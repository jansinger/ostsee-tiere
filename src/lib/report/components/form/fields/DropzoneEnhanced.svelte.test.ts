import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * Der Upload bleibt in der Schwebe, statt gegen einen Server zu laufen, den es
 * hier nicht gibt: Eine abgelehnte Upload-Promise ließe `handleFilesAdded` die
 * gerade angelegte Datei über `deleteFile` sofort wieder aus dem Store nehmen —
 * ein Wettlauf mit jeder Zusicherung über den Store-Inhalt.
 */
vi.mock('#lib/utils/uploadUtils.ts', () => ({
	uploadFileDirect: () => ({ result: new Promise<never>(() => {}), abort: () => undefined }),
	deleteFileDirect: async () => undefined
}));

vi.mock('#lib/utils/client/fileAnalysis.ts', () => ({
	analyzeClientFile: async (file: File) => ({
		fileName: file.name,
		size: file.size,
		mimeType: file.type,
		exifData: undefined
	})
}));
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { FormContext, UploadedFileInfo, ValidationPreset } from '#lib/types/index.ts';
import { MediaFile, type MediaStore } from '#lib/utils/media/MediaFile.svelte.ts';
import { markPositionFile } from './positionFileOrigin';
import DropzoneEnhanced from './DropzoneEnhanced.svelte';

/**
 * Herkunft wiederhergestellter Dateien.
 *
 * `$form.uploadedFiles` wird persistiert, `mediaStore` nicht — nach einem Reload
 * baut der `$effect.pre` in DropzoneEnhanced die `MediaFile`s neu auf. Vorher gab
 * er dabei jeder Datei die Herkunft der *mountenden* Instanz mit, und weil
 * bereits vorhandene Dateien übersprungen werden, gewann schlicht die Dropzone,
 * die zuerst mountete:
 *
 * - Reload auf Schritt 1 mit Medien aus Schritt 2 → alle galten als
 *   Positions-Foto, und das Panel behauptete „In diesem Foto sind keine
 *   GPS-Daten gespeichert", obwohl in Schritt 1 nie eines lag.
 * - Reload auf Schritt 2+ → das echte Positions-Foto galt als Schritt-2-Medium
 *   und der Hinweis war weg.
 *
 * Die Herkunft wird deshalb neben den Formulardaten persistiert (uid-Menge in
 * `positionFileOrigin.ts`) statt aus der Mount-Reihenfolge geraten.
 *
 * `mediaStore` ist hier bewusst ein einfaches Objekt: In `.svelte.test.ts` gibt
 * es keine Runes, und für die geprüfte Aussage genügt der Wert, den der
 * `$effect.pre` beim Mounten hineinschreibt.
 */

const CONFIG: ValidationPreset = {
	allowedTypes: ['image/jpeg'],
	maxFileSize: 10 * 1024 * 1024,
	maxVideoFileSize: 10 * 1024 * 1024,
	maxFiles: 10,
	accept: 'image/*'
};

function uploadedFile(uid: string): UploadedFileInfo {
	return {
		uid,
		filePath: `ref-1/${uid}.jpg`,
		originalName: `${uid}.jpg`,
		fileName: `${uid}.jpg`,
		mimeType: 'image/jpeg',
		size: 1234
	} as UploadedFileInfo;
}

function renderDropzone(
	files: UploadedFileInfo[],
	props: {
		maxFiles: number;
		enableGPSExtraction: boolean;
		showPositionMap?: boolean;
		actionLabel?: string;
	},
	seededMediaFiles: MediaFile[] = []
): { mediaStore: MediaStore; form: FormContext['form'] } {
	const mediaStore: MediaStore = { mediaFiles: seededMediaFiles };

	const context = renderWithFormContext(DropzoneEnhanced, {
		overrides: { uploadedFiles: files },
		props: { referenceId: 'ref-1', config: CONFIG, ...props },
		mediaStore
	});

	return { mediaStore, form: context.form };
}

