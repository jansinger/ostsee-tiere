import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserFileMetadata, UploadedFileInfo } from '#lib/types/index.ts';
import type { UploadHandle } from '#lib/utils/uploadUtils.ts';

/**
 * `MediaFile` ist eine `$state`-tragende Klasse (`uploadPercent`) und lebt
 * deshalb seit Task 13a in einem Rune-Modul (`MediaFile.svelte.ts`) — das läuft
 * nur im Browser-Testlauf (`npm run test:unit:client`), nicht mehr in Node. Die
 * beiden Abhängigkeiten, die ohnehin einen Browser bräuchten (EXIF-Auswertung,
 * Upload), werden hier weiterhin ersetzt — geprüft wird ausschließlich der
 * Lebenszyklus der Klasse selbst.
 *
 * Warum es diesen Test überhaupt gibt: `analyzed` ist die einzige Quelle, aus
 * der das Positions-Panel „wird gerade ausgewertet" von „dieses Foto hat kein
 * GPS" unterscheidet (positionPanelState.ts → `photoStatus`). Bisher war nur die
 * reine Regel über handgebaute Literale getestet; ob das Flag im echten Objekt
 * jemals umspringt, prüfte niemand.
 */
const analyzeClientFile = vi.hoisted(() => vi.fn<(file: File) => Promise<BrowserFileMetadata>>());
const uploadFileDirect = vi.hoisted(() => vi.fn<(...args: unknown[]) => UploadHandle>());

vi.mock('#lib/utils/client/fileAnalysis.ts', () => ({ analyzeClientFile }));
vi.mock('#lib/utils/uploadUtils.ts', () => ({ uploadFileDirect }));

const { MediaFile } = await import('./MediaFile.svelte');

function imageFile(): File {
	return new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
}

function metadata(exifData: BrowserFileMetadata['exifData'] = {}): BrowserFileMetadata {
	return {
		fileName: 'foto.jpg',
		size: 1,
		mimeType: 'image/jpeg',
		exifData
	} as BrowserFileMetadata;
}

function uploadedFileInfo(): UploadedFileInfo {
	return {
		uid: 'uid-1',
		fileName: 'foto.jpg',
		originalName: 'foto.jpg',
		filePath: 'ref/foto.jpg',
		size: 1,
		mimeType: 'image/jpeg',
		exifData: {}
	} as unknown as UploadedFileInfo;
}

beforeEach(() => {
	vi.clearAllMocks();
	uploadFileDirect.mockReturnValue({
		result: new Promise<UploadedFileInfo>(() => {}),
		abort: vi.fn()
	});
});

describe('MediaFile — Lebenszyklus von `analyzed`', () => {
	it('gilt direkt nach dem Anlegen als NICHT ausgewertet', () => {
		analyzeClientFile.mockResolvedValue(metadata());

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);

		expect(mediaFile.isAnalyzed()).toBe(false);
	});

	it('gilt nach dem Auflösen der Metadaten als ausgewertet', async () => {
		analyzeClientFile.mockResolvedValue(metadata());

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
		await mediaFile.metadata;

		expect(mediaFile.isAnalyzed()).toBe(true);
	});

	/**
	 * Der Zustand, für den das Flag existiert: Zwischen Drop und aufgelöster
	 * Promise meldet `hasPosition()` `false`, obwohl das Foto GPS trägt. Ohne
	 * `analyzed` wäre dieser Moment von „kein GPS" nicht zu unterscheiden.
	 */
	it('meldet vor der Auswertung noch kein GPS, danach schon', async () => {
		analyzeClientFile.mockResolvedValue(metadata({ latitude: 54.31, longitude: 12.09 }));

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
		expect(mediaFile.hasPosition()).toBe(false);
		expect(mediaFile.isAnalyzed()).toBe(false);

		await mediaFile.metadata;

		expect(mediaFile.hasPosition()).toBe(true);
		expect(mediaFile.isAnalyzed()).toBe(true);
	});

	/**
	 * Eine wiederhergestellte Datei darf nicht durch `'analyzing'` flackern: Die
	 * EXIF-Auswertung liegt bereits hinter ihr, `fileInfo` trägt das Ergebnis.
	 */
	it('gilt bei einer wiederhergestellten Datei sofort als ausgewertet', () => {
		const mediaFile = MediaFile.fromUploadedFile(uploadedFileInfo(), 'ref');

		expect(mediaFile.isAnalyzed()).toBe(true);
	});
});

/**
 * `isFromPositionStep` grenzt ein, über welche Dateien das Positions-Panel
 * urteilt (positionPanelState.ts → `photoStatus`). Nach einem Reload werden die
 * Dateien aus `$form.uploadedFiles` neu aufgebaut — ginge die Markierung dabei
 * verloren, verschwände der Hinweis „kein GPS im Foto" beim Neuladen der Seite.
 */
