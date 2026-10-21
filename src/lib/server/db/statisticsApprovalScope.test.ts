/**
 * @fileoverview Öffentliche Statistiken zählen nur freigegebene Sichtungen
 *
 * Bug: `getSightingStatistics()` filterte in keiner Abfrage nach
 * `freigegeben_am`. Die öffentliche Legacy-Karte (`showreports.json`) tut das
 * sehr wohl. Ergebnis (Produktionsstand 2026-07-27): Der Hilfetext im Formular
 * nannte 19.877 Sichtungen, die Karte zeigte 19.262 Marker. Wer nachzählt,
 * bekommt eine andere Zahl als der Text daneben behauptet — für ein
 * Forschungsmuseum ein Glaubwürdigkeitsproblem.
 *
 * Diese Tests fixieren zwei Dinge:
 * 1. Die öffentliche Statistik zählt dieselbe Grundmenge wie die öffentliche
 *    Karte (`freigegeben_am IS NOT NULL`) — genau diese Divergenz war der Bug.
 * 2. `scope: 'both'` liefert getrennte Werte je Freigabestatus und nirgends
 *    eine vermischte Summe.
 *
 * Testansatz: Die Drizzle-Abfragen werden gegen einen aufzeichnenden Mock
 * ausgeführt. Jede `where`-Klausel wird über den echten `PgDialect` zu SQL
 * kompiliert — der Vergleich läuft also über das tatsächlich erzeugte
 * Prädikat, nicht über eine nachgebaute Zeichenkette.
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approvedOnly, pendingOnly } from './approvalFilter';

const dialect = new PgDialect();
const toSqlText = (condition: SQL): string => dialect.sqlToQuery(condition).sql;

/** Alle `where`-Klauseln des letzten `getSightingStatistics()`-Laufs, als SQL. */
let recordedWheres: string[] = [];

/**
 * Zählwert je nach Freigabefilter der Abfrage.
 *
 * Die Werte entsprechen dem Produktionsstand vom 2026-07-27: 19.262
 * freigegeben, 615 offen, 19.877 gesamt. Die Summe darf in keinem Ergebnis
 * auftauchen.
 */
const APPROVED_COUNT = 19_262;
const PENDING_COUNT = 615;
const MIXED_TOTAL = APPROVED_COUNT + PENDING_COUNT;

/** Erkennt den Freigabefilter im kompilierten SQL der `where`-Klausel. */
function countForWhere(whereSql: string | null): number {
	if (whereSql === null) return 0;
	// Reihenfolge wichtig: "is not null" enthält "is null" nicht, aber andere
	// Spalten (z.B. email) tragen ebenfalls IS-NULL-Prädikate — deshalb wird
	// gezielt auf die Spalte `freigegeben_am` geprüft.
	if (whereSql.includes('"freigegeben_am" is not null')) return APPROVED_COUNT;
	if (whereSql.includes('"freigegeben_am" is null')) return PENDING_COUNT;
	return 0;
}

/**
 * Minimaler, aufzeichnender Drizzle-Query-Builder.
 *
 * Deckt genau die Kette ab, die `getSightingStatistics()` verwendet:
 * `select`/`selectDistinct` → `from` → optional `innerJoin` → optional `where`
 * → `as` (Subquery) → await.
 */
function createRecordingBuilder() {
	let lastWhere: string | null = null;
	const builder = {
		from: () => builder,
		innerJoin: () => builder,
		as: () => builder,
		where: (condition: SQL) => {
			const text = toSqlText(condition);
			recordedWheres.push(text);
			lastWhere = text;
			return builder;
		},
		then: (
			resolve: (rows: Array<Record<string, unknown>>) => unknown,
			reject?: (error: unknown) => unknown
		) => {
			const count = countForWhere(lastWhere);
			return Promise.resolve([{ count, avg: 9, minDate: '2002-07-08' }]).then(resolve, reject);
		}
	};
	return builder;
}

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => createRecordingBuilder(),
		selectDistinct: () => createRecordingBuilder()
	}
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { getSightingStatistics } = await import('./sightingRepository');

/**
 * Anzahl der `where`-Klauseln, die ein Lauf mindestens absetzen muss.
 *
 * Bewusst hart verdrahtet: Fällt der Filter an einer Abfrage weg, sinkt die
 * Zahl und der Test schlägt fehl. Wer eine neue Statistikabfrage ergänzt, muss
 * diesen Wert anheben — und wird dabei gezwungen, den Freigabestatus zu
 * berücksichtigen.
 */
const EXPECTED_FILTERED_QUERIES = 7;

