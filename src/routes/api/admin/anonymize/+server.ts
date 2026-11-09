/**
 * Anonymisiert Kontaktdaten 3 Monate nach Eingang.
 *
 * Zugang wie `/api/admin/cleanup-orphans`: angemeldete Admin-Session oder
 * `Authorization: Bearer` mit `CLEANUP_TOKEN` für den täglichen Web-Cron.
 * Bewusst `isAdminUser` statt `requireUserRole` — ein Cron bekäme sonst eine
 * Weiterleitung statt `401` und hielte den Lauf für gelungen.
 *
 * Vorgabe ist die Vorschau; geleert wird nur mit `mode=execute`, und auch dann
 * erst nach der einmaligen Freischaltung (`skipped: "not_activated"`).
 * Ohne `REPORTER_HASH_KEY` antwortet `mode=execute` mit 503, bevor etwas
 * geändert wird — `curl -f` meldet das als Fehler.
 *
 * Ablauf: `#lib/server/privacy/anonymizeSightings.ts`. Plan:
 * docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md (PR 4, „Automatischer Betrieb").
 */
import { env } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { isAdminUser, isSuperAdminUser } from '#lib/server/auth/auth.ts';
import { isValidCleanupToken, MIN_TOKEN_LENGTH } from '#lib/server/media/cleanupAuth.ts';
import {
	buildRateLimitHeaders,
	createRateLimitIdentifier,
	enforceRateLimit,
	RATE_LIMITS
} from '#lib/server/middleware/rateLimit.ts';
import { createAnonymizationPorts } from '#lib/server/privacy/anonymizationQueries.ts';
import { anonymizeSightings } from '#lib/server/privacy/anonymizeSightings.ts';
import { ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { describeDbError } from '#lib/server/privacy/describeDbError.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:admin:anonymize');

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
	// Auch reine Superadmins: Sie bedienen das Panel und schalten frei —
	// `isAdminUser` kennt nur die Rolle `admin` (Review PR #1013).
	const bySession = isAdminUser(locals.user) || isSuperAdminUser(locals.user);
	const byToken = isValidCleanupToken(request.headers.get('authorization'), env.CLEANUP_TOKEN);

	if (!bySession && !byToken) {
		if (env.CLEANUP_TOKEN && env.CLEANUP_TOKEN.length < MIN_TOKEN_LENGTH) {
			logger.warn(
				{ action: 'anonymize_token_too_short', required: MIN_TOKEN_LENGTH },
				'CLEANUP_TOKEN ist zu kurz und wird ignoriert'
			);
		}
		// Bewusst ohne Unterscheidung, welcher Weg fehlschlug.
		logger.warn({ action: 'anonymize_unauthorized' }, 'Anonymisierung ohne gültigen Ausweis');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';
	// Außerhalb des try: enforceRateLimit wirft error(429), das darf nicht als
	// 500 enden.
	const rateLimit = enforceRateLimit(
		createRateLimitIdentifier(locals.user?.sub, clientIp, bySession),
		RATE_LIMITS.ADMIN_CLEANUP,
		'admin_anonymize'
	);
	const headers = buildRateLimitHeaders(RATE_LIMITS.ADMIN_CLEANUP, rateLimit);

	const mode = url.searchParams.get('mode') === 'execute' ? 'execute' : 'preview';
	// Ein unbrauchbares `limit` fällt auf die Vorgabe in anonymizeSightings zurück.
	const rawLimit = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
	const trigger = bySession ? 'session' : 'token';

	try {
		const report = await anonymizeSightings({
			mode,
			limit,
			now: new Date(),
			trigger,
			ports: createAnonymizationPorts()
		});

		if (mode === 'execute') {
			await logAuditEvent({
				action: 'privacy.anonymize',
				resourceType: 'sighting',
				...(locals.user?.email ? { userEmail: locals.user.email } : {}),
				ipAddress: clientIp,
				// Nur Zahlen und Zeitpunkte — keine IDs, keine Werte.
				details: {
					trigger,
					executed: report.executed,
					skipped: report.skipped,
					due: report.due,
					anonymized: report.anonymized,
					remaining: report.remaining,
					hashed: report.hashed,
					newestDueReceivedAt: report.newestDueReceivedAt
				},
				status: 'success'
			});
		}

		logger.info(
			{
				mode,
				trigger,
				executed: report.executed,
				skipped: report.skipped,
				due: report.due,
				anonymized: report.anonymized,
				remaining: report.remaining
			},
			'Anonymisierungs-Lauf abgeschlossen'
		);
		return json(report, { headers });
	} catch (error) {
		if (error instanceof ReporterHashKeyMissingError) {
			logger.error({ action: 'reporter_hash_key_missing' }, error.message);
			return json({ error: error.message }, { status: 503, headers });
		}
		// Nicht das Fehlerobjekt: Ein DrizzleQueryError trägt die Parameter der
		// Anweisung in seiner Meldung, beim Hash-Backfill also E-Mail-Adressen.
		logger.error(describeDbError(error), 'Anonymisierung fehlgeschlagen');
		return json({ error: 'Anonymisierung fehlgeschlagen' }, { status: 500, headers });
	}
};
