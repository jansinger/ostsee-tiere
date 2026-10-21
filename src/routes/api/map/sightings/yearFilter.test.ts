import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockWhere, mockOrderBy } = vi.hoisted(() => {
	const mockOrderBy = vi.fn().mockResolvedValue([]);
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	return { mockWhere, mockOrderBy };
});

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({ where: mockWhere, orderBy: mockOrderBy })
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {
		sightingDate: 'sightingDate',
		approvedAt: 'approvedAt',
		latitude: 'latitude',
		longitude: 'longitude'
	}
}));

// Drizzle wird durch Marker-Objekte ersetzt, damit die erzeugten Grenz-Instants
// direkt geprüft werden können statt über generiertes SQL.
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions) => conditions),
	between: vi.fn((column, from, to) => ({ op: 'between', column, from, to })),
	gte: vi.fn((column, value) => ({ op: 'gte', column, value })),
	lte: vi.fn((column, value) => ({ op: 'lte', column, value })),
	lt: vi.fn((column, value) => ({ op: 'lt', column, value })),
	eq: vi.fn((column, value) => ({ op: 'eq', column, value })),
	isNotNull: vi.fn((column) => ({ op: 'isNotNull', column })),
	sql: Object.assign(
		vi.fn((strings: TemplateStringsArray) => String(strings.raw[0])),
		{ raw: vi.fn((s: string) => s) }
	)
}));

vi.mock('#lib/map/mapUtils.ts', () => ({
	sightingsToGeoJSON: vi.fn().mockReturnValue({ type: 'FeatureCollection', features: [] })
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { GET } from './+server';

type Condition = { op: string; column: string; value?: Date };

async function yearRange(year: string): Promise<{ start: Date; endExclusive: Date }> {
	const url = new URL(`http://localhost/api/map/sightings?year=${year}`);
	await GET({
		url,
		locals: { user: null },
		setHeaders: vi.fn()
	} as unknown as Parameters<typeof GET>[0]);

	const conditions = mockWhere.mock.calls.at(-1)?.[0] as Condition[];
	const onDate = conditions.filter((condition) => condition.column === 'sightingDate');
	expect(onDate.map((condition) => condition.op)).toEqual(['gte', 'lt']);

	return { start: onDate[0]!.value as Date, endExclusive: onDate[1]!.value as Date };
}

/** Bildet das halboffene Intervall der Abfrage nach: `>= start AND < endExclusive`. */
function includes(range: { start: Date; endExclusive: Date }, instant: string): boolean {
	const time = new Date(instant).getTime();
	return time >= range.start.getTime() && time < range.endExclusive.getTime();
}

describe('GET /api/map/sightings — Jahresfilter meint Berliner Kalenderjahre', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValue([]);
	});

	it('nutzt kein BETWEEN, sondern das halboffene Intervall gte/lt', async () => {
		const { between, gte, lte, lt } = vi.mocked(await import('drizzle-orm'));

		await GET({
			url: new URL('http://localhost/api/map/sightings?year=2024'),
			locals: { user: null },
			setHeaders: vi.fn()
		} as unknown as Parameters<typeof GET>[0]);

		expect(between).not.toHaveBeenCalled();
		// 1x sightingDate-Jahresgrenze + 2x Ostsee-Bounding-Box (Lat/Lon) — QW1
		expect(gte).toHaveBeenCalledTimes(3);
		expect(lte).toHaveBeenCalledTimes(2);
		expect(lt).toHaveBeenCalledTimes(1);
	});

	it('setzt die Jahresgrenzen auf Berliner Mitternacht', async () => {
		const range = await yearRange('2024');

		expect(range.start.toISOString()).toBe('2023-12-31T23:00:00.000Z');
		expect(range.endExclusive.toISOString()).toBe('2024-12-31T23:00:00.000Z');
	});

	it('enthält den 31.12. vollständig', async () => {
		const range = await yearRange('2024');

		// 31.12.2024 14:00 Berlin = 13:00Z
		expect(includes(range, '2024-12-31T13:00:00.000Z')).toBe(true);
		// 31.12.2024 23:30 Berlin = 22:30Z
		expect(includes(range, '2024-12-31T22:30:00.000Z')).toBe(true);
	});

	it('enthält den 01.01. ab Berliner Mitternacht und schließt den Jahreswechsel korrekt ab', async () => {
		const range = await yearRange('2024');

		// 01.01.2024 00:30 Berlin = 31.12.2023 23:30Z
		expect(includes(range, '2023-12-31T23:30:00.000Z')).toBe(true);
		// 31.12.2023 23:30 Berlin = 22:30Z — gehört noch zu 2023
		expect(includes(range, '2023-12-31T22:30:00.000Z')).toBe(false);
		// 01.01.2025 00:30 Berlin = 31.12.2024 23:30Z
		expect(includes(range, '2024-12-31T23:30:00.000Z')).toBe(false);
	});

	it('filtert ohne Jahresparameter nicht auf das Sichtungsdatum', async () => {
		await GET({
			url: new URL('http://localhost/api/map/sightings'),
			locals: { user: null },
			setHeaders: vi.fn()
		} as unknown as Parameters<typeof GET>[0]);

		const conditions = mockWhere.mock.calls.at(-1)?.[0] as Condition[];
		expect(conditions.some((condition) => condition.column === 'sightingDate')).toBe(false);
	});
});
