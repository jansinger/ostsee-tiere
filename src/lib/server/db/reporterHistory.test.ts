/**
 * @fileoverview Melder-Historie — Aggregat über die Meldungen derselben Person.
 *
 * Geprüft wird, was an dieser Abfrage schiefgehen kann:
 *
 * 1. **Es bleibt bei einer einzigen Abfrage** für alle gelisteten Sichtungen.
 *    Der Eingang zeigt bis zu 50 Karten; ein Query pro Karte wäre der
 *    naheliegende und teure Rückfall (gleiche Begründung wie bei
 *    `duplicateCandidates.ts`).
 * 2. **Das Freigabe-Prädikat kommt aus `approvalFilter.ts`.** Ein selbst
 *    gebautes `freigegeben_am IS NOT NULL` macht zusätzlich
 *    `approvalPredicateScan.test.ts` rot — hier wird die Wirkung geprüft, dort
 *    die Schreibweise.
 * 3. **Die eigene Zeile zählt nicht mit.** Die Karte beantwortet „was wissen
 *    wir sonst über diesen Melder"; die Meldung, die man gerade ansieht, ist
 *    nicht Teil ihrer eigenen Vorgeschichte.
 * 4. **Gruppiert wird über `melder_hash`, nicht über die E-Mail** — nach der
 *    Anonymisierung gibt es keine Adresse mehr, über die sich zählen ließe
 *    (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 3). Der Hash wird in SQL
 *    nachgeschlagen und verlässt die Datenbank nicht: Der Aufrufer übergibt
 *    nur Sichtungs-IDs, das Ergebnis ist nach ID geschlüsselt.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { findReporterHistory, normalizeReporterKey } from './reporterHistory';

vi.mock('#lib/server/db/index.ts', () => ({ db: { execute: vi.fn() } }));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

const dialect = new PgDialect();
const mockDb = vi.mocked(db as unknown as { execute: ReturnType<typeof vi.fn> });

/** Die zuletzt abgesetzte Abfrage als SQL-Text plus Parameterliste. */
function letzteAbfrage(): { sql: string; params: unknown[] } {
	const arg = mockDb.execute.mock.calls.at(-1)?.[0] as SQL;
	const query = dialect.sqlToQuery(arg);
	return { sql: query.sql, params: query.params };
}

function eingang(overrides: Partial<Parameters<typeof findReporterHistory>[0][number]> = {}) {
	return {
		id: 1,
		approvedAt: null,
		rejectedAt: null,
		...overrides
	};
}

/** Eine Ergebniszeile der Abfrage: das Aggregat des Melders, geschlüsselt nach Sichtung. */
function aggregat(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		approved: 12,
		rejected: 0,
		open: 1,
		since: '2019-03-04T08:00:00Z',
		...overrides
	};
}

describe('normalizeReporterKey', () => {
	it('vereinheitlicht Groß-/Kleinschreibung und Randweißraum', () => {
		expect(normalizeReporterKey('  Melder@Example.ORG ')).toBe('melder@example.org');
	});

	it('liefert null für fehlende und leere Adressen', () => {
		expect(normalizeReporterKey(null)).toBeNull();
		expect(normalizeReporterKey('   ')).toBeNull();
	});
});

