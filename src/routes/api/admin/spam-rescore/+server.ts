/**
 * Stößt die nachträgliche Spam-Bewertung bestehender Sichtungen an.
 *
 * Warum es diesen Endpunkt gibt: Auf den deployten Hosts ist die Datenbank von
 * außen nicht erreichbar — auf dmm gibt das Compose für `db` keinen Port frei,
 * auf hawking hat sshd `allowtcpforwarding no`. Ein Werkzeug vom Arbeitsplatz
 * aus (`npm run spam:rescore`) erreicht dort also nichts, und im Runtime-Image
 * liegt `src/tools/` gar nicht erst. Der Backfill muss deshalb dort laufen, wo
 * die Anwendung läuft. Ein reines SQL-Skript scheidet aus: Die Heuristik
 * braucht MX-DNS-Lookups und die TypeScript-Logik.
 *
 * Zugang und Aufbau folgen `/api/admin/cleanup-orphans` — angemeldete
 * Admin-Session ODER `Authorization: Bearer` mit `CLEANUP_TOKEN`. Bewusst
 * `isAdminUser` statt `requireUserRole`: Letzteres wirft `redirect(302)` auf
 * die Anmeldeseite, ein Skript würde die Weiterleitung als Erfolg werten.
 *
 * Der Lauf arbeitet in Batches (`limit`, Vorgabe 200, Maximum 1000) — bei
 * ~20.000 Zeilen und je einem MX-Lookup wäre ein Durchlauf in einer einzigen
 * Antwort weder zumutbar noch sinnvoll. `done: false` heißt: nochmal aufrufen.
 * Idempotent, weil nur Zeilen mit `spam_score IS NULL` geladen werden.
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
import { rescoreSightings } from '#lib/server/spam/rescoreSightings.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:admin:spam-rescore');

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
	const bySession = isAdminUser(locals.user);
	const byToken = isValidCleanupToken(request.headers.get('authorization'), env.CLEANUP_TOKEN);

	if (!bySession && !byToken) {
		// Ein gesetztes, aber zu kurzes Token verhält sich wie keins — das ist
		// leicht zu übersehen und muss deshalb sichtbar sein.
		if (env.CLEANUP_TOKEN && env.CLEANUP_TOKEN.length < MIN_TOKEN_LENGTH) {
			logger.warn(
				{ action: 'rescore_token_too_short', required: MIN_TOKEN_LENGTH },
				'CLEANUP_TOKEN ist zu kurz und wird ignoriert'
			);
		}
		// Bewusst ohne Unterscheidung, welcher Weg fehlschlug.
		logger.warn({ action: 'rescore_unauthorized' }, 'Spam-Rescore ohne gültigen Ausweis');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';
	// Außerhalb des try: enforceRateLimit wirft error(429), das darf nicht als
	// 500 enden.
	const rateLimit = enforceRateLimit(
		createRateLimitIdentifier(locals.user?.sub, clientIp, bySession),
		RATE_LIMITS.ADMIN_CLEANUP,
		'admin_spam_rescore'
	);
	const headers = buildRateLimitHeaders(RATE_LIMITS.ADMIN_CLEANUP, rateLimit);

	// Ein unbrauchbares `limit` wird weggelassen statt geraten — die Vorgabe
	// steht in rescoreSightings und existiert damit genau einmal.
	const rawLimit = Number(url.searchParams.get('limit'));
	const options = Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: rawLimit } : {};

	try {
		const report = await rescoreSightings(options);

		await logAuditEvent({
			action: 'sighting.spam_rescore',
			resourceType: 'sighting',
			// exactOptionalPropertyTypes: das Feld weglassen statt undefined
			// setzen. Beim Token-Weg gibt es keinen Nutzer — `trigger` in den
			// Details hält fest, wer ausgelöst hat.
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			ipAddress: clientIp,
			details: { ...report, trigger: bySession ? 'session' : 'token' },
			status: 'success'
		});

		return json(report, { headers });
	} catch (error) {
		logger.error({ error }, 'Spam-Rescore fehlgeschlagen');
		return json({ error: 'Spam-Rescore fehlgeschlagen' }, { status: 500, headers });
	}
};
