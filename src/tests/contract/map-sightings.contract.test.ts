import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/map/sightings/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

const { mockWhere } = vi.hoisted(() => {
	const mockWhere = vi.fn().mockReturnValue({
		orderBy: vi.fn().mockResolvedValue([])
	});
	return { mockWhere };
});

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: mockWhere,
				orderBy: vi.fn().mockResolvedValue([])
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('#lib/server/db/schema.ts', {
		sightings: {
			id: 'id',
			sightingDate: 'sightingDate',
			verified: 'verified',
			approvedAt: 'approvedAt',
			rejectedAt: 'rejectedAt',
			firstName: 'firstName',
			lastName: 'lastName',
			nameConsent: 'nameConsent',
			shipName: 'shipName',
			shipNameConsent: 'shipNameConsent',
			waterway: 'waterway',
			seaMark: 'seaMark',
			longitude: 'longitude',
			latitude: 'latitude',
			species: 'species',
			totalCount: 'totalCount',
			juvenileCount: 'juvenileCount',
			isDead: 'isDead'
		}
	});
});

vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		and: vi.fn((...args) => args),
		between: vi.fn((a, b, c) => ({ a, b, c })),
		gte: vi.fn((a, b) => ({ a, b })),
		lte: vi.fn((a, b) => ({ a, b })),
		lt: vi.fn((a, b) => ({ a, b })),
		eq: vi.fn((a, b) => ({ a, b })),
		isNotNull: vi.fn((a) => ({ isNotNull: a })),
		or: vi.fn((...args) => ({ or: args })),
		isNull: vi.fn((a) => ({ isNull: a })),
		sql: Object.assign(
			vi.fn((strings: TemplateStringsArray) => String(strings.raw[0])),
			{
				raw: vi.fn((s: string) => s)
			}
		)
	});
});

vi.mock('#lib/map/mapUtils.ts', () => ({
	sightingsToGeoJSON: vi.fn().mockReturnValue({
		type: 'FeatureCollection',
		features: []
	})
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('Contract: GET /api/map/sightings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/map/sightings', {
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 with year filter and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/map/sightings', {
			locals: { user: mockAdminUser },
			searchParams: { year: '2024' }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns GeoJSON FeatureCollection', async () => {
		const event = createEvent('/api/map/sightings', {
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const body = await res.json();

		expect(body.type).toBe('FeatureCollection');
		expect(Array.isArray(body.features)).toBe(true);
	});

	it('filtert über approvedOnly() auf approvedAt statt auf verified=1 (gleiche Grundmenge wie Legacy-API)', async () => {
		const { isNotNull, eq } = vi.mocked(await import('drizzle-orm'));
		const event = createEvent('/api/map/sightings', {
			locals: { user: mockAdminUser }
		});

		await GET(event);

		// Die öffentliche Grundmenge der modernen Karte muss dieselbe Spalte nutzen
		// wie /sichtungen/showreports.json, an die die Legacy-API vertraglich
		// gebunden ist: approvedAt. `verified` und `approvedAt` werden zwar immer
		// gemeinsam geschrieben, aber zwei verschiedene Filterspalten für zwei
		// öffentliche Flächen können auseinanderlaufen — deshalb hier nur eine.
		expect(isNotNull).toHaveBeenCalledWith('approvedAt');
		expect(eq).not.toHaveBeenCalledWith('verified', 1);
	});
});

describe('GET /api/map/sightings — Statusfilter', () => {
	beforeEach(() => {
		mockWhere.mockClear();
	});

	it('antwortet ohne Anmeldung mit 403, sobald status gesetzt ist', async () => {
		const response = await GET(
			createEvent('/api/map/sightings', { searchParams: { status: 'open' } })
		);
		expect(response.status).toBe(403);
		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('antwortet für Admins mit 200', async () => {
		const response = await GET(
			createEvent('/api/map/sightings', {
				searchParams: { status: 'open,rejected' },
				locals: { user: mockAdminUser }
			})
		);
		expect(response.status).toBe(200);
		expect(mockWhere).toHaveBeenCalled();
	});

	it('antwortet für Admins mit 400 bei unbekanntem Status', async () => {
		const response = await GET(
			createEvent('/api/map/sightings', {
				searchParams: { status: 'verified' },
				locals: { user: mockAdminUser }
			})
		);
		expect(response.status).toBe(400);
		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('setzt für den Admin-Fall einen privaten Cache-Header', async () => {
		const event = createEvent('/api/map/sightings', {
			searchParams: { status: 'open' },
			locals: { user: mockAdminUser }
		});
		await GET(event);
		expect(event.setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'private, no-store' });
	});

	it('setzt ohne Statusparameter keinen Cache-Control-Header, aber Vary: Cookie', async () => {
		// Finding 4 (Pre-Merge-Review): Die Antwort hängt vom Session-Cookie ab
		// (Admin-Status entscheidet, ob überhaupt ein Statusfilter erlaubt wäre) —
		// ein Shared Cache muss das über Vary wissen. Am unveränderten Verhalten
		// für den öffentlichen Fall (kein Cache-Control) ändert sich nichts.
		const event = createEvent('/api/map/sightings');
		await GET(event);
		expect(event.setHeaders).toHaveBeenCalledWith({ Vary: 'Cookie' });
		expect(event.setHeaders).not.toHaveBeenCalledWith(
			expect.objectContaining({ 'Cache-Control': expect.anything() })
		);
	});

	it('setzt auf dem 403-Pfad Vary: Cookie und einen privaten Cache-Header', async () => {
		// Finding 4: Vorher trug die Ablehnung (kein Statusfilter ohne Anmeldung
		// erlaubt) gar keine Cache-Direktive — als einzige Antwort der Route.
		const event = createEvent('/api/map/sightings', { searchParams: { status: 'open' } });
		const response = await GET(event);

		expect(response.status).toBe(403);
		expect(event.setHeaders).toHaveBeenCalledWith({ Vary: 'Cookie' });
		expect(event.setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'private, no-store' });
	});
});
