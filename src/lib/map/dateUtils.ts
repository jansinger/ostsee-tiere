import { getLocale } from '#lib/paraglide/runtime.js';
import { resolveDisplayLocale } from '#lib/utils/format/dateTime.ts';

/**
 * Gibt die Anzahl der Tage in einem Jahr zurück (365 oder 366 bei Schaltjahr).
 */
export function getDaysInYear(year: number): number {
	return isLeapYear(year) ? 366 : 365;
}

/**
 * Prüft ob ein Jahr ein Schaltjahr ist.
 * Schaltjahr: durch 4 teilbar, außer durch 100 — es sei denn auch durch 400 teilbar.
 */
export function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Lokales Datum für einen 0-basierten Tag-Index innerhalb eines Jahres
 * (Tag 0 = 1. Januar). Kalender-Arithmetik über den Date-Konstruktor —
 * robust gegenüber Sommerzeit-Umstellungen.
 */
export function dateFromDayOfYear(year: number, dayIndex: number): Date {
	return new Date(year, 0, 1 + dayIndex);
}

/** ISO-Datum (YYYY-MM-DD, lokale Zeit) eines 0-basierten Tag-Index. */
export function isoDateFromDayOfYear(year: number, dayIndex: number): string {
	const date = dateFromDayOfYear(year, dayIndex);
	const pad = (value: number): string => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Lesbares lokalisiertes Datum („6. Juli" / „6 July") eines 0-basierten
 * Tag-Index — für aria-valuetext der Slider-Griffe (M10).
 */
export function formatDayOfYearLong(year: number, dayIndex: number): string {
	return dateFromDayOfYear(year, dayIndex).toLocaleDateString(resolveDisplayLocale(getLocale()), {
		day: 'numeric',
		month: 'long'
	});
}
