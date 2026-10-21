import { describe, it, expect, vi } from 'vitest';
import { GET, HEAD } from '../../routes/health/+server';
import { createEvent } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/env.ts', () => ({
	env: { NODE_ENV: 'test', APP_GIT_SHA: 'abcdef1234567890', APP_BUILD_DATE: '2026-07-31T10:00:00Z' }
}));

// DB-Konnektivität mocken: gesund (true), damit der Contract-Test 200 erhält
vi.mock('#lib/server/db/index.ts', () => ({
	testDatabaseConnection: vi.fn().mockResolvedValue(true)
}));

describe('Contract: GET /health', () => {
	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/health');
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('includes all required response fields', async () => {
		const event = createEvent('/health');
		const res = await GET(event);
		const body = await res.json();

		expect(body).toMatchObject({
			status: 'healthy',
			timestamp: expect.any(String),
			uptime: expect.any(Number),
			environment: expect.any(String),
			version: expect.any(String),
			responseTime: expect.any(String)
		});
	});

	it('sets Cache-Control: no-cache header', async () => {
		const event = createEvent('/health');
		const res = await GET(event);

		expect(res.headers.get('cache-control')).toContain('no-cache');
	});
});

describe('Contract: HEAD /health', () => {
	it('returns 200 with no body', async () => {
		const event = createEvent('/health', { method: 'HEAD' });
		const res = await HEAD(event);

		expect(res.status).toBe(200);
		// HEAD responses have no body — do not call toSatisfyApiSpec() here
		expect(res.body).toBeNull();
	});

	it('sets Cache-Control header', async () => {
		const event = createEvent('/health', { method: 'HEAD' });
		const res = await HEAD(event);

		expect(res.headers.get('cache-control')).toContain('no-cache');
	});
});
