/**
 * @fileoverview Was die Anonymisierung an einer Meldung leert.
 *
 * Abgeleitet aus `SIGHTING_COLUMN_CLASSES` (`piiColumns.ts`), nicht als
 * eigene Liste: Eine neue Kontaktspalte, die dort als `contact` eingeordnet
 * wird, leert der Job ohne weitere Änderung mit.
 *
 * Als Einwilligung zählt nur die `1`. Ein unbekannter Wert führt zum Leeren —
 * im Zweifel geht der Name verloren, nicht die Frist.
 */
import type { sightings } from '#lib/server/db/schema.ts';
import { SIGHTING_COLUMN_CLASSES, type SightingColumnClass } from './piiColumns';

type SightingColumn = keyof typeof sightings.$inferSelect;

export interface AnonymizationConsents {
	nameConsent: number;
	shipNameConsent: number;
}

/**
 * Als Update-Typ der Tabelle, damit `db.update().set()` ihn annimmt. Dass jede
 * geleerte Spalte `NULL` überhaupt erlaubt, prüft `anonymizationPatch.test.ts`
 * am Schema — der Typ allein kann das nicht ausdrücken.
 */
export type AnonymizationPatch = Partial<typeof sightings.$inferInsert> & { anonymizedAt: Date };

const CONSENT_GIVEN = 1;

function columnsOf(cls: SightingColumnClass): SightingColumn[] {
	return (Object.keys(SIGHTING_COLUMN_CLASSES) as SightingColumn[]).filter(
		(column) => SIGHTING_COLUMN_CLASSES[column] === cls
	);
}

/** Klassen, die bei dieser Einwilligungslage geleert werden. */
export function clearedClasses(consents: AnonymizationConsents): SightingColumnClass[] {
	const classes: SightingColumnClass[] = ['contact'];
	if (consents.nameConsent !== CONSENT_GIVEN) classes.push('name');
	if (consents.shipNameConsent !== CONSENT_GIVEN) classes.push('ship');
	return classes;
}

/** Spalten, die bei dieser Einwilligungslage geleert werden. */
export function clearedColumns(consents: AnonymizationConsents): SightingColumn[] {
	return clearedClasses(consents).flatMap(columnsOf);
}

export function buildAnonymizationPatch(
	consents: AnonymizationConsents,
	now: Date
): AnonymizationPatch {
	const patch: Record<string, null> = {};
	for (const column of clearedColumns(consents)) patch[column] = null;
	return { ...(patch as Partial<typeof sightings.$inferInsert>), anonymizedAt: now };
}
