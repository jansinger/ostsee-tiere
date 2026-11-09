/**
 * SQL-Seite des Anonymisierungs-Jobs.
 *
 * Die Fälligkeit muss vorwärts vom Eingang rechnen und darf den Prüfstatus
 * nicht kennen: Sonst blieben ungeprüfte oder abgelehnte Meldungen unbegrenzt
 * liegen (docs/ANONYMISIERUNG_KONZEPT.md, 5.1).
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { groupByConsents } from './anonymizationPatch';
import { dueForAnonymization } from './anonymizationQueries';

const text = (): string => new PgDialect().sqlToQuery(dueForAnonymization()).sql;

describe('dueForAnonymization', () => {
	it('rechnet vorwärts vom Eingang, mit einem Tag Puffer, in UTC', () => {
		expect(text()).toContain(
			`"sichtungen"."created" + INTERVAL '3 months' - INTERVAL '1 day' <= (NOW() AT TIME ZONE 'UTC')`
		);
	});

	it('nimmt nur noch nicht anonymisierte Meldungen', () => {
		expect(text()).toContain('"sichtungen"."anonymisiert_am" is null');
	});

	it('hängt nicht am Prüfstatus', () => {
		expect(text()).not.toMatch(/freigegeben_am|abgelehnt_am|geprueft/);
	});
});

describe('groupByConsents', () => {
	it('fasst Zeilen gleicher Einwilligungslage zusammen', () => {
		const groups = groupByConsents([
			{ id: 1, nameConsent: 0, shipNameConsent: 0 },
			{ id: 2, nameConsent: 1, shipNameConsent: 0 },
			{ id: 3, nameConsent: 0, shipNameConsent: 0 },
			{ id: 4, nameConsent: 1, shipNameConsent: 1 }
		]);

		expect(groups).toEqual([
			{ consents: { nameConsent: 0, shipNameConsent: 0 }, ids: [1, 3] },
			{ consents: { nameConsent: 1, shipNameConsent: 0 }, ids: [2] },
			{ consents: { nameConsent: 1, shipNameConsent: 1 }, ids: [4] }
		]);
	});

	it('führt unbekannte Werte wie „keine Einwilligung"', () => {
		// Gruppiert wird nach dem, was geleert wird — nicht nach dem Rohwert.
		const groups = groupByConsents([
			{ id: 1, nameConsent: 0, shipNameConsent: 0 },
			{ id: 2, nameConsent: 2, shipNameConsent: -1 }
		]);

		expect(groups).toEqual([{ consents: { nameConsent: 0, shipNameConsent: 0 }, ids: [1, 2] }]);
	});
});
