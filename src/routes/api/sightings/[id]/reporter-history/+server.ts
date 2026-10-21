/**
 * @fileoverview Melder-Historie einer Sichtung — für die Detailansicht.
 *
 * Die Detailansicht lädt `ssr = false` über die API; deshalb ein Endpunkt und
 * kein `+page.server.ts`. Gleiche Bauart wie `spam-check`: Admin-geschützt,
 * `no-store`, und ein Antwortfeld, das „nicht ermittelt" von „nichts vorhanden"
 * unterscheidet.
 *
 * Es wird nichts persistiert und nichts entschieden — die Zahlen sind eine
 * Triage-Hilfe (`docs/SPAM_DETECTION.md`, Abschnitt „Melder-Historie").
 */
import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { findReporterHistory } from '#lib/server/db/reporterHistory.ts';
import { sightings } from '#lib/server/db/schema.ts';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';
import { error, isHttpError, json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const logger = createLogger('api:sightings:reporter-history');

export const GET: RequestHandler = async ({ params, locals, url }) => {
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { id } = params;

	if (!id || isNaN(Number(id))) {
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		const rows = await db
			.select({
				id: sightings.id,
				email: sightings.email,
				approvedAt: sightings.approvedAt,
				rejectedAt: sightings.rejectedAt
			})
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		const row = rows[0];
		if (!row) {
			throw error(404, 'Sichtung nicht gefunden');
		}

		const byId = await findReporterHistory([row]);
		/* `null` und nicht `{approved: 0, …}`: Ohne Adresse oder nach einem
		   Fehlschlag der Abfrage ist nichts ermittelt worden, und ein Nullaggregat
		   behauptete das Gegenteil.
		   `null` fasst dabei zwei Ursachen zusammen, die von hier aus nicht zu
		   unterscheiden sind: keine E-Mail-Adresse hinterlegt, oder die Abfrage in
		   `findReporterHistory` ist fail-open fehlgeschlagen. Beides zeigt die
		   Detailansicht identisch (kein Badge) — das ist der Preis des Fail-open
		   und bewusst so. Ein eigener Fehlertext existiert dort nur für den
		   Transportfehler (Endpunkt nicht erreichbar, Antwort ohne `history`),
		   nicht für diesen Fall. */
		const history: ReporterHistory | null = byId[row.id] ?? null;

		return json({ history }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		if (isHttpError(err)) {
			throw err;
		}
		logger.error({ err, id }, 'Fehler beim Ermitteln der Melder-Historie');
		throw error(500, 'Interner Serverfehler bei der Melder-Historie');
	}
};
