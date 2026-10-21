/**
 * @fileoverview H2 — GET /api/sightings muss `dt`/`ti` in Europe/Berlin liefern
 * (nicht UTC) und die Jahresgrenzen über `getYearRange` (Berlin-Mitternacht,
 * halboffenes Intervall) statt über prozesszonen-abhängige `Date`-Konstruktoren
 * bilden. Die Feldnamen sind identisch mit `showreports.json`, das bereits
 * korrekt in Berlin formatiert — beide Endpunkte dürfen nicht mehr auseinanderlaufen.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockOrderBy, mockWhere } = vi.hoisted(() => {
	const mockOrderBy = vi.fn().mockResolvedValue([]);
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	return { mockOrderBy, mockWhere };
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
		id: 'id',
		created: 'created',
		sightingDate: 'sightingDate',
		latitude: 'latitude',
		longitude: 'longitude',
		totalCount: 'totalCount',
		juvenileCount: 'juvenileCount',
		species: 'species',
		isDead: 'isDead',
		nameConsent: 'nameConsent',
		firstName: 'firstName',
		lastName: 'lastName',
		waterway: 'waterway',
		shipNameConsent: 'shipNameConsent',
		shipName: 'shipName',
		approvedAt: 'approvedAt'
	}
}));

// Drizzle wird durch Marker-Objekte ersetzt, damit die erzeugten Grenz-Instants
// und Feld-Ausdrücke direkt geprüft werden können statt über generiertes SQL
// (gleiches Muster wie `api/map/sightings/yearFilter.test.ts`).
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions) => conditions),
	gte: vi.fn((column, value) => ({ op: 'gte', column, value })),
	lt: vi.fn((column, value) => ({ op: 'lt', column, value })),
	isNotNull: vi.fn((column) => ({ op: 'isNotNull', column })),
	isNull: vi.fn((column) => ({ op: 'isNull', column })),
	sql: Object.assign(
		vi.fn(() => 'sql-fragment'),
		{ raw: vi.fn((s: string) => s) }
	)
}));

vi.mock('#lib/legacy-api/date-utils.ts', () => ({
	getYearRange: vi.fn((year: number) => ({
		startDate: new Date(Date.UTC(year - 1, 11, 31, 23, 0, 0)),
		endDate: new Date(Date.UTC(year, 11, 31, 23, 0, 0))
	}))
}));

vi.mock('#lib/server/db/sqlTimeZone.ts', () => ({
	berlinToChar: vi.fn((column: string, pattern: string) => `berlinToChar(${column},${pattern})`)
}));

// Spy um die *echte* Implementierung: die WHERE-Bedingung bleibt damit real
// geprüft, gleichzeitig ist nachweisbar, dass der Endpunkt den Helper benutzt
// und das Prädikat nicht selbst zusammenbaut.
vi.mock('#lib/server/db/approvalFilter.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/db/approvalFilter.ts')>();
	return { ...actual, approvedOnly: vi.fn(actual.approvedOnly) };
});

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

import { GET } from './+server';

type Condition = { op: string; column: string; value?: Date };

const createMockGetEvent = (url: string) =>
	({
		url: new URL(url),
		setHeaders: vi.fn()
	}) as unknown as Parameters<typeof GET>[0];

describe('GET /api/sightings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValue([]);
	});

	it('nutzt getYearRange (Berlin-Mitternacht) statt lokaler Date-Konstruktoren', async () => {
		const { getYearRange } = await import('#lib/legacy-api/date-utils.ts');

		await GET(createMockGetEvent('http://localhost/api/sightings?year=2024'));

		expect(getYearRange).toHaveBeenCalledWith(2024);

		const dateConditions = (mockWhere.mock.calls.at(-1)?.[0] as Condition[]).filter(
			(c) => c.column === 'sightingDate'
		);
		expect(dateConditions.map((c) => c.op)).toEqual(['gte', 'lt']);
		expect(dateConditions[0]?.value?.toISOString()).toBe('2023-12-31T23:00:00.000Z');
		expect(dateConditions[1]?.value?.toISOString()).toBe('2024-12-31T23:00:00.000Z');
	});

	it('formatiert dt/ti über berlinToChar (Europe/Berlin), nicht über rohes to_char', async () => {
		const { berlinToChar } = await import('#lib/server/db/sqlTimeZone.ts');
		const { db } = await import('#lib/server/db/index.ts');

		await GET(createMockGetEvent('http://localhost/api/sightings?year=2024'));

		expect(berlinToChar).toHaveBeenCalledWith('sightingDate', 'DD.MM.YYYY');
		expect(berlinToChar).toHaveBeenCalledWith('sightingDate', 'HH24:MI');

		const selectArg = vi.mocked(db.select).mock.calls.at(-1)?.[0] as unknown as {
			dt: string;
			ti: string;
		};
		expect(selectArg.dt).toBe('berlinToChar(sightingDate,DD.MM.YYYY)');
		expect(selectArg.ti).toBe('berlinToChar(sightingDate,HH24:MI)');
	});
});

/**
 * Der Endpunkt filterte ausschließlich auf den Jahreszeitraum und war ohne
 * Session erreichbar — damit war jede eingegangene Meldung abrufbar, bevor sie
 * jemand gesichtet hatte, inklusive Klarname (`na`) und Schiffsname (`sh`), wo
 * eine Einwilligung vorliegt. Die Einwilligung erlaubt die Veröffentlichung des
 * Namens, nicht die Veröffentlichung einer ungeprüften Meldung.
 *
 * Gemessen am 2026-08-02 gegen die lokale Datenbank: `?year=2018` lieferte 2.394
 * Datensätze, davon 162 ungeprüft und 92 davon mit Namens- oder
 * Schiffsnamens-Einwilligung; `?year=2026` lieferte 8 Datensätze, von denen
 * *alle* ungeprüft waren. Nach dem Fix: 2.232 bzw. 0, jeweils 0 ungeprüfte.
 *
 * Verbindliche Regel (`CLAUDE.md`, `.claude/rules/api.md`): „Öffentliche
 * Grundmenge überall: `freigegeben_am IS NOT NULL`."
 */