describe('DropzoneEnhanced — Herkunft wiederhergestellter Dateien', () => {
	it('markiert ein nicht vorgemerktes Medium nicht als Positions-Foto, auch wenn die Positions-Dropzone zuerst mountet', async () => {
		const { mediaStore } = renderDropzone([uploadedFile('media-uid')], {
			maxFiles: 1,
			enableGPSExtraction: true
		});

		await expect.poll(() => mediaStore.mediaFiles.length).toBe(1);
		expect(mediaStore.mediaFiles[0]?.isFromPositionStep).toBe(false);
	});

	it('markiert ein vorgemerktes Foto als Positions-Foto, auch wenn die Medien-Dropzone zuerst mountet', async () => {
		markPositionFile('position-uid');

		const { mediaStore } = renderDropzone([uploadedFile('position-uid')], {
			maxFiles: 10,
			enableGPSExtraction: false
		});

		await expect.poll(() => mediaStore.mediaFiles.length).toBe(1);
		expect(mediaStore.mediaFiles[0]?.isFromPositionStep).toBe(true);
	});

	it('trennt beide Herkünfte in einem gemeinsamen Store', async () => {
		markPositionFile('position-uid');

		const { mediaStore } = renderDropzone(
			[uploadedFile('position-uid'), uploadedFile('media-uid')],
			{
				maxFiles: 10,
				enableGPSExtraction: false
			}
		);

		await expect.poll(() => mediaStore.mediaFiles.length).toBe(2);
		const byUid = Object.fromEntries(
			mediaStore.mediaFiles.map((file) => [file.uid, file.isFromPositionStep])
		);
		expect(byUid).toEqual({ 'position-uid': true, 'media-uid': false });
	});
});

/**
 * Baut ein `MediaFile`, dessen Metadaten-Auswertung ablehnt — der Fall, den
 * `analyzeClientFile` heute selbst schluckt, den die injizierte Promise aber
 * jederzeit liefern darf.
 */
function failingMediaFile(uid: string): MediaFile {
	const mediaFile = new MediaFile(
		uid,
		`${uid}.jpg`,
		'ref-1',
		Promise.resolve(uploadedFile(uid)),
		Promise.reject(new Error('exif kaputt'))
	);
	mediaFile.isFromPositionStep = true;
	return mediaFile;
}

/**
 * Scheitert die EXIF-Auswertung, hat der `{#await}`-Block bisher keinen
 * `{:catch}`-Zweig: Die Ablehnung schlägt als Svelte-Fehler durch und der
 * Nutzer sieht im besten Fall gar nichts, im schlechteren eine kaputte Seite.
 * Sichtbar bleiben muss mindestens ein Ausweg — die Datei selbst ist ja da.
 */
describe('DropzoneEnhanced — gescheiterte EXIF-Auswertung', () => {
	it('zeigt einen Hinweis statt eines Dauer-Spinners oder eines Absturzes', async () => {
		renderDropzone([], { maxFiles: 1, enableGPSExtraction: true }, [failingMediaFile('kaputt')]);

		await expect
			.poll(() => document.querySelectorAll('[data-testid="photo-analysis-failed"]').length)
			.toBe(1);
		expect(document.querySelectorAll('[aria-label="Analysiere Bilddaten"]').length).toBe(0);
	});
});

/** Wiederhergestellte Datei ohne GPS — `analyzed` ist sofort true. */
function restoredMediaFile(uid: string, fromPositionStep: boolean): MediaFile {
	return MediaFile.fromUploadedFile(uploadedFile(uid), 'ref-1', fromPositionStep);
}

/**
 * `mediaStore` gehört dem ganzen Formular. `photoStatus` grenzt deshalb auf
 * `isFromPositionStep` ein — sein Geschwister `positionMediaFile` tat es nicht
 * und fiel auf `mediaFiles[0]` zurück. Nach einem Reload auf Schritt 1, mit
 * Medien nur aus Schritt 2, zeigte Schritt 1 damit ein fremdes Foto als „das
 * Positions-Foto" und ersetzte die Dropzone vollständig. Einziger Ausweg war
 * „Neu auswählen" — und das löschte serverseitig alle Medien aller Schritte.
 */
describe('DropzoneEnhanced — Eingrenzung auf den Positions-Schritt', () => {
	it('zeigt im Positions-Schritt die Dropzone, wenn nur Medien aus Schritt 2 vorliegen', async () => {
		renderDropzone([], { maxFiles: 1, enableGPSExtraction: true }, [
			restoredMediaFile('media-uid', false)
		]);

		await expect.poll(() => document.querySelectorAll('input[type="file"]').length).toBe(1);
		expect(document.body.textContent).not.toContain('Neu auswählen');
	});

	it('löscht mit „Neu auswählen" keine Medien der anderen Schritte', async () => {
		const { mediaStore, form } = renderDropzone(
			[uploadedFile('position-uid'), uploadedFile('media-uid')],
			{ maxFiles: 1, enableGPSExtraction: true },
			[restoredMediaFile('position-uid', true), restoredMediaFile('media-uid', false)]
		);

		const reset = await vi.waitUntil(() =>
			Array.from(document.querySelectorAll('button')).find(
				(button) => button.textContent?.trim() === 'Neu auswählen'
			)
		);
		reset.click();

		await expect.poll(() => mediaStore.mediaFiles.map((file) => file.uid)).toEqual(['media-uid']);
		expect(get(form).uploadedFiles.map((file) => file.uid)).toEqual(['media-uid']);
	});
});

