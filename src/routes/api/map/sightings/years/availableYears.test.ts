import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockWhere, mockGroupBy, mockOrderBy } = vi.hoisted(() => {
	const mockOrderBy = vi.fn().mockResolvedValue([]);
	const mockGroupBy = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
	return { mockWhere, mockGroupBy, mockOrderBy };
});

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({ where: mockWhere })
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {
		sightingDate: 'sightingDate',
		approvedAt: 'approvedAt',
		rejectedAt: 'rejectedAt',
		latitude: 'latitude',
		longitude: 'longitude'
	}
}));

// Drizzle wird durch Marker-Objekte ersetzt, damit die WHERE-Bedingungen
// direkt geprüft werden können, statt generiertes SQL zu parsen. `sql` wird
// so gemockt, dass es (wie im Original) beliebig verschachtelt werden kann —
// berlinDatePart() aus sqlTimeZone.ts nutzt genau dieses Verhalten.
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions) => conditions),
	or: vi.fn((...conditions) => ({ op: 'or', conditions })),
	gte: vi.fn((column, value) => ({ op: 'gte', column, value })),
	lte: vi.fn((column, value) => ({ op: 'lte', column, value })),
	isNotNull: vi.fn((column) => ({ op: 'isNotNull', column })),
	isNull: vi.fn((column) => ({ op: 'isNull', column })),
	sql: Object.assign(
		vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
			op: 'sql',
			strings: strings.raw,
			values
		})),
		{ raw: vi.fn((s: string) => ({ op: 'sql.raw', value: s })) }
	)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { GET } from './+server';
import { mockAdminUser } from '../../../../../tests/contract/helpers/createEvent';

type Condition = { op: string; column: string };

function makeEvent(
	options: { status?: string; user?: unknown; setHeaders?: ReturnType<typeof vi.fn> } = {}
): Parameters<typeof GET>[0] {
	const url = new URL('http://localhost/api/map/sightings/years');
	if (options.status !== undefined) url.searchParams.set('status', options.status);

	return {
		url,
		locals: { user: options.user ?? null },
		setHeaders: options.setHeaders ?? vi.fn()
	} as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/map/sightings/years', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockReturnValue({ groupBy: mockGroupBy });
		mockGroupBy.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValue([]);
	});

	it('nutzt dieselbe Grundmenge wie die Karte (Freigabe + Koordinatenfilter)', async () => {
		await GET(makeEvent());

		const conditions = mockWhere.mock.calls.at(-1)?.[0] as Condition[];
		const notNullColumns = conditions
			.filter((condition) => condition.op === 'isNotNull')
			.map((condition) => condition.column);

		expect(notNullColumns).toEqual(expect.arrayContaining(['approvedAt', 'latitude', 'longitude']));
		expect(conditions.filter((condition) => condition.op === 'gte')).toHaveLength(2);
		expect(conditions.filter((condition) => condition.op === 'lte')).toHaveLength(2);
	});

	it('liefert Jahre absteigend sortiert und filtert count=0 heraus', async () => {
		mockOrderBy.mockResolvedValueOnce([
			{ year: 2025, count: 42 },
			{ year: 2024, count: 0 },
			{ year: 2023, count: 7 }
		]);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(body).toEqual({
			years: [
				{ year: 2025, count: 42 },
				{ year: 2023, count: 7 }
			]
		});
	});

	it('wandelt String-Werte (bigint/numeric aus Postgres) in Zahlen um', async () => {
		mockOrderBy.mockResolvedValueOnce([{ year: '2025', count: '42' }]);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(body).toEqual({ years: [{ year: 2025, count: 42 }] });
	});

	it('liefert ein leeres Array, wenn keine Sichtungen vorhanden sind', async () => {
		mockOrderBy.mockResolvedValueOnce([]);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(body).toEqual({ years: [] });
	});

	it('fängt DB-Fehler ab und liefert 500 ohne interne Details', async () => {
		mockOrderBy.mockRejectedValueOnce(new Error('boom - interne Details'));

		const response = await GET(makeEvent());

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('boom');
	});
});

describe('GET /api/map/sightings/years — Statusfilter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockReturnValue({ groupBy: mockGroupBy });
		mockGroupBy.mockReturnValue({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValue([]);
	});

	it('antwortet ohne Anmeldung mit 403, sobald status gesetzt ist', async () => {
		const response = await GET(makeEvent({ status: 'open' }));

		expect(response.status).toBe(403);
		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('antwortet für Admins mit 200', async () => {
		const response = await GET(makeEvent({ status: 'open,rejected', user: mockAdminUser }));

		expect(response.status).toBe(200);
		expect(mockWhere).toHaveBeenCalled();
	});

	it('antwortet für Admins mit 400 bei unbekanntem Status', async () => {
		const response = await GET(makeEvent({ status: 'verified', user: mockAdminUser }));

		expect(response.status).toBe(400);
		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('setzt für den Admin-Fall einen privaten Cache-Header', async () => {
		const setHeaders = vi.fn();
		await GET(makeEvent({ status: 'open', user: mockAdminUser, setHeaders }));

		expect(setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'private, no-store' });
	});

	it('setzt ohne Statusparameter keinen Cache-Control-Header, aber Vary: Cookie', async () => {
		// Finding 4 (Pre-Merge-Review): dieselbe Begründung wie bei GET /api/map/sightings —
		// die Antwort hängt vom Session-Cookie ab, ein Shared Cache muss das über Vary
		// wissen. Der öffentliche Fall bleibt ohne Cache-Control unverändert.
		const setHeaders = vi.fn();
		await GET(makeEvent({ setHeaders }));

		expect(setHeaders).toHaveBeenCalledWith({ Vary: 'Cookie' });
		expect(setHeaders).not.toHaveBeenCalledWith(
			expect.objectContaining({ 'Cache-Control': expect.anything() })
		);
	});

	it('setzt auf dem 403-Pfad Vary: Cookie und einen privaten Cache-Header', async () => {
		const setHeaders = vi.fn();
		const response = await GET(makeEvent({ status: 'open', setHeaders }));

		expect(response.status).toBe(403);
		expect(setHeaders).toHaveBeenCalledWith({ Vary: 'Cookie' });
		expect(setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'private, no-store' });
	});
});
