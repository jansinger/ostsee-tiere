/**
 * SQL-Bausteine für Auswertungen über Melder (Statistik, /about).
 *
 * Gezählt wird über `melder_hash`, nicht über die E-Mail: Nach der
 * Anonymisierung gibt es keine Adresse mehr, über die sich zählen ließe
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 3). Die Bausteine liegen hier und
 * nicht in den Routen, damit keine Route den Hash beim Namen nennt
 * (`reporterHashLeakScan.test.ts`).
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQLWrapper } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	distinctReporterCount,
	hasReporter,
	latestContactEmail,
	notInternalReporter,
	reporterKey
} from './reporterAggregates';

const dialect = new PgDialect();
const text = (expression: SQLWrapper): string => dialect.sqlToQuery(expression.getSQL()).sql;

describe('reporterAggregates', () => {
	it('zählt verschiedene Melder über den Hash', () => {
		expect(text(distinctReporterCount)).toMatch(
			/count\(distinct "sichtungen"\."melder_hash"\)::integer/i
		);
		expect(text(distinctReporterCount)).not.toContain('email');
	});

	it('gruppiert über den Hash', () => {
		expect(text(reporterKey)).toBe('"sichtungen"."melder_hash"');
	});

	it('nimmt nur Meldungen mit Hash', () => {
		expect(text(hasReporter())).toBe('"sichtungen"."melder_hash" is not null');
	});

	it('schließt Museums-Adressen über melder_intern aus, nicht über die Domain', () => {
		// Nach der Anonymisierung ist die Domain weg; das Kennzeichen bleibt.
		// `IS NOT TRUE` statt `= false`: NULL (Altbestand ohne Adresse) zählt mit.
		expect(text(notInternalReporter()).toLowerCase()).toBe(
			'"sichtungen"."melder_intern" is not true'
		);
	});

	it('zeigt die jüngste noch vorhandene Adresse, NULL wenn alle anonymisiert sind', () => {
		const sql = text(latestContactEmail);
		expect(sql).toMatch(
			/array_agg\("sichtungen"\."email" order by "sichtungen"\."created" desc\)/i
		);
		expect(sql).toMatch(/filter \(where "sichtungen"\."email" ~ '\[\^\[:space:\]\]'\)/i);
		expect(sql).toMatch(/\)\[1\]$/);
	});
});
