/**
 * Guard: Jede Spalte von `sichtungen` ist eingeordnet.
 *
 * Die Anonymisierung (docs/ANONYMISIERUNG_KONZEPT.md) leert genau die Spalten,
 * die `piiColumns.ts` als personenbezogen führt. Eine neue Spalte mit
 * Personenbezug, die dort niemand einträgt, bliebe still außerhalb der
 * Löschfrist. Deshalb ist „nicht eingeordnet" ein Fehler, nicht „vermutlich
 * harmlos" — dieselbe Polarität wie beim Leak-Guard in
 * `publicClientLeakScan.test.ts`.
 */
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { sightings } from '#lib/server/db/schema.ts';
import { SIGHTING_COLUMN_CLASSES } from './piiColumns';

const schemaColumns = Object.keys(getTableColumns(sightings)).sort();
const classified = Object.keys(SIGHTING_COLUMN_CLASSES).sort();

describe('SIGHTING_COLUMN_CLASSES', () => {
	it('ordnet jede Spalte von sichtungen ein', () => {
		const missing = schemaColumns.filter((column) => !classified.includes(column));

		expect(missing, 'Neue Spalte in piiColumns.ts einordnen').toEqual([]);
	});

	it('führt keine Spalten, die es im Schema nicht gibt', () => {
		const stale = classified.filter((column) => !schemaColumns.includes(column));

		expect(stale).toEqual([]);
	});

	it('ordnet die Kontaktdaten als immer zu leeren ein (Entscheidung E1)', () => {
		for (const column of ['email', 'phone', 'fax', 'street', 'zipCode', 'city'] as const) {
			expect(SIGHTING_COLUMN_CLASSES[column]).toBe('contact');
		}
	});

	it('bindet Name und Schiff an ihre Einwilligung (Entscheidungen E1, E2)', () => {
		expect(SIGHTING_COLUMN_CLASSES.firstName).toBe('name');
		expect(SIGHTING_COLUMN_CLASSES.lastName).toBe('name');
		expect(SIGHTING_COLUMN_CLASSES.shipName).toBe('ship');
		expect(SIGHTING_COLUMN_CLASSES.homePort).toBe('ship');
	});

	it('lässt Freitexte stehen, ordnet sie aber als solche ein (Entscheidung E3)', () => {
		expect(SIGHTING_COLUMN_CLASSES.notes).toBe('freeText');
		expect(SIGHTING_COLUMN_CLASSES.otherObservations).toBe('freeText');
	});

	it('führt den Hash als Pseudonym, das bei der Anonymisierung bleibt', () => {
		expect(SIGHTING_COLUMN_CLASSES.reporterHash).toBe('pseudonym');
		expect(SIGHTING_COLUMN_CLASSES.reporterInternal).toBe('pseudonym');
	});
});
