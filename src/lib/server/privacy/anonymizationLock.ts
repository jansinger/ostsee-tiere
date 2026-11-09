/**
 * @fileoverview Eine anonymisierte Meldung bekommt ihre Kontaktdaten nicht zurück.
 *
 * Zwei Ebenen:
 *
 * - `lockedFieldsIn` — die Route weist eine Bearbeitung ab, die ein geleertes
 *   Feld wieder füllen will, und sagt, welches.
 * - `guardAnonymizedColumns` — das UPDATE selbst lässt geleerte Spalten an
 *   anonymisierten Zeilen stehen. Das hält auch dann, wenn der Job zwischen
 *   Laden und Speichern der Bearbeitungsmaske gelaufen ist; eine Vorabprüfung
 *   allein sähe das nicht.
 *
 * Gesperrt ist, was die Anonymisierung an dieser Zeile geleert hat
 * (`anonymizationPatch.ts`): Kontakt immer, Name ohne Namens-, Schiff ohne
 * Schiffsnamen-Einwilligung. Dazu Hash und Intern-Kennzeichen — sie würden
 * sonst aus einer neu eingetragenen Adresse neu berechnet, und die Meldung
 * hinge an einer anderen Person.
 */
import { sql, type SQL } from 'drizzle-orm';
import { sightings } from '#lib/server/db/schema.ts';
import { clearedColumns, type AnonymizationConsents } from './anonymizationPatch';
import { SIGHTING_COLUMN_CLASSES } from './piiColumns';

type SightingColumn = keyof typeof sightings.$inferSelect;

/** Bedingung, unter der die Spalte an dieser Zeile geschrieben werden darf. */
function writableWhen(column: SightingColumn): SQL | null {
	switch (SIGHTING_COLUMN_CLASSES[column]) {
		case 'contact':
		case 'pseudonym':
			return sql`${sightings.anonymizedAt} IS NULL`;
		case 'name':
			return sql`${sightings.anonymizedAt} IS NULL OR ${sightings.nameConsent} = 1`;
		case 'ship':
			return sql`${sightings.anonymizedAt} IS NULL OR ${sightings.shipNameConsent} = 1`;
		default:
			return null;
	}
}

/**
 * Ersetzt in einem Update-Objekt die Werte gesperrter Spalten durch
 * `CASE WHEN <schreibbar> THEN <neu> ELSE <alt> END`. Fehlende Felder bleiben
 * fehlend, alle übrigen unverändert.
 */
export function guardAnonymizedColumns<T extends Record<string, unknown>>(updateData: T): T {
	const guarded: Record<string, unknown> = { ...updateData };
	for (const [key, value] of Object.entries(updateData)) {
		if (value === undefined || !(key in SIGHTING_COLUMN_CLASSES)) continue;
		const column = key as SightingColumn;
		const condition = writableWhen(column);
		if (!condition) continue;
		// Der neue Wert läuft durch den Encoder der Spalte, wie ein normales `.set()`.
		const param = sql.param(value, sightings[column]);
		guarded[key] = sql`CASE WHEN ${condition} THEN ${param} ELSE ${sightings[column]} END`;
	}
	return guarded as T;
}

export interface AnonymizationRowState extends AnonymizationConsents {
	anonymizedAt: Date | null | undefined;
}

const hasText = (value: unknown): boolean => typeof value === 'string' && /\S/.test(value);

/** Geleerte Felder, die die Eingabe wieder füllen würde. Leer = nichts zu beanstanden. */
export function lockedFieldsIn(
	input: Record<string, unknown>,
	row: AnonymizationRowState
): string[] {
	// `== null`: Eine Zeile ohne die Angabe gilt als nicht anonymisiert.
	if (row.anonymizedAt == null) return [];
	return clearedColumns(row).filter((column) => hasText(input[column]));
}