describe('MediaFile — Markierung des Positions-Schritts', () => {
	it('merkt sich die Herkunft einer frisch abgelegten Datei', () => {
		analyzeClientFile.mockResolvedValue(metadata());

		expect(MediaFile.createMediaFile('ref', imageFile(), true).isFromPositionStep).toBe(true);
		expect(MediaFile.createMediaFile('ref', imageFile(), false).isFromPositionStep).toBe(false);
	});

	it('übernimmt die Herkunft auch für eine wiederhergestellte Datei', () => {
		expect(MediaFile.fromUploadedFile(uploadedFileInfo(), 'ref', true).isFromPositionStep).toBe(
			true
		);
	});

	it('bleibt ohne Angabe beim Medien-Schritt — Aufrufer ohne Positionsbezug ändern sich nicht', () => {
		expect(MediaFile.fromUploadedFile(uploadedFileInfo(), 'ref').isFromPositionStep).toBe(false);
	});

	/**
	 * Die Zusage gehört dem Konstruktor, nicht den Factories: Ein direkt
	 * erzeugtes `MediaFile` bliebe sonst für immer „in Auswertung" — und ein
	 * Panel, das darauf wartet, dauerhaft stumm.
	 */
	it('setzt das Flag auch bei direkter Konstruktion, ohne Factory', async () => {
		const metadataPromise = Promise.resolve(metadata());
		const mediaFile = new MediaFile(
			'uid-2',
			'foto.jpg',
			'ref',
			new Promise<UploadedFileInfo>(() => {}),
			metadataPromise
		);

		expect(mediaFile.isAnalyzed()).toBe(false);

		await metadataPromise;

		expect(mediaFile.isAnalyzed()).toBe(true);
	});

	/**
	 * Die Auswertung ist auch dann durch, wenn sie gescheitert ist — „fehlgeschlagen"
	 * ist ein Ergebnis, kein Dauerzustand. Bliebe das Flag hier `false`, hinge das
	 * Positions-Panel für immer in `analyzing`: kein GPS-Hinweis, kein Ausweg, keine
	 * Fehlermeldung.
	 *
	 * `metadata` ist eine in den Konstruktor injizierte Promise. Dass der heutige
	 * Aufrufer `analyzeClientFile` übergibt, das jeden Fehler selbst schluckt, ist
	 * deshalb keine Zusicherung dieser Klasse — jeder andere Aufrufer darf eine
	 * ablehnende Promise übergeben.
	 */
	it('setzt das Flag auch, wenn die Metadaten-Auswertung ablehnt', async () => {
		const metadataPromise = Promise.reject(new Error('exif kaputt'));
		const mediaFile = new MediaFile(
			'uid-3',
			'foto.jpg',
			'ref',
			new Promise<UploadedFileInfo>(() => {}),
			metadataPromise
		);

		expect(mediaFile.isAnalyzed()).toBe(false);

		await expect(metadataPromise).rejects.toThrow('exif kaputt');
		// Eine Mikrotask weiter — der Handler des Konstruktors hängt an derselben
		// Promise und läuft direkt nach dem hiesigen `await`.
		await Promise.resolve();

		expect(mediaFile.isAnalyzed()).toBe(true);
	});
});

/**
 * Task 13a verdrahtet `createMediaFile` mit `uploadFileDirect`: gemeldeter
 * Fortschritt landet in `uploadPercent`, `abortUpload` zeigt auf die
 * `abort`-Funktion des Handles, und `uploadPercent` fällt nach Abschluss —
 * ob erfolgreich oder nicht — wieder auf `undefined`. Ohne diese Verdrahtung
 * bliebe die Prozentanzeige stehen, während ein 100-MB-Video im Hintergrund
 * längst fertig oder abgebrochen ist.
 */
