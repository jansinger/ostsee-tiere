import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from '../../routes/api/files/delete/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

const { mockIsAdmin, mockSelectLimit } = vi.hoisted(() => {
	const mockIsAdmin = vi.fn().mockReturnValue(true);
	const mockSelectLimit = vi.fn().mockResolvedValue([]);
	return { mockIsAdmin, mockSelectLimit };
});

vi.mock('#lib/server/auth/auth.ts', () => ({
	isAdminUser: mockIsAdmin,
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: mockSelectLimit
				})
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('#lib/server/db/schema.ts', {
		sightingFiles: {
			id: 'id',
			sightingId: 'sightingId',
			filePath: 'filePath'
		}
	});
});

// Die Route schreibt einen Audit-Eintrag. Ohne diese Attrappe liefe der echte
// `auditService` gegen die db-Attrappe, scheiterte still in seinem eigenen
// catch und zöge `auditLogs` aus der Schema-Attrappe — dort fehlte es
// unbemerkt, bis `strictModuleMock` es meldete.
vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/db/sightingFilesRepository.ts', () => ({
	deleteFileByPath: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: vi.fn().mockReturnValue({
		delete: vi.fn().mockResolvedValue(undefined)
	})
}));

vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		eq: vi.fn((a, b) => ({ a, b }))
	});
});

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('Contract: DELETE /api/files/delete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsAdmin.mockReturnValue(true);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/files/delete', {
			locals: { user: mockAdminUser },
			method: 'DELETE',
			body: { filePath: 'uploads/2024/01/image_123.jpg' }
		});
		const res = await DELETE(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 400 when filePath is missing', async () => {
		const event = createEvent('/api/files/delete', {
			locals: { user: mockAdminUser },
			method: 'DELETE',
			body: {}
		});

		try {
			await DELETE(event);
			expect.fail('should have thrown');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('returns 400 for path traversal attempt', async () => {
		const event = createEvent('/api/files/delete', {
			locals: { user: mockAdminUser },
			method: 'DELETE',
			body: { filePath: '../../../etc/passwd' }
		});

		try {
			await DELETE(event);
			expect.fail('should have thrown');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('returns 403 when non-admin tries to delete file assigned to a sighting', async () => {
		mockIsAdmin.mockReturnValue(false);
		mockSelectLimit.mockResolvedValueOnce([{ id: 1, sightingId: 42 }]);

		const event = createEvent('/api/files/delete', {
			locals: { user: { sub: 'u-99', email: 'user@test.de', roles: [] } },
			method: 'DELETE',
			body: { filePath: 'uploads/assigned_file.jpg' }
		});

		try {
			await DELETE(event);
			expect.fail('should have thrown');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(403);
		}
	});
});
