/**
 * Filter „gleicher Melder wie Meldung X" für Admin-Liste und Export.
 *
 * Verknüpft wird über die ID einer Meldung, nicht über den Hash: Er verlässt
 * den Server nie, auch nicht als URL-Parameter (docs/ANONYMISIERUNG_KONZEPT.md,
 * 6.2). Der Server schlägt den Hash der genannten Meldung selbst nach.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQLWrapper } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseSameReporterParam, sameReporterCondition } from './sameReporterFilter';

const dialect = new PgDialect();
const compile = (condition: SQLWrapper) => dialect.sqlToQuery(condition.getSQL());

describe('parseSameReporterParam', () => {
	it.each([
		['42', 42],
		[' 7 ', 7]
	])('liest %j als %d', (eingabe, erwartet) => {
		expect(parseSameReporterParam(eingabe)).toBe(erwartet);
	});

	it.each([null, '', 'abc', '0', '-3', '4.5', '1e3', '42abc'])('verwirft %j', (eingabe) => {
		expect(parseSameReporterParam(eingabe)).toBeUndefined();
	});
});

describe('sameReporterCondition', () => {
	it('liefert ohne gültige ID kein Prädikat', () => {
		expect(sameReporterCondition(null)).toBeUndefined();
		expect(sameReporterCondition('abc')).toBeUndefined();
	});

	it('vergleicht den Hash mit dem der genannten Meldung, die ID als Parameter', () => {
		const { sql, params } = compile(sameReporterCondition('42') as SQLWrapper);

		expect(sql).toMatch(
			/"sichtungen"\."melder_hash" = \(select .*melder_hash.* where .*id.* = \$1\)/i
		);
		expect(params).toEqual([42]);
		expect(sql).not.toContain('42');
	});
});
