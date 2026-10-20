import { describe, expect, it } from 'vitest';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { formatWallClockDateTime } from './formatWallClockDateTime';

describe('formatWallClockDateTime', () => {
	it('formatiert Datum und Uhrzeit als deutsche Wanduhrzeit', () => {
		expect(formatWallClockDateTime('2026-07-15', '14:30')).toBe('15.07.2026, 14:30');
	});

	it('formatiert nur das Datum wenn keine Uhrzeit vorliegt', () => {
		expect(formatWallClockDateTime('2026-01-05')).toBe('05.01.2026');
	});

	it('ignoriert eine unplausible Uhrzeit', () => {
		expect(formatWallClockDateTime('2026-01-05', 'irgendwann')).toBe('05.01.2026');
	});

	it('meldet fehlende oder unlesbare Datumsangaben', () => {
		expect(formatWallClockDateTime(undefined)).toBe('Nicht angegeben');
		expect(formatWallClockDateTime('15.07.2026')).toBe('Nicht angegeben');
	});

	it('liefert in jeder Zeitzone dieselbe Ausgabe', () => {
		const results = TEST_TIME_ZONES.map((timeZone) =>
			withTimeZone(timeZone, () => formatWallClockDateTime('2026-07-15', '00:30'))
		);

		expect(results).toEqual(TEST_TIME_ZONES.map(() => '15.07.2026, 00:30'));
	});
});
