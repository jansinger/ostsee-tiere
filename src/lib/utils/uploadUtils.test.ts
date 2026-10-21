import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileDirect } from './uploadUtils';

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const VALID_CUID = 'clh4z9z0b0000356gkzfh6a2i';
const VALID_UID = 'clh4z9z0b0001356gkzfh6a2j';

/** Minimaler XMLHttpRequest-Ersatz, der sich von außen steuern lässt. */
class FakeXhr {
	static last: FakeXhr;
	upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	status = 200;
	responseText = '{"uid":"u","filePath":"p"}';
	aborted = false;

	constructor() {
		FakeXhr.last = this;
	}
	open(): void {}
	send(): void {}
	abort(): void {
		this.aborted = true;
		this.onabort?.();
	}

	emitProgress(loaded: number, total: number): void {
		this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
	}
	finish(): void {
		this.onload?.();
	}
}

beforeEach(() => {
	vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

function file(bytes: number): File {
	return new File([new Uint8Array(bytes)], 'wal.mp4', { type: 'video/mp4' });
}

describe('uploadFileDirect', () => {
	it('meldet den Fortschritt in Prozent', () => {
		const onProgress = vi.fn();
		uploadFileDirect(file(100), VALID_CUID, VALID_UID, onProgress);

		FakeXhr.last.emitProgress(25, 100);

		expect(onProgress).toHaveBeenCalledWith({
			loadedBytes: 25,
			totalBytes: 100,
			percent: 25
		});
	});

	it('rundet den Prozentwert', () => {
		const onProgress = vi.fn();
		uploadFileDirect(file(3), VALID_CUID, VALID_UID, onProgress);

		FakeXhr.last.emitProgress(1, 3);

		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 33 }));
	});

	it('löst die Zusage nach dem Abschluss auf', async () => {
		const handle = uploadFileDirect(file(10), VALID_CUID, VALID_UID);

		FakeXhr.last.finish();

		await expect(handle.result).resolves.toMatchObject({ uid: 'u' });
	});

	it('bricht die Übertragung auf Zuruf ab und lehnt die Zusage ab', async () => {
		const handle = uploadFileDirect(file(10), VALID_CUID, VALID_UID);

		handle.abort();

		expect(FakeXhr.last.aborted).toBe(true);
		await expect(handle.result).rejects.toThrow(/abgebrochen/i);
	});

	it('lehnt bei einem Fehlerstatus mit der Servermeldung ab', async () => {
		const handle = uploadFileDirect(file(10), VALID_CUID, VALID_UID);

		FakeXhr.last.status = 413;
		FakeXhr.last.responseText = '{"message":"Datei zu groß"}';
		FakeXhr.last.finish();

		await expect(handle.result).rejects.toThrow('Datei zu groß');
	});

	it('kommt ohne Fortschritts-Rückruf aus', () => {
		expect(() => {
			uploadFileDirect(file(10), VALID_CUID, VALID_UID);
			FakeXhr.last.emitProgress(5, 10);
		}).not.toThrow();
	});
});
