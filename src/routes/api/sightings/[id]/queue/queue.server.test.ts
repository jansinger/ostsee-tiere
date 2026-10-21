/**
 * @fileoverview Warteschlangen-Endpunkt der Detailansicht.
 *
 * Vier Zusagen, jede davon leicht falsch zu bauen:
 *
 * 1. Nachbarn werden per Keyset gegen `(created, id)` gesucht — nicht per
 *    OFFSET. Ein Offset wäre nach jeder Entscheidung um eins falsch.
 * 2. Der Vorgänger wird in **Gegenrichtung** gesucht; sonst liefert `LIMIT 1`
 *    den Stapelanfang statt des direkten Nachbarn.
 * 3. Eine bereits entschiedene Sichtung hat keine Position mehr (`null`),
 *    behält aber Nachbarn — genau das trägt den Auto-Advance.
 * 4. Der Freigabestatus wird über `isSightingApproved`/`isSightingRejected`
 *    gelesen, nie von Hand (Guard: `approvalPredicateScan.test.ts`).
 *
 * Mock-Harnisch wie `src/routes/admin/inboxPage.server.test.ts`: ein
 * aufzeichnender `db.select`-Mock, dessen Ausdrücke über den echten `PgDialect`
 * zu SQL kompiliert werden.
 */
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOnly } from '#lib/server/db/approvalFilter.ts';

const dialect = new PgDialect();
const toSqlText = (condition: SQLWrapper): string => dialect.sqlToQuery(condition.getSQL()).sql;

type RecordedSelect = {
	whereSql?: string;
	orderBySql?: string;
	limit?: number;
};

let recordedSelects: RecordedSelect[] = [];
let resolvedRows: unknown[][] = [];

function createRecordingBuilder(record: RecordedSelect) {
	const builder = {
		from: () => builder,
		where: (predicate?: SQL) => {
			if (predicate) record.whereSql = toSqlText(predicate);
			return builder;
		},
		orderBy: (...expressions: SQLWrapper[]) => {
			if (expressions.length) record.orderBySql = expressions.map(toSqlText).join(', ');
			return builder;
		},
		limit: (value: number) => {
			record.limit = value;
			return builder;
		},
		then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) => {
			try {
				return Promise.resolve(resolve(resolvedRows.shift() ?? []));
			} catch (error) {
				return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
			}
		}
	};
	return builder;
}

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => {
			const record: RecordedSelect = {};
			recordedSelects.push(record);
			return createRecordingBuilder(record);
		}
	}
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

const { GET } = await import('./+server');

const OFFENE_SICHTUNG = {
	id: 500,
	created: new Date('2026-08-01T10:00:00Z'),
	referenceId: 'REF-500',
	approvedAt: null,
	rejectedAt: null
};

function aufrufen(order = 'desc', id = '500') {
	return GET({
		params: { id },
		locals: { user: { email: 'admin@example.org', roles: ['admin'] } },
		url: new URL(`https://localhost:4000/api/sightings/${id}/queue?order=${order}`)
	} as any);
}

beforeEach(() => {
	recordedSelects = [];
	resolvedRows = [];
});

