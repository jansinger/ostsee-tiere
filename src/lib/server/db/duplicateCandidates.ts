/**
 * Duplikat-Hinweis der Eingangsseite (`/admin`, Spec B2).
 *
 * Sucht zu den gelisteten Sichtungen andere Meldungen, die dasselbe Ereignis
 * beschreiben könnten. Das Ergebnis ist ausdrücklich **nur ein Hinweis**: Es
 * wird nichts zusammengeführt, nichts markiert und nichts gefiltert — die
 * Entscheidung trifft der Bearbeiter in der Detailansicht.
 *
 * Die Heuristik hat zwei Zweige, weil derselbe Vorfall auf zwei Wegen doppelt
 * ankommt: Ein Melder schickt sein Formular zweimal ab (gleiche E-Mail,
 * gleiche Zeit), oder zwei Menschen sehen dieselben Tiere (gleicher Ort,
 * ähnliche Zeit).
 *
 * **Eine Abfrage für alle Sichtungen, nicht eine pro Karte.** Die
 * Eingangsseite listet bis zu 50 Karten; der naheliegende Rückfall auf einen
 * Query je Karte kostete 50 Roundtrips für eine Nebeninformation.
 */
import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { createLogger } from '#lib/logger.server.ts';

const logger = createLogger('duplicateCandidates');

/**
 * Radius des Positions-Zweigs. 1 km ist knapp genug, dass zwei Meldungen
 * plausibel dieselben Tiere betreffen, und weit genug für die Streuung, die
 * eine per Karte gesetzte Position mit sich bringt — Melder tippen den Punkt
 * aus der Erinnerung, nicht aus dem GPS.
 */
export const DUPLICATE_RADIUS_METERS = 1000;

/**
 * Zeitfenster des Positions-Zweigs. 2 h deckt den typischen Fall ab, dass
 * dieselbe Tiergruppe von zwei Booten kurz nacheinander gemeldet wird, ohne
 * einen ganzen Beobachtungstag zu einem Duplikat zu erklären.
 */
export const DUPLICATE_TIME_WINDOW_HOURS = 2;

/**
 * Kantenlänge (halbe, in Grad) des Bounding-Box-Vorfilters im Positions-Zweig.
 * Reine Beschleunigung: `ST_DWithin` auf `geography` rechnet in Metern, kann
 * dafür aber den GIST-Index der `geometry`-Spalte nicht nutzen — ein
 * `&&`-Vergleich gegen ein `ST_Expand`-Rechteck schon.
 *
 * Der Wert ist bewusst großzügiger als {@link DUPLICATE_RADIUS_METERS}: 1 km
 * sind in der Ostsee je nach Breitengrad bis zu 0,023° Länge. 0,03° schließt
 * damit garantiert keinen echten Kandidaten aus; die exakte Grenze zieht
 * weiterhin `ST_DWithin`.
 */
export const DUPLICATE_BBOX_DEGREES = 0.03;

/**
 * Höchstzahl genannter Kandidaten pro Karte. Die Eingangsseite ist eine
 * Arbeitsliste — eine aufgeklappte Liste mit 30 Links wäre dort kein Hinweis
 * mehr, sondern eine zweite Tabelle. Wer mehr sehen will, geht in die
 * Detailansicht.
 */
export const DUPLICATE_CANDIDATE_LIMIT = 5;

/** Warum diese Meldung als Kandidat gilt — trägt die Erklärung in der UI. */
export type DuplicateReason = 'email' | 'position';

export interface DuplicateCandidate {
	id: number;
	/** Sichtungszeit als ISO-Zeichenkette in UTC (Formatierung erst in der UI). */
	sightingDate: string;
	species: number;
	reason: DuplicateReason;
}

/** Rohzeile der Abfrage; Spaltennamen kommen aus dem `AS`-Alias der SQL. */
interface CandidateRow {
	sighting_id: number | string;
	candidate_id: number | string;
	sighting_date: string;
	species: number | string;
	same_email: boolean;
}

