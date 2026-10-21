import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockIsAdminUser,
	mockSelect,
	mockIsCloudStorage,
	mockGetStorageProvider,
	mockEnforceRateLimit,
	mockIsValidUploadPath,
	mockGetFileInfo
} = vi.hoisted(() => ({
	mockIsAdminUser: vi.fn().mockReturnValue(false),
	mockSelect: vi.fn(),
	mockIsCloudStorage: vi.fn().mockReturnValue(true),
	mockGetStorageProvider: vi.fn().mockReturnValue({
		getUrl: vi.fn().mockReturnValue('https://cdn.example/blob/file.jpg')
	}),
	mockEnforceRateLimit: vi.fn().mockReturnValue({ remaining: 10, resetTime: Date.now() + 1000 }),
	mockIsValidUploadPath: vi.fn().mockReturnValue(true),
	mockGetFileInfo: vi.fn().mockReturnValue({
		size: 123,
		mimeType: 'image/jpeg',
		lastModified: new Date(),
		isAllowed: true
	})
}));

vi.mock('fs', () => ({
	createReadStream: vi.fn().mockReturnValue({ on: vi.fn() })
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/uploads.ts', () => ({
	isValidUploadPath: mockIsValidUploadPath,
	getUploadPath: vi.fn().mockReturnValue('/abs/uploads/file.jpg'),
	getFileInfo: mockGetFileInfo
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

describe('GET /uploads/[...path] — Cache-Control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsAdminUser.mockReturnValue(false);
		mockIsCloudStorage.mockReturnValue(true);
		mockIsValidUploadPath.mockReturnValue(true);
		mockEnforceRateLimit.mockReturnValue({ remaining: 10, resetTime: Date.now() + 1000 });
		mockGetFileInfo.mockReturnValue({
			size: 123,
			mimeType: 'image/jpeg',
			lastModified: new Date(),
			isAllowed: true
		});
	});

	it('markiert freigegebene Cloud-Redirects als öffentlich cachebar', async () => {
		mockDbResult([{ sightingId: 5, approvedAt: new Date() }]);

		const res = await GET(makeEvent('ref/approved.jpg') as never);

		expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
	});

	it('verbietet geteilten Caches das Vorhalten unfreigegebener Admin-Cloud-Redirects', async () => {
		mockIsAdminUser.mockReturnValue(true);
		mockDbResult([{ sightingId: 5, approvedAt: null }]);

		const res = await GET(
			makeEvent('ref/unapproved.jpg', { sub: 'auth0|admin', roles: ['admin'] }) as never
		);

		expect(res.headers.get('Cache-Control')).toBe('private, no-store');
	});

	it('markiert freigegebene lokale Dateien als öffentlich cachebar', async () => {
		mockIsCloudStorage.mockReturnValue(false);
		mockDbResult([{ sightingId: 5, approvedAt: new Date() }]);

		const res = await GET(makeEvent('ref/approved.jpg') as never);

		expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
	});

	it('verbietet geteilten Caches das Vorhalten unfreigegebener lokaler Admin-Dateien', async () => {
		mockIsCloudStorage.mockReturnValue(false);
		mockIsAdminUser.mockReturnValue(true);
		mockDbResult([{ sightingId: 5, approvedAt: null }]);

		const res = await GET(
			makeEvent('ref/unapproved.jpg', { sub: 'auth0|admin', roles: ['admin'] }) as never
		);

		expect(res.headers.get('Cache-Control')).toBe('private, no-store');
	});
});
