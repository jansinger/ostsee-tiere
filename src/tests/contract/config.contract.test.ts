import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT, DELETE } from '../../routes/api/config/+server';
import { GET as publicGET } from '../../routes/api/config/public/+server';
import { GET as uploadGET } from '../../routes/api/config/upload/+server';
import { POST as initPOST } from '../../routes/api/config/init/+server';
import { POST as resetPOST } from '../../routes/api/config/reset/+server';
import { POST as configTestEmailPOST } from '../../routes/api/config/test-email/+server';
import { createEvent, mockAdminUser, mockSuperadmin } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

const mockConfigs = [
	{ key: 'display.maxSightings', value: 100, description: 'Max sightings', category: 'display' }
];

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		getAll: vi.fn().mockResolvedValue([]),
		getByCategory: vi.fn().mockResolvedValue([]),
		upsert: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		clearCache: vi.fn()
	}
}));

vi.mock('#lib/server/config/accessControl.ts', () => ({
	filterConfigsByUserAccess: vi.fn((configs: unknown[]) => configs),
	canUserAccessConfigKey: vi.fn().mockReturnValue(true)
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		get: vi.fn().mockResolvedValue(null),
		getString: vi.fn().mockResolvedValue(null),
		isMaintenanceModeEnabled: vi.fn().mockResolvedValue(false),
		getUploadConfig: vi.fn().mockResolvedValue({
			maxFileSize: 10,
			maxFileSizeBytes: 10 * 1024 * 1024,
			maxVideoFileSize: 100,
			maxVideoFileSizeBytes: 100 * 1024 * 1024,
			maxTotalUploadSize: 200,
			maxTotalUploadSizeBytes: 200 * 1024 * 1024,
			allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		})
	},
	DEFAULT_CONFIG_VALUES: {}
}));

vi.mock('#lib/server/services/configInitializer.ts', () => ({
	initializeDefaultConfigurations: vi.fn().mockResolvedValue(undefined),
	resetToDefaultConfigurations: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/services/emailService.ts', () => ({
	EmailService: {
		sendTestEmail: vi.fn().mockResolvedValue(true)
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

describe('Contract: GET /api/config', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { ConfigRepository } = vi.mocked(await import('#lib/server/db/configRepository.ts'));
		(ConfigRepository.getAll as any).mockResolvedValue([...mockConfigs]);
		const { filterConfigsByUserAccess } = vi.mocked(
			await import('#lib/server/config/accessControl.ts')
		);
		(filterConfigsByUserAccess as any).mockImplementation((configs: unknown[]) => configs);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config', {
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/config', { locals: { user: mockAdminUser } });
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
		const event = createEvent('/api/config', { locals: { user: mockAdminUser } });
		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: PUT /api/config', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { canUserAccessConfigKey } = vi.mocked(
			await import('#lib/server/config/accessControl.ts')
		);
		canUserAccessConfigKey.mockReturnValue(true);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config', {
			method: 'PUT',
			locals: { user: mockAdminUser },
			body: { key: 'display.maxSightings', value: 50, category: 'display' }
		});
		const res = await PUT(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 400 when key is missing', async () => {
		const event = createEvent('/api/config', {
			method: 'PUT',
			locals: { user: mockAdminUser },
			body: { value: 50, category: 'display' }
		});
		const res = await PUT(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(400);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/config', {
			method: 'PUT',
			locals: { user: mockAdminUser },
			body: { key: 'x', value: 1 }
		});
		try {
			await PUT(event);
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
		const event = createEvent('/api/config', {
			method: 'PUT',
			locals: { user: mockAdminUser },
			body: { key: 'x', value: 1 }
		});
		try {
			await PUT(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: DELETE /api/config', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { canUserAccessConfigKey } = vi.mocked(
			await import('#lib/server/config/accessControl.ts')
		);
		canUserAccessConfigKey.mockReturnValue(true);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config', {
			method: 'DELETE',
			searchParams: { key: 'display.maxSightings' },
			locals: { user: mockAdminUser }
		});
		const res = await DELETE(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/config', {
			method: 'DELETE',
			searchParams: { key: 'x' },
			locals: { user: mockAdminUser }
		});
		try {
			await DELETE(event);
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
		const event = createEvent('/api/config', {
			method: 'DELETE',
			searchParams: { key: 'x' },
			locals: { user: mockAdminUser }
		});
		try {
			await DELETE(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: GET /api/config/public', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config/public');
		const res = await publicGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	// Die Karte (optimizedMapController.ts) verdrahtet Zentrum, Zoom und Tile-Quelle
	// fest. Solange das so ist, gehören diese Schlüssel in keine öffentliche Antwort —
	// sie wurden anonym ausgeliefert, ohne dass sie irgendwo gelesen wurden.
	it('liefert keine Karten-Schlüssel aus, die nirgends gelesen werden', async () => {
		const event = createEvent('/api/config/public');
		const res = await publicGET(event);
		const body = await res.json();

		expect(body).not.toHaveProperty('display.defaultMapCenter');
		expect(body).not.toHaveProperty('display.defaultMapZoom');
		expect(body).not.toHaveProperty('integration.mapTileProvider');
	});
});

describe('Contract: GET /api/config/upload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 for unauthenticated user (public config) and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config/upload');
		const res = await uploadGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 for authenticated user (full config) and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config/upload', {
			locals: { user: mockAdminUser }
		});
		const res = await uploadGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});
});

describe('Contract: POST /api/config/init', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config/init', {
			method: 'POST',
			locals: { user: mockSuperadmin }
		});
		const res = await initPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/config/init', {
			method: 'POST',
			locals: { user: mockSuperadmin }
		});
		try {
			await initPOST(event);
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
		const event = createEvent('/api/config/init', {
			method: 'POST',
			locals: { user: mockAdminUser }
		});
		try {
			await initPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: POST /api/config/reset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config/reset', {
			method: 'POST',
			locals: { user: mockSuperadmin }
		});
		const res = await resetPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/config/reset', {
			method: 'POST',
			locals: { user: mockSuperadmin }
		});
		try {
			await resetPOST(event);
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
		const event = createEvent('/api/config/reset', {
			method: 'POST',
			locals: { user: mockAdminUser }
		});
		try {
			await resetPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: POST /api/config/test-email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/config/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { recipient: 'test@example.com' }
		});
		const res = await configTestEmailPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 without explicit recipient', async () => {
		const event = createEvent('/api/config/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser }
		});
		const res = await configTestEmailPOST(event);

		expect(res.status).toBe(200);
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/config/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser }
		});
		try {
			await configTestEmailPOST(event);
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
		const event = createEvent('/api/config/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser }
		});
		try {
			await configTestEmailPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});
