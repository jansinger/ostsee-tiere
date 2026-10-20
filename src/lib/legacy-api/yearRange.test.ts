/**
 * @fileoverview Der `year`-Filter der Legacy-API muss deutsche Ortszeit-Jahre abgrenzen.
 *
 * `sichtungsdatum` enthält echte UTC-Zeitpunkte, die Ausgabefelder `dt`/`ti`
 * werden aber nach `Europe/Berlin` umgerechnet. Das Jahr einer Sichtung ist
 * damit eine Ortszeit-Frage: eine Sichtung am 01.01.2024 um 00:30 Ortszeit
 * steht als `2023-12-31T23:30Z` in der Spalte und gehört trotzdem ins Jahr 2024.
 *
 * Vorher grenzte `showreports.json` mit `new Date(yearNum, 0, 1)` ab — dem
 * lokalen Konstruktor, dessen Ergebnis an der Server-Zeitzone hängt.
 */

import { describe, expect, it } from 'vitest';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { formatDateDDMMYY, getYearRange } from './date-utils';

describe('getYearRange', () => {
	it('grenzt an Mitternacht deutscher Ortszeit ab', () => {
		const { startDate, endDate } = getYearRange(2024);

		// 01.01.2024 00:00 MEZ == 2023-12-31T23:00Z
		expect(startDate.toISOString()).toBe('2023-12-31T23:00:00.000Z');
		expect(endDate.toISOString()).toBe('2024-12-31T23:00:00.000Z');
	});

	it('deckt sich mit der Jahresauslegung der Ausgabefelder', () => {
		// Der erste enthaltene Zeitpunkt muss ein `dt` aus 2024 liefern,
		// der letzte ebenfalls — sonst filtert der Endpunkt anders als er ausgibt.
		const { startDate, endDate } = getYearRange(2024);

		expect(formatDateDDMMYY(startDate)).toBe('01.01.24');
		expect(formatDateDDMMYY(new Date(endDate.getTime() - 1))).toBe('31.12.24');
	});

	it('schließt eine Sichtung kurz nach Neujahr ein', () => {
		// 01.01.2024 00:30 Ortszeit — vor der Umstellung wäre dieser Datensatz
		// bei UTC-Grenzen ins Jahr 2023 gefallen.
		const neujahrsNacht = new Date('2023-12-31T23:30:00Z');
		const { startDate, endDate } = getYearRange(2024);

		expect(formatDateDDMMYY(neujahrsNacht)).toBe('01.01.24');
		expect(neujahrsNacht >= startDate && neujahrsNacht < endDate).toBe(true);
	});

	it('grenzt halboffen ab: endDate gehört bereits ins Folgejahr', () => {
		// `endDate` ist Neujahr des Folgejahres. Wird es inklusiv gefiltert
		// (SQL `BETWEEN`), landet eine Sichtung exakt um 00:00 Ortszeit am 01.01.
		// in zwei Jahren. Das ist keine Theorie: 365 Datensätze haben genau
		// 00:00 als Uhrzeit, weil keine angegeben wurde.
		const { endDate } = getYearRange(2024);
		const naechstesJahr = getYearRange(2025);

		expect(formatDateDDMMYY(endDate)).toBe('01.01.25');
		expect(endDate.getTime()).toBe(naechstesJahr.startDate.getTime());
	});

	it('liefert in jeder Server-Zeitzone dieselben Grenzen', () => {
		const ergebnisse = TEST_TIME_ZONES.map((tz) =>
			withTimeZone(tz, () => {
				const { startDate, endDate } = getYearRange(2024);
				return `${startDate.toISOString()}..${endDate.toISOString()}`;
			})
		);

		expect(new Set(ergebnisse).size).toBe(1);
	});

	it('behandelt Schaltjahre korrekt', () => {
		const { startDate, endDate } = getYearRange(2024);
		const tage = (endDate.getTime() - startDate.getTime()) / 86_400_000;

		expect(tage).toBe(366);
	});
});
