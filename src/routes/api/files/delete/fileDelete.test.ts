import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockLogAuditEvent,
	mockIsAdminUser,
	mockSelect,
	mockStorage,
	mockEnforceRateLimit,
	mockGetUploadUid
} = vi.hoisted(() => ({
	mockLogAuditEvent: vi.fn().mockResolvedValue(undefined),
	mockIsAdminUser: vi.fn().mockReturnValue(true),
	mockSelect: vi.fn(),
	mockStorage: { delete: vi.fn().mockResolvedValue(undefined) },
	mockEnforceRateLimit: vi.fn().mockReturnValue({ remaining: 10, resetTime: Date.now() + 1000 }),
	mockGetUploadUid: vi.fn().mockReturnValue('owner-uid-match')
}));

vi.mock('#lib/server/middleware/rateLimit.ts', () => ({
	RATE_LIMITS: {
		FILE_UPLOAD_ANONYMOUS: { windowMs: 3600000, maxRequests: 20 },
		FILE_UPLOAD_AUTHENTICATED: { windowMs: 3600000, maxRequests: 50 }
	},
	enforceRateLimit: mockEnforceRateLimit,
	createRateLimitIdentifier: vi.fn().mockReturnValue('ip:10.0.0.1')
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: mockLogAuditEvent
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	isAdminUser: mockIsAdminUser
}));

vi.mock('#lib/server/auth/uploadOwnership.ts', () => ({
	getUploadUid: mockGetUploadUid
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/db/sightingFilesRepository.ts', () => ({
	deleteFileByPath: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: vi.fn().mockReturnValue(mockStorage)
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: mockSelect }
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightingFiles: {}
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn()
}));

import { DELETE } from './+server';

function makeEvent(
	filePath: string,
	locals: Record<string, unknown> = {
		user: { email: 'admin@test.com', sub: 'auth0|admin', roles: ['admin'] }
	}
) {
	return {
		request: new Request('http://localhost/api/files/delete', {
			method: 'DELETE',
			headers: {
				'content-type': 'application/json',
				'x-forwarded-for': '10.0.0.1'
			},
			body: JSON.stringify({ filePath })
		}),
		locals,
		getClientAddress: () => '10.0.0.1',
		// Cookies werden im Handler nur an das (gemockte) getUploadUid übergeben.
		cookies: { get: vi.fn() }
	};
}

/** Locals eines anonymen (nicht angemeldeten) Nutzers. */
const ANON_LOCALS = { user: null };

describe('DELETE /api/files/delete — Audit Logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStorage.delete.mockResolvedValue(undefined);
		mockIsAdminUser.mockReturnValue(true);
		mockEnforceRateLimit.mockReturnValue({ remaining: 10, resetTime: Date.now() + 1000 });
		mockGetUploadUid.mockReturnValue('owner-uid-match');
	});

	/** Setzt den Select-Mock so, dass eine nicht zugeordnete Datei mit gegebenem uid gefunden wird. */
	function mockFileRecord(uid: string | null, sightingId: number | null = null) {
		const mockLimit = vi.fn().mockResolvedValue([{ id: 1, sightingId, uid }]);
		const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		mockSelect.mockReturnValue({ from: mockFrom });
	}

	it('erzwingt Rate-Limiting vor dem Löschen', async () => {
		const event = makeEvent('uploads/test-image.jpg');
		await DELETE(event as never);

		expect(mockEnforceRateLimit).toHaveBeenCalledOnce();
		expect(mockEnforceRateLimit).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ maxRequests: 50 }),
			'file_delete'
		);
	});

	it('bricht mit 429 ab, wenn das Rate-Limit überschritten ist', async () => {
		const { error } = await import('@sveltejs/kit');
		mockEnforceRateLimit.mockImplementation(() => {
			throw error(429, 'Rate limit exceeded');
		});

		const event = makeEvent('uploads/test-image.jpg');
		await expect(DELETE(event as never)).rejects.toMatchObject({ status: 429 });
		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it('loggt file.delete für Admin-Löschungen', async () => {
		const event = makeEvent('uploads/test-image.jpg');
		await DELETE(event as never);

		expect(mockLogAuditEvent).toHaveBeenCalledOnce();
		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'file.delete',
				resourceType: 'file',
				resourceId: 'uploads/test-image.jpg'
			})
		);
	});

	it('loggt KEIN file.delete für nicht-Admin-Löschungen', async () => {
		mockIsAdminUser.mockReturnValue(false);
		mockFileRecord('owner-uid-match');
		mockGetUploadUid.mockReturnValue('owner-uid-match');

		const event = makeEvent('uploads/unassigned.jpg', ANON_LOCALS);
		await DELETE(event as never);

		expect(mockLogAuditEvent).not.toHaveBeenCalled();
	});

	it('erlaubt Löschen einer nicht zugeordneten Datei mit passendem upload-uid-Cookie', async () => {
		mockIsAdminUser.mockReturnValue(false);
		mockFileRecord('owner-uid-match');
		mockGetUploadUid.mockReturnValue('owner-uid-match');

		const event = makeEvent('uploads/unassigned.jpg', ANON_LOCALS);
		const res = await DELETE(event as never);

		expect(mockStorage.delete).toHaveBeenCalledWith('uploads/unassigned.jpg');
		expect((res as Response).status).toBe(200);
	});

	it('blockiert Löschen mit fremdem upload-uid-Cookie (403)', async () => {
		mockIsAdminUser.mockReturnValue(false);
		mockFileRecord('owner-uid-match');
		mockGetUploadUid.mockReturnValue('someone-else');

		const event = makeEvent('uploads/unassigned.jpg', ANON_LOCALS);
		await expect(DELETE(event as never)).rejects.toMatchObject({ status: 403 });
		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it('blockiert Löschen ohne upload-uid-Cookie (403)', async () => {
		mockIsAdminUser.mockReturnValue(false);
		mockFileRecord('owner-uid-match');
		mockGetUploadUid.mockReturnValue(undefined);

		const event = makeEvent('uploads/unassigned.jpg', ANON_LOCALS);
		await expect(DELETE(event as never)).rejects.toMatchObject({ status: 403 });
		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it('erlaubt Admin das Löschen unabhängig vom upload-uid-Cookie', async () => {
		mockIsAdminUser.mockReturnValue(true);
		mockGetUploadUid.mockReturnValue(undefined); // Admin braucht keinen Cookie

		const event = makeEvent('uploads/admin-delete.jpg');
		const res = await DELETE(event as never);

		expect(mockStorage.delete).toHaveBeenCalledWith('uploads/admin-delete.jpg');
		expect((res as Response).status).toBe(200);
		expect(mockLogAuditEvent).toHaveBeenCalledOnce();
	});
});
