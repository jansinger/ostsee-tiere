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

// Drizzle wird durch Marker-Objekte ersetzt, damit die WHERE-Bedingungen
// direkt geprüft werden können, statt generiertes SQL zu parsen.
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
import { BALTIC_SEA_BBOX } from '#lib/utils/geo/checkBalticSea.ts';

type Condition = { op: string; column: string; value?: string };

async function queryConditions(): Promise<Condition[]> {
	const url = new URL('http://localhost/api/map/sightings');
	await GET({
		url,
		locals: { user: null },
		setHeaders: vi.fn()
	} as unknown as Parameters<typeof GET>[0]);

	return mockWhere.mock.calls.at(-1)?.[0] as Condition[];
}

describe('GET /api/map/sightings — Koordinatenfilter gegen Null Island', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValue([]);
	});

	it('verlangt NOT NULL für Breiten- und Längengrad', async () => {
		const conditions = await queryConditions();
		const notNullColumns = conditions
			.filter((condition) => condition.op === 'isNotNull')
			.map((condition) => condition.column);

		expect(notNullColumns).toContain('latitude');
		expect(notNullColumns).toContain('longitude');
	});

	it('klemmt den Breitengrad auf die Ostsee-Bounding-Box', async () => {
		const conditions = await queryConditions();
		const latConditions = conditions.filter((condition) => condition.column === 'latitude');

		expect(latConditions.find((condition) => condition.op === 'gte')?.value).toBe(
			BALTIC_SEA_BBOX.minLatitude.toString()
		);
		expect(latConditions.find((condition) => condition.op === 'lte')?.value).toBe(
			BALTIC_SEA_BBOX.maxLatitude.toString()
		);
	});

	it('klemmt den Längengrad auf die Ostsee-Bounding-Box', async () => {
		const conditions = await queryConditions();
		const lonConditions = conditions.filter((condition) => condition.column === 'longitude');

		expect(lonConditions.find((condition) => condition.op === 'gte')?.value).toBe(
			BALTIC_SEA_BBOX.minLongitude.toString()
		);
		expect(lonConditions.find((condition) => condition.op === 'lte')?.value).toBe(
			BALTIC_SEA_BBOX.maxLongitude.toString()
		);
	});

	it('nutzt die Konstanten aus checkBalticSea.ts (kein duplizierter Wert)', () => {
		// Bewusst keine Zahlen: BALTIC_SEA_BBOX wird aus der Geometrie abgeleitet
		// (npm run geo:build), die Werte werden in checkBalticSea.test.ts gegen
		// baltic-extent.json geprueft. Hier zaehlt nur, dass der Filter die
		// Konstante benutzt und keine eigenen Werte mitbringt.
		const { minLongitude, maxLongitude, minLatitude, maxLatitude } = BALTIC_SEA_BBOX;

		// Wohlgeformt: echtes Rechteck, keine vertauschten oder fehlenden Kanten.
		expect(minLongitude).toBeLessThan(maxLongitude);
		expect(minLatitude).toBeLessThan(maxLatitude);

		// Grob in der Ostsee-Region — faengt vertauschte Achsen und Ausreisser ab,
		// ohne die exakten Werte zu wiederholen. Ein Vorzeichenfehler oder ein
		// Lon/Lat-Tausch faellt hier auf, bevor der Kartenfilter ihn uebernimmt.
		expect(minLongitude).toBeGreaterThan(5);
		expect(maxLongitude).toBeLessThan(35);
		expect(minLatitude).toBeGreaterThan(50);
		expect(maxLatitude).toBeLessThan(70);
	});

	it('behält den Freigabe-Filter bei (approvedAt)', async () => {
		const conditions = await queryConditions();

		expect(
			conditions.some(
				(condition) => condition.op === 'isNotNull' && condition.column === 'approvedAt'
			)
		).toBe(true);
	});
});