describe('GET /api/sightings — öffentliche Grundmenge', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValue([]);
	});

	const approvalConditions = () =>
		(mockWhere.mock.calls.at(-1)?.[0] as Condition[]).filter((c) => c.column === 'approvedAt');

	it('liefert ohne Session ausschließlich freigegebene Sichtungen', async () => {
		// Bewusst ohne `locals.user`: der Endpunkt ist öffentlich erreichbar, der
		// Schutz liegt also allein im Freigabe-Filter.
		await GET(createMockGetEvent('http://localhost/api/sightings'));

		expect(approvalConditions()).toEqual([{ op: 'isNotNull', column: 'approvedAt' }]);
	});

	it('behält den Freigabe-Filter auch mit year-Parameter', async () => {
		await GET(createMockGetEvent('http://localhost/api/sightings?year=2018'));

		expect(approvalConditions()).toEqual([{ op: 'isNotNull', column: 'approvedAt' }]);
	});

	it('cached höchstens 5 Minuten, damit Freigaben zeitnah sichtbar werden', async () => {
		// Die Antwortmenge hängt am Freigabestatus: eine frisch freigegebene
		// Sichtung bleibt so lange unsichtbar, wie die alte Antwort gecached ist.
		// Eine Stunde war dafür zu lang.
		const event = createMockGetEvent('http://localhost/api/sightings?year=2018');
		await GET(event);

		expect(vi.mocked(event.setHeaders)).toHaveBeenCalledWith(
			expect.objectContaining({ 'Cache-Control': 'max-age=300' })
		);
	});

	it('nutzt den gemeinsamen Helper statt einer eigenen Bedingung', async () => {
		// `approvedOnly()` ist die einzige Definition des Prädikats (siehe
		// approvalFilter.ts). Der Spy umschließt die echte Implementierung — die
		// Bedingung oben bleibt also real geprüft, und ein handgeschriebenes
		// `isNotNull(sightings.approvedAt)` im Endpunkt fällt hier auf, weil der
		// Helper dann nicht aufgerufen wird.
		const { approvedOnly } = await import('#lib/server/db/approvalFilter.ts');

		await GET(createMockGetEvent('http://localhost/api/sightings?year=2018'));

		expect(vi.mocked(approvedOnly)).toHaveBeenCalled();
	});
});