/**
 * Das Datei-Limit gehört zur selben Eingrenzung wie `ownedMediaFiles`.
 *
 * `mediaStore` gehört dem ganzen Formular. `positionMediaFile` und `handleClear`
 * rechnen deshalb nur mit den Dateien DIESES Schritts — `handleFilesAdded` zählte
 * dagegen den ganzen Store gegen `maxFiles`. Im Positions-Schritt (`maxFiles: 1`)
 * belegte damit jedes Medium aus Schritt 2 den einzigen Platz: Der Ersetzen-Zweig
 * löschte nichts (die fremde Datei gehört ihm nicht), und der Upload endete in
 * „Nur 0 von 1 Dateien können hinzugefügt werden (Maximum: 1)". Sichtbar wurde
 * das nach „Neu auswählen" — das Positions-Foto war weg, der Platz blieb belegt.
 */
describe('DropzoneEnhanced — Datei-Limit im Positions-Schritt', () => {
	it('nimmt ein Foto an, obwohl ein Medium aus Schritt 2 im Store liegt', async () => {
		const { mediaStore } = renderDropzone(
			[uploadedFile('media-uid')],
			{ maxFiles: 1, enableGPSExtraction: true },
			[restoredMediaFile('media-uid', false)]
		);

		const input = await vi.waitUntil(() =>
			document.querySelector<HTMLInputElement>('input[data-testid="dropzone-input"]')
		);
		const transfer = new DataTransfer();
		transfer.items.add(new File(['x'], 'position.jpg', { type: 'image/jpeg' }));
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));

		await expect
			.poll(() => mediaStore.mediaFiles.filter((file) => file.isFromPositionStep).length)
			.toBe(1);
	});

	/**
	 * Dieselbe Eingrenzung gilt für die Beschriftung der Fläche: Sie ist über
	 * `zoneTriggerAttributes` auch ihr zugänglicher Name (WCAG 4.1.2). Mit einem
	 * fremden Medium im Store hieß sie „Foto ersetzen", obwohl dieser Schritt kein
	 * Foto hat, das er ersetzen könnte — und der Klick öffnet dann auch nichts
	 * anderes als sonst.
	 */
	it('nennt die Fläche nicht „Foto ersetzen", wenn nur eine fremde Datei im Store liegt', async () => {
		renderDropzone([uploadedFile('media-uid')], { maxFiles: 1, enableGPSExtraction: true }, [
			restoredMediaFile('media-uid', false)
		]);

		await vi.waitUntil(() => document.querySelector('input[data-testid="dropzone-input"]'));
		expect(document.body.textContent).not.toContain('Foto ersetzen');
	});
});

/**
 * Zwei Karten derselben Position.
 *
 * Mit GPS-Foto rendert die Foto-Karte eine 300 px hohe, schreibgeschützte
 * `OLMap`, und die Disclosure des Panels klappt darunter eine zweite,
 * interaktive Karte mit demselben Marker auf — auf 375 px zusammen rund 600 px
 * Karte, ohne erkennbaren Unterschied, welche davon bedienbar ist. Die
 * Spezifikation sieht für Zustand B eine kompakte Bestätigungszeile plus GENAU
 * EINE Karte vor: die interaktive.
 *
 * Wie bei `showNoGpsWarning` steckt die Entscheidung in einer Prop mit dem
 * bisherigen Verhalten als Default — Schritt 2 und die Admin-Maske
 * (`sections/Media.svelte`, beide mit `enableGPSExtraction={false}`) erreichen
 * diesen Zweig ohnehin nicht.
 */
describe('DropzoneEnhanced — Karte in der Foto-Karte', () => {
	function gpsMediaFile(uid: string): MediaFile {
		const info = {
			...uploadedFile(uid),
			exifData: { latitude: 54.31, longitude: 12.09 }
		} as UploadedFileInfo;
		return MediaFile.fromUploadedFile(info, 'ref-1', true);
	}

	it('zeigt ohne `showPositionMap` die kompakte Bestätigungszeile statt einer zweiten Karte', async () => {
		renderDropzone([], { maxFiles: 1, enableGPSExtraction: true, showPositionMap: false }, [
			gpsMediaFile('gps-uid')
		]);

		await expect
			.poll(() => document.querySelectorAll('[data-testid="photo-position-summary"]').length)
			.toBe(1);
		expect(document.querySelectorAll('.ol-viewport').length).toBe(0);
	});
});

