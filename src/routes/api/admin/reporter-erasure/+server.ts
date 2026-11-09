/**
 * Löschersuchen (Art. 17 DSGVO) über eine genannte Adresse.
 *
 * Findet alle Meldungen der Person über den Melder-Hash — auch die schon
 * anonymisierten —, anonymisiert sie sofort und leert den Hash. Ablauf und
 * Begründung: `#lib/server/privacy/eraseReporter.ts`.
 *
 * Nur Superadmins, nur per Session: Die Anfrage enthält eine Adresse, und
 * schon die Vorschau verrät, ob es zu ihr Meldungen gibt. Kein Cron-Token.
 * Die Adresse steht weder im Log noch im Audit-Eintrag.
 *
 * Vorgabe ist die Vorschau; geändert wird nur mit `mode: "execute"`.
 */
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { eraseReporter, InvalidErasureAddressError } from '#lib/server/privacy/eraseReporter.ts';
import { describeDbError } from '#lib/server/privacy/describeDbError.ts';
import { ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:admin:reporter-erasure');

async function readBody(request: Request): Promise<{ email: string | null; execute: boolean }> {
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== 'object' || body === null) return { email: null, execute: false };
	const record = body as Record<string, unknown>;
	return {
		email: typeof record.email === 'string' ? record.email : null,
		execute: record.mode === 'execute'
	};
}

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
	// Außerhalb des try: redirect(302)/error(403) müssen durchgereicht werden.
	requireUserRole(url, locals.user, ['superadmin']);

	const { email, execute } = await readBody(request);
	if (email === null) {
		return json({ error: 'Adresse fehlt' }, { status: 400 });
	}
	const mode = execute ? 'execute' : 'preview';

	try {
		const report = await eraseReporter({ email, mode, now: new Date() });

		const ipAddress = getClientIp(getClientAddress, request);
		await logAuditEvent({
			action: 'privacy.erasure',
			resourceType: 'sighting',
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			...(ipAddress ? { ipAddress } : {}),
			// Nur Zahlen — die Adresse gehört gerade nicht ins Audit.
			details: { ...report },
			status: 'success'
		});

		logger.info({ ...report }, 'Löschersuchen bearbeitet');
		return json(report);
	} catch (error) {
		if (error instanceof InvalidErasureAddressError) {
			return json({ error: error.message }, { status: 400 });
		}
		if (error instanceof ReporterHashKeyMissingError) {
			logger.error({ action: 'reporter_hash_key_missing' }, error.message);
			return json({ error: error.message }, { status: 503 });
		}
		// Nur der Fehlertyp — die Meldung eines Datenbankfehlers kann
		// Parameter und damit die Adresse enthalten.
		logger.error(describeDbError(error), 'Löschersuchen fehlgeschlagen');
		return json({ error: 'Löschersuchen fehlgeschlagen' }, { status: 500 });
	}
};
