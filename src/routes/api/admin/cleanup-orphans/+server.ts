/**
 * Räumt verwaiste Uploads und abgelaufene Sessions auf.
 *
 * Zwei Zugänge: angemeldete Admin-Session oder `Authorization: Bearer` mit
 * `CLEANUP_TOKEN` für einen externen Web-Cron. Ist die Variable nicht gesetzt,
 * ist der Token-Weg abgeschaltet.
 *
 * Bewusst `isAdminUser` statt `requireUserRole`: Letzteres wirft einen
 * `redirect(302)` auf die Anmeldeseite — ein Cron-Dienst bekäme statt `401`
 * eine Weiterleitung und würde den Lauf als Erfolg werten.
 *
 * Vorgabe ist die Vorschau; gelöscht wird nur mit `mode=execute`.
 * Entwurf: docs/archive/AUFRAEUM_ENDPUNKT_ENTWURF_2026-07-28.md
 */
import { env } from '#lib/server/env.ts';
import { ORPHAN_RETENTION_HOURS } from '#lib/constants/uploadRetention.ts';
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { deleteExpiredSessions } from '#lib/server/auth/sessionRepository.ts';
import { MIN_TOKEN_LENGTH, isValidCleanupToken } from '#lib/server/media/cleanupAuth.ts';
import { createDbPorts } from '#lib/server/media/cleanupPorts.ts';
import { cleanupOrphans } from '#lib/server/media/orphanCleanup.ts';
import {
	RATE_LIMITS,
	buildRateLimitHeaders,
	createRateLimitIdentifier,
	enforceRateLimit
} from '#lib/server/middleware/rateLimit.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:admin:cleanup-orphans');

const MAX_LIMIT = 500;
const HOUR_IN_MS = 60 * 60 * 1000;

/**
 * Frist aus der Query: auf ganze Stunden abgerundet und nach unten auf die
 * Mindestfrist geklemmt.
 *
 * Abrunden vor dem Klemmen — OpenAPI dokumentiert `hours` als `integer`, eine
 * krumme Frist wäre weder dokumentiert noch im Bericht nachvollziehbar.
 */
function resolveRetentionMs(raw: string | null): number {
	const parsed = raw === null ? NaN : Number(raw);
	const hours = Number.isFinite(parsed)
		? Math.max(Math.floor(parsed), ORPHAN_RETENTION_HOURS)
		: ORPHAN_RETENTION_HOURS;
	return hours * HOUR_IN_MS;
}

function resolveLimit(raw: string | null): number {
	const parsed = raw === null ? NaN : Number(raw);
	if (!Number.isFinite(parsed) || parsed < 1) return MAX_LIMIT;
	return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
	const bySession = isAdminUser(locals.user);
	const byToken = isValidCleanupToken(request.headers.get('authorization'), env.CLEANUP_TOKEN);

	if (!bySession && !byToken) {
		// Ein gesetztes, aber zu kurzes Token verhält sich wie keins — das ist
		// leicht zu übersehen und muss deshalb sichtbar sein.
		if (env.CLEANUP_TOKEN && env.CLEANUP_TOKEN.length < MIN_TOKEN_LENGTH) {
			logger.warn(
				{ action: 'cleanup_token_too_short', required: MIN_TOKEN_LENGTH },
				'CLEANUP_TOKEN ist zu kurz und wird ignoriert'
			);
		}
		// Bewusst ohne Unterscheidung, welcher Weg fehlschlug.
		logger.warn({ action: 'cleanup_unauthorized' }, 'Aufräum-Lauf ohne gültigen Ausweis');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';
	// Außerhalb des try: enforceRateLimit wirft error(429), das darf nicht als
	// 500 enden.
	const rateLimit = enforceRateLimit(
		createRateLimitIdentifier(locals.user?.sub, clientIp, bySession),
		RATE_LIMITS.ADMIN_CLEANUP,
		'admin_cleanup'
	);
	const headers = buildRateLimitHeaders(RATE_LIMITS.ADMIN_CLEANUP, rateLimit);

	const execute = url.searchParams.get('mode') === 'execute';
	const retentionMs = resolveRetentionMs(url.searchParams.get('hours'));
	const limit = resolveLimit(url.searchParams.get('limit'));

	try {
		const report = await cleanupOrphans({
			now: new Date(),
			retentionMs,
			execute,
			limit,
			ports: createDbPorts(),
			onError: (subject, error) => logger.error({ subject, error }, 'Löschen fehlgeschlagen')
		});

		/* Abgelaufene Session-Zeilen im selben Lauf wegräumen. `createSession` erwischt
		   nur Zeilen desselben Benutzers — wer sich abmeldet und nie wiederkommt, liesse
		   sonst Name und E-Mail dauerhaft in `sessions` stehen (DSGVO). Fehler hier
		   duerfen den Datei-Aufraeumlauf nicht kippen, deshalb separat gefangen. */
		let sessionsRemoved = 0;
		if (execute) {
			try {
				sessionsRemoved = await deleteExpiredSessions();
			} catch (error) {
				logger.error({ error }, 'Aufräumen abgelaufener Sessions fehlgeschlagen');
			}
		}

		if (execute) {
			await logAuditEvent({
				action: 'file.cleanup_orphans',
				resourceType: 'file',
				// exactOptionalPropertyTypes: das Feld weglassen statt undefined
				// setzen. Beim Cron-Weg gibt es keinen Nutzer — `trigger` in den
				// Details hält fest, wer ausgelöst hat.
				...(locals.user?.email ? { userEmail: locals.user.email } : {}),
				ipAddress: clientIp,
				details: { ...report, sessionsRemoved, trigger: bySession ? 'session' : 'token' },
				status: report.failed > 0 ? 'failure' : 'success'
			});
		}

		logger.info({ ...report, sessionsRemoved, execute }, 'Aufräum-Lauf abgeschlossen');
		return json(
			{ retentionHours: retentionMs / HOUR_IN_MS, ...report, sessionsRemoved },
			{ headers }
		);
	} catch (error) {
		logger.error({ error }, 'Aufräum-Lauf fehlgeschlagen');
		return json({ error: 'Aufräumen fehlgeschlagen' }, { status: 500, headers });
	}
};