/**
 * Verhaltenstest für die Aufnahmezeit-Anzeige (M10-Befund): `aufnahmeLocale`
 * läuft seit der Umstellung auf `resolveDisplayLocale(getLocale())` statt
 * hartcodiertem `'de-DE'` — bewiesen wird das über den tatsächlich gerenderten
 * Wert (Datumstrenner `.` gegen `/`), nicht nur über die Existenz einer Zeit.
 *
 * Deckt die Aufrufstelle in der Medien-Listenkarte ab (Zeile ~717,
 * `!isPositionStep`-Zweig — Multi-Datei-Modus, `enableGPSExtraction: false`).
 * Die beiden Geschwisterstellen in der Foto-Karte des Positions-Schritts
 * (Zeile ~799, ~932) lesen dieselbe `aufnahmeLocale`-Variable — eine gemeinsam
 * verdrahtete `$derived` kann nicht an einer Stelle deutsch und an einer
 * anderen englisch sein, ein Test für die Variable genügt. Der
 * Positions-Zweig wird hier bewusst NICHT belegt: Ein dort gesetzter
 * `mediaFile.timestamp` löst den `$effect`, der EXIF-Zeiten ins Formular
 * übernimmt (`applyExifDateTime`, Zeile ~306), in dieser Test-Umgebung in
 * eine Endlosschleife aus (`effect_update_depth_exceeded`) — ein
 * vorbestehendes Verhalten dieses Effekts, unabhängig von der Locale-Frage
 * hier, das eigene Untersuchung verdient und nicht nebenbei „mitgefixt" wird.
 */
describe('DropzoneEnhanced — Aufnahmezeit folgt der Locale', () => {
	// 2025-06-15T14:26:40Z → Europe/Berlin (Sommerzeit) 15.6./15/06 17:06:40
	const AUFNAHMEZEIT = new Date(1_750_000_000_000);

	function mediaFileWithTimestamp(uid: string): MediaFile {
		const info = {
			...uploadedFile(uid),
			exifData: { dateTimeOriginal: AUFNAHMEZEIT }
		} as UploadedFileInfo;
		return MediaFile.fromUploadedFile(info, 'ref-1', false);
	}

	afterEach(async () => {
		// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
		// eingebauten Reset — auf den echten Default zurückschalten, damit
		// andere Tests im selben Prozess nicht die englische Locale erben.
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => baseLocale);
	});

	it('zeigt die Aufnahmezeit deutsch formatiert, wenn die aktive Locale de ist', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'de');

		renderDropzone([uploadedFile('media-uid')], { maxFiles: 10, enableGPSExtraction: false }, [
			mediaFileWithTimestamp('media-uid')
		]);

		await expect.poll(() => document.body.textContent).toContain('15.6.2025, 17:06:40');
	});

	it('zeigt die Aufnahmezeit britisch formatiert, wenn die aktive Locale en ist', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		renderDropzone([uploadedFile('media-uid')], { maxFiles: 10, enableGPSExtraction: false }, [
			mediaFileWithTimestamp('media-uid')
		]);

		await expect.poll(() => document.body.textContent).toContain('15/06/2025, 17:06:40');
	});
});

/**
 * Muster B (i18n Etappe 2, Aufgabe 2.4): Der Datei-Zähler der Medien-Listenkarte
 * (Zeile ~579, `!isPositionStep`-Zweig) baute den Plural vorher aus deutscher
 * Grammatik ({mediaFiles.length !== 1 ? 'en' : ''}) — bei 1 Datei zufällig
 * richtig, in jeder anderen Sprache falsch. Ersetzt durch eine
 * ICU-Plural-Botschaft. Diese Suite belegt 1 und 2 Dateien in beiden Sprachen
 * positiv, nach demselben Muster wie „Aufnahmezeit folgt der Locale" oben.
 */
