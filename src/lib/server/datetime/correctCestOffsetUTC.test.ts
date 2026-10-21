/**
 * @fileoverview Sicherheitsnetz für die Zeitzonen-Abhängigkeit der Sichtungs-Datumsverarbeitung.
 *
 * Hintergrund: Im Docker-Setup war lange kein `TZ` gesetzt, der Container lief
 * also UTC. `correctCestOffsetUTC` steigt bei `getTimezoneOffset() !== 0` sofort
 * wieder aus — die Funktion tut also **nur** auf einem UTC-Server etwas.
 *
 * Bevor `TZ=Europe/Berlin` gesetzt wird, muss bewiesen sein, dass die Pipeline
 * `combineToDate` → `correctCestOffsetUTC` unter beiden Zeitzonen denselben
 * UTC-Zeitpunkt liefert. Sonst verschiebt das Pinnen still alle neu erfassten
 * Sichtungszeiten um 1–2 Stunden.
 */

import { describe, expect, it } from 'vitest';
import { combineToDate } from '#lib/utils/format/dateTime.ts';
import { correctCestOffsetUTC } from './correctCestOffsetUTC';
import { withTimeZone } from './withTimeZone.testutil';

/** Bildet eine Formulareingabe (deutsche Ortszeit) auf den gespeicherten UTC-Zeitpunkt ab. */
function speichereSichtungszeit(datum: string, uhrzeit: string): string {
	return correctCestOffsetUTC(combineToDate(datum, uhrzeit)).toISOString();
}

