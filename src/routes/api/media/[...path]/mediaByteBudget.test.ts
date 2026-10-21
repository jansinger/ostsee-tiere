import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { consumeByteBudget, resetByteBudgets } from '#lib/server/middleware/byteBudget.ts';
import { RATE_LIMITS } from '#lib/server/middleware/rateLimit.ts';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	isAdminUser: vi.fn().mockReturnValue(false)
}));

const TOTAL_SIZE = 7_894_181; // ~7.9 MB, wie im Befund gemessen

const fileRecord = {
	id: 1,
	sightingId: 42,
	fileName: 'wal.mp4',
	filePath: 'sichtung-42/wal.mp4',
	mimeType: 'video/mp4',
	size: TOTAL_SIZE,
	originalName: 'wal.mp4',
	approvedAt: new Date('2026-01-01T00:00:00Z'),
	verified: 1
};

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({ limit: async () => [fileRecord] })
				})
			})
		})
	}
}));

const getFileStream = vi.fn();
const getMetadata = vi.fn();

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: () => ({ getFileStream, getMetadata })
}));

function createEvent(rangeHeader: string | null, clientIp = '198.51.100.1') {
	return {
		params: { path: 'sichtung-42/wal.mp4' },
		url: new URL('http://localhost/api/media/sichtung-42/wal.mp4'),
		request: {
			headers: {
				get: (name: string) => (name.toLowerCase() === 'range' ? rangeHeader : null)
			}
		} as unknown as Request,
		locals: {},
		getClientAddress: () => clientIp
	} as never;
}

/**
 * `error(429, …)` aus `@sveltejs/kit` WIRFT (wie überall sonst in dieser Route,
 * z. B. bei 404) statt eine Response zurückzugeben — anders als die 416/304-Fälle,
 * die diese Route selbst als `new Response(...)` konstruiert. Ein Test auf den
 * 429-Fall muss den Wurf deshalb auffangen statt `.status` an einem Rückgabewert
 * zu prüfen.
 */
async function expectHttpError(promise: unknown, status: number): Promise<{ message: string }> {
	let caught: unknown;
	try {
		await promise;
	} catch (err) {
		caught = err;
	}
	if (caught === undefined) {
		expect.fail(`Erwartete HTTP ${status}, aber die Anfrage wurde nicht abgelehnt`);
	}
	const httpError = caught as { status: number; body: { message: string } };
	expect(httpError.status).toBe(status);
	return httpError.body;
}

beforeEach(() => {
	resetByteBudgets();
	getFileStream.mockReset();
	getMetadata.mockReset();
	getMetadata.mockResolvedValue({
		size: TOTAL_SIZE,
		mimeType: 'video/mp4',
		lastModified: new Date('2026-01-01T00:00:00Z')
	});
	getFileStream.mockImplementation(async () => ({
		stream: new Response('x'.repeat(TOTAL_SIZE)).body,
		totalSize: TOTAL_SIZE,
		rangeDelivered: true
	}));
});

