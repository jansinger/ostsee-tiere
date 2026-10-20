import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockIsAdminUser,
	mockSelect,
	mockIsCloudStorage,
	mockGetStorageProvider,
	mockEnforceRateLimit,
	mockIsValidUploadPath
} = vi.hoisted(() => ({
	mockIsAdminUser: vi.fn().mockReturnValue(false),
	mockSelect: vi.fn(),
	mockIsCloudStorage: vi.fn().mockReturnValue(true),
	mockGetStorageProvider: vi.fn().mockReturnValue({
		getUrl: vi.fn().mockReturnValue('https://cdn.example/blob/file.jpg')
	}),
	mockEnforceRateLimit: vi.fn().mockReturnValue({ remaining: 10, resetTime: Date.now() + 1000 }),
	mockIsValidUploadPath: vi.fn().mockReturnValue(true)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/uploads.ts', () => ({
	isValidUploadPath: mockIsValidUploadPath,
	getUploadPath: vi.fn().mockReturnValue('/abs/uploads/file.jpg'),
	getFileInfo: vi.fn()
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: mockGetStorageProvider,
	isCloudStorage: mockIsCloudStorage
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	isAdminUser: mockIsAdminUser
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: mockSelect }
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightingFiles: { sightingId: {}, filePath: {}, id: {} },
	sightings: { id: {}, approvedAt: {} }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn()
}));

vi.mock('#lib/server/middleware/rateLimit.ts', () => ({
	RATE_LIMITS: {
		MEDIA_ACCESS_ANONYMOUS: { windowMs: 60000, maxRequests: 30 },
		MEDIA_ACCESS_AUTHENTICATED: { windowMs: 60000, maxRequests: 100 }
	},
	enforceRateLimit: mockEnforceRateLimit,
	createRateLimitIdentifier: vi.fn().mockReturnValue('ip:10.0.0.1')
}));

vi.mock('#lib/server/utils/getClientIp.ts', () => ({
	getClientIp: vi.fn().mockReturnValue('10.0.0.1')
}));

import { GET } from './+server';

function mockDbResult(rows: Array<{ sightingId: number | null; approvedAt: Date | null }>) {
	const limit = vi.fn().mockResolvedValue(rows);
	const where = vi.fn().mockReturnValue({ limit });
	const innerJoin = vi.fn().mockReturnValue({ where });
	const from = vi.fn().mockReturnValue({ innerJoin });
	mockSelect.mockReturnValue({ from });
}

function makeEvent(path: string, user: unknown = null) {
	return {
		params: { path },
		request: new Request(`http://localhost/uploads/${path}`),
		locals: { user },
		getClientAddress: () => '10.0.0.1'
	};
}

describe('GET /uploads/[...path] — Zugriffskontrolle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsAdminUser.mockReturnValue(false);
		mockIsCloudStorage.mockReturnValue(true);
		mockIsValidUploadPath.mockReturnValue(true);
		mockEnforceRateLimit.mockReturnValue({ remaining: 10, resetTime: Date.now() + 1000 });
	});

	it('verweigert anonymen Zugriff auf unfreigegebene Dateien mit 404', async () => {
		mockDbResult([{ sightingId: 5, approvedAt: null }]);

		await expect(GET(makeEvent('ref/unapproved.jpg') as never)).rejects.toMatchObject({
			status: 404
		});
	});

	it('liefert freigegebene Dateien aus (Cloud-Redirect)', async () => {
		mockDbResult([{ sightingId: 5, approvedAt: new Date() }]);

		const res = await GET(makeEvent('ref/approved.jpg') as never);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe('https://cdn.example/blob/file.jpg');
	});

	it('setzt keinen Access-Control-Allow-Origin: * Header', async () => {
		mockDbResult([{ sightingId: 5, approvedAt: new Date() }]);

		const res = await GET(makeEvent('ref/approved.jpg') as never);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});

	it('erlaubt Admins den Zugriff auf unfreigegebene Dateien', async () => {
		mockIsAdminUser.mockReturnValue(true);
		mockDbResult([{ sightingId: 5, approvedAt: null }]);

		const res = await GET(
			makeEvent('ref/unapproved.jpg', { sub: 'auth0|admin', roles: ['admin'] }) as never
		);
		expect(res.status).toBe(302);
	});

	it('gibt 404 für unbekannte Dateien zurück', async () => {
		mockDbResult([]);

		await expect(GET(makeEvent('ref/missing.jpg') as never)).rejects.toMatchObject({
			status: 404
		});
	});
});
