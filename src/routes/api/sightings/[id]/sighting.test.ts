import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogAuditEvent, mockSelect, mockTransaction, mockSchema, mockStorage } = vi.hoisted(
	() => ({
		mockLogAuditEvent: vi.fn().mockResolvedValue(undefined),
		mockSelect: vi.fn(),
		mockTransaction: vi.fn(),
		mockSchema: { sightings: {}, sightingFiles: {} },
		mockStorage: { delete: vi.fn().mockResolvedValue(undefined) }
	})
);

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: mockLogAuditEvent
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

vi.mock('#lib/form/validation/sightingSchema.ts', () => ({
	// PUT validiert gegen das Admin-Schema (Bestandssichtungen), POST gegen das
	// strenge — beide mocken, sonst hängt der Test am Import.
	getSightingSchema: vi.fn(() => ({ validate: vi.fn().mockResolvedValue(true) })),
	getAdminSightingSchema: vi.fn(() => ({ validate: vi.fn().mockResolvedValue(true) }))
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: mockSelect, transaction: mockTransaction }
}));

vi.mock('#lib/server/db/schema.ts', () => mockSchema);

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: vi.fn(() => mockStorage)
}));

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	loadSightingFiles: vi.fn().mockResolvedValue([]),
	saveSightingFiles: vi.fn().mockResolvedValue(undefined),
	updateSighting: vi.fn().mockResolvedValue({ id: 42, referenceId: 'ref-42' })
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn()
}));

import { PUT, DELETE } from './+server';
import * as sightingRepository from '#lib/server/db/sightingRepository.ts';

function makeSelectChain(records: unknown[]) {
	const mockLimit = vi.fn().mockResolvedValue(records);
	const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
	const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
	mockSelect.mockReturnValue({ from: mockFrom });
}

/**
 * DELETE löscht Dateizeilen (mit `returning`) und Sichtung in einer Transaktion.
 *
 * @param fileRecords Pfade der entfernten `sichtungen_dateien`-Zeilen
 */
function makeDeleteTransaction(fileRecords: { filePath: string }[] = []) {
	mockTransaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
		callback({
			delete: (table: unknown) => ({
				where: () =>
					table === mockSchema.sightingFiles
						? { returning: vi.fn().mockResolvedValue(fileRecords) }
						: Promise.resolve()
			})
		})
	);
}

function makeAdminLocals() {
	return { user: { email: 'admin@test.com', roles: ['admin'], sub: 'auth0|test' } };
}

describe('PUT /api/sightings/[id] — Audit Logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loggt sighting.edit mit changedFields wenn Felder geändert wurden', async () => {
		makeSelectChain([{ id: 42, species: 0, totalCount: 1 }]);
		// updateSighting gibt den aktualisierten Drizzle-Record zurück (species: 1 = geändert)
		vi.mocked(sightingRepository.updateSighting).mockResolvedValueOnce({
			id: 42,
			species: 1,
			totalCount: 1,
			referenceId: 'ref-42'
		} as ReturnType<typeof sightingRepository.updateSighting> extends Promise<infer T> ? T : never);

		const event = {
			params: { id: '42' },
			request: new Request('http://localhost/api/sightings/42', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ species: 1, totalCount: 1 })
			}),
			locals: makeAdminLocals(),
			url: new URL('http://localhost/api/sightings/42'),
			getClientAddress: () => '127.0.0.1'
		};

		await PUT(event as never);

		expect(mockLogAuditEvent).toHaveBeenCalledOnce();
		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.edit',
				resourceType: 'sighting',
				resourceId: '42',
				details: expect.objectContaining({
					changedFields: expect.arrayContaining(['species'])
				})
			})
		);
	});

	it('loggt leere changedFields wenn keine Felder geändert wurden', async () => {
		makeSelectChain([{ id: 42, species: 0 }]);
		// updateSighting gibt denselben Drizzle-Record zurück (keine Änderung)
		// Muss exakt dieselben Keys wie currentRecord haben damit changedFields leer bleibt
		vi.mocked(sightingRepository.updateSighting).mockResolvedValueOnce({
			id: 42,
			species: 0
		} as ReturnType<typeof sightingRepository.updateSighting> extends Promise<infer T> ? T : never);

		const event = {
			params: { id: '42' },
			request: new Request('http://localhost/api/sightings/42', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ species: 0 })
			}),
			locals: makeAdminLocals(),
			url: new URL('http://localhost/api/sightings/42'),
			getClientAddress: () => '127.0.0.1'
		};

		await PUT(event as never);

		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				details: expect.objectContaining({ changedFields: [] })
			})
		);
	});
});

describe('DELETE /api/sightings/[id] — Audit Logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loggt sighting.delete nach erfolgreichem Löschen', async () => {
		makeSelectChain([{ id: 42 }]);
		makeDeleteTransaction();

		const event = {
			params: { id: '42' },
			request: new Request('http://localhost/api/sightings/42', { method: 'DELETE' }),
			locals: makeAdminLocals(),
			url: new URL('http://localhost/api/sightings/42'),
			getClientAddress: () => '127.0.0.1'
		};

		await DELETE(event as never);

		expect(mockLogAuditEvent).toHaveBeenCalledOnce();
		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.delete',
				resourceType: 'sighting',
				resourceId: '42'
			})
		);
	});
});
