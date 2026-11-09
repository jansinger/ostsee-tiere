/**
 * Der Melder-Hash verknüpft alle Meldungen einer Person, auch nachdem ihre
 * E-Mail-Adresse gelöscht wurde (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {} as { REPORTER_HASH_KEY?: string }
}));
vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));

import {
	computeReporterHash,
	getReporterHashKey,
	isInternalReporter,
	MIN_REPORTER_HASH_KEY_LENGTH,
	omitReporterIdentity,
	reporterIdentityFor
} from './reporterHash';

const KEY = 'k'.repeat(MIN_REPORTER_HASH_KEY_LENGTH);
const OTHER_KEY = 'o'.repeat(MIN_REPORTER_HASH_KEY_LENGTH);

describe('computeReporterHash', () => {
	it('liefert 64 Hex-Zeichen (HMAC-SHA256)', () => {
		expect(computeReporterHash('erika@example.invalid', KEY)).toMatch(/^[0-9a-f]{64}$/);
	});

	it('ist deterministisch', () => {
		expect(computeReporterHash('erika@example.invalid', KEY)).toBe(
			computeReporterHash('erika@example.invalid', KEY)
		);
	});

	it('behandelt Groß-/Kleinschreibung und Leerzeichen am Rand als dieselbe Adresse', () => {
		// Dieselbe Gleichheit wie die Melder-Historie (`normalizeReporterKey`).
		expect(computeReporterHash('  Erika@Example.INVALID ', KEY)).toBe(
			computeReporterHash('erika@example.invalid', KEY)
		);
	});

	it('unterscheidet verschiedene Adressen', () => {
		expect(computeReporterHash('erika@example.invalid', KEY)).not.toBe(
			computeReporterHash('max@example.invalid', KEY)
		);
	});

	it('hängt vom Schlüssel ab — ohne ihn lässt sich eine vermutete Adresse nicht nachrechnen', () => {
		expect(computeReporterHash('erika@example.invalid', KEY)).not.toBe(
			computeReporterHash('erika@example.invalid', OTHER_KEY)
		);
	});

	it.each([null, undefined, '', '   '])('liefert null ohne Adresse (%j)', (email) => {
		expect(computeReporterHash(email, KEY)).toBeNull();
	});

	it('weist einen zu kurzen Schlüssel ab', () => {
		expect(() =>
			computeReporterHash('erika@example.invalid', 'k'.repeat(MIN_REPORTER_HASH_KEY_LENGTH - 1))
		).toThrow();
	});
});

describe('isInternalReporter', () => {
	it.each([
		['erika@meeresmuseum.de', true],
		[' Erika@Meeresmuseum.DE ', true],
		['erika@example.invalid', false],
		// Nur die Domain selbst, nicht ein Name, der sie enthält
		['erika@meeresmuseum.de.example.invalid', false],
		['meeresmuseum.de@example.invalid', false]
	])('%s → %s', (email, expected) => {
		expect(isInternalReporter(email)).toBe(expected);
	});

	it.each([null, undefined, '', '   '])('liefert null ohne Adresse (%j)', (email) => {
		expect(isInternalReporter(email)).toBeNull();
	});
});

describe('getReporterHashKey', () => {
	beforeEach(() => {
		delete mockEnv.REPORTER_HASH_KEY;
	});

	it('liefert den gesetzten Schlüssel', () => {
		mockEnv.REPORTER_HASH_KEY = KEY;
		expect(getReporterHashKey()).toBe(KEY);
	});

	it('liefert null, wenn kein Schlüssel gesetzt ist', () => {
		expect(getReporterHashKey()).toBeNull();
	});

	it('behandelt einen zu kurzen Schlüssel wie keinen', () => {
		mockEnv.REPORTER_HASH_KEY = 'k'.repeat(MIN_REPORTER_HASH_KEY_LENGTH - 1);
		expect(getReporterHashKey()).toBeNull();
	});
});

describe('reporterIdentityFor', () => {
	it('liefert Hash und Intern-Kennzeichen', () => {
		expect(reporterIdentityFor('erika@meeresmuseum.de', KEY)).toEqual({
			reporterHash: computeReporterHash('erika@meeresmuseum.de', KEY),
			reporterInternal: true
		});
	});

	it('setzt ohne Schlüssel nur den Hash auf null — das Kennzeichen braucht keinen', () => {
		expect(reporterIdentityFor('erika@meeresmuseum.de', null)).toEqual({
			reporterHash: null,
			reporterInternal: true
		});
	});

	it('liefert ohne Adresse beides als null', () => {
		expect(reporterIdentityFor('', KEY)).toEqual({ reporterHash: null, reporterInternal: null });
	});
});

describe('omitReporterIdentity', () => {
	it('entfernt Hash und Intern-Kennzeichen und lässt den Rest stehen', () => {
		const row = { id: 7, species: 1, reporterHash: 'abc', reporterInternal: false };

		expect(omitReporterIdentity(row)).toEqual({ id: 7, species: 1 });
	});

	it('verändert das übergebene Objekt nicht', () => {
		const row = { id: 7, reporterHash: 'abc', reporterInternal: false };

		omitReporterIdentity(row);

		expect(row).toEqual({ id: 7, reporterHash: 'abc', reporterInternal: false });
	});
});
