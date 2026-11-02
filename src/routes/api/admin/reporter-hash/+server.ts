/**
 * Holt den Melder-Hash für Sichtungen nach, die noch keinen haben.
 *
 * Warum es diesen Endpunkt gibt: Auf den deployten Hosts ist die Datenbank von
 * außen nicht erreichbar, und im Runtime-Image liegt `src/tools/` nicht —
 * derselbe Grund wie bei `/api/admin/spam-rescore`. Der Backfill über den
 * Bestand muss laufen, solange die Adressen noch da sind, also vor dem ersten
 * Anonymisierungslauf (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 2).
 *
 * Zugang und Aufbau folgen `/api/admin/spam-rescore`: angemeldete
 * Admin-Session ODER `Authorization: Bearer` mit `CLEANUP_TOKEN`. Batches über
 * `limit` (Vorgabe 500, Maximum 2000); `done: false` heißt: nochmal aufrufen.
 * Idempotent, weil nur Zeilen ohne Hash geladen werden.
 *
 * Ohne `REPORTER_HASH_KEY` antwortet der Endpunkt mit 503 und schreibt
 * nichts — ein Cron mit `curl -f` meldet das als Fehler, statt still zu
 * „gelingen".
 */
import { env } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { isValidCleanupToken, MIN_TOKEN_LENGTH } from '#lib/server/media/cleanupAuth.ts';
import {
	buildRateLimitHeaders,
	createRateLimitIdentifier,
	enforceRateLimit,
	RATE_LIMITS
} from '#lib/server/middleware/rateLimit.ts';
import { hashReporters, ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:admin:reporter-hash');

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
	const bySession = isAdminUser(locals.user);
	const byToken = isValidCleanupToken(request.headers.get('authorization'), env.CLEANUP_TOKEN);

	if (!bySession && !byToken) {
		if (env.CLEANUP_TOKEN && env.CLEANUP_TOKEN.length < MIN_TOKEN_LENGTH) {
			logger.warn(
				{ action: 'reporter_hash_token_too_short', required: MIN_TOKEN_LENGTH },
				'CLEANUP_TOKEN ist zu kurz und wird ignoriert'
			);
		}
		// Bewusst ohne Unterscheidung, welcher Weg fehlschlug.
		logger.warn({ action: 'reporter_hash_unauthorized' }, 'Hash-Backfill ohne gültigen Ausweis');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';
	// Außerhalb des try: enforceRateLimit wirft error(429), das darf nicht als
	// 500 enden.
	const rateLimit = enforceRateLimit(
		createRateLimitIdentifier(locals.user?.sub, clientIp, bySession),
		RATE_LIMITS.ADMIN_CLEANUP,
		'admin_reporter_hash'
	);
	const headers = buildRateLimitHeaders(RATE_LIMITS.ADMIN_CLEANUP, rateLimit);

	// Ein unbrauchbares `limit` wird weggelassen statt geraten — die Vorgabe
	// steht in hashReporters und existiert damit genau einmal.
	const rawLimit = Number(url.searchParams.get('limit'));
	const options = Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: rawLimit } : {};

	try {
		const report = await hashReporters(options);

		await logAuditEvent({
			action: 'sighting.reporter_hash_backfill',
			resourceType: 'sighting',
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			ipAddress: clientIp,
			details: { ...report, trigger: bySession ? 'session' : 'token' },
			status: 'success'
		});

		return json(report, { headers });
	} catch (error) {
		if (error instanceof ReporterHashKeyMissingError) {
			logger.error({ action: 'reporter_hash_key_missing' }, error.message);
			return json({ error: error.message }, { status: 503, headers });
		}
		logger.error({ error }, 'Hash-Backfill fehlgeschlagen');
		return json({ error: 'Hash-Backfill fehlgeschlagen' }, { status: 500, headers });
	}
};