describe('GET /api/sightings/[id]/queue', () => {
	it('liefert Nachbarn, Position und Gesamtzahl', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[{ id: 501, referenceId: 'REF-501' }], // next
			[{ id: 499, referenceId: 'REF-499' }], // prev
			[{ count: 16 }], // Vorgänger im Stapel
			[{ count: 653 }] // offene insgesamt
		];

		const response = await aufrufen();

		expect(await response.json()).toEqual({
			next: { id: 501, referenceId: 'REF-501' },
			prev: { id: 499, referenceId: 'REF-499' },
			position: 17,
			total: 653
		});
	});

	it('sucht Nachbarn per Keyset-Wertepaar, nicht per Offset', async () => {
		resolvedRows = [[OFFENE_SICHTUNG], [], [], [{ count: 0 }], [{ count: 1 }]];

		await aufrufen();

		const [, next] = recordedSelects;
		expect(next?.whereSql).toMatch(/\("sichtungen"\."created", "sichtungen"\."id"\)\s*<\s*\(/);
		expect(next?.limit).toBe(1);
	});

	it('sucht den Vorgänger in Gegenrichtung', async () => {
		resolvedRows = [[OFFENE_SICHTUNG], [], [], [{ count: 0 }], [{ count: 1 }]];

		await aufrufen('desc');

		const [, next, prev] = recordedSelects;
		expect(next?.orderBySql).toMatch(/"created" desc/);
		expect(prev?.orderBySql).toMatch(/"created" asc/);
	});

	it('gibt einer bereits entschiedenen Sichtung keine Position, aber Nachbarn', async () => {
		resolvedRows = [
			[{ ...OFFENE_SICHTUNG, approvedAt: new Date('2026-08-02T09:00:00Z') }],
			[{ id: 501, referenceId: 'REF-501' }],
			[{ id: 499, referenceId: 'REF-499' }],
			[{ count: 653 }]
		];

		const body = await (await aufrufen()).json();

		expect(body.position).toBeNull();
		expect(body.next).toEqual({ id: 501, referenceId: 'REF-501' });
	});

	it('liefert am Stapelende null statt eines Nachbarn', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[],
			[{ id: 499, referenceId: 'REF-499' }],
			[{ count: 652 }],
			[{ count: 653 }]
		];

		const body = await (await aufrufen()).json();

		expect(body.next).toBeNull();
		expect(body.prev).toEqual({ id: 499, referenceId: 'REF-499' });
	});

	it('filtert alle vier Abfragen über openOnly() auf offene Sichtungen', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[{ id: 501, referenceId: 'REF-501' }], // next
			[{ id: 499, referenceId: 'REF-499' }], // prev
			[{ count: 16 }], // Vorgänger im Stapel
			[{ count: 653 }] // offene insgesamt
		];

		await aufrufen();

		const [, next, prev, rank, total] = recordedSelects;
		// Über denselben Helper kompiliert statt als Literal hingeschrieben — ein
		// hartcodiertes SQL-Fragment hier wäre selbst das selbstgebaute
		// Freigabe-Prädikat, das approvalPredicateScan.test.ts verbietet.
		const openOnlySql = toSqlText(openOnly());
		expect(next?.whereSql).toContain(openOnlySql);
		expect(prev?.whereSql).toContain(openOnlySql);
		expect(rank?.whereSql).toContain(openOnlySql);
		/* `toBe`, nicht `toContain`: Die Gesamtzahl-Abfrage filtert AUSSCHLIESSLICH
		   auf `openOnly()` — anders als `next`/`prev`/`rank`, die zusätzlich die
		   Keyset-Bedingung tragen. `toContain` prüft nur, dass `openOnlySql`
		   irgendwo im WHERE steht; kopierte jemand die Keyset-Bedingung der
		   direkt darüberstehenden Rang-Abfrage per Copy-Paste auch hierher, zählte
		   `total` nur einen Teilstapel — unbemerkt, weil `openOnlySql` weiterhin
		   enthalten wäre. `toBe` verlangt Gleichheit und deckt genau das auf. */
		expect(total?.whereSql).toBe(openOnlySql);
	});

	it('zählt die Rangzählung in Vorgänger-Richtung, nicht in Nachfolger-Richtung', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[], // next
			[], // prev
			[{ count: 16 }], // Vorgänger im Stapel
			[{ count: 653 }] // offene insgesamt
		];

		await aufrufen('desc');

		const [, , , rank] = recordedSelects;
		// order=desc + Vorgänger-Richtung ergibt laut queueNeighborCondition den
		// ">"-Vergleich (kleinerAlsAnker = (order==='desc') === (direction==='next') = false).
		// Ein ins Gegenteil verdrehtes Vorzeichen zählte Nachfolger statt Vorgänger.
		expect(rank?.whereSql).toMatch(/\)\s*>\s*\(/);
	});

	it('verdrahtet order=asc bis in orderBy und die Keyset-Richtung', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[{ id: 501, referenceId: 'REF-501' }], // next
			[{ id: 499, referenceId: 'REF-499' }], // prev
			[{ count: 16 }], // Vorgänger im Stapel
			[{ count: 653 }] // offene insgesamt
		];

		await aufrufen('asc');

		const [, next, prev, rank] = recordedSelects;
		expect(next?.orderBySql).toMatch(/"created" asc/);
		expect(prev?.orderBySql).toMatch(/"created" desc/);
		// Bei order=asc kehrt sich auch die Keyset-Richtung um: "next" sucht jetzt
		// per ">"-Vergleich, die Vorgänger-Rangzählung weiterhin per "<".
		expect(next?.whereSql).toMatch(/\)\s*>\s*\(/);
		expect(rank?.whereSql).toMatch(/\)\s*<\s*\(/);
	});

	it('macht ein leeres Rang-Zählergebnis sichtbar statt eine Position zu erfinden', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[], // next
			[], // prev
			[], // leeres Zählergebnis statt einer count(*)-Zeile
			[{ count: 653 }]
		];

		await expect(aufrufen()).rejects.toMatchObject({ status: 500 });
	});

	it('macht ein leeres Gesamt-Zählergebnis sichtbar statt eine Zahl zu erfinden', async () => {
		resolvedRows = [
			[OFFENE_SICHTUNG],
			[], // next
			[], // prev
			[{ count: 16 }],
			[] // leeres Zählergebnis statt einer count(*)-Zeile
		];

		await expect(aufrufen()).rejects.toMatchObject({ status: 500 });
	});

	it('lehnt eine unbrauchbare ID ab, bevor sie in die Datenbank geht', async () => {
		await expect(aufrufen('desc', 'keine-zahl')).rejects.toMatchObject({ status: 400 });
		expect(recordedSelects).toHaveLength(0);
	});

	/**
	 * `static/openapi.yml` deklariert den Pfadparameter als `integer, minimum: 1`.
	 * Die frühere Prüfung (`Number.isInteger(Number(params.id))`) ließ jeden Fall
	 * hier durch: `0` und negative Werte widersprechen der Untergrenze direkt,
	 * `1e3` und ` 500 ` sind keine Ganzzahl-Schreibweisen und trafen nur deshalb
	 * eine Zeile, weil `Number()` großzügig parst. Alle vier endeten in einer
	 * DB-Abfrage und im 404 — einer Antwort, die dem eigenen Vertrag widerspricht.
	 * Der Test prüft zusätzlich, dass gar nicht erst abgefragt wird.
	 */
	it.each(['0', '-5', '1e3', ' 500 ', '1.0', ''])(
		'lehnt die vertragswidrige ID %o mit 400 ab',
		async (roheId) => {
			await expect(aufrufen('desc', roheId)).rejects.toMatchObject({ status: 400 });
			expect(recordedSelects).toHaveLength(0);
		}
	);

	it('lässt eine gültige ID weiterhin durch', async () => {
		resolvedRows = [[OFFENE_SICHTUNG], [], [], [{ count: 0 }], [{ count: 1 }]];

		await expect(aufrufen('desc', '500')).resolves.toBeDefined();
		expect(recordedSelects.length).toBeGreaterThan(0);
	});

	it('meldet 404, wenn es die Sichtung nicht gibt', async () => {
		resolvedRows = [[]];

		await expect(aufrufen()).rejects.toMatchObject({ status: 404 });
	});
});
