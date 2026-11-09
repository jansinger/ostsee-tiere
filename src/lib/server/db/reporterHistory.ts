/**
 * @fileoverview Melder-Historie für Eingang und Detailansicht.
 *
 * Beantwortet zu einer Meldung: Wie viele **andere** Meldungen derselben
 * Person wurden freigegeben, abgelehnt, sind noch offen — und seit wann meldet
 * sie. Reine Anzeige: Es wird nichts gefiltert, nichts sortiert und nichts
 * entschieden.
 *
 * **Dieselbe Person heißt: derselbe `melder_hash`** (HMAC der normalisierten
 * E-Mail, siehe `#lib/server/privacy/reporterHash.ts`). Bis 2026-11 wurde über
 * `lower(trim(email))` gruppiert; nach der Anonymisierung der Kontaktdaten gibt
 * es diese Adresse nicht mehr, der Hash bleibt. Die Gleichheit ist dieselbe —
 * auf Production nachgezählt: 6.578 Personen über beide Wege.
 *
 * **Der Hash verlässt die Datenbank nicht.** Der Aufrufer übergibt nur
 * Sichtungs-IDs, die Abfrage schlägt den Hash selbst nach und liefert das
 * Aggregat nach Sichtungs-ID. So muss er weder in `INBOX_COLUMNS` (die an den
 * Browser gehen) noch sonst in eine Antwort.
 *
 * **Eine Abfrage für alle gelisteten Sichtungen, nicht eine pro Karte.** Der
 * Eingang listet bis zu 50 Karten; ein Query je Karte kostete 50 Roundtrips für
 * eine Nebeninformation (gleiche Begründung wie in `duplicateCandidates.ts`).
 *
 * **Das Freigabe-Prädikat wird interpoliert, nicht nachgebaut.**
 * `approvedOnly()`/`rejectedOnly()`/`openOnly()` kompilieren auf
 * `"sichtungen"."freigegeben_am" …` — deshalb steht die Tabelle hier
 * **ohne Alias** im FROM. Ein Self-Join mit Alias (`sichtungen c`) hätte die
 * Helfer unbrauchbar gemacht und zum handgeschriebenen Prädikat gezwungen,
 * das `approvalPredicateScan.test.ts` zu Recht verbietet. Die eigene Zeile wird
 * deshalb nicht in SQL ausgeschlossen, sondern in JavaScript abgezogen —
 * exakt, weil ihr Zustand mitgeliefert wird.
 *
 * Die Gruppierung nutzt `idx_melder_hash`.
 */
import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { createLogger } from '#lib/logger.server.ts';
import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { normalizeReporterKey } from '#lib/server/privacy/reporterKey.ts';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';

const logger = createLogger('reporterHistory');

export type { ReporterHistory };
export { normalizeReporterKey };

/** Was der Aufrufer je Sichtung mitbringt — mehr wird nicht gelesen. */
export interface ReporterHistoryInput {
	id: number;
	approvedAt: Date | string | null;
	rejectedAt: Date | string | null;
}

/** Eine Ergebniszeile: das Aggregat des Melders, geschlüsselt nach Sichtung. */
interface AggregateRow {
	id: number | string;
	approved: number | string;
	rejected: number | string;
	open: number | string;
	since: string | null;
}

export async function findReporterHistory(
	rows: ReporterHistoryInput[]
): Promise<Record<number, ReporterHistory>> {
	if (rows.length === 0) return {};

	const idListe = sql.join(
		rows.map((row) => sql`${row.id}`),
		sql`, `
	);

	try {
		/* `to_char` statt des rohen Zeitstempels: `TIMESTAMP_AS_TEXT`
		   (`postgresTypes.ts`) liefert `timestamp without time zone` als Text, und
		   eine `db.execute`-Abfrage läuft an Drizzles Spalten-Mapping vorbei. Ein
		   String ohne Zonenangabe wird von `new Date(...)` als Ortszeit gelesen —
		   im Sommer zwei Stunden daneben, und zwar lautlos.

		   Beide CTEs lesen `sichtungen` ohne Alias, damit die Freigabe-Prädikate
		   interpoliert werden können (siehe Dateikopf). Die Ausgabe nennt nur die
		   Sichtungs-ID und die Zähler, nie den Hash. */
		const result = await db.execute(sql`
			WITH gelistet AS (
				SELECT ${sightings.id} AS id, ${sightings.reporterHash} AS hash
				FROM sichtungen
				WHERE ${sightings.id} IN (${idListe}) AND ${sightings.reporterHash} IS NOT NULL
			),
			aggregat AS (
				SELECT
					${sightings.reporterHash} AS hash,
					count(*) filter (WHERE ${approvedOnly()}) AS approved,
					count(*) filter (WHERE ${rejectedOnly()}) AS rejected,
					count(*) filter (WHERE ${openOnly()}) AS open,
					to_char(min(${sightings.created}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS since
				FROM sichtungen
				WHERE ${sightings.reporterHash} IN (SELECT hash FROM gelistet)
				GROUP BY 1
			)
			SELECT gelistet.id, aggregat.approved, aggregat.rejected, aggregat.open, aggregat.since
			FROM gelistet JOIN aggregat ON aggregat.hash = gelistet.hash
		`);

		const rowsOut = (Array.isArray(result) ? result : []) as AggregateRow[];
		const byId = new Map(rowsOut.map((row) => [Number(row.id), row]));

		const history: Record<number, ReporterHistory> = {};
		for (const row of rows) {
			const aggregate = byId.get(row.id);
			if (!aggregate) continue;

			/* `count(*)` ist bigint und kommt je nach Treiber als String zurück.
			   Unbehandelt verglichen die Schwellen lexikografisch ("9" > "10") —
			   dieselbe Falle wie beim Zähler der Eingangsseite. */
			let approved = Number(aggregate.approved);
			let rejected = Number(aggregate.rejected);
			let open = Number(aggregate.open);

			/* Die eigene Zeile aus dem Topf abziehen, in dem sie steckt.
			   Voraussetzung: `approvedAt` und `rejectedAt` sind nie gleichzeitig
			   gesetzt. Das hält ausschließlich `PATCH /api/sightings/[id]/verify`
			   ein (es setzt beim Freigeben `rejectedAt: null` und umgekehrt, in
			   einem Update) — dieses Modul selbst erzwingt es nicht. Verletzt eine
			   künftige Schreibstelle die Annahme, wandert der Zähler für diese
			   eine Zeile um eins in den falschen Topf (hier `else if`: `approved`
			   gewinnt); `Math.max(0, …)` unten verhindert immerhin, dass daraus ein
			   negativer Zähler wird. */
			if (row.approvedAt) approved -= 1;
			else if (row.rejectedAt) rejected -= 1;
			else open -= 1;

			history[row.id] = {
				approved: Math.max(0, approved),
				rejected: Math.max(0, rejected),
				open: Math.max(0, open),
				since: aggregate.since
			};
		}

		return history;
	} catch (error) {
		/* Fail-open: Die Historie ist Zusatzinformation. Eine fehlgeschlagene
		   Abfrage darf die Arbeitsliste nicht mitnehmen. */
		logger.warn({ error }, 'Melder-Historie konnte nicht ermittelt werden');
		return {};
	}
}
