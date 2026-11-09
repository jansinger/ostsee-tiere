/**
 * Fehler aus Datenbankläufen über personenbezogene Daten ohne deren Werte loggen.
 *
 * Ein `DrizzleQueryError` nennt in seiner Meldung die Parameter der Anweisung.
 * Beim Hash-Backfill sind das E-Mail-Adressen — und die Log-Redaction greift
 * nur an Feldnamen, nicht in Fließtext.
 */
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { describeDbError } from './describeDbError';

describe('describeDbError', () => {
	it('nennt Typ und SQLSTATE, aber weder Meldung noch Parameter', () => {
		const cause = Object.assign(new Error('duplicate key value'), { code: '23505' });
		const error = new DrizzleQueryError(
			'update "sichtungen" set "melder_hash" = $1 where "email" = $2',
			['abc', 'erika@example.invalid'],
			cause
		);

		const described = describeDbError(error);

		expect(described).toEqual({ errorName: 'DrizzleQueryError', code: '23505' });
		expect(JSON.stringify(described)).not.toContain('erika@example.invalid');
	});

	it('kommt mit Nicht-Fehlern zurecht', () => {
		expect(describeDbError('kaputt')).toEqual({ errorName: 'string', code: null });
	});
});
