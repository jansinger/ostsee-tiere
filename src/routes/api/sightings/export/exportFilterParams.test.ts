import { describe, expect, it, vi } from 'vitest';

// Drizzle wird durch Marker-Objekte ersetzt, damit die erzeugten Grenz-Instants
// direkt geprüft werden können statt über generiertes SQL.
// `or`/`gt`/`lte`/`isNull`/`isNotNull` braucht `balticSeaCondition` — ohne sie
// stünde dort `undefined(...)`, sobald ein Ostsee-Filter gesetzt ist.
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions) => ({ op: 'and', conditions })),
	or: vi.fn((...conditions) => ({ op: 'or', conditions })),
	between: vi.fn((column, from, to) => ({ op: 'between', column, from, to })),
	gte: vi.fn((column, value) => ({ op: 'gte', column, value })),
	gt: vi.fn((column, value) => ({ op: 'gt', column, value })),
	lt: vi.fn((column, value) => ({ op: 'lt', column, value })),
	lte: vi.fn((column, value) => ({ op: 'lte', column, value })),
	eq: vi.fn((column, value) => ({ op: 'eq', column, value })),
	ne: vi.fn((column, value) => ({ op: 'ne', column, value })),
	isNull: vi.fn((column) => ({ op: 'isNull', column })),
	isNotNull: vi.fn((column) => ({ op: 'isNotNull', column })),
	ilike: vi.fn((column, value) => ({ op: 'ilike', column, value }))
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {
		sightingDate: 'sightingDate',
		verified: 'verified',
		entryChannel: 'entryChannel',
		mediaUpload: 'mediaUpload',
		isDead: 'isDead',
		inBalticSea: 'inBalticSea',
		inBalticSeaGeo: 'inBalticSeaGeo',
		latitude: 'latitude',
		longitude: 'longitude',
		approvedAt: 'approvedAt',
		rejectedAt: 'rejectedAt',
		referenceId: 'referenceId',
		email: 'email',
		firstName: 'firstName',
		lastName: 'lastName',
		waterway: 'waterway'
	}
}));

import { buildExportConditions, parseExportFilterParams } from './exportFilterParams';
import { normalizeStatusParam } from '#lib/components/admin/sightingStatusFilter.ts';

type Condition = { op: string; column: string; value?: Date; from?: Date; to?: Date };

function dateRange(fromDate: string, toDate: string): { start: Date; endExclusive: Date } {
	const conditions = buildExportConditions({
		fromDate,
		toDate,
		verified: null,
		entryChannel: null,
		mediaUpload: null,
		deadFinding: null,
		balticSea: null,
		q: null
	}) as unknown as Condition[];

	const onDate = conditions.filter((condition) => condition.column === 'sightingDate');
	expect(onDate.map((condition) => condition.op)).toEqual(['gte', 'lt']);

	return { start: onDate[0]!.value as Date, endExclusive: onDate[1]!.value as Date };
}

/** Bildet das halboffene Intervall der Abfrage nach: `>= start AND < endExclusive`. */
function includes(range: { start: Date; endExclusive: Date }, instant: string): boolean {
	const time = new Date(instant).getTime();
	return time >= range.start.getTime() && time < range.endExclusive.getTime();
}

