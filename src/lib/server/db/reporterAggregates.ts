/**
 * @fileoverview SQL-Bausteine für Auswertungen über Melder.
 *
 * „Ein Melder" ist seit 2026-11 ein `melder_hash` (HMAC der normalisierten
 * E-Mail, `#lib/server/privacy/reporterHash.ts`), nicht mehr eine Adresse:
 * Die Kontaktdaten werden 3 Monate nach Eingang anonymisiert, der Hash bleibt
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 3). Die Zählung ist dieselbe wie
 * über `lower(trim(email))` — auf Production nachgezählt, 6.578 Personen über
 * beide Wege. Die frühere Statistik zählte über `email` ohne Normalisierung und
 * kam auf 6.747: `Erika@…` und `erika@…` waren zwei Melder.
 *
 * Die Bausteine liegen hier und nicht in den Routen: Keine Route soll den Hash
 * beim Namen nennen (`reporterHashLeakScan.test.ts`). Sie liefern Zähler und
 * Gruppierungen, nie den Hash selbst als Ausgabe.
 */
import { isNotNull, sql, type SQL } from 'drizzle-orm';
import { sightings } from '#lib/server/db/schema.ts';

/** Gruppierungsschlüssel „derselbe Melder". Nur für `GROUP BY`, nie für die Ausgabe. */
export const reporterKey: SQL = sql`${sightings.reporterHash}`;

/** Anzahl verschiedener Melder in der Grundmenge. */
export const distinctReporterCount = sql<number>`COUNT(DISTINCT ${sightings.reporterHash})::integer`;

/** Nur Meldungen, die einem Melder zugeordnet sind. */
export function hasReporter(): SQL {
	return isNotNull(sightings.reporterHash);
}

/**
 * Schließt Adressen des Museums aus (`melder_intern`, gesetzt beim Eingang).
 *
 * Ersetzt `email NOT LIKE '%@meeresmuseum.de'`: Nach der Anonymisierung ist
 * die Domain weg, das Kennzeichen bleibt — und es normalisiert, wo der
 * LIKE-Filter `@Meeresmuseum.de` durchließ. `IS NOT TRUE`, damit `NULL`
 * (keine Adresse) mitzählt.
 */
export function notInternalReporter(): SQL {
	return sql`${sightings.reporterInternal} IS NOT TRUE`;
}

/**
 * Anzeigename einer Melder-Gruppe: die jüngste noch vorhandene Adresse.
 *
 * `NULL`, wenn alle Meldungen dieser Person anonymisiert sind — die Oberfläche
 * zeigt dann „anonymisiert". Aggregatfunktion, also nur zusammen mit
 * `GROUP BY reporterKey`.
 */
export const latestContactEmail = sql<
	string | null
>`(array_agg(${sightings.email} ORDER BY ${sightings.created} DESC) FILTER (WHERE ${sightings.email} ~ '[^[:space:]]'))[1]`;
