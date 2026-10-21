import { describe, expect, it, vi } from 'vitest';
import { discardFormUploads } from './discardFormUploads';
import type { UploadedFileInfo } from '#lib/types/index.ts';
import type { MediaStore } from '#lib/utils/media/MediaFile.svelte.ts';

function upload(uid: string): UploadedFileInfo {
	return {
		uid,
		filePath: `ref-1/${uid}.jpg`,
		originalName: `${uid}.jpg`,
		fileName: `${uid}.jpg`,
		mimeType: 'image/jpeg',
		size: 1024
	} as UploadedFileInfo;
}

/** Der echte Store trägt `MediaFile`-Instanzen; hier zählt nur die Länge. */
function storeWith(count: number): MediaStore {
	return { mediaFiles: Array.from({ length: count }, () => ({})) } as unknown as MediaStore;
}

describe('discardFormUploads', () => {
	it('löscht genau die übergebenen Dateien vom Server', () => {
		const deleteFiles = vi.fn<(files: UploadedFileInfo[]) => Promise<void>>(async () => undefined);
		const files = [upload('uid-1'), upload('uid-2')];

		discardFormUploads(files, storeWith(2), { deleteFiles });

		expect(deleteFiles).toHaveBeenCalledTimes(1);
		expect(deleteFiles.mock.calls[0]?.[0]).toEqual(files);
	});

	it('leert den Medien-Store vollständig', () => {
		// Ganz und nicht gefiltert: Der Reset verwirft alle Schritte — anders als
		// `handleClear` in DropzoneEnhanced, das sich auf die eigenen Dateien
		// beschränkt (PR #716).
		const mediaStore = storeWith(3);

		discardFormUploads([upload('uid-1')], mediaStore, { deleteFiles: async () => undefined });

		expect(mediaStore.mediaFiles).toEqual([]);
	});

	it('räumt den Store auch dann auf, wenn es nichts zu löschen gibt', () => {
		const deleteFiles = vi.fn<(files: UploadedFileInfo[]) => Promise<void>>(async () => undefined);
		const mediaStore = storeWith(1);

		discardFormUploads([], mediaStore, { deleteFiles });

		expect(deleteFiles).not.toHaveBeenCalled();
		expect(mediaStore.mediaFiles).toEqual([]);
	});

	it('kommt mit fehlender Dateiliste zurecht', () => {
		// `$form.uploadedFiles` ist im Schema optional — ein `undefined` darf den
		// Reset nicht mit einem TypeError abbrechen.
		const deleteFiles = vi.fn<(files: UploadedFileInfo[]) => Promise<void>>(async () => undefined);

		expect(() => discardFormUploads(undefined, storeWith(0), { deleteFiles })).not.toThrow();
		expect(deleteFiles).not.toHaveBeenCalled();
	});

	it('läuft weiter, wenn die Löschung fehlschlägt', async () => {
		// Netz weg oder 403: Der Reset ist eine Zusage an den Nutzer und darf
		// daran nicht hängenbleiben. Weder eine geworfene noch eine abgelehnte
		// Promise darf nach außen dringen.
		const rejected = vi.fn(async () => {
			throw new Error('Verbindung zum Server unterbrochen');
		});
		const mediaStore = storeWith(1);

		expect(() =>
			discardFormUploads([upload('uid-1')], mediaStore, { deleteFiles: rejected })
		).not.toThrow();
		expect(mediaStore.mediaFiles).toEqual([]);

		// Die Ablehnung muss abgefangen sein — eine unbehandelte Rejection ließe
		// den Test-Runner (und im Browser die Konsole) auflaufen.
		await Promise.resolve();
	});

	it('bricht nicht ab, wenn die Löschfunktion synchron wirft', () => {
		const throwing = vi.fn(() => {
			throw new Error('kaputt');
		}) as unknown as (files: UploadedFileInfo[]) => Promise<void>;

		expect(() =>
			discardFormUploads([upload('uid-1')], storeWith(0), { deleteFiles: throwing })
		).not.toThrow();
	});
});
