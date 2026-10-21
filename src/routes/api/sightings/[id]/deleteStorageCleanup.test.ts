/**
 * Regressionstests: Beim Löschen einer Sichtung müssen auch die Dateien im
 * Storage verschwinden.
 *
 * Der Fremdschlüssel `sichtungen_dateien.sichtung_id` hat `onDelete: 'cascade'`
 * — die DB-Zeilen verschwinden also von selbst. Ohne expliziten Storage-Aufruf
 * bleiben die Dateien im Upload-Verzeichnis als verwaiste Objekte zurück.
 *
 * `filePath` ist der Storage-Key `referenceId/dateiname` (siehe
 * `LocalStorageProvider.upload`) — nicht die öffentliche URL `/uploads/...`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSchema, mockSelect, mockTransaction, mockStorage, callOrder } = vi.hoisted(() => ({
	mockSchema: {
		sightings: { id: 'sichtungen.id' },
		sightingFiles: { sightingId: 'sichtungen_dateien.sichtung_id', filePath: 'datei_pfad' }
	},
	mockSelect: vi.fn(),
	mockTransaction: vi.fn(),
	mockStorage: { delete: vi.fn().mockResolvedValue(undefined) },
	callOrder: [] as string[]
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: mockSelect, transaction: mockTransaction }
}));

vi.mock('#lib/server/db/schema.ts', () => mockSchema);

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a, b) => ({ a, b }))
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: vi.fn(() => mockStorage)
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { DELETE } from './+server';

/**
 * Baut die DB-Mocks so, dass die Existenzprüfung eine Sichtung findet und das
 * Löschen der Dateizeilen die übergebenen Pfade zurückgibt.
 */
function mockDbWithFiles(filePaths: string[]) {
	mockSelect.mockImplementation(() => ({
		from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 123 }]) }) })
	}));

	const tx = {
		delete: (table: unknown) => ({
			where: () => {
				if (table === mockSchema.sightingFiles) {
					return {
						returning: async () => {
							callOrder.push('tx:delete-files');
							return filePaths.map((filePath) => ({ filePath }));
						}
					};
				}
				callOrder.push('tx:delete-sighting');
				return Promise.resolve();
			}
		})
	};

	mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
		const result = await callback(tx);
		callOrder.push('tx:commit');
		return result;
	});
}

function makeEvent(id = '123') {
	return {
		params: { id },
		locals: { user: { email: 'admin@test.com', roles: ['admin'] } },
		url: new URL(`http://localhost/api/sightings/${id}`),
		request: new Request(`http://localhost/api/sightings/${id}`, { method: 'DELETE' }),
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('DELETE /api/sightings/[id] — Storage-Aufräumen', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		callOrder.length = 0;
		mockStorage.delete.mockResolvedValue(undefined);
	});

	it('löscht die zugehörigen Dateien aus dem Storage', async () => {
		mockDbWithFiles(['ref-abc123/a1b2c3d4.jpg', 'ref-abc123/e5f6g7h8.png']);

		const response = await DELETE(makeEvent());

		expect(response.status).toBe(200);
		expect(mockStorage.delete).toHaveBeenCalledTimes(2);
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/a1b2c3d4.jpg');
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/e5f6g7h8.png');
	});

	it('löscht Dateizeilen und Sichtung in einer Transaktion, den Storage erst danach', async () => {
		mockDbWithFiles(['ref-abc123/a1b2c3d4.jpg']);
		mockStorage.delete.mockImplementation(async () => {
			callOrder.push('storage:delete');
		});

		await DELETE(makeEvent());

		expect(callOrder).toEqual([
			'tx:delete-files',
			'tx:delete-sighting',
			'tx:commit',
			'storage:delete'
		]);
	});

	it('ruft den Storage nicht auf, wenn keine Dateien verknüpft sind', async () => {
		mockDbWithFiles([]);

		await DELETE(makeEvent());

		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it('meldet Erfolg, auch wenn eine Datei nicht aus dem Storage entfernt werden kann', async () => {
		mockDbWithFiles(['ref-abc123/a1b2c3d4.jpg', 'ref-abc123/e5f6g7h8.png']);
		mockStorage.delete.mockRejectedValueOnce(new Error('ENOENT'));

		const response = await DELETE(makeEvent());

		// Die Sichtung ist weg — eine liegengebliebene Datei ist folgenlos, weil
		// keine DB-Zeile mehr auf sie zeigt, und kein Grund für einen 500er.
		expect(response.status).toBe(200);
		expect(mockStorage.delete).toHaveBeenCalledTimes(2);
	});
});