describe('DropzoneEnhanced — Datei-Zähler folgt der Locale (Muster B)', () => {
	afterEach(async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => baseLocale);
	});

	it('zeigt den deutschen Singular bei 1 Datei', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'de');

		renderDropzone([uploadedFile('a')], { maxFiles: 10, enableGPSExtraction: false }, [
			MediaFile.fromUploadedFile(uploadedFile('a'), 'ref-1', false)
		]);

		await expect.poll(() => document.body.textContent).toContain('1 Datei');
		expect(document.body.textContent).not.toContain('1 Dateien');
	});

	it('zeigt den deutschen Plural bei 2 Dateien', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'de');

		renderDropzone(
			[uploadedFile('a'), uploadedFile('b')],
			{ maxFiles: 10, enableGPSExtraction: false },
			[
				MediaFile.fromUploadedFile(uploadedFile('a'), 'ref-1', false),
				MediaFile.fromUploadedFile(uploadedFile('b'), 'ref-1', false)
			]
		);

		await expect.poll(() => document.body.textContent).toContain('2 Dateien');
	});

	it('zeigt den englischen Singular bei 1 Datei', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		renderDropzone([uploadedFile('a')], { maxFiles: 10, enableGPSExtraction: false }, [
			MediaFile.fromUploadedFile(uploadedFile('a'), 'ref-1', false)
		]);

		await expect.poll(() => document.body.textContent).toContain('1 file');
		expect(document.body.textContent).not.toContain('1 files');
	});

	it('zeigt den englischen Plural bei 2 Dateien', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		renderDropzone(
			[uploadedFile('a'), uploadedFile('b')],
			{ maxFiles: 10, enableGPSExtraction: false },
			[
				MediaFile.fromUploadedFile(uploadedFile('a'), 'ref-1', false),
				MediaFile.fromUploadedFile(uploadedFile('b'), 'ref-1', false)
			]
		);

		await expect.poll(() => document.body.textContent).toContain('2 files');
	});
});

/**
 * Sichtbarer Auslöser in der Dropzone.
 *
 * Bisher war die gestrichelte Fläche mit „Klicken oder Drag & Drop" der einzige
 * Auslöser — auf einem Telefon die Beschreibung einer unmöglichen Handlung, und
 * ohne Vollton-Primärbutton trägt die Foto-Karte die geforderte Prominenz
 * nicht. Der Button ist das Klickziel, die Fläche bleibt das Drop-Ziel
 * (GitHub-/Figma-Muster); genau ein `click()` auf dem versteckten
 * `<input type="file">` — ein zweites käme aus dem `role="button"` der Fläche.
 */
describe('DropzoneEnhanced — sichtbarer Auslöser', () => {
	it('öffnet den Dateidialog über einen Primärbutton, und zwar genau einmal', async () => {
		const openDialog = vi
			.spyOn(HTMLInputElement.prototype, 'click')
			.mockImplementation(() => undefined);

		renderDropzone([], {
			maxFiles: 1,
			enableGPSExtraction: true,
			actionLabel: 'Foto auswählen'
		});

		const button = await vi.waitUntil(() =>
			Array.from(document.querySelectorAll('button')).find((candidate) =>
				candidate.textContent?.includes('Foto auswählen')
			)
		);
		expect(button.className).toContain('btn-primary');

		button.click();

		expect(openDialog).toHaveBeenCalledTimes(1);
		openDialog.mockRestore();
	});
});

/**
 * Der Zusatz unter dem Dropzone-Titel darf keine Positionsübernahme versprechen,
 * die der Aufrufer nicht leistet.
 *
 * Bis zum 2026-08-04 war „GPS-Daten werden beim Upload verarbeitet" der Default
 * dieser Komponente. Sie erbte damit ausgerechnet der Aufrufer, der GPS NICHT
 * auswertet (`sections/Media.svelte`, `enableGPSExtraction={false}` — dort führt
 * kein Pfad zu `applyExifPosition`), während `PositionPanel` als einziger echter
 * GPS-Aufrufer den Zusatz mit `additionalText=""` überschrieb.
 *
 * Geprüft wird deshalb der Default, nicht ein durchgereichter Wert: Ein Aufrufer,
 * der nichts angibt, darf nichts versprechen. Was er selbst hineinschreibt, ist
 * seine Aussage und seine Verantwortung.
 */
describe('DropzoneEnhanced — Default-Zusatz verspricht kein GPS', () => {
	it('rendert ohne eigenen Zusatz keine Aussage über GPS-Daten', async () => {
		renderDropzone([], { maxFiles: 10, enableGPSExtraction: false });

		// Auf die gerenderte Fläche gewartet, sonst wäre die Assertion leer-grün.
		await vi.waitUntil(() =>
			Array.from(document.querySelectorAll('*')).find((candidate) =>
				candidate.textContent?.includes('Klicken oder Drag & Drop')
			)
		);

		expect(document.body.textContent).not.toMatch(/GPS/i);
	});
});