describe('/api/media GET — Byte-Budget (Befund C1)', () => {
	it('bucht bei Range: bytes=0- dieselbe Menge wie eine gewöhnliche Anfrage ohne Range', async () => {
		// Kern des Fixes: "Range: bytes=0-" ist ein erfüllbarer Bereich über die
		// GANZE Datei — er darf das Volumen-Budget nicht anders belasten als ein
		// Abruf ohne Range-Header. Für beide Kennungen wird das reale
		// MEDIA_BYTES_ANONYMOUS-Budget vorab bis auf exakt die Dateigröße
		// ausgeschöpft: Bucht eine der beiden Varianten mehr oder weniger als die
		// andere, unterscheidet sich, welche der beiden Anfragen noch durchgeht.
		const budget = RATE_LIMITS.MEDIA_BYTES_ANONYMOUS;

		const plainIp = '198.51.100.10';
		consumeByteBudget(`ip:${plainIp}`, budget.maxBytes - TOTAL_SIZE, budget);

		const responseWithoutRange = await GET(createEvent(null, plainIp));
		expect(responseWithoutRange.status).toBe(200);

		// Ein zweiter Abruf derselben Kennung muss jetzt am Budget scheitern —
		// die erste Anfrage hat den verbliebenen Rest vollständig verbraucht.
		await expectHttpError(GET(createEvent(null, plainIp)), 429);

		// Dieselbe Vorbelegung jetzt mit "Range: bytes=0-" auf einer frischen
		// Kennung: genau ein Aufruf darf durchgehen, der zweite muss ebenfalls
		// 429 liefern — exakt dasselbe Muster wie oben.
		const rangeIp = '198.51.100.20';
		consumeByteBudget(`ip:${rangeIp}`, budget.maxBytes - TOTAL_SIZE, budget);

		const firstRangeRequest = await GET(createEvent('bytes=0-', rangeIp));
		expect(firstRangeRequest.status).toBe(206);

		await expectHttpError(GET(createEvent('bytes=0-', rangeIp)), 429);
	});

	it('lehnt eine Anfrage mit 429 ab, sobald das stündliche Byte-Budget erschöpft ist', async () => {
		const clientIp = '198.51.100.30';
		consumeByteBudget(
			`ip:${clientIp}`,
			RATE_LIMITS.MEDIA_BYTES_ANONYMOUS.maxBytes,
			RATE_LIMITS.MEDIA_BYTES_ANONYMOUS
		);

		await expectHttpError(GET(createEvent(null, clientIp)), 429);
		expect(getFileStream).not.toHaveBeenCalled();
	});

	it('formuliert die 429-Meldung nutzerfreundlich statt technisch', async () => {
		const clientIp = '198.51.100.31';
		consumeByteBudget(
			`ip:${clientIp}`,
			RATE_LIMITS.MEDIA_BYTES_ANONYMOUS.maxBytes,
			RATE_LIMITS.MEDIA_BYTES_ANONYMOUS
		);

		const body = await expectHttpError(GET(createEvent(null, clientIp)), 429);

		expect(body.message).toMatch(/später/i);
		expect(body.message.toLowerCase()).not.toMatch(/budget|rate.?limit/);
	});

	it('bucht einen Teilbereich nur mit seiner Länge, nicht mit der vollen Dateigröße', async () => {
		const clientIp = '198.51.100.40';
		const budget = RATE_LIMITS.MEDIA_BYTES_ANONYMOUS;

		// Budget bis auf genau 1000 Bytes ausschöpfen. Bucht die Route hier fälschlich
		// die volle Dateigröße (7,9 MB) statt der Bereichslänge, scheitert schon der
		// erste 500-Byte-Bereich mit 429 — genau das soll dieser Test verhindern.
		consumeByteBudget(`ip:${clientIp}`, budget.maxBytes - 1000, budget);

		getFileStream.mockImplementation(async () => ({
			stream: new Response('x'.repeat(500)).body,
			totalSize: TOTAL_SIZE,
			rangeDelivered: true
		}));

		const first = await GET(createEvent('bytes=0-499', clientIp));
		expect(first.status).toBe(206);

		const second = await GET(createEvent('bytes=500-999', clientIp));
		expect(second.status).toBe(206);

		// Die 1000 Bytes Restbudget sind jetzt exakt verbraucht — der dritte
		// 500-Byte-Bereich muss scheitern.
		await expectHttpError(GET(createEvent('bytes=1000-1499', clientIp)), 429);
	});

	it('bucht bei nicht geliefertem Range die volle Dateigröße nach, nicht nur die Bereichslänge', async () => {
		// Der Storage liefert den angeforderten 1-Byte-Bereich nicht (z. B. ein
		// CDN vor Vercel Blob, das den Range-Header ignoriert) — die Route fällt
		// auf die Vollantwort zurück. Gebucht war vorab nur 1 Byte
		// (`plannedDeliveryBytes` für "bytes=0-0"); ohne Nachbuchung kostet ein
		// 100-MB-Video effektiv 1 Byte Budget. Vorbelegt wird bis auf exakt
		// TOTAL_SIZE Rest — reicht die Nachbuchung nicht bis zur vollen Größe,
		// bleibt hinterher Restbudget übrig und ein zweiter identischer Abruf
		// ginge fälschlich noch durch.
		const clientIp = '198.51.100.60';
		const budget = RATE_LIMITS.MEDIA_BYTES_ANONYMOUS;
		consumeByteBudget(`ip:${clientIp}`, budget.maxBytes - TOTAL_SIZE, budget);

		getFileStream.mockImplementation(async () => ({
			stream: new Response('x'.repeat(TOTAL_SIZE)).body,
			totalSize: TOTAL_SIZE,
			rangeDelivered: false
		}));

		const first = await GET(createEvent('bytes=0-0', clientIp));
		expect(first.status).toBe(200);
		expect(first.headers.get('Content-Length')).toBe(String(TOTAL_SIZE));

		// Das Budget muss jetzt um die volle Dateigröße erschöpft sein — nicht
		// nur um das eine Byte, das ursprünglich angefragt wurde.
		await expectHttpError(GET(createEvent('bytes=0-0', clientIp)), 429);
	});

	it('lehnt mit 429 ab statt der Vollantwort, wenn die Nachbuchung das Budget sprengen würde', async () => {
		// Vorbelegt bis auf 10 Restbytes: Der geplante 1-Byte-Bereich passt noch
		// (Schritt 1 lässt die Anfrage durch), aber die Datei ist real 7,9 MB
		// groß — die Nachbuchung der Differenz muss scheitern und darf dann
		// NICHT die volle Antwort ausliefern.
		const clientIp = '198.51.100.61';
		const budget = RATE_LIMITS.MEDIA_BYTES_ANONYMOUS;
		consumeByteBudget(`ip:${clientIp}`, budget.maxBytes - 10, budget);

		getFileStream.mockImplementation(async () => ({
			stream: new Response('x'.repeat(TOTAL_SIZE)).body,
			totalSize: TOTAL_SIZE,
			rangeDelivered: false
		}));

		await expectHttpError(GET(createEvent('bytes=0-0', clientIp)), 429);
	});
});
