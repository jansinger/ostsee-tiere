/**
 * Unit Tests für scanLocalUploads.ts
 *
 * Ein Bug hier führt entweder dazu, dass verknüpfte Dateien fälschlich als
 * „orphan" markiert werden (Datenverlust bei automatischem Cleanup) oder dass
 * der Bestand nicht bereinigt wird (`.claude/rules/upload.md`). Die eigentliche
 * Filterlogik (`selectOrphanedFiles`) ist bereits in `orphanCleanup.test.ts`
 * abgedeckt — hier geht es ausschließlich um die Zusammenführung der drei
 * Datenquellen und die korrekte Weitergabe an diese Filterlogik.
 */
import { db } from '#lib/server/db/index.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiskEntry } from './orphanCleanup';
import { scanLocalUploads } from './scanLocalUploads';

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn()
	}
}));

vi.mock('#lib/server/storage/uploadPath.ts', () => ({
	resolveUploadBasePath: vi.fn(() => '/srv/uploads')
}));

const { scanUploadDirMock, selectOrphanedFilesMock } = vi.hoisted(() => ({
	scanUploadDirMock: vi.fn(),
	selectOrphanedFilesMock: vi.fn()
}));

vi.mock('./orphanCleanup', () => ({
	scanUploadDir: scanUploadDirMock,
	selectOrphanedFiles: selectOrphanedFilesMock
}));

describe('scanLocalUploads', () => {
	const mockDb = vi.mocked(db);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function mockSelectSequence(rows: unknown[][]) {
		let call = 0;
		mockDb.select.mockImplementation(
			() =>
				({
					from: vi.fn().mockResolvedValue(rows[call++])
				}) as never
		);
	}

	it('führt Disk-Scan, Datei-Pfade und Referenz-IDs zusammen und reicht sie an selectOrphanedFiles weiter', async () => {
		const entries: DiskEntry[] = [
			{ relativePath: 'abc123/foto.jpg', modifiedAt: new Date('2026-01-01') }
		];
		scanUploadDirMock.mockResolvedValue(entries);
		mockSelectSequence([
			[{ filePath: 'abc123/foto.jpg' }, { filePath: 'def456/video.mp4' }],
			[{ referenceId: 'abc123' }, { referenceId: 'def456' }]
		]);
		const orphaned: DiskEntry[] = [];
		selectOrphanedFilesMock.mockReturnValue(orphaned);

		const cutoff = new Date('2026-07-30T00:00:00Z');
		const result = await scanLocalUploads(cutoff);

		expect(scanUploadDirMock).toHaveBeenCalledWith('/srv/uploads');
		expect(selectOrphanedFilesMock).toHaveBeenCalledWith(
			entries,
			{
				paths: ['abc123/foto.jpg', 'def456/video.mp4'],
				referenceIds: ['abc123', 'def456']
			},
			cutoff
		);
		expect(result).toBe(orphaned);
	});

	it('filtert null- und leere referenceId-Werte aus den Sichtungen heraus', async () => {
		scanUploadDirMock.mockResolvedValue([]);
		mockSelectSequence([
			[],
			[
				{ referenceId: 'real-ref-1' },
				{ referenceId: null },
				{ referenceId: '' },
				{ referenceId: undefined },
				{ referenceId: 'real-ref-2' }
			]
		]);
		selectOrphanedFilesMock.mockReturnValue([]);

		await scanLocalUploads(new Date());

		expect(selectOrphanedFilesMock).toHaveBeenCalledWith(
			[],
			expect.objectContaining({ referenceIds: ['real-ref-1', 'real-ref-2'] }),
			expect.any(Date)
		);
	});

	it('gibt eine leere Liste weiter, wenn weder Dateien noch Sichtungen bekannt sind', async () => {
		scanUploadDirMock.mockResolvedValue([]);
		mockSelectSequence([[], []]);
		selectOrphanedFilesMock.mockReturnValue([]);

		const result = await scanLocalUploads(new Date());

		expect(selectOrphanedFilesMock).toHaveBeenCalledWith(
			[],
			{ paths: [], referenceIds: [] },
			expect.any(Date)
		);
		expect(result).toEqual([]);
	});

	it('reicht den cutoff unverändert an selectOrphanedFiles durch', async () => {
		scanUploadDirMock.mockResolvedValue([]);
		mockSelectSequence([[], []]);
		selectOrphanedFilesMock.mockReturnValue([]);

		const cutoff = new Date('2025-12-24T12:00:00Z');
		await scanLocalUploads(cutoff);

		const passedCutoff = selectOrphanedFilesMock.mock.calls[0]?.[2];
		expect(passedCutoff).toBe(cutoff);
	});

	it('holt Disk-Scan, Datei-Pfade und Referenz-IDs parallel (Promise.all), nicht nacheinander', async () => {
		const callOrder: string[] = [];

		scanUploadDirMock.mockImplementation(async () => {
			callOrder.push('scanUploadDir:start');
			await new Promise((resolve) => setTimeout(resolve, 10));
			callOrder.push('scanUploadDir:end');
			return [];
		});

		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			const label = selectCall++ === 0 ? 'files' : 'sightings';
			return {
				from: vi.fn().mockImplementation(async () => {
					callOrder.push(`${label}:start`);
					await new Promise((resolve) => setTimeout(resolve, 5));
					callOrder.push(`${label}:end`);
					return [];
				})
			} as never;
		});
		selectOrphanedFilesMock.mockReturnValue([]);

		await scanLocalUploads(new Date());

		// Alle drei müssen gestartet sein, bevor irgendeines zu Ende ist —
		// sonst liefe der Disk-Scan sequentiell vor den DB-Abfragen statt
		// parallel mit ihnen (Promise.all).
		const firstEndIndex = callOrder.findIndex((entry) => entry.endsWith(':end'));
		const startsBeforeFirstEnd = callOrder.slice(0, firstEndIndex);
		expect(startsBeforeFirstEnd).toEqual(
			expect.arrayContaining(['scanUploadDir:start', 'files:start', 'sightings:start'])
		);
	});
});
