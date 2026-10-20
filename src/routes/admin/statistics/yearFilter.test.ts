/**
 * @fileoverview Jahresauswahl der Admin-Statistik (B5)
 *
 * Der Parameter kommt aus der URL und damit aus einer fremden Hand. Er wird
 * deshalb nicht gegen die tatsächlich vorhandenen Jahre geprüft — diese Liste
 * entsteht erst durch eine eigene Abfrage und wäre eine zweite Quelle —, sondern
 * gegen den plausiblen Bereich zwischen der ältesten echten Sichtung und heute.
 * Ein Jahr ohne Daten liefert dann eine leere, korrekt beschriftete Auswertung
 * statt eines Fehlers; ein unsinniger Wert fällt auf „Alle Jahre" zurück.
 */

import { describe, expect, it } from 'vitest';
import { EARLIEST_PLAUSIBLE_SIGHTING_DATE } from '#lib/server/db/sightingRepository.ts';
import { ALL_YEARS_VALUE, YEAR_PARAM, parseYearParam, plausibleYearRange } from './yearFilter';

const BEREICH = { min: 2002, max: 2026 };

describe('parseYearParam', () => {
	it('liefert ohne Parameter „Alle Jahre" (null)', () => {
		expect(parseYearParam(null, BEREICH)).toBeNull();
	});

	it('liefert für den ausdrücklichen „Alle Jahre"-Wert null', () => {
		expect(parseYearParam(ALL_YEARS_VALUE, BEREICH)).toBeNull();
	});

	it('übernimmt ein Jahr innerhalb des plausiblen Bereichs', () => {
		expect(parseYearParam('2020', BEREICH)).toBe(2020);
		expect(parseYearParam(String(BEREICH.min), BEREICH)).toBe(BEREICH.min);
		expect(parseYearParam(String(BEREICH.max), BEREICH)).toBe(BEREICH.max);
	});

	it('verwirft Jahre außerhalb des Bereichs', () => {
		expect(parseYearParam('1970', BEREICH)).toBeNull();
		expect(parseYearParam(String(BEREICH.min - 1), BEREICH)).toBeNull();
		expect(parseYearParam(String(BEREICH.max + 1), BEREICH)).toBeNull();
	});

	it('verwirft alles, was kein ganzes Jahr ist', () => {
		for (const eingabe of ['', '  ', 'abc', '20a0', '2020.5', '2020;DROP', 'NaN', 'Infinity']) {
			expect(parseYearParam(eingabe, BEREICH), `„${eingabe}" wurde akzeptiert`).toBeNull();
		}
	});

	it('heißt in der URL `jahr`', () => {
		expect(YEAR_PARAM).toBe('jahr');
	});
});

describe('plausibleYearRange', () => {
	it('spannt von der ältesten plausiblen Sichtung bis zum laufenden Jahr', () => {
		const bereich = plausibleYearRange(new Date('2026-08-08T10:00:00Z'));

		expect(bereich.min).toBe(EARLIEST_PLAUSIBLE_SIGHTING_DATE.getUTCFullYear());
		expect(bereich.max).toBe(2026);
	});

	it('rechnet die Obergrenze in deutscher Ortszeit', () => {
		// 31.12. 23:30 UTC ist in Berlin bereits der 01.01. des Folgejahres — die
		// Statistik gruppiert überall in Ortszeit (`berlinDatePart`), die Grenze
		// der Auswahl muss derselben Auslegung folgen.
		const bereich = plausibleYearRange(new Date('2026-12-31T23:30:00Z'));

		expect(bereich.max).toBe(2027);
	});
});
