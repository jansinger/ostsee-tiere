import { describe, expect, it } from 'vitest';
import type { FormStep } from '#lib/types/index.ts';
import { resolveServerFieldErrors } from './serverFieldErrors';

const steps: FormStep[] = [
	{ id: 'a', title: 'Position & Zeit', description: '', fields: ['latitude', 'waterway'] },
	{ id: 'b', title: 'Details', description: '', fields: ['species', 'totalCount'] },
	{ id: 'c', title: 'Kontakt', description: '', fields: ['email', 'privacyConsent'] }
];

describe('resolveServerFieldErrors', () => {
	it('nennt den frühesten betroffenen Schritt als Sprungziel', () => {
		const result = resolveServerFieldErrors({ email: 'ungültig', waterway: 'zu lang' }, steps, 2);

		expect(result.targetStep).toBe(0);
	});

	it('verzichtet auf den Sprung, wenn die Fehler schon sichtbar sind', () => {
		const result = resolveServerFieldErrors({ email: 'ungültig' }, steps, 2);

		expect(result.targetStep).toBeNull();
	});

	/**
	 * Die Reihenfolge stammt aus dem ZIEL-Schritt, nicht aus dem aktuellen —
	 * sonst springt `scrollToFirstError` auf das Feld, das in der Server-Antwort
	 * zufällig zuerst stand, statt auf das oberste im Formular.
	 */
	it('liefert die Feldreihenfolge des Zielschritts', () => {
		const result = resolveServerFieldErrors({ waterway: 'zu lang', latitude: 'fehlt' }, steps, 2);

		expect(result.targetStep).toBe(0);
		expect(result.fieldOrder).toEqual(['latitude', 'waterway']);
	});

	it('liefert ohne Sprung die Reihenfolge des aktuellen Schritts', () => {
		const result = resolveServerFieldErrors({ email: 'ungültig' }, steps, 2);

		expect(result.fieldOrder).toEqual(['email', 'privacyConsent']);
	});

	/**
	 * Der eigentliche Grund für den Filter: Ein Fehler an einem Feld, das in
	 * keinem Schritt steht, hat kein Bedienelement — `updateField` löscht nur den
	 * Fehler des GEÄNDERTEN Feldes, also bliebe er bis zum nächsten Absenden im
	 * Store hängen, ohne dass ihn jemand sehen oder beheben könnte.
	 *
	 * Erreichbar ist das: `POST /api/sightings` fällt bei unerwarteter
	 * Fehlerstruktur auf den Schlüssel `allgemein` zurück, und `referenceId`,
	 * `entryChannel` oder `weatherData.*` kommen aus dem Schema, stehen aber in
	 * keinem Schritt.
	 */
	it('verwirft Felder, die in keinem Schritt stehen', () => {
		const result = resolveServerFieldErrors(
			{ allgemein: 'Unbekannter Validierungsfehler', email: 'ungültig' },
			steps,
			2
		);

		expect(result.fields).toEqual({ email: 'ungültig' });
	});

	it('liefert eine leere Karte, wenn ausschließlich unbekannte Felder benannt sind', () => {
		const result = resolveServerFieldErrors({ referenceId: 'kaputt' }, steps, 2);

		expect(result.fields).toEqual({});
		expect(result.targetStep).toBeNull();
	});

	/** Ein unbekanntes Feld darf das Sprungziel nicht mitbestimmen. */
	it('bestimmt das Sprungziel nur aus den bekannten Feldern', () => {
		const result = resolveServerFieldErrors({ allgemein: 'irgendwas', species: 'fehlt' }, steps, 2);

		expect(result.targetStep).toBe(1);
		expect(result.fieldOrder).toEqual(['species', 'totalCount']);
	});
});
