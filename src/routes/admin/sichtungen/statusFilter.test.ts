/* Das Mock-Muster für drizzle-orm steht bereits in
   `src/routes/api/sightings/export/exportFilterParams.test.ts` (Zeilen 7–25) —
   von dort übernehmen, nicht neu erfinden. */
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQLWrapper } from 'drizzle-orm';
import { statusCondition } from './statusFilter';
import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';

// Die von statusCondition() zurückgegebenen SQL-Objekte enthalten das
// vollständige Drizzle-Tabellenschema und referenzieren sich dabei selbst
// (Spalte -> Tabelle -> Spalte …) — `JSON.stringify` bricht daran mit
// "Converting circular structure to JSON" ab. `PgDialect` kompiliert das
// Prädikat stattdessen zu echtem SQL-Text, wie es page.server.test.ts bereits
// für dieselbe Art von Vergleich tut.
const dialect = new PgDialect();
const toSqlText = (condition: SQLWrapper): string => dialect.sqlToQuery(condition.getSQL()).sql;

describe('statusCondition', () => {
	it('bildet die drei Zustände auf die vorhandenen Prädikate ab', () => {
		expect(toSqlText(statusCondition('approved') as SQLWrapper)).toBe(toSqlText(approvedOnly()));
		expect(toSqlText(statusCondition('rejected') as SQLWrapper)).toBe(toSqlText(rejectedOnly()));
		expect(toSqlText(statusCondition('open') as SQLWrapper)).toBe(toSqlText(openOnly()));
	});

	/*
	 * Regression zum Bestandsbefund vom 2026-08-07: 22 Zeilen tragen die alte
	 * Spalte auf 1 ohne Freigabe, 9 eine Freigabe ohne die alte Spalte auf 1.
	 * Der alte Filter las diese Spalte und lieferte damit beide Gruppen falsch.
	 */
	it('filtert nie über geprueft', () => {
		for (const wert of ['open', 'approved', 'rejected', '1', '0']) {
			expect(toSqlText(statusCondition(wert) as SQLWrapper)).not.toContain('geprueft');
		}
	});

	it('liefert ohne Filterwert kein Prädikat', () => {
		expect(statusCondition(null)).toBeUndefined();
		expect(statusCondition('quatsch')).toBeUndefined();
	});
});
