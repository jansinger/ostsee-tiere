import { describe, expect, it } from 'vitest';
import { findStepForErrors } from './findStepForErrors';
import type { FormStep } from '#lib/types/index.ts';

/**
 * Minimaler, aber realistischer Steps-Aufbau für die Tests — analog zu
 * formStepsConfig (4 Schritte mit jeweils eigenen Feldern).
 */
const steps: FormStep[] = [
	{
		id: 'location-time',
		title: 'Position & Zeit',
		description: '',
		fields: ['latitude', 'longitude', 'sightingDate']
	},
	{
		id: 'sighting-details',
		title: 'Sichtungsdetails',
		description: '',
		fields: ['species', 'totalCount']
	},
	{
		id: 'observations',
		title: 'Beobachtungen',
		description: '',
		fields: ['behavior', 'seaState']
	},
	{
		id: 'contact',
		title: 'Kontaktdaten',
		description: '',
		fields: ['firstName', 'lastName', 'email']
	}
];

describe('findStepForErrors', () => {
	it('liefert null, wenn die Fehler nur auf dem aktuellen Schritt liegen (kein Sprung nötig)', () => {
		const result = findStepForErrors(['species', 'totalCount'], steps, 1);
		expect(result).toBeNull();
	});

	it('springt zu Schritt 1 (Index 0), wenn dort ein Fehler liegt, während man auf Schritt 4 (Index 3) ist', () => {
		const result = findStepForErrors(['latitude'], steps, 3);
		expect(result).toBe(0);
	});

	it('wählt bei Fehlern über mehrere Schritte hinweg den frühesten betroffenen Schritt', () => {
		// Fehler liegen auf Schritt 2 (Index 2) UND Schritt 1 (Index 0) — der frühere gewinnt
		const result = findStepForErrors(['behavior', 'latitude'], steps, 3);
		expect(result).toBe(0);
	});

	it('liefert null (sinnvoller Fallback), wenn nur ein unbekanntes Feld betroffen ist', () => {
		const result = findStepForErrors(['einUnbekanntesFeld'], steps, 2);
		expect(result).toBeNull();
	});

	it('ignoriert unbekannte Felder und springt trotzdem zum frühesten bekannten Schritt', () => {
		const result = findStepForErrors(['einUnbekanntesFeld', 'species'], steps, 3);
		expect(result).toBe(1);
	});

	it('liefert null bei einer leeren Fehlerliste', () => {
		const result = findStepForErrors([], steps, 2);
		expect(result).toBeNull();
	});

	it('liefert null, wenn der früheste betroffene Schritt zufällig der aktuelle ist, obwohl auch spätere Schritte Fehler haben', () => {
		// Fehler auf Schritt 1 (aktuell) und Schritt 3 — Schritt 1 ist früher, also kein Sprung
		const result = findStepForErrors(['species', 'firstName'], steps, 1);
		expect(result).toBeNull();
	});
});
