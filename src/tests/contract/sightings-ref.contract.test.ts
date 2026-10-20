import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/sightings/ref/[refId]/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	getSightingByReferenceId: vi.fn()
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

const { getSightingByReferenceId } = await import('#lib/server/db/sightingRepository.ts');

const mockSighting = {
	id: 123,
	sightingDate: new Date('2024-06-15T14:30:00Z'),
	created: new Date('2024-06-15T15:00:00Z'),
	species: 1,
	totalCount: 2,
	juvenileCount: 0,
	latitude: 54.5,
	longitude: 13.5,
	isDead: 0,
	referenceId: 'ref-test-123',
	verified: 1,
	approvedAt: null,
	internalComment: null
};

describe('Contract: GET /api/sightings/ref/{refId}', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSightingByReferenceId).mockResolvedValue(mockSighting as any);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/ref/ref-test-123', {
			params: { refId: 'ref-test-123' },
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns the sighting data', async () => {
		const event = createEvent('/api/sightings/ref/ref-test-123', {
			params: { refId: 'ref-test-123' },
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const body = await res.json();

		expect(body.id).toBe(123);
		expect(body.referenceId).toBe('ref-test-123');
	});

	it('throws 404 when sighting not found', async () => {
		vi.mocked(getSightingByReferenceId).mockResolvedValueOnce(null);
		const event = createEvent('/api/sightings/ref/does-not-exist', {
			params: { refId: 'does-not-exist' },
			locals: { user: mockAdminUser }
		});

		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(404);
			expect(e.body.message).toBeDefined();
		}
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/sightings/ref/ref-test-123', {
			params: { refId: 'ref-test-123' },
			locals: { user: mockAdminUser }
		});
		try {
			await GET(event);
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
		const event = createEvent('/api/sightings/ref/ref-test-123', {
			params: { refId: 'ref-test-123' },
			locals: { user: mockAdminUser }
		});
		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});