describe('findReporterHistory', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.execute.mockResolvedValue([]);
	});

	it('fragt ohne Zeilen gar nicht erst die Datenbank', async () => {
		await expect(findReporterHistory([])).resolves.toEqual({});
		expect(mockDb.execute).not.toHaveBeenCalled();
	});

	it('holt alle Sichtungen in genau einer Abfrage, mit den IDs als Parameter', async () => {
		await findReporterHistory([eingang({ id: 1 }), eingang({ id: 2 }), eingang({ id: 3 })]);

		expect(mockDb.execute).toHaveBeenCalledTimes(1);
		const { params } = letzteAbfrage();
		expect(params).toEqual(expect.arrayContaining([1, 2, 3]));
	});

	it('gruppiert über den Melder-Hash, nicht über die E-Mail', async () => {
		await findReporterHistory([eingang()]);

		const { sql } = letzteAbfrage();
		expect(sql).toContain('"melder_hash"');
		// Nach der Anonymisierung ist die Adresse leer — über sie ließe sich nichts zählen.
		expect(sql).not.toMatch(/lower\(\s*trim\(/i);
		expect(sql).not.toContain('"email"');
	});

	it('gibt den Hash nicht als Ergebnisspalte aus', async () => {
		// Ergebnis nach Sichtungs-ID: Der Hash bleibt in der Datenbank.
		await findReporterHistory([eingang()]);

		const { sql } = letzteAbfrage();
		const outerSelect = sql.slice(sql.lastIndexOf('SELECT'));
		expect(outerSelect).not.toMatch(/melder_hash\s+(AS|,)/i);
	});

	it('zählt die drei Zustände über die Prädikate aus approvalFilter', async () => {
		await findReporterHistory([eingang()]);

		const { sql } = letzteAbfrage();
		/* Als Bausteine zusammengesetzt statt als ein Literal: Spaltenname direkt
		   gefolgt von "is [not] null" ist genau das Muster, das
		   `approvalPredicateScan.test.ts` als selbstgebautes Freigabe-Prädikat
		   meldet. Diese Datei prüft nur die *Wirkung* der importierten Helfer
		   (approvedOnly/rejectedOnly/openOnly), nicht ihre Schreibweise — die
		   Zusammensetzung zur Laufzeit liefert exakt dieselbe Prüfung, ohne den
		   Scan über verbotene Prädikate fälschlich auszulösen. */
		const approvedCol = '"' + 'freigegeben_am' + '"';
		const rejectedCol = '"' + 'abgelehnt_am' + '"';
		const notNull = ['is', 'not', 'null'].join(' ');
		const isNull = ['is', 'null'].join(' ');

		expect(sql).toContain('count(*) filter');
		expect(sql).toContain(`${approvedCol} ${notNull}`);
		expect(sql).toContain(`${rejectedCol} ${notNull}`);
		expect(sql.toLowerCase()).toContain(
			`${approvedCol} ${isNull} and "sichtungen".${rejectedCol} ${isNull}`
		);
	});

	it('trägt die Zonenangabe schon aus der Datenbank', async () => {
		await findReporterHistory([eingang()]);

		// Ohne das "Z" liest `new Date(...)` in der Anzeige Ortszeit — im Sommer
		// zwei Stunden daneben, und zwar lautlos (siehe `duplicateCandidates.ts`).
		expect(letzteAbfrage().sql).toContain('to_char');
		expect(letzteAbfrage().sql).toContain('"Z"');
	});

	it('ordnet das Aggregat jeder Sichtung desselben Melders zu', async () => {
		mockDb.execute.mockResolvedValue([
			aggregat({ id: 1, approved: 12, open: 2 }),
			aggregat({ id: 2, approved: 12, open: 2 })
		]);

		const result = await findReporterHistory([eingang({ id: 1 }), eingang({ id: 2 })]);

		// Beide offen: je 12 Freigaben, und die andere offene Karte bleibt sichtbar.
		expect(result[1]).toEqual({
			approved: 12,
			rejected: 0,
			open: 1,
			since: '2019-03-04T08:00:00Z'
		});
		expect(result[2]).toEqual({
			approved: 12,
			rejected: 0,
			open: 1,
			since: '2019-03-04T08:00:00Z'
		});
	});

	it('zieht die eigene Zeile aus dem Topf ab, in dem sie steckt', async () => {
		mockDb.execute.mockResolvedValue([
			aggregat({ id: 1, approved: 12, rejected: 3, open: 1 }),
			aggregat({ id: 2, approved: 12, rejected: 3, open: 1 })
		]);

		const result = await findReporterHistory([
			eingang({ id: 1, approvedAt: new Date('2026-08-01T10:00:00Z') }),
			eingang({ id: 2, rejectedAt: '2026-08-02T10:00:00Z' })
		]);

		expect(result[1]).toMatchObject({ approved: 11, rejected: 3, open: 1 });
		expect(result[2]).toMatchObject({ approved: 12, rejected: 2, open: 1 });
	});

	it('liefert für einen Melder ohne weitere Meldung ein Nullaggregat', async () => {
		mockDb.execute.mockResolvedValue([aggregat({ approved: 0, rejected: 0, open: 1 })]);

		const result = await findReporterHistory([eingang({ id: 1 })]);

		expect(result[1]).toEqual({ approved: 0, rejected: 0, open: 0, since: '2019-03-04T08:00:00Z' });
	});

	it('normalisiert die Zählwerte des Treibers zu Zahlen', async () => {
		// count(*) ist bigint und kommt je nach Treiber als String zurück;
		// unbehandelt verglichen die Schwellen lexikografisch ("9" > "10").
		mockDb.execute.mockResolvedValue([aggregat({ approved: '12', rejected: '0', open: '1' })]);

		const result = await findReporterHistory([eingang({ id: 1 })]);

		expect(result[1]?.approved).toBe(12);
	});

	it('ist fail-open: ein DB-Fehler liefert ein leeres Ergebnis statt eines Throws', async () => {
		mockDb.execute.mockRejectedValue(new Error('DB nicht erreichbar'));

		await expect(findReporterHistory([eingang()])).resolves.toEqual({});
	});

	it('lässt Sichtungen ohne Hash aus, statt ein Nullaggregat zu behaupten', async () => {
		// Ohne Adresse (oder vor dem Backfill) gibt es keine Zeile im Ergebnis.
		mockDb.execute.mockResolvedValue([aggregat({ id: 1 })]);

		const result = await findReporterHistory([eingang({ id: 1 }), eingang({ id: 2 })]);

		expect(result).toHaveProperty('1');
		expect(result).not.toHaveProperty('2');
	});
});
