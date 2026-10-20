import { afterEach, describe, expect, it } from 'vitest';
import {
	dateFromDayOfYear,
	formatDayOfYearLong,
	getDaysInYear,
	isLeapYear,
	isoDateFromDayOfYear
} from './dateUtils';

describe('isLeapYear', () => {
	it('erkennt normales Jahr als kein Schaltjahr', () => {
		expect(isLeapYear(2023)).toBe(false);
	});

	it('erkennt durch 4 teilbares Jahr als Schaltjahr', () => {
		expect(isLeapYear(2024)).toBe(true);
	});

	it('erkennt durch 100 teilbares Jahr als kein Schaltjahr', () => {
		expect(isLeapYear(1900)).toBe(false);
	});

	it('erkennt durch 400 teilbares Jahr als Schaltjahr', () => {
		expect(isLeapYear(2000)).toBe(true);
	});

	it('erkennt 2028 als Schaltjahr', () => {
		expect(isLeapYear(2028)).toBe(true);
	});
});

describe('dateFromDayOfYear', () => {
	it('gibt den 1. Januar für Tag-Index 0 zurück', () => {
		const date = dateFromDayOfYear(2025, 0);
		expect(date.getFullYear()).toBe(2025);
		expect(date.getMonth()).toBe(0);
		expect(date.getDate()).toBe(1);
	});

	it('gibt den 31. Dezember für den letzten Tag-Index zurück', () => {
		const date = dateFromDayOfYear(2025, 364);
		expect(date.getMonth()).toBe(11);
		expect(date.getDate()).toBe(31);
	});

	it('berücksichtigt den Schalttag (Tag 59 = 29. Februar 2024)', () => {
		const date = dateFromDayOfYear(2024, 59);
		expect(date.getMonth()).toBe(1);
		expect(date.getDate()).toBe(29);
	});
});

describe('isoDateFromDayOfYear', () => {
	it('formatiert Tag-Index 0 als YYYY-01-01', () => {
		expect(isoDateFromDayOfYear(2025, 0)).toBe('2025-01-01');
	});

	it('formatiert Tag-Index 186 in 2025 als 6. Juli', () => {
		expect(isoDateFromDayOfYear(2025, 186)).toBe('2025-07-06');
	});

	it('formatiert den letzten Tag eines Schaltjahres', () => {
		expect(isoDateFromDayOfYear(2024, 365)).toBe('2024-12-31');
	});
});

describe('formatDayOfYearLong', () => {
	it('formatiert Tag-Index 186 in 2025 als „6. Juli" (M10: aria-valuetext)', () => {
		expect(formatDayOfYearLong(2025, 186)).toBe('6. Juli');
	});

	it('formatiert Tag-Index 0 als „1. Januar"', () => {
		expect(formatDayOfYearLong(2025, 0)).toBe('1. Januar');
	});

	it('formatiert den Schalttag als „29. Februar"', () => {
		expect(formatDayOfYearLong(2024, 59)).toBe('29. Februar');
	});

	describe('Locale-Umschaltung (resolveDisplayLocale)', () => {
		afterEach(async () => {
			// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
			// eingebauten Reset — auf den echten Default zurückschalten, damit
			// andere Tests im selben Prozess nicht die englische Locale erben.
			const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => baseLocale);
		});

		it('formatiert deutsch, wenn die aktive Locale de ist', async () => {
			const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => 'de');

			expect(formatDayOfYearLong(2025, 186)).toBe('6. Juli');
		});

		it('formatiert britisch, wenn die aktive Locale en ist', async () => {
			const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => 'en');

			expect(formatDayOfYearLong(2025, 186)).toBe('6 July');
		});
	});
});

describe('getDaysInYear', () => {
	it('gibt 365 für normales Jahr zurück', () => {
		expect(getDaysInYear(2023)).toBe(365);
	});

	it('gibt 366 für Schaltjahr zurück', () => {
		expect(getDaysInYear(2024)).toBe(366);
	});

	it('gibt 365 für durch 100 teilbares Jahr zurück', () => {
		expect(getDaysInYear(1900)).toBe(365);
	});

	it('gibt 366 für durch 400 teilbares Jahr zurück', () => {
		expect(getDaysInYear(2000)).toBe(366);
	});
});
