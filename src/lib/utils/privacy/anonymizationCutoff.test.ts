/**
 * Fälligkeit der Anonymisierung, vorwärts vom Eingang gerechnet.
 *
 * Dieselbe Rechnung steht als SQL in `anonymizeSightings.ts`
 * (`created + INTERVAL '3 months' - INTERVAL '1 day'`). Hier wird PostgreSQLs
 * Verhalten nachgebildet: Monate addieren, den Tag auf das Monatsende kappen,
 * dann einen Tag abziehen — alles in UTC, weil `created` ein `timestamp` ohne
 * Zone in UTC ist (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 5.1).
 */
import { describe, expect, it } from 'vitest';
import { ANONYMIZE_AFTER_MONTHS } from '#lib/constants/reporterDataRetention.ts';
import { anonymizationDueAt, isAnonymizationDue } from './anonymizationCutoff';

const utc = (iso: string): Date => new Date(`${iso}Z`);

describe('anonymizationDueAt', () => {
	it('die Frist beträgt drei Monate', () => {
		expect(ANONYMIZE_AFTER_MONTHS).toBe(3);
	});

	it('rechnet drei Monate weniger einen Tag ab Eingang', () => {
		expect(anonymizationDueAt(utc('2026-01-15T10:00:00'))).toEqual(utc('2026-04-14T10:00:00'));
	});

	it('kappt am Monatsende wie PostgreSQL: 31. Mai → 31. August → 30. August', () => {
		expect(anonymizationDueAt(utc('2026-05-31T08:00:00'))).toEqual(utc('2026-08-30T08:00:00'));
	});

	it('30. November → 28. Februar (kein Schaltjahr) → 27. Februar', () => {
		expect(anonymizationDueAt(utc('2026-11-30T12:00:00'))).toEqual(utc('2027-02-27T12:00:00'));
	});

	it('30. November → 29. Februar (Schaltjahr) → 28. Februar', () => {
		expect(anonymizationDueAt(utc('2027-11-30T12:00:00'))).toEqual(utc('2028-02-28T12:00:00'));
	});

	it('wechselt über den Jahreswechsel', () => {
		expect(anonymizationDueAt(utc('2026-10-31T23:59:59'))).toEqual(utc('2027-01-30T23:59:59'));
	});

	it('bleibt bei der Sommerzeit-Umstellung bei derselben UTC-Uhrzeit', () => {
		// 2026-03-29 01:00 UTC springt Berlin auf Sommerzeit
		expect(anonymizationDueAt(utc('2026-03-29T00:30:00'))).toEqual(utc('2026-06-28T00:30:00'));
	});

	it('bleibt bei der Winterzeit-Umstellung bei derselben UTC-Uhrzeit', () => {
		// 2026-10-25 01:00 UTC springt Berlin zurück
		expect(anonymizationDueAt(utc('2026-10-25T01:30:00'))).toEqual(utc('2027-01-24T01:30:00'));
	});
});

describe('isAnonymizationDue', () => {
	const created = utc('2026-01-15T10:00:00');

	it('ist genau an der Grenze fällig', () => {
		expect(isAnonymizationDue(created, utc('2026-04-14T10:00:00'))).toBe(true);
	});

	it('ist einen Tag davor nicht fällig', () => {
		expect(isAnonymizationDue(created, utc('2026-04-13T10:00:00'))).toBe(false);
	});

	it('ist eine Millisekunde davor nicht fällig', () => {
		expect(isAnonymizationDue(created, new Date(utc('2026-04-14T10:00:00').getTime() - 1))).toBe(
			false
		);
	});

	it('ist einen Tag danach fällig', () => {
		expect(isAnonymizationDue(created, utc('2026-04-15T10:00:00'))).toBe(true);
	});
});