export async function findDuplicateCandidates(
	ids: number[]
): Promise<Record<number, DuplicateCandidate[]>> {
	if (ids.length === 0) return {};

	const zeitfensterSekunden = DUPLICATE_TIME_WINDOW_HOURS * 3600;
	const idListe = sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `
	);

	try {
		/* `k` ist die gelistete Sichtung, `c` der Kandidat.
		 *
		 * **Die beiden Zweige stehen als `UNION ALL` und nicht als `OR`.** Mit
		 * `OR` in einer WHERE-Klausel kann der Planer keinen der beiden Indizes
		 * nutzen und fällt auf einen Nested Loop über den gesamten Bestand
		 * zurück: gemessen auf der lokalen DB (30k Zeilen, 2026-08-08) **5947 ms**
		 * gegenüber **43 ms** für diese Fassung. Wer das hier zu einer Klausel
		 * zusammenzieht, macht die Eingangsseite unbenutzbar.
		 *
		 * **Der E-Mail-Zweig vergleicht die Kalenderstunde, kein ±1-h-Fenster** —
		 * bewusst asymmetrisch: 10:01 und 10:59 sind Kandidaten, 10:59 und 11:01
		 * nicht. Er zielt auf den doppelt abgeschickten Melder, und dort ist
		 * `sichtungsdatum` die eingegebene Sichtungszeit, in beiden Meldungen also
		 * identisch. Ein Intervall wie im Positions-Zweig zöge stattdessen zwei
		 * getrennte Beobachtungen desselben Melders zusammen.
		 *
		 * Die Zeit trägt ihr `Z` per `to_char` schon aus der Datenbank. Roh käme
		 * hier `"2026-08-01 10:00:00"` an — `TIMESTAMP_AS_TEXT` (`postgresTypes.ts`)
		 * liefert `timestamp without time zone` bewusst als Text, und eine
		 * `db.execute`-Abfrage läuft an Drizzles Spalten-Mapping vorbei, das
		 * sonst das `+0000` anhängt. Ein solcher String ohne Zonenangabe wird von
		 * `new Date(...)` in der Anzeige als **Ortszeit** gelesen: im Sommer zwei
		 * Stunden daneben, und zwar lautlos. */
		const result = await db.execute(sql`
			SELECT sighting_id, candidate_id, sighting_date, species, same_email
			FROM (
				SELECT
					k.id AS sighting_id,
					c.id AS candidate_id,
					to_char(c.sichtungsdatum, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sighting_date,
					c.tierart AS species,
					true AS same_email,
					c.sichtungsdatum AS sort_date
				FROM sichtungen k
				JOIN sichtungen c ON c.id <> k.id
				WHERE k.id IN (${idListe})
					AND k.email IS NOT NULL AND c.email IS NOT NULL
					AND lower(k.email) = lower(c.email)
					AND date_trunc('hour', k.sichtungsdatum) = date_trunc('hour', c.sichtungsdatum)

				UNION ALL

				SELECT
					k.id,
					c.id,
					to_char(c.sichtungsdatum, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
					c.tierart,
					false,
					c.sichtungsdatum
				FROM sichtungen k
				JOIN sichtungen c ON c.id <> k.id
				WHERE k.id IN (${idListe})
					AND k.location IS NOT NULL AND c.location IS NOT NULL
					AND c.location && ST_Expand(k.location, ${DUPLICATE_BBOX_DEGREES})
					AND ST_DWithin(
						k.location::geography,
						c.location::geography,
						${DUPLICATE_RADIUS_METERS}
					)
					AND abs(extract(epoch from (k.sichtungsdatum - c.sichtungsdatum)))
						< ${zeitfensterSekunden}
			) kandidaten
			ORDER BY sighting_id, same_email DESC, sort_date DESC
		`);

		/* postgres.js liefert seine `RowList` als echtes Array-Derivat — der
		   Zweig ist keine Vorsichtsmaßnahme gegen einen anderen Treiber, sondern
		   die Typwand zwischen Drizzles generischem Rückgabetyp und dieser
		   rohen Abfrage. */
		const rows = (Array.isArray(result) ? result : []) as CandidateRow[];
		return gruppiere(rows);
	} catch (error) {
		/* Fail-open: Der Hinweis ist Zusatzinformation. Eine fehlgeschlagene
		   Abfrage darf die Arbeitsliste nicht mitnehmen. */
		logger.warn({ error }, 'Duplikat-Kandidaten konnten nicht ermittelt werden');
		return {};
	}
}

function gruppiere(rows: CandidateRow[]): Record<number, DuplicateCandidate[]> {
	const result: Record<number, DuplicateCandidate[]> = {};
	const gesehen = new Set<string>();

	for (const row of rows) {
		const sightingId = Number(row.sighting_id);
		const candidateId = Number(row.candidate_id);
		/* Beide Zweige können denselben Kandidaten liefern (gleicher Melder,
		   gleiche Stunde, gleicher Ort). Die SQL sortiert `same_email` nach vorn,
		   der erste Treffer trägt damit die aussagekräftigere Begründung. */
		const schluessel = `${sightingId}:${candidateId}`;
		if (gesehen.has(schluessel)) continue;
		gesehen.add(schluessel);

		const liste = (result[sightingId] ??= []);
		if (liste.length >= DUPLICATE_CANDIDATE_LIMIT) continue;
		liste.push({
			id: candidateId,
			sightingDate: row.sighting_date,
			species: Number(row.species),
			reason: row.same_email ? 'email' : 'position'
		});
	}

	return result;
}
