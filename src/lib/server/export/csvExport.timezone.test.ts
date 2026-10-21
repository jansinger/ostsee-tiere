/**
 * @fileoverview CSV-Export muss deutsche Ortszeit liefern — unabhängig von der Server-Zeitzone.
 *
 * Der CSV-Export baute Datum und Uhrzeit aus `getDate()`/`getHours()` zusammen.
 * Diese Getter arbeiten in der **lokalen** Zeitzone des Prozesses. Im Docker-
 * Container (kein `TZ` gesetzt → UTC) lieferte der Export damit UTC-Uhrzeiten,
 * während KML-, XML- und JSON-Export über `formatForExport` explizit
 * `Europe/Berlin` verwenden. Dieselbe Sichtung erschien je nach Exportformat
 * mit 1–2 Stunden Unterschied.
 */

import { describe, expect, it, vi } from 'vitest';
import type { FrontendSighting } from '#lib/types/index.ts';
import { withTimeZone, TEST_TIME_ZONES } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { generateCsvData } from './csvExport';

vi.mock('#lib/report/formOptions/animalBehavior.ts', () => ({
	getAnimalBehaviorLabel: vi.fn((value) => `behavior-${value}`)
}));
vi.mock('#lib/report/formOptions/boatDrive.ts', () => ({
	getBoatDriveLabel: vi.fn((value) => `boatDrive-${value}`)
}));
vi.mock('#lib/report/formOptions/distance.ts', () => ({
	getDistanceLabel: vi.fn((value) => `distance-${value}`)
}));
vi.mock('#lib/report/formOptions/distribution.ts', () => ({
	getDistributionLabel: vi.fn((value) => `distribution-${value}`)
}));
vi.mock('#lib/report/formOptions/seaState.ts', () => ({
	getSeaStateLabel: vi.fn((value) => `seaState-${value}`)
}));
vi.mock('#lib/report/formOptions/sightingFrom.ts', () => ({
	getSightingFromLabel: vi.fn((value) => `sightingFrom-${value}`)
}));
vi.mock('#lib/report/formOptions/species.ts', () => ({
	getSpeciesLabel: vi.fn((value) => `species-${value}`)
}));
vi.mock('#lib/report/formOptions/visibility.ts', () => ({
	getVisibilityLabel: vi.fn((value) => `visibility-${value}`)
}));

/** Minimale Sichtung — nur die für Datum/Uhrzeit relevanten Felder sind gesetzt. */
function sichtungMit(sightingDate: string): FrontendSighting {
	return { id: 'tz-1', sightingDate, species: 0, totalCount: 1 } as unknown as FrontendSighting;
}

/** Liefert `[Datum, Uhrzeit]` aus der ersten Datenzeile des CSV. */
function datumUndUhrzeit(csv: string): [string, string] {
	const spalten = csv.split('\n')[1]?.split(';') ?? [];
	return [spalten[1]?.replaceAll('"', '') ?? '', spalten[2]?.replaceAll('"', '') ?? ''];
}

describe('csvExport — Zeitzonenbehandlung', () => {
	it('gibt Winterzeit als MEZ (UTC+1) aus', () => {
		// 2024-01-15T14:30Z == 15:30 MEZ
		const [datum, uhrzeit] = datumUndUhrzeit(
			withTimeZone('UTC', () => generateCsvData([sichtungMit('2024-01-15T14:30:00.000Z')]))
		);

		expect(datum).toBe('15.01.2024');
		expect(uhrzeit).toBe('15:30');
	});

	it('gibt Sommerzeit als MESZ (UTC+2) aus', () => {
		// 2024-07-15T14:30Z == 16:30 MESZ
		const [datum, uhrzeit] = datumUndUhrzeit(
			withTimeZone('UTC', () => generateCsvData([sichtungMit('2024-07-15T14:30:00.000Z')]))
		);

		expect(datum).toBe('15.07.2024');
		expect(uhrzeit).toBe('16:30');
	});

	it('liefert in jeder Server-Zeitzone dasselbe Ergebnis', () => {
		const sichtung = sichtungMit('2024-07-15T22:30:00.000Z');

		const ergebnisse = TEST_TIME_ZONES.map((tz) =>
			datumUndUhrzeit(withTimeZone(tz, () => generateCsvData([sichtung]))).join(' ')
		);

		// 2024-07-15T22:30Z == 16.07.2024 00:30 MESZ — der Tageswechsel macht die
		// Zeitzonenabhängigkeit sichtbar, falls sie zurückkehrt.
		expect(new Set(ergebnisse)).toEqual(new Set(['16.07.2024 00:30']));
	});
});
