/**
 * @fileoverview Zählung der beantworteten Zusatzfelder einer Sichtung
 *
 * Grundlage der Kennzahl „Beobachter füllen Zusatzfelder aus" in der Hilfe
 * unter dem Meldeformular (`/api/statistics`).
 *
 * Ein Feld gilt nur dann als beantwortet, wenn darin eine Angabe steht — nicht
 * schon, wenn die Spalte nicht `NULL` ist. Das ist der Unterschied zur
 * früheren Zählung, die bei jeder Sichtung fünf Felder als „ausgefüllt"
 * mitzählte:
 *
 * - `sichtungsdatum` ist Pflichtfeld und gehört nicht dazu.
 * - `seegang` und `sichtweite` stehen per Default auf `0` = „Keine Angabe".
 * - `verhalten` und `verteilung` stehen per Default auf `0` = „Sonstige"; im
 *   Altbestand ist das überwiegend eine nicht gegebene Antwort, neue Daten
 *   tragen dafür `4` = „Keine Angabe". „Sonstige" zählt deshalb nur mit
 *   Freitext (Messung und Begründung in `unspecifiedDefaults.test.ts`).
 * - Texte zählen nur, wenn sie mehr als Leerraum enthalten.
 * - `anzahl_schiffe` hat keinen Default; `0` ist dort eine echte Antwort.
 */

import { sightings } from '#lib/server/db/schema.ts';
import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Text mit mindestens einem Zeichen, das kein Leerraum ist. Nicht `btrim`: Das
 * entfernt nur Leerzeichen, ein bloßer Zeilenumbruch zählte sonst als Angabe.
 * `coalesce`, weil `NULL ~ …` NULL ergibt und die Summe sonst NULL würde.
 */
const hasText = (column: AnyPgColumn): SQL => sql`coalesce(${column} ~ '[^[:space:]]', false)`;

/** `0` = „Sonstige", `4` = „Keine Angabe" — siehe Datei-Kommentar. */
const hasCategory = (column: AnyPgColumn, textColumn: AnyPgColumn): SQL =>
	sql`(${column} not in (0, 4) or (${column} = 0 and ${hasText(textColumn)}))`;

/**
 * Verhalten ist angegeben. Eigens exportiert, weil die Admin-Statistik es als
 * Datenqualitäts-Kennzahl ausweist — dieselbe Bedingung wie in der Zählung.
 */
export function isBehaviorAnswered(): SQL {
	return hasCategory(sightings.behavior, sightings.behaviorText);
}

/**
 * Je Feld eine Bedingung „beantwortet". Als Funktion statt Modulkonstante:
 * Mehrere Route-Tests mocken `drizzle-orm` ohne `sql`, und ein Aufruf beim
 * Import ließe sie scheitern, obwohl sie die Statistik gar nicht benutzen.
 */
const answeredPredicates = (): SQL[] => [
	sql`(${sightings.seaState} > 0)`,
	sql`(${sightings.visibility} > 0)`,
	hasText(sightings.windDirection),
	hasText(sightings.windForce),
	isBehaviorAnswered(),
	hasCategory(sightings.distribution, sightings.distributionText),
	hasText(sightings.reaction),
	sql`(${sightings.shipCount} is not null)`,
	hasText(sightings.shipName),
	hasText(sightings.boatType),
	hasText(sightings.notes)
];

/** Anzahl der Zusatzfelder, über die gezählt wird (gegen die Liste geprüft in optionalFields.test.ts). */
export const OPTIONAL_FIELD_COUNT = 11;

/** SQL-Ausdruck: Anzahl der beantworteten Zusatzfelder einer Zeile (0 … OPTIONAL_FIELD_COUNT). */
export function answeredOptionalFieldCount(): SQL {
	return sql.join(
		answeredPredicates().map((predicate) => sql`${predicate}::int`),
		sql` + `
	);
}

/** SQL-Bedingung: Die Sichtung hat mindestens ein beantwortetes Zusatzfeld. */
export function hasAnsweredOptionalField(): SQL {
	return sql`(${answeredOptionalFieldCount()}) > 0`;
}
