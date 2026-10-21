/**
 * Unit Tests für deleteStoredFiles().
 *
 * Die Funktion läuft immer NACH einem bereits committeten DB-Vorgang — sie darf
 * deshalb unter keinen Umständen werfen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage, mockGetStorageProvider } = vi.hoisted(() => ({
	mockStorage: { delete: vi.fn().mockResolvedValue(undefined) },
	mockGetStorageProvider: vi.fn()
}));

vi.mock('./factory', () => ({
	getStorageProvider: mockGetStorageProvider
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { deleteStoredFiles } from './deleteStoredFiles';

describe('deleteStoredFiles', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStorage.delete.mockResolvedValue(undefined);
		mockGetStorageProvider.mockReturnValue(mockStorage);
	});

	it('löscht jeden übergebenen Pfad', async () => {
		await deleteStoredFiles(['ref-abc123/a.jpg', 'ref-abc123/b.png']);

		expect(mockStorage.delete).toHaveBeenCalledTimes(2);
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/a.jpg');
		expect(mockStorage.delete).toHaveBeenCalledWith('ref-abc123/b.png');
	});

	it('löscht einen mehrfach referenzierten Pfad nur einmal', async () => {
		await deleteStoredFiles(['ref-abc123/a.jpg', 'ref-abc123/a.jpg', 'ref-abc123/b.png']);

		expect(mockStorage.delete).toHaveBeenCalledTimes(2);
	});

	it('fordert bei leerer Liste gar keinen Storage-Provider an', async () => {
		await deleteStoredFiles([]);

		expect(mockGetStorageProvider).not.toHaveBeenCalled();
	});

	it('löscht die übrigen Dateien weiter, wenn eine fehlschlägt', async () => {
		mockStorage.delete.mockRejectedValueOnce(new Error('ENOENT'));

		await expect(
			deleteStoredFiles(['ref-abc123/kaputt.jpg', 'ref-abc123/ok.png'])
		).resolves.toBeUndefined();
		expect(mockStorage.delete).toHaveBeenCalledTimes(2);
	});

	it('wirft nicht, wenn der Storage-Provider nicht verfügbar ist', async () => {
		mockGetStorageProvider.mockImplementation(() => {
			throw new Error('Unknown storage provider: s3');
		});

		await expect(deleteStoredFiles(['ref-abc123/a.jpg'])).resolves.toBeUndefined();
		expect(mockStorage.delete).not.toHaveBeenCalled();
	});
});
