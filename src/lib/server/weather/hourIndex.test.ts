/**
 * @fileoverview Der Stundenindex in die Open-Meteo-Zeitreihe darf nicht an der Server-Zeitzone hängen.
 *
 * Open-Meteo wird mit `timezone=Europe/Berlin` abgefragt, `hourly.time[]` ist
 * also deutsche Ortszeit. Der Index wurde bisher aus
 * `combineToDate(datum, zeit).getHours()` gebildet — ein Umweg über ein
 * `Date`, dessen `getHours()` in der Prozess-Zeitzone auswertet. Im UTC-
 * Container griff die Abfrage damit 1–2 Stunden daneben: Sichtungen bekamen
 * das Wetter der falschen Stunde angeheftet.
 *
 * Die Uhrzeit kommt bereits als deutsche Ortszeit im Format "HH:MM" aus dem
 * Formular. Sie direkt zu parsen ist zeitzonenunabhängig.
 */

import { describe, expect, it } from 'vitest';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { NOON_HOUR_INDEX, hourIndexFromLocalTime } from './hourIndex';

describe('hourIndexFromLocalTime', () => {
	it('bildet volle Stunden direkt ab', () => {
		expect(hourIndexFromLocalTime('00:00')).toBe(0);
		expect(hourIndexFromLocalTime('09:00')).toBe(9);
		expect(hourIndexFromLocalTime('23:00')).toBe(23);
	});

	it('rundet auf die nächstliegende Stunde', () => {
		expect(hourIndexFromLocalTime('14:29')).toBe(14);
		expect(hourIndexFromLocalTime('14:30')).toBe(15);
		expect(hourIndexFromLocalTime('14:45')).toBe(15);
	});

	it('begrenzt das Aufrunden auf die letzte Stunde des Tages', () => {
		// 23:45 würde auf 24 aufrunden — die Zeitreihe hat aber nur die Indizes 0..23.
		expect(hourIndexFromLocalTime('23:45')).toBe(23);
	});

	it('fällt bei fehlender oder ungültiger Uhrzeit auf Mittag zurück', () => {
		expect(hourIndexFromLocalTime(undefined)).toBe(NOON_HOUR_INDEX);
		expect(hourIndexFromLocalTime('')).toBe(NOON_HOUR_INDEX);
		expect(hourIndexFromLocalTime('keine Zeit')).toBe(NOON_HOUR_INDEX);
		expect(hourIndexFromLocalTime('99:99')).toBe(NOON_HOUR_INDEX);
	});

	it('liefert in jeder Server-Zeitzone denselben Index', () => {
		for (let stunde = 0; stunde < 24; stunde++) {
			const uhrzeit = `${String(stunde).padStart(2, '0')}:15`;
			const ergebnisse = TEST_TIME_ZONES.map((tz) =>
				withTimeZone(tz, () => hourIndexFromLocalTime(uhrzeit))
			);

			expect(new Set(ergebnisse), `Zeitzonenabhängigkeit bei ${uhrzeit}`).toEqual(
				new Set([stunde])
			);
		}
	});
});
