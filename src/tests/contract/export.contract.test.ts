import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as exportBaseGET } from '../../routes/api/sightings/export/+server';
import { GET as jsonGET } from '../../routes/api/sightings/export/json/+server';
import { GET as csvGET } from '../../routes/api/sightings/export/csv/+server';
import { GET as xmlGET } from '../../routes/api/sightings/export/xml/+server';
import { GET as kmlGET } from '../../routes/api/sightings/export/kml/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockResolvedValue([])
				}),
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
			entryChannel: 'entryChannel',
			mediaUpload: 'mediaUpload'
		}
	});
});

vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		and: vi.fn((...args) => args),
		between: vi.fn((a, b, c) => ({ a, b, c })),
		gte: vi.fn((a, b) => ({ a, b })),
		lt: vi.fn((a, b) => ({ a, b })),
		eq: vi.fn((a, b) => ({ a, b })),
		isNotNull: vi.fn((a) => ({ a }))
	});
});

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const mockSighting = {
	id: 1,
	referenceId: 'REF-001',
	sightingDate: new Date('2024-06-15T14:30:00Z'),
	created: new Date('2024-06-15T15:00:00Z'),
	species: 0,
	totalCount: 2,
	juvenileCount: 0,
	latitude: 54.5,
	longitude: 13.5,
	isDead: 0,
	email: 'max@example.com',
	lastName: 'Muster',
	phone: null,
	distance: 1,
	distribution: 1,
	city: 'Rostock',
	notes: null,
	seaState: null,
	windForce: null,
	visibility: null,
	mediaUpload: 0,
	inBalticSeaGeo: true,
	verified: 1,
	entryChannel: 0
};

async function mockDbWithSighting(sighting: object) {
	const { db } = vi.mocked(await import('#lib/server/db/index.ts'));
	(db.select as any).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue([sighting])
			}),
			orderBy: vi.fn().mockResolvedValue([sighting])
		})
	});
}

describe('Contract: GET /api/sightings/export/json', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 with application/json content-type and satisfies spec', async () => {
		const event = createEvent('/api/sightings/export/json', {
			locals: { user: mockAdminUser }
		});
		const res = await jsonGET(event);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/json');
		const apiRes = await asApiResponse(res, event);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 with fromDate/toDate filter applied', async () => {
		const event = createEvent('/api/sightings/export/json', {
			locals: { user: mockAdminUser },
			searchParams: { fromDate: '2024-01-01', toDate: '2024-12-31' }
		});
		const res = await jsonGET(event);

		expect(res.status).toBe(200);
	});

	it('response body contains metadata and sichtungen keys', async () => {
		const event = createEvent('/api/sightings/export/json', {
			locals: { user: mockAdminUser }
		});
		const res = await jsonGET(event);
		const text = await res.text();
		const body = JSON.parse(text);

		expect(body).toHaveProperty('metadata');
		expect(body).toHaveProperty('sichtungen');
		expect(Array.isArray(body.sichtungen)).toBe(true);
	});

	it('sichtungen array contains records when DB has data and satisfies spec', async () => {
		await mockDbWithSighting(mockSighting);

		const event = createEvent('/api/sightings/export/json', {
			locals: { user: mockAdminUser }
		});
		const res = await jsonGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
		expect((apiRes.body as any).sichtungen).toHaveLength(1);
		expect((apiRes.body as any).metadata.recordCount).toBe(1);
	});
});

describe('Contract: GET /api/sightings/export/csv', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 with text/csv content-type and satisfies spec', async () => {
		const event = createEvent('/api/sightings/export/csv', {
			locals: { user: mockAdminUser }
		});
		const res = await csvGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
		expect(apiRes.text.length).toBeGreaterThan(0);
	});

	it('CSV body contains data row when DB has records', async () => {
		await mockDbWithSighting(mockSighting);

		const event = createEvent('/api/sightings/export/csv', {
			locals: { user: mockAdminUser }
		});
		const res = await csvGET(event);
		const body = await res.text();

		expect(body.split('\n').length).toBeGreaterThanOrEqual(2);
		// Spaltensatz und Zeitzone kommen aus generateCsvData (Europe/Berlin)
		expect(body).toContain('"Schweinswal"');
		expect(body).toContain('"15.06.2024";"16:30"');
	});
});

