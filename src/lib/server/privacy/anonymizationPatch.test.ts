/**
 * Feld-Matrix der Anonymisierung (docs/ANONYMISIERUNG_KONZEPT.md, 5.2).
 *
 * E1: Kontaktdaten immer leeren; Name nur ohne Namens-Einwilligung.
 * E2: Schiffsname und Heimathafen nur ohne Schiffsnamen-Einwilligung.
 * E3: Freitexte bleiben. Hash und Einwilligungsnachweise bleiben.
 */
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { sightings } from '#lib/server/db/schema.ts';
import { buildAnonymizationPatch, clearedColumns } from './anonymizationPatch';
import { SIGHTING_COLUMN_CLASSES } from './piiColumns';

const NOW = new Date('2026-11-09T03:15:00Z');

const CONTACT = { email: null, phone: null, fax: null, street: null, zipCode: null, city: null };
const NAME = { firstName: null, lastName: null };
const SHIP = { shipName: null, homePort: null };

describe('buildAnonymizationPatch', () => {
	it('ohne jede Einwilligung: Kontakt, Name und Schiff leer', () => {
		expect(buildAnonymizationPatch({ nameConsent: 0, shipNameConsent: 0 }, NOW)).toEqual({
			...CONTACT,
			...NAME,
			...SHIP,
			anonymizedAt: NOW
		});
	});

	it('mit Namens-Einwilligung: Name bleibt, Kontakt und Schiff leer', () => {
		expect(buildAnonymizationPatch({ nameConsent: 1, shipNameConsent: 0 }, NOW)).toEqual({
			...CONTACT,
			...SHIP,
			anonymizedAt: NOW
		});
	});

	it('mit Schiffsnamen-Einwilligung: Schiff bleibt, Kontakt und Name leer', () => {
		expect(buildAnonymizationPatch({ nameConsent: 0, shipNameConsent: 1 }, NOW)).toEqual({
			...CONTACT,
			...NAME,
			anonymizedAt: NOW
		});
	});

	it('mit beiden Einwilligungen: nur Kontakt leer (E1)', () => {
		expect(buildAnonymizationPatch({ nameConsent: 1, shipNameConsent: 1 }, NOW)).toEqual({
			...CONTACT,
			anonymizedAt: NOW
		});
	});

	it('wertet nur die 1 als Einwilligung', () => {
		// Unbekannte Werte führen zum Leeren, nicht zum Behalten.
		const patch = buildAnonymizationPatch({ nameConsent: 2, shipNameConsent: -1 }, NOW);
		expect(patch).toMatchObject({ ...NAME, ...SHIP });
	});

	it('fasst Freitexte, Hash, Medien und Einwilligungsnachweise nie an', () => {
		const untouched = Object.entries(SIGHTING_COLUMN_CLASSES)
			.filter(([, cls]) => cls === 'freeText' || cls === 'pseudonym' || cls === 'media')
			.map(([column]) => column);
		const patch = buildAnonymizationPatch({ nameConsent: 0, shipNameConsent: 0 }, NOW);

		for (const column of [...untouched, 'nameConsentAt', 'privacyConsentVersion', 'created']) {
			expect(patch).not.toHaveProperty(column);
		}
	});

	it('leert nur Spalten, die NULL erlauben', () => {
		// Sonst scheitert das Update in der Datenbank — der Typ fängt es nicht.
		const columns = getTableColumns(sightings);
		for (const column of clearedColumns({ nameConsent: 0, shipNameConsent: 0 })) {
			expect(columns[column].notNull, column).toBe(false);
		}
	});
});
