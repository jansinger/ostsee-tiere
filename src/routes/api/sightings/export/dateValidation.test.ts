import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => Promise.resolve([])
				})
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {}
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args) => args),
	between: vi.fn(),
	gte: vi.fn(),
	lt: vi.fn(),
	eq: vi.fn()
}));

const createMockEvent = (params: Record<string, string> = {}) => {
	const search = new URLSearchParams(params).toString();
	return {
		url: new URL(`http://localhost/api/sightings/export${search ? '?' + search : ''}`),
		locals: { user: { email: 'admin@test.com', roles: ['admin'] } }
	};
};

describe('/api/sightings/export GET — Datum-Parameter-Validierung', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gibt 400 zurück bei ungültigem fromDate', async () => {
		const response = await GET(
			createMockEvent({ fromDate: '2024-99-99' }) as Parameters<typeof GET>[0]
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toMatch(/fromDate/i);
	});

	it('gibt 400 zurück bei nicht-datumförmigem fromDate', async () => {
		const response = await GET(createMockEvent({ fromDate: 'foo' }) as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toMatch(/fromDate/i);
	});

	it('gibt 400 zurück bei ungültigem toDate', async () => {
		const response = await GET(
			createMockEvent({ toDate: 'notadate' }) as Parameters<typeof GET>[0]
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toMatch(/toDate/i);
	});

	it('gibt 400 zurück bei toDate mit Monatsüberlauf', async () => {
		const response = await GET(
			createMockEvent({ toDate: '2024-13-01' }) as Parameters<typeof GET>[0]
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toMatch(/toDate/i);
	});

	it('gibt 200 zurück wenn nur fromDate gesetzt und gültig ist', async () => {
		const response = await GET(
			createMockEvent({ fromDate: '2024-01-01' }) as Parameters<typeof GET>[0]
		);

		expect(response.status).toBe(200);
	});

	it('gibt 200 zurück wenn nur toDate gesetzt und gültig ist', async () => {
		const response = await GET(
			createMockEvent({ toDate: '2024-12-31' }) as Parameters<typeof GET>[0]
		);

		expect(response.status).toBe(200);
	});

	it('gibt 200 zurück wenn beide Datum-Parameter gültig sind', async () => {
		const response = await GET(
			createMockEvent({ fromDate: '2024-01-01', toDate: '2024-12-31' }) as Parameters<typeof GET>[0]
		);

		expect(response.status).toBe(200);
	});

	it('gibt 200 zurück ohne Datum-Parameter', async () => {
		const response = await GET(createMockEvent() as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
	});
});
