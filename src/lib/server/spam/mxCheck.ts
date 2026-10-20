import { resolveMx as dnsResolveMx } from 'node:dns/promises';
import { createLogger } from '#lib/logger.server.ts';

const logger = createLogger('spam:mxCheck');

export type MxCheckResult = 'has-mx' | 'no-mx' | 'unknown';

type MxResolver = (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;

export interface MxCheckOptions {
	resolveMx?: MxResolver | undefined;
	timeoutMs?: number | undefined;
}

const DEFAULT_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;

// 'unknown' (Timeout, DNS-Serverfehler) wird bewusst NICHT gecacht, damit ein
// vorübergehender Ausfall nicht eine Stunde lang jede Prüfung leerlaufen lässt.
const cache = new Map<string, { result: 'has-mx' | 'no-mx'; expires: number }>();

/** Leert den Cache — nur für Tests gedacht. */
export function clearMxCache(): void {
	cache.clear();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			const timeoutError = new Error('MX lookup timeout') as NodeJS.ErrnoException;
			timeoutError.code = 'MX_TIMEOUT';
			reject(timeoutError);
		}, timeoutMs);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(reason) => {
				clearTimeout(timer);
				reject(reason);
			}
		);
	});
}

/**
 * Prüft, ob eine E-Mail-Domain MX-Records hat (also Mail empfangen kann).
 *
 * Fail-open: Nur ein eindeutiges „Domain existiert nicht" bzw. „keine
 * MX-Records" liefert 'no-mx'. Timeouts und Serverfehler liefern 'unknown'
 * und dürfen den Spam-Score nicht erhöhen — sonst würde ein DNS-Ausfall
 * jede Meldung verdächtig machen.
 */
export async function checkMxRecords(
	domain: string,
	options: MxCheckOptions = {}
): Promise<MxCheckResult> {
	const key = domain.toLowerCase();

	const cached = cache.get(key);
	if (cached && cached.expires > Date.now()) {
		return cached.result;
	}

	const resolveMx = options.resolveMx ?? dnsResolveMx;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	let result: MxCheckResult;
	try {
		const records = await withTimeout(resolveMx(key), timeoutMs);
		result = records.length > 0 ? 'has-mx' : 'no-mx';
	} catch (error: unknown) {
		const code = (error as NodeJS.ErrnoException)?.code;
		if (code === 'ENOTFOUND' || code === 'ENODATA') {
			result = 'no-mx';
		} else {
			logger.debug({ domain: key, code }, 'MX-Lookup nicht eindeutig – kein Spam-Indikator');
			result = 'unknown';
		}
	}

	if (result !== 'unknown') {
		// Wachstumsbremse: Viele erfundene Domains dürfen die Map nicht monoton
		// wachsen lassen. Erst Abgelaufenes räumen; reicht das nicht, alles —
		// der Cache ist reine Optimierung, ein Kaltstart kostet nur DNS-Queries.
		if (cache.size >= MAX_CACHE_ENTRIES) {
			const now = Date.now();
			for (const [domain, entry] of cache) {
				if (entry.expires <= now) cache.delete(domain);
			}
			if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
		}
		cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS });
	}

	return result;
}