describe('Contract: GET /api/sightings/export/xml', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 with application/xml content-type and satisfies spec', async () => {
		const event = createEvent('/api/sightings/export/xml', {
			locals: { user: mockAdminUser }
		});
		const res = await xmlGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
		expect(apiRes.text.length).toBeGreaterThan(0);
	});

	it('XML body contains sichtung element when DB has records', async () => {
		await mockDbWithSighting(mockSighting);

		const event = createEvent('/api/sightings/export/xml', {
			locals: { user: mockAdminUser }
		});
		const res = await xmlGET(event);
		const body = await res.text();

		expect(body).toContain('<sichtung>');
		// Legacy-Feldnamen und Berliner Ortszeit kommen aus generateXmlData
		expect(body).toContain('<nr>1</nr>');
		expect(body).toContain('<datum>15.06.24</datum>');
	});
});

describe('Contract: GET /api/sightings/export/kml', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 with kml content-type and satisfies spec', async () => {
		const event = createEvent('/api/sightings/export/kml', {
			locals: { user: mockAdminUser }
		});
		const res = await kmlGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
		expect(apiRes.text.length).toBeGreaterThan(0);
	});

	it('KML body contains Placemark when DB has records', async () => {
		await mockDbWithSighting(mockSighting);

		const event = createEvent('/api/sightings/export/kml', {
			locals: { user: mockAdminUser }
		});
		const res = await kmlGET(event);
		const body = await res.text();

		expect(body).toContain('<Placemark>');
		// Koordinatenformat und Berliner Ortszeit kommen aus generateKmlData
		expect(body).toContain('<coordinates>13.5,54.5</coordinates>');
		expect(body).toContain('15.06.24 16:30');
	});
});

describe('Contract: GET /api/sightings/export (base)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/export', {
			searchParams: { format: 'json' },
			locals: { user: mockAdminUser }
		});
		const res = await exportBaseGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 with date filter applied', async () => {
		const event = createEvent('/api/sightings/export', {
			searchParams: { format: 'json', fromDate: '2024-01-01', toDate: '2024-12-31' },
			locals: { user: mockAdminUser }
		});
		const res = await exportBaseGET(event);

		expect(res.status).toBe(200);
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/sightings/export', {
			searchParams: { format: 'json' },
			locals: { user: mockAdminUser }
		});
		try {
			await exportBaseGET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('throws 403 when role is insufficient', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 403, body: { message: 'Forbidden' } };
		});
		const event = createEvent('/api/sightings/export', {
			searchParams: { format: 'json' },
			locals: { user: mockAdminUser }
		});
		try {
			await exportBaseGET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Audit: export.download wird geloggt', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('logAuditEvent wird mit action export.download für JSON-Export aufgerufen', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export/json', {
			searchParams: { fromDate: '2024-01-01', toDate: '2024-12-31' },
			locals: { user: mockAdminUser }
		});

		await jsonGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'export.download',
				resourceType: 'export',
				details: expect.objectContaining({ format: 'json' })
			})
		);
	});

	it('logAuditEvent wird mit action export.download für CSV-Export aufgerufen', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export/csv', {
			locals: { user: mockAdminUser }
		});

		await csvGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'export.download',
				resourceType: 'export',
				details: expect.objectContaining({ format: 'csv' })
			})
		);
	});

	it('logAuditEvent wird mit action export.download für XML-Export aufgerufen', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export/xml', {
			locals: { user: mockAdminUser }
		});

		await xmlGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'export.download',
				resourceType: 'export',
				details: expect.objectContaining({ format: 'xml' })
			})
		);
	});

	it('logAuditEvent wird mit action export.download für KML-Export aufgerufen', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export/kml', {
			locals: { user: mockAdminUser }
		});

		await kmlGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'export.download',
				resourceType: 'export',
				details: expect.objectContaining({ format: 'kml' })
			})
		);
	});

	it('logAuditEvent wird mit action export.download für Basis-Export aufgerufen', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export', {
			searchParams: { fromDate: '2024-01-01', toDate: '2024-12-31' },
			locals: { user: mockAdminUser }
		});

		await exportBaseGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'export.download',
				resourceType: 'export',
				details: expect.objectContaining({ format: 'json' })
			})
		);
	});

	it('logAuditEvent enthält userEmail wenn admin eingeloggt', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export/json', {
			locals: { user: mockAdminUser }
		});

		await jsonGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'export.download',
				userEmail: 'admin@test.de'
			})
		);
	});

	it('logAuditEvent enthält fromDate und toDate in details', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/export/csv', {
			searchParams: { fromDate: '2024-01-01', toDate: '2024-12-31' },
			locals: { user: mockAdminUser }
		});

		await csvGET(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				details: expect.objectContaining({
					fromDate: '2024-01-01',
					toDate: '2024-12-31'
				})
			})
		);
	});
});
