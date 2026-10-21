import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from './+server';

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
					limit: () => Promise.resolve([{ id: 123, referenceId: 'ref-test' }])
				})
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: { id: 'id' }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a, b) => ({ a, b }))
}));

vi.mock('#lib/form/validation/sightingSchema.ts', () => ({
	getSightingSchema: vi.fn(() => ({
		validate: vi.fn().mockResolvedValue(undefined)
	})),
	// PUT validiert gegen das Admin-Schema (siehe +server.ts).
	getAdminSightingSchema: vi.fn(() => ({
		validate: vi.fn().mockResolvedValue(undefined)
	}))
}));

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	updateSighting: vi.fn().mockResolvedValue({ id: 123, referenceId: 'ref-test' }),
	loadSightingFiles: vi.fn().mockResolvedValue([]),
	saveSightingFiles: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: () => ({
		getUrl: (filePath: string) => `https://storage.example.com/${filePath}`
	})
}));

vi.mock('#lib/server/utils/getClientIp.ts', () => ({
	getClientIp: () => '127.0.0.1'
}));

const validFormData = {
	species: 0,
	totalCount: 1,
	sightingDate: '2024-01-01',
	firstName: 'Max',
	lastName: 'Mustermann',
	email: 'max@test.com'
};

const createMockEvent = (uploadedFiles: unknown[] = []) => ({
	params: { id: '123' },
	locals: { user: { email: 'admin@test.com', roles: ['admin'] } },
	url: new URL('http://localhost/api/sightings/123'),
	request: {
		json: () => Promise.resolve({ ...validFormData, uploadedFiles }),
		headers: new Headers()
	},
	getClientAddress: () => '127.0.0.1'
});

describe('/api/sightings/[id] PUT — filePath-Validierung', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gibt 400 zurück wenn filePath kein String ist (number)', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: 123,
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		try {
			await PUT(event as Parameters<typeof PUT>[0]);
			expect.fail('Sollte einen Fehler geworfen haben');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 400 zurück wenn filePath ein leerer String ist', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: '',
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		try {
			await PUT(event as Parameters<typeof PUT>[0]);
			expect.fail('Sollte einen Fehler geworfen haben');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 400 zurück bei ungültig URL-kodiertem filePath', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: '%E0%A4%A', // ungültige UTF-8 Sequenz
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		try {
			await PUT(event as Parameters<typeof PUT>[0]);
			expect.fail('Sollte einen Fehler geworfen haben');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 400 zurück bei Pfad-Traversal (../)', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: '../etc/passwd',
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		try {
			await PUT(event as Parameters<typeof PUT>[0]);
			expect.fail('Sollte einen Fehler geworfen haben');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 400 zurück bei doppelt kodiertem Pfad-Traversal (%252e%252e)', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: '%252e%252e/etc/passwd',
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		try {
			await PUT(event as Parameters<typeof PUT>[0]);
			expect.fail('Sollte einen Fehler geworfen haben');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 400 zurück bei absolutem Pfad (/etc/passwd)', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: '/etc/passwd',
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		try {
			await PUT(event as Parameters<typeof PUT>[0]);
			expect.fail('Sollte einen Fehler geworfen haben');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 200 zurück bei gültigem relativem filePath', async () => {
		const event = createMockEvent([
			{
				uid: 'test-uid',
				originalName: 'test.jpg',
				fileName: 'test.jpg',
				filePath: 'uploads/2024/test.jpg',
				size: 1000,
				mimeType: 'image/jpeg'
			}
		]);

		const response = await PUT(event as Parameters<typeof PUT>[0]);
		expect(response.status).toBe(200);
	});

	it('gibt 200 zurück ohne uploadedFiles', async () => {
		const event = createMockEvent([]);

		const response = await PUT(event as Parameters<typeof PUT>[0]);
		expect(response.status).toBe(200);
	});
});