describe('buildExportConditions — Datumsfilter meint Berliner Kalendertage', () => {
	it('nutzt kein BETWEEN, sondern das halboffene Intervall gte/lt', async () => {
		const { between, gte, lt } = vi.mocked(await import('drizzle-orm'));
		vi.clearAllMocks();

		buildExportConditions({
			fromDate: '2024-06-01',
			toDate: '2024-06-30',
			verified: null,
			entryChannel: null,
			mediaUpload: null,
			deadFinding: null,
			balticSea: null,
			q: null
		});

		expect(between).not.toHaveBeenCalled();
		expect(gte).toHaveBeenCalledTimes(1);
		expect(lt).toHaveBeenCalledTimes(1);
	});

	it('setzt die Grenzen im Sommer auf Berliner Mitternacht (MESZ, UTC+2)', () => {
		const range = dateRange('2024-06-01', '2024-06-30');

		expect(range.start.toISOString()).toBe('2024-05-31T22:00:00.000Z');
		expect(range.endExclusive.toISOString()).toBe('2024-06-30T22:00:00.000Z');
	});

	it('setzt die Grenzen im Winter auf Berliner Mitternacht (MEZ, UTC+1)', () => {
		const range = dateRange('2024-01-01', '2024-01-31');

		expect(range.start.toISOString()).toBe('2023-12-31T23:00:00.000Z');
		expect(range.endExclusive.toISOString()).toBe('2024-01-31T23:00:00.000Z');
	});

	it('enthält den letzten Tag vollständig (23:30 Berlin) und nicht den Folgetag', () => {
		const range = dateRange('2024-06-01', '2024-06-30');

		// 30.06.2024 23:30 Berlin = 21:30Z
		expect(includes(range, '2024-06-30T21:30:00.000Z')).toBe(true);
		// 01.07.2024 00:30 Berlin = 30.06. 22:30Z
		expect(includes(range, '2024-06-30T22:30:00.000Z')).toBe(false);
	});

	it('enthält die frühen Randstunden des ersten Tages (00:30 Berlin)', () => {
		const range = dateRange('2024-01-01', '2024-01-31');

		// 01.01.2024 00:30 Berlin = 31.12.2023 23:30Z
		expect(includes(range, '2023-12-31T23:30:00.000Z')).toBe(true);
		// 31.12.2023 23:30 Berlin = 22:30Z
		expect(includes(range, '2023-12-31T22:30:00.000Z')).toBe(false);
	});

	it('deckt Silvester als Einzeltag vollständig ab', () => {
		const range = dateRange('2024-12-31', '2024-12-31');

		expect(range.start.toISOString()).toBe('2024-12-30T23:00:00.000Z');
		expect(range.endExclusive.toISOString()).toBe('2024-12-31T23:00:00.000Z');
		// 31.12.2024 14:00 Berlin = 13:00Z
		expect(includes(range, '2024-12-31T13:00:00.000Z')).toBe(true);
		// 31.12.2024 23:30 Berlin = 22:30Z
		expect(includes(range, '2024-12-31T22:30:00.000Z')).toBe(true);
		// 01.01.2025 00:30 Berlin = 31.12. 23:30Z
		expect(includes(range, '2024-12-31T23:30:00.000Z')).toBe(false);
	});

	/**
	 * Offene Grenzen wie in der Tabelle (`/admin/sichtungen`): Der Export erbt
	 * die Filter der Ansicht, aus der er ausgelöst wird. Ließe er eine einzeln
	 * gesetzte Grenze weg, enthielte die Datei mehr Zeilen, als der Nutzer
	 * gerade gesehen hat — genau die Falle, die bei `mediaUpload` und
	 * `balticSea` schon einmal vermieden wurde.
	 */
	it('filtert mit nur „Von" ab Berliner Mitternacht dieses Tages, ohne Obergrenze', () => {
		const conditions = buildExportConditions({
			fromDate: '2024-06-01',
			toDate: '',
			verified: null,
			entryChannel: null,
			mediaUpload: null,
			deadFinding: null,
			balticSea: null,
			q: null
		}) as unknown as Condition[];

		expect(conditions.map((condition) => condition.op)).toEqual(['gte']);
		expect((conditions[0]!.value as Date).toISOString()).toBe('2024-05-31T22:00:00.000Z');
	});

	it('filtert mit nur „Bis" bis vor Berliner Mitternacht des Folgetags, ohne Untergrenze', () => {
		const conditions = buildExportConditions({
			fromDate: '',
			toDate: '2024-06-30',
			verified: null,
			entryChannel: null,
			mediaUpload: null,
			deadFinding: null,
			balticSea: null,
			q: null
		}) as unknown as Condition[];

		expect(conditions.map((condition) => condition.op)).toEqual(['lt']);
		// Der letzte Tag gehört vollständig dazu: 30.06. 23:30 Berlin = 21:30Z.
		expect((conditions[0]!.value as Date).toISOString()).toBe('2024-06-30T22:00:00.000Z');
	});

	it('lässt den Datumsfilter weg, wenn keine Grenze gesetzt ist', () => {
		const conditions = buildExportConditions({
			fromDate: '',
			toDate: '',
			verified: null,
			entryChannel: null,
			mediaUpload: null,
			deadFinding: null,
			balticSea: null,
			q: null
		}) as unknown as Condition[];

		expect(conditions).toHaveLength(0);
	});
});

/**
 * Der Ostsee-Filter selbst ist in `#lib/server/db/balticSeaFilter.test.ts` gegen
 * `getBalticSeaStatus()` abgesichert. Hier geht es nur um die Verdrahtung: dass
 * `?balticSea=…` gelesen wird und die Bedingung im Export tatsächlich ankommt.
 * Ohne das könnte der Export stillschweigend mehr Zeilen liefern als die
 * Admin-Liste anzeigt — genau die Falle, die bei `mediaUpload` vermieden wurde.
 */
