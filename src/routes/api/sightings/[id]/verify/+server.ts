import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { db } from '#lib/server/db/index.ts';
import { isSightingApproved, isSightingRejected } from '#lib/server/db/approvalFilter.ts';
import { sightings, sightingStatusLog } from '#lib/server/db/schema.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { error, isHttpError, json } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';

// Logger für diesen API-Endpunkt erstellen
const logger = createLogger('api:sightings:verify');

/**
 * Eine Sichtung kennt genau zwei Zustände: ungeprüft und geprüft.
 * Geprüft bedeutet zugleich veröffentlicht — einen dritten Zustand
 * "geprüft, aber nicht freigegeben" gibt es fachlich nicht.
 *
 * Die Datenbank führt aus historischen Gründen zwei Spalten (`geprueft` und
 * `freigegeben_am`). Sie werden deshalb ausschließlich hier und immer
 * gemeinsam geschrieben: `freigegeben_am` trägt den Zeitpunkt der Prüfung,
 * `geprueft` das Kennzeichen. Die öffentlichen Flächen (Legacy-API und
 * Karte) filtern auf `freigegeben_am`.
 *
 * Die Ablehnung (`abgelehnt_am`/`abgelehnt_von`) ist kein dritter
 * Veröffentlichungszustand, sondern eine Triage-Markierung: abgelehnt heißt
 * ungeprüft und nicht veröffentlicht, nur mit festgehaltener Entscheidung.
 * Deshalb schreibt dieser Endpunkt alle fünf Status-Spalten in EINEM Update —
 * `freigegeben_am` und `abgelehnt_am` sind nie gleichzeitig gesetzt, und
 * `freigegeben_von`/`abgelehnt_von` gehören untrennbar zu ihrem Zeitstempel.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, url, getClientAddress }) => {
	// Authorization check - nur Admins dürfen prüfen und damit freigeben
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { id } = params;

	if (!id || isNaN(Number(id))) {
		logger.warn({ id }, 'Ungültige Sichtungs-ID für Prüfung');
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		// Request body für neuen Status parsen
		const body = await request.json();

		// Verdict bestimmen. `{ verified: 0|1 }` bleibt als Alias bestehen —
		// bestehende Aufrufer (Tabelle, Detailansicht) senden ihn weiterhin.
		// `verified: 0` bedeutete schon immer „zurückziehen auf ungeprüft" = reset.
		type Verdict = 'approve' | 'reject' | 'reset';
		let verdict: Verdict;
		if (body.verdict !== undefined) {
			if (body.verdict !== 'approve' && body.verdict !== 'reject' && body.verdict !== 'reset') {
				logger.warn({ verdict: body.verdict }, 'Ungültiges Verdict');
				throw error(400, "Ungültiges Verdict. Muss 'approve', 'reject' oder 'reset' sein.");
			}
			verdict = body.verdict;
		} else if (body.verified === 1) {
			verdict = 'approve';
		} else if (body.verified === 0) {
			verdict = 'reset';
		} else {
			logger.warn({ body }, 'Ungültiger Prüfstatus');
			throw error(
				400,
				'Ungültiger Request-Body. Erwartet { verdict: "approve" | "reject" | "reset" } oder den Alias { verified: 0 | 1 }.'
			);
		}

		// Prüfen ob die Sichtung existiert
		const existingSighting = await db
			.select({
				id: sightings.id,
				verified: sightings.verified,
				approvedAt: sightings.approvedAt,
				rejectedAt: sightings.rejectedAt
			})
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		const existing = existingSighting[0];
		if (!existing) {
			logger.warn({ id }, 'Sichtung zum Prüfen nicht gefunden');
			throw error(404, 'Sichtung nicht gefunden');
		}

		const approved = verdict === 'approve';
		const now = new Date();
		// Alle Status-Spalten in EINEM Update, damit sie nie auseinanderlaufen —
		// insbesondere sind freigegeben_am und abgelehnt_am nie gleichzeitig gesetzt.
		const statusColumns =
			verdict === 'approve'
				? {
						verified: 1,
						approvedAt: now,
						// Wer freigibt, wird genauso festgehalten wie wer ablehnt.
						// Ohne angemeldete Identität bleibt die Spalte NULL statt
						// einen Platzhalter zu behaupten — wie beim Altbestand.
						approvedBy: locals.user?.email ?? null,
						rejectedAt: null,
						rejectedBy: null
					}
				: verdict === 'reject'
					? {
							verified: 0,
							approvedAt: null,
							approvedBy: null,
							rejectedAt: now,
							rejectedBy: locals.user?.email ?? null
						}
					: {
							verified: 0,
							approvedAt: null,
							approvedBy: null,
							rejectedAt: null,
							rejectedBy: null
						};

		// Spalten und Historien-Eintrag in EINER Transaktion. Eine Historie, die
		// einen stattgefundenen Wechsel verschweigt, sieht vollständig aus und ist
		// es nicht — sie wäre damit schlechter als gar keine. Der Eintrag hält
		// bewusst nur fest, WAS entschieden wurde; der Zustand davor steht in der
		// jeweils vorherigen Zeile bzw. ist für den Altbestand unbekannt.
		await db.transaction(async (tx) => {
			await tx
				.update(sightings)
				.set(statusColumns)
				.where(eq(sightings.id, Number(id)));

			await tx.insert(sightingStatusLog).values({
				sightingId: Number(id),
				verdict,
				// Dieselbe Kennung wie in `freigegeben_von`/`abgelehnt_von` — keine
				// neue Datenkategorie. Ohne Anmeldung NULL statt Platzhalter.
				editor: locals.user?.email ?? null,
				recordedAt: now
			});
		});

		const ipAddress = getClientIp(getClientAddress, request);
		await logAuditEvent({
			action: 'sighting.verify',
			resourceType: 'sighting',
			resourceId: String(id),
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			...(ipAddress ? { ipAddress } : {}),
			details: {
				verdict,
				verified: statusColumns.verified,
				approved,
				previousVerified: existing.verified,
				previouslyApproved: isSightingApproved(existing),
				previouslyRejected: isSightingRejected(existing)
			}
		});

		logger.info(
			{
				id,
				verdict,
				previousStatus: existing.verified,
				newStatus: statusColumns.verified,
				approvedAt: statusColumns.approvedAt,
				rejectedAt: statusColumns.rejectedAt,
				verifiedBy: locals.user?.email
			},
			'Prüfstatus erfolgreich geändert'
		);

		const messages: Record<Verdict, string> = {
			approve: 'Sichtung wurde geprüft und freigegeben',
			reject: 'Sichtung wurde abgelehnt',
			reset: 'Sichtung wurde als ungeprüft markiert und zurückgezogen'
		};

		return json({
			success: true,
			id: Number(id),
			verdict,
			verified: statusColumns.verified,
			approvedAt: statusColumns.approvedAt,
			rejectedAt: statusColumns.rejectedAt,
			message: messages[verdict]
		});
	} catch (err) {
		if (isHttpError(err)) {
			throw err;
		}
		logger.error({ err, id }, 'Fehler beim Ändern des Prüfstatus');
		throw error(500, 'Interner Serverfehler beim Ändern des Prüfstatus');
	}
};

export const GET: RequestHandler = async ({ params, locals, url }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { id } = params;

	if (!id || isNaN(Number(id))) {
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		const sighting = await db
			.select({
				id: sightings.id,
				verified: sightings.verified,
				approvedAt: sightings.approvedAt,
				rejectedAt: sightings.rejectedAt
			})
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		if (sighting.length === 0) {
			logger.warn({ id }, 'Sichtung nicht gefunden');
			throw error(404, 'Sichtung nicht gefunden');
		}

		// Aufsteigend: Die Zeitleiste wird von oben nach unten gelesen, älteste
		// Entscheidung zuerst. Der Altbestand liefert hier eine leere Liste — die
		// Aufzeichnung beginnt mit dieser Tabelle, nicht mit der Sichtung.
		const history = await db
			.select({
				id: sightingStatusLog.id,
				verdict: sightingStatusLog.verdict,
				editor: sightingStatusLog.editor,
				recordedAt: sightingStatusLog.recordedAt
			})
			.from(sightingStatusLog)
			.where(eq(sightingStatusLog.sightingId, Number(id)))
			.orderBy(asc(sightingStatusLog.recordedAt));

		return json({
			id: sighting[0]?.id,
			verified: sighting[0]?.verified,
			approvedAt: sighting[0]?.approvedAt ?? null,
			rejectedAt: sighting[0]?.rejectedAt ?? null,
			history
		});
	} catch (err) {
		if (isHttpError(err)) {
			throw err;
		}
		logger.error({ err, id }, 'Fehler beim Abrufen des Prüfstatus');
		throw error(500, 'Interner Serverfehler');
	}
};
