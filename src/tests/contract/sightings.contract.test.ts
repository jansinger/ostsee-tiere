import { beforeEach, describe, it, expect, vi } from 'vitest';
import { GET, POST } from '../../routes/api/sightings/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockResolvedValue([])
				})
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('#lib/server/db/schema.ts', {
		// `approvedAt` wird von `approvedOnly()` gebraucht — GET filtert die
		// öffentliche Grundmenge, siehe ../../routes/api/sightings/getEndpoint.test.ts
		sightings: {
			id: 'id',
			sightingDate: 'sightingDate',
			created: 'created',
			approvedAt: 'approvedAt'
		}
	});
});

vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		and: vi.fn((...args) => args),
		gte: vi.fn((a, b) => ({ a, b })),
		lt: vi.fn((a, b) => ({ a, b })),
		isNotNull: vi.fn((column) => ({ op: 'isNotNull', column })),
		isNull: vi.fn((column) => ({ op: 'isNull', column })),
		sql: Object.assign(
			vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => String(strings.raw[0])),
			{
				raw: vi.fn((s: string) => s)
			}
		)
	});
});

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	saveSighting: vi.fn().mockResolvedValue({ id: 123 }),
	countRecentDuplicateSignals: vi.fn().mockResolvedValue({ sameEmail: 0, sameNotes: 0 })
}));

// Spam-Detektor mocken: verhindert echte MX-DNS-Lookups im Contract-Test.
vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] })
}));
vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/middleware/rateLimit.ts', () => ({
	enforceRateLimit: vi.fn(),
	RATE_LIMITS: { SIGHTING_SUBMISSION: {} },
	createRateLimitIdentifier: vi.fn().mockReturnValue('test-id')
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getEmailConfig: vi.fn().mockResolvedValue({ enabled: false, recipient: '' })
	}
}));

vi.mock('#lib/server/env.ts', () => ({
	env: { NODE_ENV: 'test' }
}));

const validSightingBody = {
	referenceId: 'ref-test-123',
	firstName: 'Max',
	lastName: 'Muster',
	email: 'max@example.com',
	species: 0,
	totalCount: 1,
	sightingDate: '2024-06-15',
	hasPosition: true,
	latitude: 54.5,
	longitude: 13.5,
	privacyConsent: true,
	entryChannel: 0,
	boatDrive: 1,
	sightingFrom: 1,
	distance: 1,
	isDead: false
};

describe('Contract: GET /api/sightings', () => {
	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings', { locals: { user: mockAdminUser } });
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 with year query param', async () => {
		const event = createEvent('/api/sightings', {
			locals: { user: mockAdminUser },
			searchParams: { year: '2024' }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});
});

describe('Contract: POST /api/sightings', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { saveSighting } = vi.mocked(await import('#lib/server/db/sightingRepository.ts'));
		saveSighting.mockResolvedValue({ id: 123 });
	});

	it('returns 201 for a valid sighting submission', async () => {
		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: validSightingBody
		});
		const res = await POST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(201);
		expect(apiRes).toSatisfyApiSpec();
	}, 15000);

	it('returns 400 with VALIDATION_ERROR for missing required fields', async () => {
		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: { species: 0, totalCount: 1, privacyConsent: true } // missing firstName/lastName/email
		});
		const res = await POST(event);
		const body = await res.json();

		expect(res.status).toBe(400);
		expect(body.success).toBe(false);
		expect(body.code).toBe('VALIDATION_ERROR');
	}, 15000);

	it('returns 403 with FORBIDDEN_FIELDS when admin fields are submitted', async () => {
		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: { ...validSightingBody, verified: 1, internalComment: 'hack' }
		});
		const res = await POST(event);
		const body = await res.json();

		expect(res.status).toBe(403);
		expect(body.success).toBe(false);
		expect(body.code).toBe('FORBIDDEN_FIELDS');
	});

	it('returns 400 with INVALID_FIELDS for unknown fields', async () => {
		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: { ...validSightingBody, unknownField: 'bad' }
		});
		const res = await POST(event);
		const body = await res.json();

		expect(res.status).toBe(400);
		expect(body.success).toBe(false);
		expect(body.code).toBe('INVALID_FIELDS');
	});

	it('returns 400 when honeypot field is filled', async () => {
		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: { ...validSightingBody, _honeypot: 'i-am-a-bot' }
		});
		const res = await POST(event);

		expect(res.status).toBe(400);
	});

	it('returns 400 when body is not a JSON object', async () => {
		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: 'not-an-object'
		});
		const res = await POST(event);
		const body = await res.json();

		expect(res.status).toBe(400);
		expect(body.code).toBe('INVALID_FIELDS');
	});

	it('returns 422 on PostgreSQL constraint violation', async () => {
		const { saveSighting } = vi.mocked(await import('#lib/server/db/sightingRepository.ts'));
		saveSighting.mockRejectedValueOnce({
			code: '23505',
			detail: 'Key (email)=(max@example.com) already exists'
		});

		const event = createEvent('/api/sightings', {
			method: 'POST',
			body: validSightingBody
		});
		const res = await POST(event);
		const body = await res.json();

		expect(res.status).toBe(422);
		expect(body.success).toBe(false);
		expect(body.code).toBe('DATABASE_ERROR');
	}, 15000);

	it('throws 429 when rate limit is exceeded', async () => {
		const { enforceRateLimit } = vi.mocked(await import('#lib/server/middleware/rateLimit.ts'));
		enforceRateLimit.mockImplementationOnce(() => {
			throw { status: 429, body: { message: 'Too many requests' } };
		});
		const event = createEvent('/api/sightings', { method: 'POST', body: validSightingBody });
		try {
			await POST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(429);
		}
	});
});
