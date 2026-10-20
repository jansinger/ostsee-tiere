/**
 * Unit Tests für sightingFilesRepository.ts
 */
import type { UploadedFileInfo } from '#lib/types/index.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sightingFiles } from './schema';
import {
	countFilesForSighting,
	deleteFileByPath,
	saveUploadedFile,
	setSightingIdForReferenceId,
	sumFileSizesForReference
} from './sightingFilesRepository';

// Gleicher Specifier wie im Code unter Test (`import { db } from '.'` in
// sightingFilesRepository.ts) — sonst könnten Mock und echter Import bei
// unterschiedlicher Alias-Auflösung auseinanderlaufen und der Mock griffe
// nicht (PR #688 Review-Hinweis).
vi.mock('.', () => {
	const db: Record<string, any> = {
		insert: vi.fn(),
		update: vi.fn(),
		select: vi.fn(),
		delete: vi.fn()
	};
	return { db };
});

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

import { db } from '.';

describe('sightingFilesRepository', () => {
	const mockUploadedFile: UploadedFileInfo = {
		uid: 'file-1',
		originalName: 'test.jpg',
		fileName: 'test-123.jpg',
		filePath: 'uploads/test-123.jpg',
		url: '/uploads/test-123.jpg',
		size: 1024000,
		mimeType: 'image/jpeg',
		uploadedAt: new Date('2024-01-15T10:00:00.000Z').toISOString(),
		exifData: { latitude: 54.1, longitude: 12.3 }
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('saveUploadedFile', () => {
		it('sollte eine Datei mit vollständigen Metadaten speichern', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await saveUploadedFile(mockUploadedFile, 'ref-123', 42);

			expect(mockDb.insert).toHaveBeenCalledWith(sightingFiles);
			expect(valuesMock).toHaveBeenCalledWith(
				expect.objectContaining({
					uid: 'file-1',
					sightingId: 42,
					referenceId: 'ref-123',
					originalName: 'test.jpg',
					fileName: 'test-123.jpg',
					filePath: 'uploads/test-123.jpg',
					mimeType: 'image/jpeg',
					size: 1024000,
					url: '/uploads/test-123.jpg',
					uploadedAt: new Date('2024-01-15T10:00:00.000Z'),
					exifData: { latitude: 54.1, longitude: 12.3 }
				})
			);
		});

		it('sollte sightingId auf null setzen, wenn keine übergeben wird', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await saveUploadedFile(mockUploadedFile, 'ref-123');

			expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ sightingId: null }));
		});

		it('sollte fileName auf originalName zurückfallen lassen, wenn fileName fehlt', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const fileWithoutFileName = { ...mockUploadedFile, fileName: undefined as any };

			await saveUploadedFile(fileWithoutFileName, 'ref-123');

			expect(valuesMock).toHaveBeenCalledWith(
				expect.objectContaining({ fileName: mockUploadedFile.originalName })
			);
		});

		it('sollte url auf null setzen, wenn keine URL vorhanden ist', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const fileWithoutUrl = { ...mockUploadedFile, url: '' };

			await saveUploadedFile(fileWithoutUrl, 'ref-123');

			expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ url: null }));
		});

		it('sollte exifData auf null setzen, wenn keine EXIF-Daten vorhanden sind', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const fileWithoutExif = { ...mockUploadedFile, exifData: null };

			await saveUploadedFile(fileWithoutExif, 'ref-123');

			expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ exifData: null }));
		});

		it('sollte uploadedAt auf den aktuellen Zeitpunkt defaulten, wenn keiner übergeben wird', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const before = Date.now();
			const fileWithoutUploadedAt = { ...mockUploadedFile, uploadedAt: undefined as any };

			await saveUploadedFile(fileWithoutUploadedAt, 'ref-123');
			const after = Date.now();

			const insertedRecord = valuesMock.mock.calls[0]?.[0];
			expect(insertedRecord.uploadedAt).toBeInstanceOf(Date);
			const uploadedAtMs = (insertedRecord.uploadedAt as Date).getTime();
			expect(uploadedAtMs).toBeGreaterThanOrEqual(before);
			expect(uploadedAtMs).toBeLessThanOrEqual(after);
		});

		it('sollte einen übergebenen uploadedAt-String korrekt in ein Date konvertieren', async () => {
			const mockDb = db as any;
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await saveUploadedFile(mockUploadedFile, 'ref-123');

			const insertedRecord = valuesMock.mock.calls[0]?.[0];
			expect(insertedRecord.uploadedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
		});
	});

	describe('deleteFileByPath', () => {
		it('sollte eine Datei anhand des Pfads löschen', async () => {
			const mockDb = db as any;
			const returningMock = vi.fn().mockResolvedValue([{ uid: 'file-1' }]);
			const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
			mockDb.delete.mockReturnValue({ where: whereMock });

			await deleteFileByPath('uploads/test-123.jpg');

			expect(mockDb.delete).toHaveBeenCalledWith(sightingFiles);
			expect(whereMock).toHaveBeenCalled();
			expect(returningMock).toHaveBeenCalledWith({ uid: sightingFiles.uid });
		});

		it('sollte auch dann nicht werfen, wenn keine Datei gefunden wurde', async () => {
			const mockDb = db as any;
			const returningMock = vi.fn().mockResolvedValue([]);
			const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
			mockDb.delete.mockReturnValue({ where: whereMock });

			await expect(deleteFileByPath('unbekannt/pfad.jpg')).resolves.toBeUndefined();
		});
	});

	describe('sumFileSizesForReference', () => {
		it('sollte die Summe der Dateigrößen für eine referenceId zurückgeben', async () => {
			const mockDb = db as any;
			const whereMock = vi.fn().mockResolvedValue([{ total: '2048000' }]);
			const fromMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.select.mockReturnValue({ from: fromMock });

			const result = await sumFileSizesForReference('ref-123');

			expect(result).toBe(2048000);
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('sollte 0 zurückgeben, wenn keine Dateien vorhanden sind (total ist null)', async () => {
			const mockDb = db as any;
			const whereMock = vi.fn().mockResolvedValue([{ total: null }]);
			const fromMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.select.mockReturnValue({ from: fromMock });

			const result = await sumFileSizesForReference('ref-ohne-dateien');

			expect(result).toBe(0);
			expect(result).not.toBeNaN();
		});

		it('sollte 0 zurückgeben, wenn keine Zeile zurückkommt (row ist undefined)', async () => {
			const mockDb = db as any;
			const whereMock = vi.fn().mockResolvedValue([]);
			const fromMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.select.mockReturnValue({ from: fromMock });

			const result = await sumFileSizesForReference('ref-leer');

			expect(result).toBe(0);
			expect(result).not.toBeNaN();
		});
	});

	/**
	 * Zählt die an einer Sichtung hängenden Dateien. Die Benachrichtigungs-Mail
	 * entscheidet damit, ob der Hinweis „Foto angekündigt, kommt per E-Mail
	 * nach" überhaupt zutrifft — bei einer Meldung über das Web-Formular ist die
	 * Datei zum Versandzeitpunkt bereits verknüpft.
	 */
	describe('countFilesForSighting', () => {
		it('sollte die Anzahl der verknüpften Dateien zurückgeben', async () => {
			const mockDb = db as any;
			const whereMock = vi.fn().mockResolvedValue([{ count: 2 }]);
			const fromMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.select.mockReturnValue({ from: fromMock });

			const result = await countFilesForSighting(42);

			expect(result).toBe(2);
			expect(fromMock).toHaveBeenCalledWith(sightingFiles);
		});

		it('sollte 0 zurückgeben, wenn keine Zeile zurückkommt', async () => {
			const mockDb = db as any;
			const whereMock = vi.fn().mockResolvedValue([]);
			const fromMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.select.mockReturnValue({ from: fromMock });

			const result = await countFilesForSighting(42);

			expect(result).toBe(0);
			expect(result).not.toBeNaN();
		});
	});

	describe('setSightingIdForReferenceId', () => {
		it('sollte standardmäßig die globale db-Instanz verwenden', async () => {
			const mockDb = db as any;
			const returningMock = vi.fn().mockResolvedValue([{ uid: 'file-1' }]);
			const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
			const setMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.update.mockReturnValue({ set: setMock });

			await setSightingIdForReferenceId('ref-123', 99);

			expect(mockDb.update).toHaveBeenCalledWith(sightingFiles);
			expect(setMock).toHaveBeenCalledWith({ sightingId: 99 });
		});

		it('sollte einen übergebenen Executor (z.B. Transaktion) statt der globalen db-Instanz verwenden', async () => {
			const mockDb = db as any;
			const returningMock = vi.fn().mockResolvedValue([{ uid: 'file-1' }]);
			const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
			const setMock = vi.fn().mockReturnValue({ where: whereMock });
			const txExecutor = { update: vi.fn().mockReturnValue({ set: setMock }) };

			await setSightingIdForReferenceId('ref-123', 99, txExecutor as any);

			expect(txExecutor.update).toHaveBeenCalledWith(sightingFiles);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('sollte die Anzahl der aktualisierten Dateien nicht gegen einen Fehler abfangen (Fehler propagiert)', async () => {
			const mockDb = db as any;
			const dbError = new Error('Update failed');
			const whereMock = vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(dbError) });
			const setMock = vi.fn().mockReturnValue({ where: whereMock });
			mockDb.update.mockReturnValue({ set: setMock });

			await expect(setSightingIdForReferenceId('ref-123', 99)).rejects.toThrow('Update failed');
		});
	});
});
