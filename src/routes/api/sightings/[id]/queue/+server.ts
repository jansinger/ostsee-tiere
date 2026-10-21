/**
 * @fileoverview Warteschlange der Admin-Detailansicht: Wer liegt vor und hinter
 * dieser Sichtung im Stapel der offenen Meldungen?
 *
 * Die Antwort trägt den Arbeitsmodus des Eingangs: Nach einer Entscheidung
 * springt die Detailansicht direkt zur nächsten offenen Meldung, ohne Umweg
 * über die Liste.
 *
 * **Keyset statt Offset.** Die Nachbarn werden über einen Wertevergleich gegen
 * `(created, id)` der aktuellen Zeile gesucht — nicht über eine Position im
 * Ergebnis. Ein mitgeführter Offset wäre nach jeder Entscheidung um eins
 * falsch, weil die entschiedene Sichtung den Stapel verlässt und alle
 * nachfolgenden Ränge verschiebt. Der Wertevergleich hängt dagegen nicht daran,
 * ob die aktuelle Sichtung noch offen ist: „Wer kommt danach" bleibt
 * beantwortbar, nachdem sie freigegeben wurde. Genau deshalb braucht der
 * Auto-Advance keinen Sonderfall.
 *
 * `position` ist die Anzahl der Vorgänger plus eins — und `null`, sobald die
 * Sichtung nicht mehr offen ist: Sie hat dann keinen Rang im Stapel, wohl aber
 * weiterhin Nachbarn.
 */
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { isSightingApproved, isSightingRejected, openOnly } from '#lib/server/db/approvalFilter.ts';
import {
	neighborScanOrder,
	openQueueOrderBy,
	queueNeighborCondition,
	resolveQueueOrder,
	type QueueAnchor,
	type QueueOrder
} from '#lib/server/db/openQueueOrder.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Ein Nachbar, so weit die Oberfläche ihn braucht.
 *
 * `referenceId` ist im Schema `varchar` ohne `notNull` (`schema.ts`,
 * `referenz_id`) — Altbestand ohne Referenz-ID existiert. `null` ist deshalb
 * Teil des Typs, nicht ein Fehler, den man wegcasten dürfte.
 */
export interface QueueNeighbor {
	id: number;
	referenceId: string | null;
}

async function findNeighbor(
	order: QueueOrder,
	direction: 'next' | 'prev',
	anchor: QueueAnchor
): Promise<QueueNeighbor | null> {
	const rows = await db
		.select({ id: sightings.id, referenceId: sightings.referenceId })
		.from(sightings)
		.where(and(openOnly(), queueNeighborCondition(order, direction, anchor)))
		.orderBy(...openQueueOrderBy(neighborScanOrder(order, direction)))
		.limit(1);

	return rows[0] ?? null;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	/* Strenger als die Nachbar-Endpunkte (`!id || isNaN(Number(id))`), und das
	   mit Absicht: `static/openapi.yml` deklariert für diesen Pfadparameter
	   `type: integer, minimum: 1`. Die lockere Prüfung ließ `0`, negative Werte
	   und Schreibweisen wie `1e3` oder ` 500 ` durch — sie landeten in einer
	   DB-Abfrage und endeten im 404 statt im 400, also mit einer Antwort, die
	   dem eigenen dokumentierten Vertrag widerspricht. Wer die Nachbarn
	   angleicht, gleicht bitte nach oben an und nicht diese Zeile nach unten. */
	if (!/^[1-9]\d*$/.test(params.id ?? '')) {
		throw error(400, 'Keine valide Sichtungs-ID angegeben');
	}
	const id = Number(params.id);

	const [current] = await db
		.select({
			id: sightings.id,
			created: sightings.created,
			approvedAt: sightings.approvedAt,
			rejectedAt: sightings.rejectedAt
		})
		.from(sightings)
		.where(eq(sightings.id, id))
		.limit(1);

	if (!current) {
		throw error(404, 'Sichtung nicht gefunden');
	}

	const order = resolveQueueOrder(url.searchParams.get('order'));
	const anchor: QueueAnchor = { created: current.created, id: current.id };
	const istOffen = !isSightingApproved(current) && !isSightingRejected(current);

	/* Die vier Abfragen werden **innerhalb** von `Promise.all` gebaut, nicht
	   davor. `db.select(...)` startet den Builder sofort beim Aufruf — eine
	   Deklaration weiter oben verschiebt die Reihenfolge, in der die Abfragen
	   entstehen, gegenüber der Reihenfolge im Array. Für die Datenbank ist das
	   egal, für den aufzeichnenden Mock im Test nicht: Er ordnet seine
	   Antwortzeilen nach Aufrufreihenfolge zu. Hier stehen beide gleich.

	   Der Rang ist die Zahl der Vorgänger plus eins — dieselbe Keyset-Bedingung
	   wie beim Nachbarn, nur gezählt statt begrenzt. Für eine entschiedene
	   Sichtung wird gar nicht erst gezählt: Sie steht nicht mehr im Stapel, und
	   eine Zahl würde eine Position behaupten, die es nicht gibt. */
	const [next, prev, rankResult, totalResult] = await Promise.all([
		findNeighbor(order, 'next', anchor),
		findNeighbor(order, 'prev', anchor),
		istOffen
			? db
					.select({ count: sql<number>`count(*)` })
					.from(sightings)
					.where(and(openOnly(), queueNeighborCondition(order, 'prev', anchor)))
			: null,
		db
			.select({ count: sql<number>`count(*)` })
			.from(sightings)
			.where(openOnly())
	]);

	/* `count(*)` liefert in Postgres immer genau eine Zeile — auch bei null
	   Treffern steht dort `{ count: 0 }`, nie ein leeres Ergebnis. Eine leere
	   Zeilenliste ist deshalb kein „keine Vorgänger"/„keine Sichtungen", sondern
	   ein gebrochener Vertrag der Abfrage (z. B. ein kaputter Mock in einem
	   Testaufbau). `?? 0` würde das zu einer plausiblen Zahl glätten — genau die
	   Art stiller Fehlanzeige, gegen die dieser Endpunkt laut Docblock antritt.
	   Analog zu `+page.ts` der Detailansicht (`statusLogFailed`): ein Fehlschlag
	   bekommt einen eigenen, sichtbaren Fall statt eines beschönigten Werts —
	   hier als 500, weil es keinen sinnvollen Rückfallwert für eine Position
	   oder eine Gesamtzahl gibt, die die Oberfläche stattdessen anzeigen könnte. */
	const rankRow = rankResult?.[0];
	if (rankResult && !rankRow) {
		throw error(500, 'Rangzählung im offenen Stapel lieferte keine Ergebniszeile');
	}

	const totalRow = totalResult[0];
	if (!totalRow) {
		throw error(500, 'Zählung der offenen Sichtungen lieferte keine Ergebniszeile');
	}

	// `count(*)` ist bigint und kommt je nach Treiber als String zurück —
	// normalisiert wird hier, nicht in jeder Aufrufstelle einzeln.
	return json({
		next,
		prev,
		position: rankRow ? Number(rankRow.count) + 1 : null,
		total: Number(totalRow.count)
	});
};
