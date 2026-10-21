/**
 * @fileoverview Duplikat-Hinweis der Eingangsseite (Spec B2).
 *
 * Geprüft wird beides, was an dieser Heuristik schiefgehen kann:
 *
 * 1. **Die Schwellen stehen wirklich in der SQL.** Zwei Meldungen sind
 *    Kandidaten, wenn E-Mail und Kalenderstunde übereinstimmen ODER die
 *    Positionen unter 1 km und die Sichtungszeiten unter 2 h auseinander
 *    liegen. Eine Konstante, die niemand in die Abfrage einsetzt, fällt sonst
 *    nicht auf — die Anzeige wäre nur „etwas" anders.
 * 2. **Es bleibt bei einer einzigen Abfrage für alle Sichtungen.** Die
 *    Eingangsseite listet bis zu 50 Karten; ein Query pro Karte wäre der
 *    naheliegende und teure Rückfall.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import {
	DUPLICATE_BBOX_DEGREES,
	DUPLICATE_CANDIDATE_LIMIT,
	DUPLICATE_RADIUS_METERS,
	DUPLICATE_TIME_WINDOW_HOURS,
	findDuplicateCandidates
} from './duplicateCandidates';

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

function zeile(overrides: Record<string, unknown> = {}) {
	return {
		sighting_id: 1,
		candidate_id: 2,
		sighting_date: '2026-08-01T10:00:00Z',
		species: 0,
		same_email: true,
		...overrides
	};
}

describe('findDuplicateCandidates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.execute.mockResolvedValue([]);
	});

	it('fragt ohne IDs gar nicht erst die Datenbank', async () => {
		await expect(findDuplicateCandidates([])).resolves.toEqual({});
		expect(mockDb.execute).not.toHaveBeenCalled();
	});

	it('holt alle Kandidaten in genau einer Abfrage', async () => {
		await findDuplicateCandidates([1, 2, 3, 4, 5]);

		expect(mockDb.execute).toHaveBeenCalledTimes(1);
		expect(letzteAbfrage().params).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
	});

	it('prüft E-Mail-Gleichheit auf dieselbe Kalenderstunde und ohne Groß-/Kleinschreibung', async () => {
		await findDuplicateCandidates([1]);

		const { sql } = letzteAbfrage();
		expect(sql).toContain("date_trunc('hour'");
		expect(sql).toMatch(/lower\([^)]*email\)\s*=\s*lower\([^)]*email\)/i);
	});

	it('prüft die Position per ST_DWithin mit 1 km und 2 h Zeitfenster', async () => {
		await findDuplicateCandidates([1]);

		const { sql, params } = letzteAbfrage();
		expect(sql).toContain('ST_DWithin');
		// Meter statt Grad: die Geometrie wird dafür nach geography gecastet.
		expect(sql).toContain('geography');
		expect(params).toContain(DUPLICATE_RADIUS_METERS);
		expect(params).toContain(DUPLICATE_TIME_WINDOW_HOURS * 3600);
	});

	/**
	 * Gemessen auf der lokalen DB (30k Zeilen, 2026-08-08): Beide Zweige mit
	 * `OR` in **einer** WHERE-Klausel brauchten **5947 ms** — der Planer kann
	 * für eine Oder-Verknüpfung keinen der beiden Indizes nutzen und fällt auf
	 * einen Nested Loop über den gesamten Bestand zurück. Als `UNION ALL` mit
	 * Bounding-Box-Vorfilter sind es 43 ms.
	 *
	 * Der Bounding-Box-Vorfilter ist dabei der Teil, der den Positions-Zweig
	 * trägt: `ST_DWithin` auf `geography` kann den vorhandenen GIST-Index auf
	 * der `geometry`-Spalte nicht verwenden, `&&` gegen ein `ST_Expand`-Rechteck
	 * schon. Er ist bewusst großzügiger als der Radius — die exakte Grenze
	 * bleibt `ST_DWithin`.
	 */
	it('trennt die beiden Zweige per UNION ALL und filtert die Position über den GIST-Index vor', async () => {
		await findDuplicateCandidates([1]);

		const { sql, params } = letzteAbfrage();
		expect(sql).toContain('UNION ALL');
		expect(sql).toContain('ST_Expand');
		expect(params).toContain(DUPLICATE_BBOX_DEGREES);
		// Der Vorfilter darf die Heuristik nur beschleunigen, nicht verengen:
		// 1 km sind je nach Breitengrad bis zu 0,023° Länge.
		expect(DUPLICATE_BBOX_DEGREES).toBeGreaterThan(0.023);
	});

	it('gruppiert die Kandidaten nach der gelisteten Sichtung', async () => {
		mockDb.execute.mockResolvedValue([
			zeile({ sighting_id: 1, candidate_id: 2 }),
			zeile({ sighting_id: 1, candidate_id: 3, same_email: false }),
			zeile({ sighting_id: 7, candidate_id: 9 })
		]);

		const result = await findDuplicateCandidates([1, 7]);

		expect(Object.keys(result)).toEqual(['1', '7']);
		expect(result[1]?.map((k) => k.id)).toEqual([2, 3]);
		expect(result[1]?.[0]?.reason).toBe('email');
		expect(result[1]?.[1]?.reason).toBe('position');
		expect(result[7]?.[0]).toEqual({
			id: 9,
			sightingDate: '2026-08-01T10:00:00Z',
			species: 0,
			reason: 'email'
		});
	});

	/* Beide Zweige der Heuristik können denselben Kandidaten liefern (gleicher
	   Melder, gleiche Stunde, gleicher Ort). Ohne Entdopplung stünde „2 ähnliche
	   Meldungen" über einer einzigen fremden Sichtung. */
	it('nennt einen Kandidaten nur einmal, auch wenn beide Zweige greifen', async () => {
		mockDb.execute.mockResolvedValue([
			zeile({ candidate_id: 2, same_email: true }),
			zeile({ candidate_id: 2, same_email: false })
		]);

		const result = await findDuplicateCandidates([1]);

		expect(result[1]).toHaveLength(1);
		expect(result[1]?.[0]?.reason).toBe('email');
	});

	it('kappt die Liste pro Sichtung auf die Obergrenze', async () => {
		mockDb.execute.mockResolvedValue(
			Array.from({ length: DUPLICATE_CANDIDATE_LIMIT + 3 }, (_, index) =>
				zeile({ candidate_id: index + 2 })
			)
		);

		const result = await findDuplicateCandidates([1]);

		expect(result[1]).toHaveLength(DUPLICATE_CANDIDATE_LIMIT);
	});

	/* Der Hinweis ist eine Zusatzinformation. Fällt die Abfrage aus, soll die
	   Eingangsseite ohne Hinweis erscheinen — nicht mit einem Fehler. */
	it('ist fail-open: ein DB-Fehler liefert ein leeres Ergebnis statt eines Throws', async () => {
		mockDb.execute.mockRejectedValue(new Error('DB nicht erreichbar'));

		await expect(findDuplicateCandidates([1, 2])).resolves.toEqual({});
	});
});
