import { describe, expect, it } from 'vitest';
import { AnimalConditionEnum } from '#lib/report/formOptions/animalCondition.ts';
import { SpeciesEnum } from '#lib/report/formOptions/species.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';
import { formatSightingForDisplay, isUnknownOrMissingSpecies } from './sightingFormatter';

// Minimale gültige SightingFormValues für Tests
function makeSighting(overrides: Partial<SightingFormValues> = {}): SightingFormValues {
	return {
		species: SpeciesEnum.HARBOR_PORPOISE,
		firstName: 'Max',
		lastName: 'Mustermann',
		email: 'max@example.com',
		privacyConsent: true,
		totalCount: 1,
		...overrides
	} as SightingFormValues;
}

describe('sightingFormatter', () => {
	describe('formatSightingForDisplay()', () => {
		it('übersetzt species-Enum in deutschen Label', () => {
			const result = formatSightingForDisplay(
				makeSighting({ species: SpeciesEnum.HARBOR_PORPOISE })
			);
			expect(result.species).toBe('Schweinswal');
		});

		it('gibt speciesRaw mit dem originalen Enum-Wert zurück', () => {
			const result = formatSightingForDisplay(makeSighting({ species: SpeciesEnum.GREY_SEAL }));
			expect(result.speciesRaw).toBe(SpeciesEnum.GREY_SEAL);
			expect(result.species).toBe('Kegelrobbe');
		});

		it('gibt sightingDate als leeren String zurück wenn kein Datum', () => {
			// sightingDatetime weglassen statt undefined übergeben (exactOptionalPropertyTypes)
			const sighting = makeSighting({});
			delete (sighting as Record<string, unknown>).sightingDatetime;
			const result = formatSightingForDisplay(sighting);
			expect(result.sightingDate).toBe('');
		});

		it('formatiert sightingDatetime in lesbares Datum', () => {
			const date = new Date('2024-06-15T14:30:00Z');
			const result = formatSightingForDisplay(makeSighting({ sightingDatetime: date }));
			expect(result.sightingDate).toBeTruthy();
			expect(typeof result.sightingDate).toBe('string');
		});

		it('gibt coordinatesFormatted als null zurück wenn keine Koordinaten', () => {
			// longitude/latitude weglassen (exactOptionalPropertyTypes erlaubt kein explicit undefined)
			const sighting = makeSighting({});
			delete (sighting as Record<string, unknown>).longitude;
			delete (sighting as Record<string, unknown>).latitude;
			const result = formatSightingForDisplay(sighting);
			expect(result.coordinatesFormatted).toBeNull();
		});

		it('formatiert Koordinaten wenn vorhanden', () => {
			const result = formatSightingForDisplay(makeSighting({ longitude: 13.5, latitude: 54.3 }));
			expect(result.coordinatesFormatted).toBeTruthy();
			expect(typeof result.coordinatesFormatted).toBe('string');
		});

		it('übersetzt behavior-Enum wenn vorhanden', () => {
			const result = formatSightingForDisplay(makeSighting({ behavior: 1 as any }));
			expect(result.behavior).toBeTruthy();
			expect(result.behaviorRaw).toBe(1);
		});

		it('lässt behavior weg wenn nicht gesetzt', () => {
			const sighting = makeSighting({});
			delete (sighting as Record<string, unknown>).behavior;
			const result = formatSightingForDisplay(sighting);
			expect(result.behavior).toBeUndefined();
			expect(result.behaviorRaw).toBeUndefined();
		});

		it('übersetzt distance-Enum wenn vorhanden', () => {
			const result = formatSightingForDisplay(makeSighting({ distance: 2 as any }));
			expect(result.distance).toBeTruthy();
			expect(result.distanceRaw).toBe(2);
		});

		it('lässt distance weg wenn nicht gesetzt', () => {
			const sighting = makeSighting({});
			delete (sighting as Record<string, unknown>).distance;
			const result = formatSightingForDisplay(sighting);
			expect(result.distance).toBeUndefined();
			expect(result.distanceRaw).toBeUndefined();
		});

		/**
		 * Der Zustand eines Totfunds ist ein Enum-Code. Ungefiltert stünde in der
		 * Benachrichtigungs-Mail „Zustand: 3" — die Vorlage kann ihn nicht
		 * auflösen, hier ist die einzige Stelle, an der die Übersetzung passiert.
		 */
		it('übersetzt deadCondition-Enum wenn vorhanden', () => {
			const result = formatSightingForDisplay(
				makeSighting({ isDead: true, deadCondition: AnimalConditionEnum.MEDIUM_DECOMPOSITION })
			);
			expect(result.deadCondition).toBe('Mittlere Verwesung');
			expect(result.deadConditionRaw).toBe(AnimalConditionEnum.MEDIUM_DECOMPOSITION);
		});

		/**
		 * `deadCondition` ist `notNull` mit Vorgabe 0 — „nicht ausgefüllt" kommt
		 * aus der Datenbank also als `UNKNOWN` und nicht als `null` zurück.
		 * Übersetzt ergäbe das die Zeile „Zustand: Unbekannt", die nichts
		 * aussagt; unterdrückt bleibt der Abschnitt still. Das ist der Grund für
		 * `if (deadCondition)` statt `if (deadCondition !== undefined)`.
		 */
		it('unterdrückt deadCondition beim UNKNOWN-Wert 0', () => {
			const result = formatSightingForDisplay(
				makeSighting({ isDead: true, deadCondition: AnimalConditionEnum.UNKNOWN })
			);
			expect(result.deadCondition).toBeUndefined();
			expect(result.deadConditionRaw).toBeUndefined();
		});

		it('lässt deadCondition weg wenn nicht gesetzt', () => {
			const sighting = makeSighting({});
			delete (sighting as Record<string, unknown>).deadCondition;
			const result = formatSightingForDisplay(sighting);
			expect(result.deadCondition).toBeUndefined();
			expect(result.deadConditionRaw).toBeUndefined();
		});

		it('enthält restliche Felder unverändert', () => {
			const result = formatSightingForDisplay(
				makeSighting({ firstName: 'Anna', lastName: 'Schmidt', totalCount: 5 })
			);
			expect(result.firstName).toBe('Anna');
			expect(result.lastName).toBe('Schmidt');
			expect(result.totalCount).toBe(5);
		});
	});

	describe('isUnknownOrMissingSpecies()', () => {
		it('gibt true zurück für null', () => {
			expect(isUnknownOrMissingSpecies(null)).toBe(true);
		});

		it('gibt true zurück für undefined', () => {
			expect(isUnknownOrMissingSpecies(undefined)).toBe(true);
		});

		it('gibt true zurück für leeren String', () => {
			expect(isUnknownOrMissingSpecies('')).toBe(true);
		});

		it('gibt false zurück für 0 (Schweinswal ist bekannt)', () => {
			expect(isUnknownOrMissingSpecies(0)).toBe(false);
		});

		it('gibt false zurück für Schweinswal als String', () => {
			expect(isUnknownOrMissingSpecies('0')).toBe(false);
		});

		it('gibt false zurück für Kegelrobbe (1)', () => {
			expect(isUnknownOrMissingSpecies(1)).toBe(false);
		});

		it('gibt true zurück für unbekannte Walart (8)', () => {
			expect(isUnknownOrMissingSpecies(8)).toBe(true);
		});

		it('gibt true zurück für unbekannte Robbenart (10)', () => {
			expect(isUnknownOrMissingSpecies(10)).toBe(true);
		});

		it('gibt true zurück für ungültigen Wert (99)', () => {
			expect(isUnknownOrMissingSpecies(99)).toBe(true);
		});

		it('akzeptiert String-Werte für gültige Arten', () => {
			expect(isUnknownOrMissingSpecies('1')).toBe(false); // Kegelrobbe
			expect(isUnknownOrMissingSpecies('2')).toBe(false); // Seehund
		});
	});
});
