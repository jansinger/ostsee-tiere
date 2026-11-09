/**
 * Einmalige Freischaltung der Anonymisierung.
 *
 * Bis zur Freischaltung führt `POST /api/admin/anonymize` auch mit
 * `mode=execute` nur die Vorschau aus. Der erste Lauf danach leert die
 * Kontaktdaten des ganzen Bestands und ist nicht umkehrbar — deshalb:
 *
 * - nur Superadmin, nur per Session (kein Cron-Token);
 * - bestätigt durch die Eingabe der aktuellen Anzahl fälliger Meldungen.
 *   Weicht sie von der Vorschau ab, die das Museum freigegeben hat, ist das
 *   der Moment anzuhalten;
 * - erst, wenn der Schlüssel gesetzt, jede Adresse gehasht und die
 *   Spam-Nachbewertung abgeschlossen ist (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, „Freigabe des
 *   ersten Laufs", Schritte 1 und 5);
 * - nur einmal: eine bestehende Freischaltung bleibt unverändert.
 */
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { createAnonymizationPorts } from '#lib/server/privacy/anonymizationQueries.ts';
import { activateAnonymization } from '#lib/server/privacy/anonymizationState.ts';
import { getAnonymizationStatus } from '#lib/server/privacy/anonymizationStatus.ts';
import { anonymizeSightings } from '#lib/server/privacy/anonymizeSightings.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:admin:anonymize:activate');

async function readConfirmedDue(request: Request): Promise<number | null> {
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== 'object' || body === null) return null;
	const value = (body as Record<string, unknown>).confirmedDue;
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
	// Außerhalb jedes try: redirect(302)/error(403) müssen durchgereicht werden.
	requireUserRole(url, locals.user, ['superadmin']);

	const confirmedDue = await readConfirmedDue(request);
	if (confirmedDue === null) {
		return json({ error: 'Anzahl fehlt oder ist ungültig' }, { status: 400 });
	}

	const preview = await anonymizeSightings({
		now: new Date(),
		ports: createAnonymizationPorts()
	});

	if (preview.activatedAt) {
		return json({ code: 'ALREADY_ACTIVATED', activatedAt: preview.activatedAt }, { status: 409 });
	}
	if (!preview.keyConfigured) {
		return json({ code: 'KEY_MISSING', error: 'REPORTER_HASH_KEY fehlt' }, { status: 503 });
	}

	// Eine Adresse ohne Kennzeichen verlöre beim Leeren die Verknüpfung zur
	// Person. Der Job holt sie zwar vor jedem Lauf nach — vor der Freigabe soll
	// der Bestand aber nachweislich vollständig sein.
	if (preview.pendingHashes > 0) {
		return json(
			{ code: 'HASH_BACKFILL_PENDING', pendingHashes: preview.pendingHashes },
			{ status: 409 }
		);
	}

	const { unscoredSpam } = await getAnonymizationStatus();
	if (unscoredSpam > 0) {
		return json({ code: 'SPAM_RESCORE_PENDING', unscoredSpam }, { status: 409 });
	}

	if (confirmedDue !== preview.due) {
		return json({ code: 'COUNT_MISMATCH', due: preview.due }, { status: 409 });
	}

	const by = locals.user?.email ?? locals.user?.sub ?? 'unbekannt';
	const { activated } = await activateAnonymization({ by, confirmedDue, now: new Date() });
	if (!activated) {
		// Ein paralleler Aufruf war schneller — die erste Freischaltung gilt.
		return json({ code: 'ALREADY_ACTIVATED' }, { status: 409 });
	}

	const ipAddress = getClientIp(getClientAddress, request);
	await logAuditEvent({
		action: 'privacy.anonymize_activate',
		resourceType: 'config',
		resourceId: 'privacy.anonymization.activatedAt',
		...(locals.user?.email ? { userEmail: locals.user.email } : {}),
		...(ipAddress ? { ipAddress } : {}),
		details: { confirmedDue, due: preview.due },
		status: 'success'
	});
	logger.info({ confirmedDue }, 'Anonymisierung freigeschaltet');

	return json({ activated: true });
};
