import { beforeEach, describe, it, expect, vi } from 'vitest';
import { GET } from '../../routes/api/statistics/+server';
import { createEvent } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	getSightingStatistics: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { getSightingStatistics } = await import('#lib/server/db/sightingRepository.ts');
const mockStats = {
	totalSightings: 1234,
	completionRate: 78.5,
	averageOptionalFields: 12.3,
	yearsOfService: 8,
	uniqueUsers: 456,
	sightingsWithMedia: 321,
	deadAnimalsFound: 42
};

describe('Contract: GET /api/statistics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSightingStatistics).mockResolvedValue(mockStats);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/statistics');
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('sets Cache-Control header with max-age', async () => {
		const event = createEvent('/api/statistics');
		const res = await GET(event);

		expect(res.headers.get('cache-control')).toContain('max-age');
	});

	it('returns 500 with fallback stats when DB throws', async () => {
		vi.mocked(getSightingStatistics).mockRejectedValue(new Error('DB down'));
		// Advance fake time past the 1-hour cache TTL so the cached value from the
		// previous test is considered stale and getSightingStatistics is called again.
		vi.useFakeTimers();
		vi.advanceTimersByTime(4_000_000); // 4000 seconds > 3600s cache TTL

		const event = createEvent('/api/statistics');
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		vi.useRealTimers();

		expect(apiRes.status).toBe(500);
		expect(apiRes).toSatisfyApiSpec();
	});
});
