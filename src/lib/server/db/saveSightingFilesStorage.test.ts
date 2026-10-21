/**
 * Regressionstests: `saveSightingFiles()` ersetzt die Dateiliste einer Sichtung.
 *
 * Die alten `sichtungen_dateien`-Zeilen werden dabei gelöscht — ohne
 * Storage-Aufruf bleiben die zugehörigen Dateien als verwaiste Objekte im
 * Upload-Verzeichnis zurück.
 */
import type { UploadedFileInfo } from '#lib/types/index.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockStorage, callOrder, removedRows } = vi.hoisted(() => ({
	mockDb: {
		insert: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn()
	},
	mockStorage: { delete: vi.fn().mockResolvedValue(undefined), getUrl: vi.fn() },
	callOrder: [] as string[],
	removedRows: { value: [] as { filePath: string }[] }
}));

vi.mock('#lib/server/db/index.ts', () => ({ db: mockDb }));

vi.mock('#lib/server/storage/factory.ts', () => ({
	isCloudStorage: vi.fn(() => false),
	getStorageProvider: vi.fn(() => mockStorage)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { saveSightingFiles } from './sightingRepository';

/** Erzeugt eine Datei-Info mit dem gegebenen Pfad. */
function file(filePath: string, uid = filePath): UploadedFileInfo {
	return {
		uid,
		originalName: 'bild.jpg',
		fileName: filePath,
		filePath,
		url: `/uploads/${filePath}`,
		size: 1024,
		mimeType: 'image/jpeg',
		uploadedAt: new Date('2026-07-28T10:00:00Z').toISOString(),
		exifData: null
	};
}

/** Setzt den Transaktions-Mock so, dass `existing` als gelöschte Zeilen zurückkommt. */
function mockTransactionRemoving(existing: string[]) {
	removedRows.value = existing.map((filePath) => ({ filePath }));

	const tx = {
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(async () => {
					callOrder.push('tx:delete');
					return removedRows.value;
				})
			}))
		})),
		insert: vi.fn(() => ({
			values: vi.fn(async () => {
				callOrder.push('tx:insert');
			})
		}))
	};

	mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
		callOrder.push('tx:begin');
		const result = await callback(tx);
		callOrder.push('tx:commit');
		return result;
	});

	return tx;
}

describe('saveSightingFiles — Storage-Aufräumen', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		callOrder.length = 0;
		mockStorage.delete.mockResolvedValue(undefined);
	});

	it('löscht Dateien aus dem Storage, die nicht mehr verknüpft sind', async () => {
		mockTransactionRemoving(['ref-abc123/alt-1.jpg', 'ref-abc123/alt-2.jpg']);

		await saveSightingFiles(42, [file('ref-abc123/neu.jpg')], 'ref-123');

		expect(mockStorage.delete).toHaveBeenCalledTimes(2);
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/alt-1.jpg');
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/alt-2.jpg');
	});

	it('behält Dateien, die weiterhin in der neuen Liste stehen', async () => {
		mockTransactionRemoving(['ref-abc123/bleibt.jpg', 'ref-abc123/weg.jpg']);

		await saveSightingFiles(
			42,
			[file('ref-abc123/bleibt.jpg'), file('ref-abc123/neu.jpg')],
			'ref-123'
		);

		expect(mockStorage.delete).toHaveBeenCalledTimes(1);
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/weg.jpg');
	});

	it('löscht die Dateien erst nach dem Commit der Transaktion', async () => {
		mockTransactionRemoving(['ref-abc123/weg.jpg']);
		mockStorage.delete.mockImplementation(async () => {
			callOrder.push('storage:delete');
		});

		await saveSightingFiles(42, [file('ref-abc123/neu.jpg')], 'ref-123');

		expect(callOrder).toEqual([
			'tx:begin',
			'tx:delete',
			'tx:insert',
			'tx:commit',
			'storage:delete'
		]);
	});

	it('scheitert nicht, wenn eine Datei nicht aus dem Storage entfernt werden kann', async () => {
		mockTransactionRemoving(['ref-abc123/weg.jpg']);
		mockStorage.delete.mockRejectedValue(new Error('ENOENT'));

		// Eine liegengebliebene Datei ist folgenlos — die bereits committete
		// DB-Änderung darf davon nicht zurückgenommen werden.
		await expect(
			saveSightingFiles(42, [file('ref-abc123/neu.jpg')], 'ref-123')
		).resolves.toBeUndefined();
	});

	it('rührt den Storage bei leerer Dateiliste nicht an', async () => {
		mockTransactionRemoving(['ref-abc123/weg.jpg']);

		await saveSightingFiles(42, [], 'ref-123');

		expect(mockDb.transaction).not.toHaveBeenCalled();
		expect(mockStorage.delete).not.toHaveBeenCalled();
	});
});
