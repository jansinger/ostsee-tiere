/**
 * @fileoverview Legacy-API-Ausgabe nach der UTC-Vereinheitlichung von `sichtungsdatum`.
 *
 * Bis zur Migration enthielt `sichtungsdatum` deutsche Ortszeit als Wanduhrzeit,
 * und die Formatter gaben sie über `getUTC*` unverändert zurück. Nach der
 * Migration steht dort ein echter UTC-Zeitpunkt — die Formatter müssen ihn
 * deshalb nach `Europe/Berlin` umrechnen.
 *
 * Beides zusammen ergibt für den Altbestand **exakt dieselbe Ausgabe** wie
 * vorher: die Migration zieht den Offset ab, der Formatter addiert ihn wieder.
 * Genau das sichert dieser Test ab — die Mobile Apps dürfen keinen Unterschied
 * sehen. Für neu erfasste Sichtungen wird die Ausgabe dadurch von "1–2 h zu
 * früh" auf korrekt gezogen.
 */

import { describe, expect, it } from 'vitest';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { formatDateDDMMYY, formatTimeHHMI } from './date-utils';

/** Offset von Europe/Berlin gegenüber UTC zu einem gegebenen Zeitpunkt, in Millisekunden. */
function berlinOffsetMs(zeitpunkt: Date): number {
	// sv-SE liefert "YYYY-MM-DD HH:MM:SS" — als UTC gelesen ergibt die Differenz den Offset.
	const alsBerlinAbgelesen = new Date(
		`${zeitpunkt.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T')}Z`
	);
	return alsBerlinAbgelesen.getTime() - zeitpunkt.getTime();
}

/**
 * Bildet die Migration nach: naive Ortszeit → echter UTC-Zeitpunkt.
 * Entspricht `(spalte AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'UTC'` in SQL.
 */
function migriere(ortszeit: string): Date {
	const alsUtcGelesen = new Date(`${ortszeit.replace(' ', 'T')}:00Z`);
	return new Date(alsUtcGelesen.getTime() - berlinOffsetMs(alsUtcGelesen));
}

describe('Legacy-API-Formatter nach UTC-Vereinheitlichung', () => {
	describe('gibt deutsche Ortszeit aus', () => {
		it('rechnet Winterzeit (MEZ, UTC+1) um', () => {
			const zeitpunkt = new Date('2012-01-25T13:50:00Z');

			expect(formatDateDDMMYY(zeitpunkt)).toBe('25.01.12');
			expect(formatTimeHHMI(zeitpunkt)).toBe('14:50');
		});

		it('rechnet Sommerzeit (MESZ, UTC+2) um', () => {
			const zeitpunkt = new Date('2024-07-15T12:30:00Z');

			expect(formatDateDDMMYY(zeitpunkt)).toBe('15.07.24');
			expect(formatTimeHHMI(zeitpunkt)).toBe('14:30');
		});

		it('behandelt Mitternacht über die Datumsgrenze', () => {
			// 2023-12-31T23:00Z == 01.01.2024 00:00 MEZ
			const zeitpunkt = new Date('2023-12-31T23:00:00Z');

			expect(formatDateDDMMYY(zeitpunkt)).toBe('01.01.24');
			expect(formatTimeHHMI(zeitpunkt)).toBe('00:00');
		});
	});

	describe('Regressionsschutz für die Mobile Apps', () => {
		// Repräsentative Altdatensätze als Wanduhrzeit, so wie sie heute in der
		// Spalte stehen — inklusive der Fälle ohne Uhrzeit und am Jahreswechsel.
		const altbestand = [
			['2012-01-25 14:50', '25.01.12', '14:50'],
			['2024-07-15 14:30', '15.07.24', '14:30'],
			['2016-01-01 00:00', '01.01.16', '00:00'],
			['2024-01-01 00:00', '01.01.24', '00:00'],
			['2018-06-21 21:15', '21.06.18', '21:15'],
			['2019-12-24 08:05', '24.12.19', '08:05']
		] as const;

		it('liefert nach der Migration unveränderte Ausgabe', () => {
			for (const [ortszeit, erwartetesDatum, erwarteteZeit] of altbestand) {
				const migriert = migriere(ortszeit);

				expect(formatDateDDMMYY(migriert), `Datum für ${ortszeit}`).toBe(erwartetesDatum);
				expect(formatTimeHHMI(migriert), `Zeit für ${ortszeit}`).toBe(erwarteteZeit);
			}
		});

		it('bleibt in jeder Server-Zeitzone identisch', () => {
			const migriert = migriere('2024-07-15 14:30');

			const ergebnisse = TEST_TIME_ZONES.map((tz) =>
				withTimeZone(tz, () => `${formatDateDDMMYY(migriert)} ${formatTimeHHMI(migriert)}`)
			);

			expect(new Set(ergebnisse)).toEqual(new Set(['15.07.24 14:30']));
		});
	});
});
