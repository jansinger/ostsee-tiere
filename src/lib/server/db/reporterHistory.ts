/**
 * @fileoverview Melder-Historie für Eingang und Detailansicht.
 *
 * Beantwortet zu einer Meldung: Wie viele **andere** Meldungen derselben
 * E-Mail-Adresse wurden freigegeben, abgelehnt, sind noch offen — und seit wann
 * meldet diese Adresse. Reine Anzeige: Es wird nichts gefiltert, nichts
 * sortiert und nichts entschieden.
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
 * **Kein Index auf `lower(trim(email))`.** Gemessen auf der lokalen DB
 * (~20.000 Zeilen, 2026-08-10): 22 ms als Seq Scan für 50 Adressen. Dieselbe
 * Lage wie bei den Duplikat-Abfragen der Spam-Erkennung; bei deutlichem
 * Wachstum wäre ein Ausdrucksindex der nächste Schritt.
 */
import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { createLogger } from '#lib/logger.server.ts';
import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';

const logger = createLogger('reporterHistory');

export type { ReporterHistory };

/** Was der Aufrufer je Sichtung mitbringt — mehr wird nicht gelesen. */
export interface ReporterHistoryInput {
	id: number;
	email: string | null;
	approvedAt: Date | string | null;
	rejectedAt: Date | string | null;
}

interface AggregateRow {
	reporter: string;
	approved: number | string;
	rejected: number | string;
	open: number | string;
	since: string | null;
}

/**
 * Die Identität eines Melders — kleingeschrieben und ohne Randweißraum.
 *
 * Dieselbe Normalisierung wie im E-Mail-Zweig von `duplicateCandidates.ts`,
 * plus `trim`: Eine Adresse mit angehängtem Leerzeichen wäre sonst ein zweiter
 * Melder. Mehr Normalisierung bewusst nicht — Punkte und `+tag` bei Gmail
 * zusammenzuziehen wäre eine Aussage über einen fremden Anbieter.
 */
export function normalizeReporterKey(email: string | null | undefined): string | null {
	const key = email?.trim().toLowerCase() ?? '';
	return key.length > 0 ? key : null;
}

export async function findReporterHistory(
	rows: ReporterHistoryInput[]
): Promise<Record<number, ReporterHistory>> {
	const keyById = new Map<number, string>();
	for (const row of rows) {
		const key = normalizeReporterKey(row.email);
		if (key) keyById.set(row.id, key);
	}

	const keys = [...new Set(keyById.values())];
	if (keys.length === 0) return {};

	const keyListe = sql.join(
		keys.map((key) => sql`${key}`),
		sql`, `
	);

	try {
		/* `to_char` statt des rohen Zeitstempels: `TIMESTAMP_AS_TEXT`
		   (`postgresTypes.ts`) liefert `timestamp without time zone` als Text, und
		   eine `db.execute`-Abfrage läuft an Drizzles Spalten-Mapping vorbei. Ein
		   String ohne Zonenangabe wird von `new Date(...)` als Ortszeit gelesen —
		   im Sommer zwei Stunden daneben, und zwar lautlos. */
		const result = await db.execute(sql`
			SELECT
				lower(trim(email)) AS reporter,
				count(*) filter (WHERE ${approvedOnly()}) AS approved,
				count(*) filter (WHERE ${rejectedOnly()}) AS rejected,
				count(*) filter (WHERE ${openOnly()}) AS open,
				to_char(min(created), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS since
			FROM sichtungen
			WHERE lower(trim(email)) IN (${keyListe})
			GROUP BY 1
		`);

		const rowsOut = (Array.isArray(result) ? result : []) as AggregateRow[];
		const byKey = new Map(rowsOut.map((row) => [row.reporter, row]));

		const history: Record<number, ReporterHistory> = {};
		for (const row of rows) {
			const key = keyById.get(row.id);
			const aggregate = key ? byKey.get(key) : undefined;
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
