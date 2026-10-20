import { describe, expect, it } from 'vitest';
import { NOT_YET_TRACKED, isBoatSightingFrom, shouldResetBoatDrive } from './boatDriveReset';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';

/**
 * Regressionstest für den stillen Datenverlust im Admin-Formular:
 * Öffnet ein Admin eine bestehende Sichtung mit sightingFrom = Land/Fähre/Sonstiges,
 * durfte boatDrive NICHT beim initialen Rendern (Mount) gelöscht werden, da das
 * bestehende `boatDrive` sonst unsichtbar aus dem Formular-State verschwindet und
 * beim Speichern durch eine falsche 0 ("Sonstiger Bootsantrieb") überschrieben wird.
 */

describe('isBoatSightingFrom', () => {
	it('erkennt Segelschiff als Boot mit Antrieb', () => {
		expect(isBoatSightingFrom(SightingFromEnum.SAILBOAT)).toBe(true);
	});

	it('erkennt Motorboot als Boot mit Antrieb', () => {
		expect(isBoatSightingFrom(SightingFromEnum.MOTORBOAT)).toBe(true);
	});

	it('erkennt Land NICHT als Boot mit Antrieb', () => {
		expect(isBoatSightingFrom(SightingFromEnum.LAND)).toBe(false);
	});

	it('ist robust gegenüber String-Werten aus HTML-Selects', () => {
		expect(isBoatSightingFrom(String(SightingFromEnum.MOTORBOAT))).toBe(true);
		expect(isBoatSightingFrom('3')).toBe(false);
	});
});

describe('shouldResetBoatDrive', () => {
	it('löst beim ersten Durchlauf (kein vorheriger Wert) mit Land KEINEN Reset aus', () => {
		// Admin-Fall: Formular wird mit bestehenden Daten (sightingFrom = Land) gemountet.
		expect(shouldResetBoatDrive(NOT_YET_TRACKED, SightingFromEnum.LAND)).toBe(false);
	});

	it('löst beim ersten Durchlauf (kein vorheriger Wert) mit Motorboot KEINEN Reset aus', () => {
		expect(shouldResetBoatDrive(NOT_YET_TRACKED, SightingFromEnum.MOTORBOAT)).toBe(false);
	});

	it('löst beim Wechsel von Motorboot zu Land einen Reset aus', () => {
		expect(shouldResetBoatDrive(SightingFromEnum.MOTORBOAT, SightingFromEnum.LAND)).toBe(true);
	});

	it('löst beim Wechsel von Segelschiff zu Fähre einen Reset aus', () => {
		expect(shouldResetBoatDrive(SightingFromEnum.SAILBOAT, SightingFromEnum.FERRY)).toBe(true);
	});

	it('löst beim Wechsel von Land zu Motorboot KEINEN Reset aus (Feld wird sichtbar)', () => {
		expect(shouldResetBoatDrive(SightingFromEnum.LAND, SightingFromEnum.MOTORBOAT)).toBe(false);
	});

	it('löst beim Wechsel zwischen zwei Nicht-Boot-Werten (Land -> Fähre) KEINEN erneuten Reset aus', () => {
		expect(shouldResetBoatDrive(SightingFromEnum.LAND, SightingFromEnum.FERRY)).toBe(false);
	});

	it('ist robust bei String- vs. Number-Werten aus HTML-Selects (kein falscher Reset bei gleichem Wert)', () => {
		expect(
			shouldResetBoatDrive(SightingFromEnum.MOTORBOAT, String(SightingFromEnum.MOTORBOAT))
		).toBe(false);
		expect(
			shouldResetBoatDrive(String(SightingFromEnum.MOTORBOAT), SightingFromEnum.MOTORBOAT)
		).toBe(false);
	});

	it('erkennt einen echten Wechsel auch dann, wenn die Werte als String/Number gemischt vorliegen', () => {
		expect(shouldResetBoatDrive('2', SightingFromEnum.LAND)).toBe(true);
		expect(shouldResetBoatDrive(SightingFromEnum.SAILBOAT, '3')).toBe(true);
	});
});