describe('MediaFile — Fortschrittsanzeige und Abbruch des Uploads', () => {
	it('übernimmt einen gemeldeten Fortschritt in uploadPercent', () => {
		analyzeClientFile.mockResolvedValue(metadata());
		let reportProgress:
			| ((progress: { loadedBytes: number; totalBytes: number; percent: number }) => void)
			| undefined;
		uploadFileDirect.mockImplementation((...args: unknown[]) => {
			reportProgress = args[3] as typeof reportProgress;
			return {
				result: new Promise<UploadedFileInfo>(() => {}),
				abort: vi.fn()
			};
		});

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
		reportProgress?.({ loadedBytes: 50, totalBytes: 100, percent: 50 });

		expect(mediaFile.uploadPercent).toBe(50);
	});

	it('setzt uploadPercent nach erfolgreichem Abschluss wieder zurück', async () => {
		analyzeClientFile.mockResolvedValue(metadata());
		uploadFileDirect.mockReturnValue({
			result: Promise.resolve(uploadedFileInfo()),
			abort: vi.fn()
		});

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
		mediaFile.uploadPercent = 42;

		await mediaFile.uploadedFile;

		expect(mediaFile.uploadPercent).toBeUndefined();
	});

	/**
	 * Sonst bliebe die Anzeige an einer Kachel kleben, die gar nicht mehr
	 * hochlädt — genau das Fehlszenario aus dem Review zu Task 13a.
	 */
	it('setzt uploadPercent auch nach einem fehlgeschlagenen Upload wieder zurück', async () => {
		analyzeClientFile.mockResolvedValue(metadata());
		uploadFileDirect.mockReturnValue({
			result: Promise.reject(new Error('upload kaputt')),
			abort: vi.fn()
		});

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
		mediaFile.uploadPercent = 77;

		await expect(mediaFile.uploadedFile).rejects.toThrow('upload kaputt');

		expect(mediaFile.uploadPercent).toBeUndefined();
	});

	it('ruft beim Abbrechen die abort-Funktion des Upload-Handles auf', () => {
		analyzeClientFile.mockResolvedValue(metadata());
		const abort = vi.fn();
		uploadFileDirect.mockReturnValue({
			result: new Promise<UploadedFileInfo>(() => {}),
			abort
		});

		const mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
		mediaFile.abortUpload?.();

		expect(abort).toHaveBeenCalledOnce();
	});
});

/**
 * Ablehnende Promises dürfen nicht als unbehandelte Rejection enden.
 *
 * `createMediaFile` hängt an beide injizierten Promises je ein `.then(...)`
 * OHNE Rejection-Zweig. Jedes davon erzeugt eine neue, abgelehnte Promise, die
 * niemandem gehört: Im Browser landet sie als `unhandledrejection` auf dem
 * `window`. `handleFilesAdded` (`DropzoneEnhanced.svelte`) hängt sein `.catch`
 * an eine ANDERE Kette (`uploadedFile.then(...).catch(...)`) und deckt diese
 * hier nicht ab.
 *
 * Dieser Test lief vor Task 13a in Node und nutzte `process.on('unhandledRejection', …)`.
 * Seit `MediaFile` `$state` trägt und deshalb nur im Browser-Lauf läuft (siehe
 * Kommentar am Dateianfang), gibt es kein `process` mehr — der Browser meldet
 * unbehandelte Rejections stattdessen als `unhandledrejection`-Event auf `window`.
 */
describe('MediaFile — abgelehnte Promises', () => {
	async function collectUnhandledRejections(run: () => Promise<void>): Promise<unknown[]> {
		const reasons: unknown[] = [];
		const listener = (event: PromiseRejectionEvent): void => {
			reasons.push(event.reason);
		};
		window.addEventListener('unhandledrejection', listener);
		try {
			await run();
			// Der Browser meldet unbehandelte Rejections erst, wenn die Microtask-Queue
			// leergelaufen ist — ein Makrotask später ist der Befund vollständig.
			await new Promise((resolve) => setTimeout(resolve, 20));
		} finally {
			window.removeEventListener('unhandledrejection', listener);
		}
		return reasons;
	}

	it('behandelt eine abgelehnte Metadaten-Promise vollständig', async () => {
		analyzeClientFile.mockRejectedValue(new Error('exif kaputt'));

		let mediaFile!: InstanceType<typeof MediaFile>;
		const reasons = await collectUnhandledRejections(async () => {
			mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
			await mediaFile.metadata.catch(() => undefined);
		});

		expect(reasons).toEqual([]);
		expect(mediaFile.isAnalyzed()).toBe(true);
	});

	it('behandelt eine abgelehnte Upload-Promise vollständig', async () => {
		analyzeClientFile.mockResolvedValue(metadata());
		uploadFileDirect.mockReturnValue({
			result: Promise.reject(new Error('upload kaputt')),
			abort: vi.fn()
		});

		let mediaFile!: InstanceType<typeof MediaFile>;
		const reasons = await collectUnhandledRejections(async () => {
			mediaFile = MediaFile.createMediaFile('ref', imageFile(), true);
			// Die Basis-Promise gehört dem Aufrufer — hier wird sie bewusst
			// abgeholt, damit nur die INTERN erzeugte Kette übrig bleibt.
			await expect(mediaFile.uploadedFile).rejects.toThrow('upload kaputt');
		});

		expect(reasons).toEqual([]);
		expect(mediaFile.isUploading).toBe(false);
	});
});
