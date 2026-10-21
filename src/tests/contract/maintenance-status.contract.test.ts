import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/maintenance-status/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		isMaintenanceModeEnabled: vi.fn().mockResolvedValue(false),
		getString: vi.fn().mockResolvedValue('Wir sind gleich wieder da.')
	}
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

const { ServerConfigService } = await import('#lib/services/configService.ts');

describe('Contract: GET /api/maintenance-status', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(ServerConfigService.isMaintenanceModeEnabled).mockResolvedValue(false);
		vi.mocked(ServerConfigService.getString).mockResolvedValue('Wir sind gleich wieder da.');
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/maintenance-status', {
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns enabled=true when maintenance mode is on', async () => {
		vi.mocked(ServerConfigService.isMaintenanceModeEnabled).mockResolvedValue(true);

		const event = createEvent('/api/maintenance-status', {
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const body = await res.json();

		expect(body.enabled).toBe(true);
		expect(body.timestamp).toBeDefined();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/maintenance-status', { locals: { user: mockAdminUser } });
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
		const event = createEvent('/api/maintenance-status', { locals: { user: mockAdminUser } });
		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});
