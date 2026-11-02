/**
 * @fileoverview Bausteine, die öffentliche und Admin-Statistik teilen
 *
 * Bug (2026-11): „Mit Medien" stand im Admin bei 3.314 freigegebenen
 * Sichtungen, die öffentliche Hilfe nannte 829. Der Admin zählte das
 * Kennzeichen `aufnahmeHochladen` — das heißt nur „Aufnahme angekündigt" und
 * ist im Altbestand 13 Jahre lang gesetzt worden, oft ohne dass je eine Datei
 * kam. Die öffentliche Statistik zählte vorhandene Dateien. Beide Seiten
 * nutzen jetzt dieses eine Prädikat.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { hasMediaFiles } from './statisticsPredicates';

const dialect = new PgDialect();

describe('hasMediaFiles', () => {
	const text = dialect.sqlToQuery(hasMediaFiles()).sql;

	it('prüft auf eine vorhandene Datei zur Sichtung', () => {
		expect(text).toMatch(/^exists \(select 1 from "sichtungen_dateien"/);
		expect(text).toContain('"sichtungen_dateien"."sichtung_id" = "sichtungen"."id"');
	});

	it('wertet das Ankündigungs-Kennzeichen aufnahmeHochladen nicht aus', () => {
		expect(text).not.toContain('aufnahmeHochladen');
	});
});