describe('correctCestOffsetUTC', () => {
	describe('Zeitzonen-Invarianz der Sichtungs-Pipeline', () => {
		it('liefert unter UTC und Europe/Berlin denselben Zeitpunkt (Winter, CET)', () => {
			const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-01-15', '14:30'));
			const berlin = withTimeZone('Europe/Berlin', () =>
				speichereSichtungszeit('2024-01-15', '14:30')
			);

			expect(utc).toBe(berlin);
			// 14:30 MEZ (UTC+1) == 13:30 UTC
			expect(utc).toBe('2024-01-15T13:30:00.000Z');
		});

		it('liefert unter UTC und Europe/Berlin denselben Zeitpunkt (Sommer, CEST)', () => {
			const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-07-15', '14:30'));
			const berlin = withTimeZone('Europe/Berlin', () =>
				speichereSichtungszeit('2024-07-15', '14:30')
			);

			expect(utc).toBe(berlin);
			// 14:30 MESZ (UTC+2) == 12:30 UTC
			expect(utc).toBe('2024-07-15T12:30:00.000Z');
		});

		it('ist für alle 24 Stunden eines Wintertages zeitzonenunabhängig', () => {
			for (let stunde = 0; stunde < 24; stunde++) {
				const uhrzeit = `${String(stunde).padStart(2, '0')}:00`;
				const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-01-15', uhrzeit));
				const berlin = withTimeZone('Europe/Berlin', () =>
					speichereSichtungszeit('2024-01-15', uhrzeit)
				);

				expect(utc, `Abweichung bei ${uhrzeit} (Winter)`).toBe(berlin);
			}
		});

		it('ist für alle 24 Stunden eines Sommertages zeitzonenunabhängig', () => {
			for (let stunde = 0; stunde < 24; stunde++) {
				const uhrzeit = `${String(stunde).padStart(2, '0')}:00`;
				const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-07-15', uhrzeit));
				const berlin = withTimeZone('Europe/Berlin', () =>
					speichereSichtungszeit('2024-07-15', uhrzeit)
				);

				expect(utc, `Abweichung bei ${uhrzeit} (Sommer)`).toBe(berlin);
			}
		});
	});

	describe('Sommerzeit-Grenzen', () => {
		it('behandelt den Tag vor der Zeitumstellung als MEZ', () => {
			// Sommerzeit 2024 beginnt am 31.03.2024
			const ergebnis = withTimeZone('UTC', () => speichereSichtungszeit('2024-03-30', '12:00'));
			expect(ergebnis).toBe('2024-03-30T11:00:00.000Z');
		});

		it('behandelt den Tag nach der Zeitumstellung als MESZ', () => {
			const ergebnis = withTimeZone('UTC', () => speichereSichtungszeit('2024-04-01', '12:00'));
			expect(ergebnis).toBe('2024-04-01T10:00:00.000Z');
		});

		it('behandelt den Tag nach dem Ende der Sommerzeit als MEZ', () => {
			// Sommerzeit 2024 endet am 27.10.2024
			const ergebnis = withTimeZone('UTC', () => speichereSichtungszeit('2024-10-28', '12:00'));
			expect(ergebnis).toBe('2024-10-28T11:00:00.000Z');
		});
	});

	/**
	 * Die Eintrittsbedingung ist `getTimezoneOffset() !== 0`, also der Offset —
	 * nicht der Name der Zeitzone. Das ist Absicht: `combineToDate` setzt die
	 * Uhrzeit per `setHours`, und ob dabei ein Offset einfließt, entscheidet
	 * allein der Offset des Prozesses.
	 *
	 * `Europe/London` im Winter ist der Prüffall dafür — Offset 0, aber nicht
	 * `UTC`. Ein Namensvergleich statt des Offset-Vergleichs würde die Korrektur
	 * hier überspringen und die Wanduhrzeit unkorrigiert speichern.
	 */
	describe('Zonen mit Offset 0, die nicht UTC heißen', () => {
		it('korrigiert unter Europe/London im Winter wie unter UTC', () => {
			const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-01-15', '14:30'));
			const london = withTimeZone('Europe/London', () =>
				speichereSichtungszeit('2024-01-15', '14:30')
			);

			// London ist im Winter GMT (Offset 0), verhält sich in `combineToDate`
			// also exakt wie UTC — dieselbe Korrektur muss greifen.
			expect(london).toBe(utc);
			expect(london).toBe('2024-01-15T13:30:00.000Z');
		});
	});

	/**
	 * Regression: Am Umstellungstag selbst lieferte die Korrektur in der Stunde
	 * 01:00–01:59 Ortszeit einen um eine Stunde verschobenen Zeitpunkt.
	 *
	 * Ursache war ein Vergleich über Systemgrenzen hinweg: `cestStart`/`cestEnd`
	 * lagen auf dem echten UTC-Instant der Umstellung (01:00 UTC), verglichen
	 * wurde aber mit `date.getTime()` — und das ist die von `combineToDate` als
	 * UTC verpackte deutsche Wanduhrzeit. Die Grenzen liegen deshalb jetzt
	 * ebenfalls auf Wanduhrzeit: 02:00 (MEZ→MESZ) bzw. 03:00 (MESZ→MEZ).
	 *
	 * Die Tests oben treffen das nicht, weil sie nur 12:00 prüfen.
	 */
	describe('Umstellungstag: Stunde 01:00–01:59 Ortszeit', () => {
		it('verschiebt eine Sichtung um 01:30 am Tag des MESZ-Beginns nicht', () => {
			const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-03-31', '01:30'));
			const berlin = withTimeZone('Europe/Berlin', () =>
				speichereSichtungszeit('2024-03-31', '01:30')
			);

			expect(utc).toBe(berlin);
			// 01:30 liegt vor der Umstellung um 02:00, gilt also noch als MEZ (UTC+1).
			expect(utc).toBe('2024-03-31T00:30:00.000Z');
		});

		it('verschiebt eine Sichtung um 01:30 am Tag des MESZ-Endes nicht', () => {
			const utc = withTimeZone('UTC', () => speichereSichtungszeit('2024-10-27', '01:30'));
			const berlin = withTimeZone('Europe/Berlin', () =>
				speichereSichtungszeit('2024-10-27', '01:30')
			);

			expect(utc).toBe(berlin);
			// 01:30 liegt vor der Rückstellung um 03:00, gilt also noch als MESZ (UTC+2).
			expect(utc).toBe('2024-10-26T23:30:00.000Z');
		});
	});

	/**
	 * Die Pipeline-Tests oben prüfen nur 2024 und nur volle Stunden abseits der
	 * Grenze. Hier wird die Funktion direkt geprüft, um zwei Dinge abzudecken:
	 *
	 * 1. Die Umschaltung erfolgt exakt auf der Wanduhr-Grenze (02:00 für den
	 *    MESZ-Beginn einschließlich, 03:00 für das MESZ-Ende ausschließlich) —
	 *    ein Vertauschen von `>=` und `>` fällt bei einem 12:00-Test nicht auf.
	 * 2. 2024 ist der Sonderfall, in dem der letzte Sonntag im März tatsächlich
	 *    der 31. ist. Würde `lastMarchSunday` fest auf 31 stehen, wäre das mit
	 *    Testdaten aus 2024 allein nicht zu erkennen.
	 */
	describe('Umstellungszeitpunkt auf die Millisekunde', () => {
		/** Wendet die Korrektur auf eine als UTC verpackte Wanduhrzeit an. */
		function korrigiere(wanduhrMillis: number): number {
			return withTimeZone('UTC', () => correctCestOffsetUTC(new Date(wanduhrMillis)).getTime());
		}

		const EINE_STUNDE = 3_600_000;
		const ZWEI_STUNDEN = 7_200_000;

		// Reale EU-Umstellungstermine: letzter Sonntag im März bzw. Oktober.
		const MAERZ = 2;
		const OKTOBER = 9;

		it.each([
			[2023, 26],
			[2024, 31],
			[2025, 30],
			[2026, 29]
		])('%i: MESZ beginnt exakt um 02:00 Ortszeit', (jahr, tag) => {
			const grenze = Date.UTC(jahr, MAERZ, tag, 2, 0, 0, 0);

			// Eine Millisekunde davor gilt noch MEZ (−1 h) …
			expect(korrigiere(grenze - 1)).toBe(grenze - 1 - EINE_STUNDE);
			// … ab der Grenze MESZ (−2 h). 02:00–02:59 existiert real nicht,
			// die Funktion legt dieses Loch bewusst auf MESZ.
			expect(korrigiere(grenze)).toBe(grenze - ZWEI_STUNDEN);
		});

		it.each([
			[2023, 29],
			[2024, 27],
			[2025, 26],
			[2026, 25]
		])('%i: MESZ endet exakt um 03:00 Ortszeit', (jahr, tag) => {
			const grenze = Date.UTC(jahr, OKTOBER, tag, 3, 0, 0, 0);

			// Eine Millisekunde davor gilt noch MESZ (−2 h) …
			expect(korrigiere(grenze - 1)).toBe(grenze - 1 - ZWEI_STUNDEN);
			// … ab der Grenze wieder MEZ (−1 h).
			expect(korrigiere(grenze)).toBe(grenze - EINE_STUNDE);
		});
	});
});