describe('Export-Filter — Ostsee-Status', () => {
	const noFilters = {
		fromDate: '',
		toDate: '',
		verified: null,
		entryChannel: null,
		mediaUpload: null,
		deadFinding: null,
		q: null
	};

	it('parseExportFilterParams liest balticSea aus der URL', () => {
		const result = parseExportFilterParams(
			new URL('https://example.com/api/sightings/export?format=json&balticSea=noPosition')
		);

		expect(result).toHaveProperty('params');
		expect((result as { params: { balticSea: string | null } }).params.balticSea).toBe(
			'noPosition'
		);
	});

	it('parseExportFilterParams liefert null, wenn der Parameter fehlt', () => {
		const result = parseExportFilterParams(
			new URL('https://example.com/api/sightings/export?format=json')
		);

		expect((result as { params: { balticSea: string | null } }).params.balticSea).toBeNull();
	});

	it.each(['baltic', 'edge', 'outside', 'noPosition'])(
		'buildExportConditions hängt für balticSea=%s eine Bedingung an',
		(status) => {
			const conditions = buildExportConditions({ ...noFilters, balticSea: status });

			expect(conditions).toHaveLength(1);
		}
	);

	it('hängt ohne Ostsee-Filter keine Bedingung an', () => {
		expect(buildExportConditions({ ...noFilters, balticSea: null })).toHaveLength(0);
		expect(buildExportConditions({ ...noFilters, balticSea: 'quatsch' })).toHaveLength(0);
	});

	it('kombiniert den Ostsee-Filter mit anderen Filtern, statt sie zu ersetzen', () => {
		const conditions = buildExportConditions({
			...noFilters,
			verified: '1',
			balticSea: 'baltic'
		});

		expect(conditions).toHaveLength(2);
	});
});

/**
 * Wie beim Ostsee-Status: Die Bedingung selbst ist in
 * `#lib/server/db/deadFindingFilter.test.ts` abgesichert, hier zählt nur die
 * Verdrahtung — sonst zeigte die Admin-Liste gefiltert Totfunde, der Export
 * lieferte aber still alles.
 */
describe('Export-Filter — Meldeart (Totfund)', () => {
	const noFilters = {
		fromDate: '',
		toDate: '',
		verified: null,
		entryChannel: null,
		mediaUpload: null,
		balticSea: null,
		q: null
	};

	it('parseExportFilterParams liest deadFinding aus der URL', () => {
		const result = parseExportFilterParams(
			new URL('https://example.com/api/sightings/export?format=json&deadFinding=1')
		);

		expect(result).toHaveProperty('params');
		expect((result as { params: { deadFinding: string | null } }).params.deadFinding).toBe('1');
	});

	it.each(['1', '0'])(
		'buildExportConditions hängt für deadFinding=%s eine Bedingung an',
		(value) => {
			const conditions = buildExportConditions({ ...noFilters, deadFinding: value });

			expect(conditions).toHaveLength(1);
		}
	);

	it('hängt ohne Meldeart-Filter keine Bedingung an', () => {
		expect(buildExportConditions({ ...noFilters, deadFinding: null })).toHaveLength(0);
		expect(buildExportConditions({ ...noFilters, deadFinding: 'quatsch' })).toHaveLength(0);
	});

	it('kombiniert den Meldeart-Filter mit anderen Filtern, statt sie zu ersetzen', () => {
		const conditions = buildExportConditions({
			...noFilters,
			verified: '1',
			deadFinding: '1'
		});

		expect(conditions).toHaveLength(2);
	});
});

/**
 * Der Statusfilter selbst (Alias-Mapping und Prädikate) ist in
 * `sightingStatusFilter.ts` und `approvalFilter.test.ts` abgesichert. Hier
 * zählt nur, dass der Export dieselben Prädikate wie die Tabelle verwendet —
 * sonst filtert die CSV gegen eine andere Menge als der Filter, den der
 * Nutzer gerade in `/admin/sichtungen` gesehen hat.
 */
describe('Export-Filter — Status', () => {
	it('filtert über dieselben Prädikate wie die Tabelle', () => {
		expect(normalizeStatusParam('1')).toBe('approved');
		expect(normalizeStatusParam('rejected')).toBe('rejected');
	});
});

/**
 * Die Freitext-Suche der Tabelle (`?q=`) muss der Export mitfiltern — sonst
 * enthielte die Datei mehr Zeilen, als der Nutzer gesehen hat. Dieselbe Falle
 * wie bei `mediaUpload` und `balticSea`; die Bedingung selbst ist in
 * `#lib/server/db/sightingSearchFilter.test.ts` abgesichert.
 */
describe('Export-Filter — Freitext-Suche', () => {
	const noFilters = {
		fromDate: '',
		toDate: '',
		verified: null,
		entryChannel: null,
		mediaUpload: null,
		deadFinding: null,
		balticSea: null,
		q: null
	};

	it('parseExportFilterParams liest q aus der URL', () => {
		const result = parseExportFilterParams(
			new URL('https://example.com/api/sightings/export?format=json&q=m%C3%BCller')
		);

		expect(result).toHaveProperty('params');
		expect((result as { params: { q: string | null } }).params.q).toBe('müller');
	});

	it('buildExportConditions hängt für einen Suchbegriff eine Bedingung an', () => {
		expect(buildExportConditions({ ...noFilters, q: 'müller' })).toHaveLength(1);
	});

	it('ein leerer Suchbegriff erzeugt keine Bedingung', () => {
		expect(buildExportConditions({ ...noFilters, q: null })).toHaveLength(0);
		expect(buildExportConditions({ ...noFilters, q: '   ' })).toHaveLength(0);
	});
});