describe('Freigabestatus in Sichtungs-Statistiken', () => {
	beforeEach(() => {
		recordedWheres = [];
	});

	describe('Grundmenge der öffentlichen Karte', () => {
		// Dass `approvedOnly()` dasselbe Prädikat erzeugt wie der Ausdruck, der bis
		// zur Zentralisierung wörtlich im Legacy-Endpunkt stand, prüft
		// `src/routes/sichtungen/showreports.json/showreports.test.ts`
		// („erzeugt dieselbe SQL wie der frühere Inline-Filter"). Diese Zusicherung
		// stand hier zweimal; sie gehört an den Legacy-Vertrag, der an das Prädikat
		// gebunden ist, und prüft dort zusätzlich die leere Parameterliste.
		it('bezieht sich auf die Spalte freigegeben_am', () => {
			expect(toSqlText(approvedOnly())).toContain('freigegeben_am');
			expect(toSqlText(pendingOnly())).toContain('freigegeben_am');
		});
	});

	describe('öffentliche Statistik (Default und scope "approved")', () => {
		it('zählt dieselbe Grundmenge wie die öffentliche Karte', async () => {
			await getSightingStatistics();

			const kartenFilter = toSqlText(approvedOnly());
			expect(recordedWheres.length).toBeGreaterThanOrEqual(EXPECTED_FILTERED_QUERIES);
			for (const whereSql of recordedWheres) {
				expect(whereSql, `Abfrage ohne Freigabefilter: ${whereSql}`).toContain(kartenFilter);
			}
		});

		it('filtert ohne Argument genauso wie mit scope "approved"', async () => {
			await getSightingStatistics();
			const defaultWheres = [...recordedWheres];

			recordedWheres = [];
			await getSightingStatistics('approved');

			expect(recordedWheres).toEqual(defaultWheres);
		});

		it('liefert die freigegebene Anzahl, nicht die Gesamtzahl', async () => {
			const stats = await getSightingStatistics('approved');

			expect(stats.totalSightings).toBe(APPROVED_COUNT);
			expect(stats.totalSightings).not.toBe(MIXED_TOTAL);
		});

		it('zählt eine leere E-Mail-Adresse nicht als Person', async () => {
			// `/about` und die Admin-Statistik filtern `email != ''`, die öffentliche
			// Statistik tat es nicht. Heute steht kein Leerstring in der Tabelle, aber
			// sobald einer entstünde, zählte ihn nur eine der beiden öffentlichen
			// Flächen als "Person" — genau die Divergenz, die dieser PR beseitigt.
			await getSightingStatistics('approved');

			const emailFilter = recordedWheres.filter((w) => w.includes('"email"'));
			expect(emailFilter.length).toBeGreaterThan(0);
			for (const whereSql of emailFilter) {
				expect(whereSql, `E-Mail-Abfrage ohne Leerstring-Ausschluss: ${whereSql}`).toContain(
					'"email" <> '
				);
			}
		});

		it('behält den Epoch-Ausschluss zusätzlich zum Freigabefilter', async () => {
			await getSightingStatistics('approved');

			const datumsFilter = recordedWheres.filter((w) => w.includes('sichtungsdatum'));
			expect(datumsFilter.length).toBeGreaterThan(0);
			for (const whereSql of datumsFilter) {
				expect(whereSql).toContain(toSqlText(approvedOnly()));
			}
		});
	});

	describe('scope "pending"', () => {
		it('filtert auf nicht freigegebene Sichtungen', async () => {
			const stats = await getSightingStatistics('pending');

			const offenFilter = toSqlText(pendingOnly());
			for (const whereSql of recordedWheres) {
				expect(whereSql, `Abfrage ohne Freigabefilter: ${whereSql}`).toContain(offenFilter);
			}
			expect(stats.totalSightings).toBe(PENDING_COUNT);
		});
	});

	describe('scope "both"', () => {
		it('liefert getrennte Werte je Freigabestatus', async () => {
			const stats = await getSightingStatistics('both');

			expect(stats.approved.totalSightings).toBe(APPROVED_COUNT);
			expect(stats.pending.totalSightings).toBe(PENDING_COUNT);
		});

		it('erzeugt nirgends eine vermischte Summe', async () => {
			const stats = await getSightingStatistics('both');

			const alleWerte = [...Object.values(stats.approved), ...Object.values(stats.pending)];
			expect(alleWerte).not.toContain(MIXED_TOTAL);
		});

		it('gibt keine Statistikzahl ohne Freigabebezug auf oberster Ebene zurück', async () => {
			const stats = await getSightingStatistics('both');

			// Nur die beiden Status-Buckets — kein `totalSightings` daneben, das
			// sich unbemerkt als Gesamtzahl lesen ließe.
			expect(Object.keys(stats).sort()).toEqual(['approved', 'pending']);
		});
	});

	describe('Fehlerfall', () => {
		it('erfindet keine Zahlen, sondern meldet den Fehler', async () => {
			const { db } = await import('#lib/server/db/index.ts');
			vi.spyOn(db, 'select').mockImplementationOnce(() => {
				throw new Error('DB down');
			});

			await expect(getSightingStatistics('approved')).rejects.toThrow();
		});
	});
});
