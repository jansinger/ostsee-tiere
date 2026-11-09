/**
 * `/about` nennt öffentlich, wie viele Menschen gemeldet haben.
 *
 * Gezählt wird über `melder_hash`, nicht über die E-Mail: Nach der
 * Anonymisierung der Kontaktdaten (3 Monate) bräche die öffentliche Zahl sonst
 * auf die letzten drei Monate ein (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 3).
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQLWrapper } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

const dialect = new PgDialect();
const toSqlText = (expression: SQLWrapper): string => dialect.sqlToQuery(expression.getSQL()).sql;

const recorded: Array<{ columns: Record<string, SQLWrapper>; where?: SQLWrapper }> = [];

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: (columns: Record<string, SQLWrapper>) => {
			const eintrag: { columns: Record<string, SQLWrapper>; where?: SQLWrapper } = { columns };
			recorded.push(eintrag);
			const builder = {
				from: () => builder,
				where: (predicate: SQLWrapper) => {
					eintrag.where = predicate;
					return builder;
				},
				then: (resolve: (rows: unknown[]) => unknown) =>
					Promise.resolve([{ count: 6578, earliestYear: 2009 }]).then(resolve)
			};
			return builder;
		}
	}
}));
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { load } = await import('./+page.server');

describe('about load()', () => {
	it('zählt die Melder über melder_hash und nur freigegebene Meldungen', async () => {
		recorded.length = 0;
		const daten = (await load({} as never)) as { totalObservers: number | null };

		const abfrage = recorded[1];
		expect(toSqlText(abfrage!.columns.count!)).toContain('"melder_hash"');
		expect(toSqlText(abfrage!.columns.count!)).not.toContain('email');
		const where = toSqlText(abfrage!.where!);
		expect(where).toContain('"melder_hash" is not null');
		expect(where).toContain('"freigegeben_am"');
		expect(daten.totalObservers).toBe(6578);
	});
});
