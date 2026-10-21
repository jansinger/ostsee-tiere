<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	/**
	 * DropzoneEnhanced Component
	 *
	 * Eine erweiterte Dropzone-Komponente für den Datei-Upload mit folgenden Hauptfunktionen:
	 * - Sofortige Dateianalyse mit EXIF-Datenextraktion (GPS, Zeitstempel)
	 * - Paralleler Upload mehrerer Dateien mit Fortschrittsanzeige
	 * - GPS-Positionsextraktion aus Fotos für automatische Standortbestimmung
	 * - Thumbnail-Vorschau für Bilder
	 * - Integration mit dem Formular-System und Media Store
	 * - Automatische Wiederherstellung von Dateien beim erneuten Besuch des Formularschritts
	 * - Validierung von GPS-Koordinaten (Ostsee-Check)
	 *
	 * Die Komponente unterstützt zwei Modi:
	 * 1. GPS-Extraktionsmodus (enableGPSExtraction=true): Einzeldatei-Upload mit Kartenanzeige
	 * 2. Media-Upload-Modus: Multi-Datei-Upload mit Galerie-Ansicht
	 */
	import UnifiedDropzone from '#lib/components/form/UnifiedDropzone.svelte';
	import OLMap from '#lib/components/map/OLMap.svelte';
	import { createLogger } from '#lib/logger.ts';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { createToast } from '#lib/stores/toastState.svelte.ts';
	import type { ExifData, UploadedFileInfo, ValidationPreset } from '#lib/types/index.ts';
	import { deleteFileDirect } from '#lib/utils/index.ts';
	import { formatFileSize } from '#lib/utils/file/fileSize.ts';
	import { getFileIcon } from '#lib/utils/file/fileType.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { resolveDisplayLocale, splitDateTime } from '#lib/utils/format/dateTime.ts';
	import { formatLocation } from '#lib/utils/format/formatLocation.ts';
	import { isInBalticArea } from '#lib/utils/geo/checkBalticSea.ts';
	import { MediaFile } from '#lib/utils/media/MediaFile.svelte.ts';
	import { deleteMultipleFiles } from '#lib/utils/upload/fileProcessing.ts';
	import {
		shouldResetExifPosition,
		type AppliedExifPosition
	} from '#lib/report/components/form/fields/exifPositionReset.ts';
	import {
		shouldApplyExifDateTime,
		type AppliedExifDateTime
	} from '#lib/report/components/form/fields/exifDateTimeApply.ts';
	import {
		isPositionUid,
		loadPositionUids,
		markPositionFile,
		unmarkPositionFile
	} from '#lib/report/components/form/fields/positionFileOrigin.ts';
	import { get } from 'svelte/store';

	import Icon from '#lib/components/Icon.svelte';

	const logger = createLogger('DropzoneEnhanced');
	let { form, touched, handleChange, mediaStore } = getFormContext();

	// Aufnahmezeit folgt der Anzeigesprache statt hartcodiert 'de-DE', sonst
	// bleibt sie unter /en deutsch formatiert.
	//
	// Verhaltenstest nur für die Aufrufstelle in der Medien-Listenkarte
	// (`!isPositionStep`-Zweig, Multi-Datei-Modus) — `DropzoneEnhanced.svelte.test.ts`
	// → „Aufnahmezeit folgt der Locale". Die beiden Aufrufstellen im
	// Positions-Zweig unten (Karten-Ansicht und kompakte Bestätigungszeile)
	// lesen dieselbe Variable und sind damit denselben Zusicherungen unterworfen,
	// bleiben aber bewusst ungetestet: Ein `mediaFile.timestamp` im
	// Positions-Zweig lässt den `$effect`, der EXIF-Zeiten ins Formular überträgt
	// (`applyExifDateTime` unten), in der Test-Umgebung in eine Endlosschleife
	// laufen (`effect_update_depth_exceeded`) — ein vorbestehendes Verhalten
	// dieses Effekts, unabhängig von dieser Locale-Frage, das eine eigene
	// Untersuchung braucht statt hier nebenbei „mitgefixt" zu werden. Ein
	// Rückfall auf hartcodiertes `'de-DE'` fiele trotzdem auf: über
	// `hardcodedDisplayLocaleScan.test.ts` (Literal-Scan) und weil ein Fehler in
	// dieser einen Variablen alle drei Aufrufstellen gleichzeitig träfe — die
	// erste Stelle bleibt der Kanarienvogel für die anderen beiden.
	const aufnahmeLocale = $derived(resolveDisplayLocale(getLocale()));

	// Merkt sich die zuletzt aus EXIF in den Formularzustand übernommene
	// Position (siehe `applyExifPosition`). Wird beim Entfernen des Fotos
	// (`handleClear`/`handleFileRemoved`) genutzt, um `latitude`/`longitude`/
	// `hasPosition` NUR dann zurückzunehmen, wenn der Nutzer sie seither nicht
	// manuell überschrieben hat (siehe `exifPositionReset.ts`).
	let appliedExifPosition = $state<AppliedExifPosition | null>(null);

	// Dasselbe für Datum und Uhrzeit (siehe `exifDateTimeApply.ts`): Merkt sich,
	// was zuletzt aus EXIF übernommen wurde, damit ein Foto-Wechsel die eigene
	// vorherige Übernahme ersetzen darf — eine Eingabe des Nutzers aber nicht.
	let appliedExifDateTime = $state<AppliedExifDateTime | null>(null);

	// Component Props
	let {
		referenceId, // Eindeutige ID für Upload-Referenz (meist sighting.tempId)
		maxFiles = 10, // Maximale Anzahl erlaubter Dateien
		config, // Datei-Validierungskonfiguration (Größe, Typen, etc.)
		enableGPSExtraction = false, // GPS-Extraktionsmodus aktivieren (für Position-Schritt)
		title, // Optionaler Titel für die Dropzone
		/**
		 * Zusatz unter dem Dropzone-Titel.
		 *
		 * Default bewusst leer: Bis zum 2026-08-04 stand hier „GPS-Daten werden
		 * beim Upload verarbeitet" — eine Aussage, die genau der Aufrufer NICHT
		 * erbte, der sie einlöst (`PositionPanel` überschreibt sie), während sie
		 * `sections/Media.svelte` mit `enableGPSExtraction={false}` versprach.
		 * Dort führt kein Codepfad zu `applyExifPosition`, die Position blieb
		 * also unberührt.
		 *
		 * Was der Aufrufer mit den Daten tut, kann diese Komponente nicht wissen —
		 * ein Zusatz dazu gehört deshalb an die Aufrufstelle, nicht in den Default.
		 */
		additionalText = '',
		/**
		 * Eigener Warnhinweis „Keine GPS-Daten im Foto" (nur im GPS-Modus sichtbar).
		 *
		 * Abschaltbar für Aufrufer, die den Fall selbst und ausführlicher behandeln
		 * — sonst stünden zwei `alert alert-warning` mit derselben Aussage
		 * übereinander.
		 *
		 * Aufrufer (Stand Task 9):
		 * - `form/position/PositionPanel.svelte` — setzt `false` und erklärt den
		 *   Fall selbst (Zustand C, inkl. der Auswege „Auf Karte wählen" und
		 *   „Seegebiet beschreiben").
		 * - `sections/Media.svelte` — übernimmt den Default `true`, erreicht den
		 *   Hinweis aber nie: mit `enableGPSExtraction={false}` ist
		 *   `isPositionStep` falsch und der GPS-Zweig wird gar nicht gerendert.
		 *
		 * An diesem Default hängt damit aktuell kein sichtbarer Hinweis; er bleibt
		 * `true` als sicheres Verhalten für einen künftigen GPS-Modus-Aufrufer ohne
		 * eigene Erklärung. Bewusst eine eigene Prop und nicht an `isPositionStep`
		 * gehängt: Der Zweck ist „Aufrufer erklärt es selbst", nicht „welcher Modus".
		 */
		showNoGpsWarning = true,
		/**
		 * Meldet dem Aufrufer, ob gerade Datum und Uhrzeit aus EXIF übernommen
		 * wurden (`true`) oder ob das zugehörige Foto wieder entfernt wurde
		 * (`false`).
		 *
		 * Nötig, weil sich das am Formularzustand nicht ablesen lässt:
		 * `$form.sightingDate` ist wegen `berlinToday()` als Schema-Default immer
		 * gefüllt. Genau daran scheiterte die frühere Fassung des Zustand-C-Satzes
		 * „Datum und Uhrzeit konnten übernommen werden" — er stand auch dann da,
		 * wenn nichts übernommen wurde.
		 */
		onExifDateTimeApplied = (_applied: boolean) => {},
		/**
		 * Schreibgeschützte Vorschau-Karte in der Foto-Karte (nur im GPS-Modus).
		 *
		 * Abschaltbar für Aufrufer, die selbst schon eine Karte derselben Position
		 * zeigen. `PositionPanel` tut genau das: Seine Disclosure klappt bei neuer
		 * Position von allein auf, sodass rund 200 px tiefer eine zweite, diesmal
		 * interaktive Karte mit demselben Marker stand — auf 375 px zusammen
		 * ~600 px Karte, ohne erkennbaren Unterschied, welche bedienbar ist. Ohne
		 * Karte tritt an ihre Stelle die kompakte Bestätigungszeile.
		 *
		 * Default `true` wie bisher; `sections/Media.svelte` (Schritt 2 und
		 * Admin-Maske) erreicht diesen Zweig mit `enableGPSExtraction={false}`
		 * ohnehin nicht. Gleiches Muster wie `showNoGpsWarning`.
		 */
		showPositionMap = true,
		/**
		 * Beschriftung des Vollton-Buttons in der Dropzone — wird unverändert an
		 * `UnifiedDropzone` durchgereicht (dort dokumentiert). Ohne Angabe bleibt
		 * die gestrichelte Fläche selbst der Auslöser.
		 */
		actionLabel = undefined,
		/**
		 * Dichte Dropzone-Fläche — wird unverändert an `UnifiedDropzone`
		 * durchgereicht (dort dokumentiert). Nur sinnvoll zusammen mit
		 * `actionLabel` und einer eigenen Überschrift über der Fläche.
		 */
		compact = false
	}: {
		referenceId: string;
		maxFiles?: number;
		config: ValidationPreset;
		enableGPSExtraction?: boolean;
		title?: string;
		additionalText?: string;
		showNoGpsWarning?: boolean;
		onExifDateTimeApplied?: (applied: boolean) => void;
		showPositionMap?: boolean;
		actionLabel?: string;
		compact?: boolean;
	} = $props();

	// Lokaler State für Dropzone-Dateien (temporär während des Drag & Drop)
	let dropzoneFiles = $state<File[]>([]);

	// Modus-Bestimmung basierend auf maxFiles
	let isSingleFileMode = $derived(maxFiles === 1);
	let isPositionStep = $derived(enableGPSExtraction && isSingleFileMode);

	// Initialisierung der Upload-Map mit bestehenden Formulardaten
	let uploadedFiles = $derived($form.uploadedFiles);

	// Direkte, abgeleitete Referenz auf mediaStore.mediaFiles für Reaktivität
	let mediaFiles = $derived(mediaStore.mediaFiles);

	// Hilfsfunktion zum Aktualisieren des mediaStore
	function updateMediaFiles(newFiles: MediaFile[]): void {
		mediaStore.mediaFiles = newFiles;
	}

	$effect.pre(() => {
		logger.info('Updating media files from uploaded files');
		const currentMediaFiles = mediaStore.mediaFiles;
		let hasChanges = false;
		const updatedFiles = [...currentMediaFiles];
		// Herkunft aus dem Storage statt aus `isPositionStep`: `uf` trägt sie
		// nicht, und das Positions-Panel urteilt nur über Dateien des
		// Positions-Schritts (positionPanelState.ts). Mit `isPositionStep`
		// stempelte die zuerst gemountete Dropzone ihre eigene Herkunft auf alle
		// wiederhergestellten Dateien — nach einem Reload auf Schritt 1 galten
		// Schritt-2-Medien als Positions-Foto, nach einem Reload auf Schritt 2+
		// verlor das echte Positions-Foto seinen Hinweis (positionFileOrigin.ts).
		const positionUids = loadPositionUids();

		uploadedFiles.forEach((uf) => {
			if (!currentMediaFiles.some((mf) => mf.uid === uf.uid)) {
				updatedFiles.push(
					MediaFile.fromUploadedFile(uf, referenceId, isPositionUid(positionUids, uf.uid))
				);
				hasChanges = true;
			}
		});

		if (hasChanges) {
			updateMediaFiles(updatedFiles);
		}
	});

	/**
	 * Dateien, über die diese Instanz überhaupt urteilen und verfügen darf.
	 *
	 * `mediaStore` gehört dem ganzen Formular (Form.svelte) und wird von allen
	 * Schritten geteilt. Im Positions-Schritt zählen deshalb nur die Dateien
	 * dieses Schritts — dieselbe Eingrenzung, die `photoStatus`
	 * (`positionPanelState.ts`) für das Panel vornimmt. Ohne sie zeigte Schritt 1
	 * nach einem Reload ein Foto aus Schritt 2 als „das Positions-Foto" und
	 * ersetzte die Dropzone damit vollständig.
	 *
	 * Im Medien-Schritt bleibt es beim ganzen Store: Dort ist die Galerie
	 * bewusst die Gesamtsicht.
	 */
	let ownedMediaFiles = $derived(
		isPositionStep ? mediaFiles.filter((mf: MediaFile) => mf.isFromPositionStep) : mediaFiles
	);

	// Mediafile für Positionsdaten - bevorzuge Dateien mit GPS, aber zeige auch erste Datei ohne GPS
	let positionMediaFile = $derived(
		ownedMediaFiles.find((mf: MediaFile) => mf.hasPosition()) ??
			(isPositionStep ? ownedMediaFiles[0] : undefined)
	);

	/**
	 * Trigger a change event for the specified form field.
	 * @param name - The name of the form field.
	 * @param value - The new value for the form field.
	 */
	function triggerChange(name: string, value: unknown) {
		handleChange({ target: { name, value } } as unknown as Event);
	}

	/**
	 * Adds a newly uploaded file to the list of uploaded files.
	 * @param uploadedFile
	 */
	function addUploadedFile(uploadedFile: UploadedFileInfo) {
		uploadedFiles = [...uploadedFiles, uploadedFile];
		triggerChange('uploadedFiles', uploadedFiles);
	}

	/**
	 * Deletes a file from the uploaded files list and media files.
	 * @param uid
	 */
	function deleteFile(uid: string) {
		uploadedFiles = uploadedFiles.filter((uf) => uf.uid !== uid);
		updateMediaFiles(mediaStore.mediaFiles.filter((mf) => mf.uid !== uid));
		unmarkPositionFile(uid);
		triggerChange('uploadedFiles', uploadedFiles);
	}

	/**
	 * Übernimmt eine aus EXIF gelesene GPS-Position in den Formularzustand und
	 * merkt sich die geschriebenen Rohwerte in `appliedExifPosition`, damit ein
	 * späteres Entfernen des Fotos diese (und nur diese) wieder zurücknehmen kann.
	 */
	function applyExifPosition(exifData: ExifData): void {
		const latitude = exifData.latitude!.toFixed(4);
		const longitude = exifData.longitude!.toFixed(4);
		triggerChange('latitude', latitude);
		triggerChange('longitude', longitude);
		// Echte Koordinaten vorhanden → Position ist gesetzt
		triggerChange('hasPosition', true);
		appliedExifPosition = { latitude, longitude };
	}

	/**
	 * Nimmt eine zuvor aus EXIF übernommene Position wieder zurück — aber NUR,
	 * wenn die aktuellen Formular-Koordinaten noch exakt diesem Wert entsprechen
	 * (siehe `shouldResetExifPosition` in `exifPositionReset.ts`). Hat der Nutzer
	 * die Position inzwischen manuell überschrieben, bleibt sie erhalten.
	 */
	function resetExifPositionIfUnchanged(): void {
		if (shouldResetExifPosition(get(form), appliedExifPosition)) {
			triggerChange('latitude', undefined);
			triggerChange('longitude', undefined);
			triggerChange('hasPosition', false);
		}
		appliedExifPosition = null;
	}

	/**
	 * Übernimmt die Aufnahmezeit aus EXIF — auch für ein Foto OHNE GPS.
	 *
	 * Das war der eigentliche Fehler: Die Karte zeigte „Aufnahmezeit: …" an,
	 * geschrieben wurde sie aber nur im Zweig mit GPS. Der Nutzer sah das
	 * richtige Datum und prüfte das Feld deshalb nicht mehr — im Formular stand
	 * weiter das heutige. Für ein Foto ohne GPS ist der Zeitstempel das Einzige,
	 * was EXIF überhaupt noch beisteuern kann.
	 *
	 * Ob geschrieben werden darf, entscheidet `shouldApplyExifDateTime`
	 * (`exifDateTimeApply.ts`) — eine Eingabe des Nutzers wird nicht
	 * überschrieben.
	 */
	function applyExifDateTime(timestamp: Date): void {
		const { date: sightingDate, time: sightingTime } = splitDateTime(timestamp);
		if (!shouldApplyExifDateTime(get(form), appliedExifDateTime, get(touched))) {
			logger.debug({ sightingDate, sightingTime }, 'EXIF timestamp not applied — field in use');
			return;
		}
		logger.info({ sightingDate, sightingTime }, 'New sighting data extracted');
		triggerChange('sightingDate', sightingDate);
		triggerChange('sightingTime', sightingTime);
		appliedExifDateTime = { sightingDate, sightingTime };
		onExifDateTimeApplied(true);
	}

	$effect(() => {
		if (positionMediaFile) {
			if (positionMediaFile.exifData?.latitude && positionMediaFile.exifData?.longitude) {
				applyExifPosition(positionMediaFile.exifData);
			}
			const timestamp = positionMediaFile.timestamp;
			if (timestamp) {
				applyExifDateTime(timestamp);
			}
		}
	});

	/**
	 * Verarbeitet neu hinzugefügte Dateien
	 *
	 * Workflow:
	 * 1. Sofortige Dateianalyse für Preview (EXIF, Thumbnails)
	 * 2. Paralleler Upload im Hintergrund
	 * 3. GPS-Extraktion bei entsprechendem Modus
	 * 4. Update von Preview-State und Media Store
	 *
	 * @param newFiles - Array von neu hinzugefügten Dateien
	 */
	async function handleFilesAdded(newFiles: File[]) {
		if (newFiles.length === 0) return;

		// Single-File-Modus: Bestehende Datei ersetzen
		//
		// Gezählt wird über `ownedMediaFiles` und nicht über den ganzen Store —
		// dieselbe Eingrenzung, mit der `positionMediaFile` und `handleClear` schon
		// arbeiten. Vorher zählte hier der ganze `mediaStore` gegen `maxFiles`: Im
		// Positions-Schritt (`maxFiles: 1`) belegte damit jedes Medium aus Schritt 2
		// den einzigen Platz, der Ersetzen-Zweig löschte nichts (die fremde Datei
		// gehört ihm nicht) und der Upload endete in „Nur 0 von 1 Dateien können
		// hinzugefügt werden (Maximum: 1)". Im Medien-Schritt sind beide Mengen
		// identisch, dort ändert sich nichts.
		if (isSingleFileMode && ownedMediaFiles.length > 0) {
			createToast(
				'info',
				m.report_components_form_fields_dropzoneenhanced_text_nur_eine_datei_erlaubt_bestehende_datei()
			);
			await handleClear();
		}

		// Datei-Limit prüfen und ggf. beschränken
		const currentCount = ownedMediaFiles.length;
		const allowedCount = Math.min(newFiles.length, maxFiles - currentCount);
		const filesToProcess = newFiles.slice(0, allowedCount);

		if (filesToProcess.length < newFiles.length) {
			createToast(
				'warning',
				m.report_components_form_fields_dropzoneenhanced_text_nur_allowed_von_total_dateien_koennen(
					{ allowed: allowedCount, total: newFiles.length, max: maxFiles }
				)
			);
		}

		if (filesToProcess.length === 0) return;

		// Add new files to mediaFiles and process them
		const newMediaFiles = filesToProcess.map((file) => {
			const mediaFile = MediaFile.createMediaFile(referenceId, file, isPositionStep);
			// Herkunft sofort festhalten, damit sie einen Reload übersteht — hier
			// ist sie bekannt, nach dem Reload nirgends mehr (positionFileOrigin.ts).
			if (isPositionStep) {
				markPositionFile(mediaFile.uid);
			}
			mediaFile.uploadedFile
				.then((uploadedFile) => {
					// Update form data
					addUploadedFile(uploadedFile);
					createToast(
						'success',
						m.report_components_form_fields_dropzoneenhanced_text_datei_erfolgreich_hochgeladen()
					);
				})
				.catch((error) => {
					// Ein gewollter Abbruch (Abbrechen-Knopf) ist kein Fehler — dafür
					// kein Fehler-Toast. Die Servermeldung wird sonst durchgereicht statt
					// durch einen generischen Text ersetzt: Task 12 hat den 413-Text
					// (tatsächliche Größe, Grenze, Ausweg per E-Mail) sorgfältig
					// formuliert, und der wäre hier sonst verloren.
					const wasAborted = error instanceof Error && /abgebrochen/i.test(error.message);
					if (wasAborted) {
						logger.info({ uid: mediaFile.uid }, 'Upload vom Melder abgebrochen');
					} else {
						logger.error({ error }, 'Fehler beim Hochladen der Datei.');
						createToast(
							'error',
							error instanceof Error
								? error.message
								: m.report_components_form_fields_dropzoneenhanced_text_fehler_beim_hochladen()
						);
					}
					deleteFile(mediaFile.uid);
				});
			// Trigger positionMediaFile update when metadata is ready
			//
			// Mit Rejection-Zweig, und der ist nicht kosmetisch: `analyzed` ist ein
			// gewöhnliches Klassenfeld und weckt nichts; das einzige reaktive Signal
			// ist die Neuzuweisung von `mediaStore.mediaFiles` unten. Lehnt die
			// Metadaten-Promise ab und liefe nur der Erfolgs-Zweig, bliebe diese
			// Zuweisung aus — das Panel hinge für immer in `'analyzing'`: kein
			// GPS-Hinweis, kein Ausweg, keine Fehlermeldung. Zusätzlich entstünde
			// eine unbehandelte Rejection.
			const refreshAfterMetadata = (): void => {
				// Directly update form GPS data here — the $effect that reads positionMediaFile.exifData
				// runs before EXIF extraction completes (async), and won't re-run afterwards because
				// positionMediaFile stays the same object reference (plain class property, not $state).
				if (isPositionStep && mediaFile.hasPosition()) {
					applyExifPosition(mediaFile.exifData!);
				}
				// BEWUSST außerhalb des GPS-Zweigs: Ein Foto ohne GPS trägt trotzdem
				// eine Aufnahmezeit, und sie war bisher das Einzige, was angezeigt,
				// aber nie übernommen wurde.
				if (isPositionStep && mediaFile.timestamp) {
					applyExifDateTime(mediaFile.timestamp);
				}
				// Trigger store update to refresh derived values.
				//
				// Bedingungslos, und das ist der Punkt: Der Abschluss der Auswertung IST
				// die Neuigkeit — auch (gerade) dann, wenn kein GPS gefunden wurde.
				// PositionPanel unterscheidet „wird ausgewertet" von „kein GPS" über
				// `MediaFile.isAnalyzed()`; ohne diese Zuweisung bliebe sein `$derived`
				// auf dem Stand vom Drop-Zeitpunkt stehen und der Hinweis auf das Foto
				// ohne GPS erschiene nie.
				//
				// Der bisherige Wächter (`!hadPositionMediaFile && hasPosition()`) hat
				// den Fall ohne GPS ausgelassen. Doppelt angewandt wird dadurch nichts:
				// `positionMediaFile` ist ein `$derived` und liefert dieselbe Instanz
				// wie zuvor — Sveltes Gleichheitsprüfung (deriveds.js:396) stoppt die
				// Propagation, der `$effect` oben läuft also nicht erneut.
				updateMediaFiles([...mediaStore.mediaFiles]);
			};
			mediaFile.metadata.then(refreshAfterMetadata, (error) => {
				logger.warn({ error, uid: mediaFile.uid }, 'EXIF-Auswertung fehlgeschlagen');
				refreshAfterMetadata();
			});
			return mediaFile;
		});
		updateMediaFiles([...mediaStore.mediaFiles, ...newMediaFiles]);
	}

	/**
	 * Entfernt eine einzelne Datei
	 *
	 * Schritte:
	 * 1. Löschung vom Server (falls hochgeladen)
	 * 2. Entfernung aus Upload-Map
	 * 3. Entfernung aus Media Store
	 * 4. GPS-Formulardaten zurücknehmen — aber NUR, wenn sie noch dem zuletzt
	 *    aus diesem Foto übernommenen EXIF-Wert entsprechen und der Nutzer sie
	 *    nicht inzwischen manuell überschrieben hat (siehe `resetExifPositionIfUnchanged`)
	 * 5. User-Feedback
	 *
	 * @param index - Index der zu löschenden Datei im gefilterten Array
	 */
	async function handleFileRemoved(uidOrFilename: string) {
		// Suche nach der Mediendatei
		const mediaFile = mediaFiles.find(
			(mf) => mf.uid === uidOrFilename || mf.fileName === uidOrFilename
		);
		if (!mediaFile) {
			logger.warn({ uidOrFilename }, 'No media file found with uid or filename');
			return;
		}

		// Doppelklick-Schutz
		if (mediaFile.isDeleting) {
			return;
		}
		mediaFile.isDeleting = true;

		try {
			const fileInfo = await mediaFile.uploadedFile;

			// Vom Server löschen falls hochgeladen
			if (fileInfo) {
				await deleteFileDirect(fileInfo.filePath);
				// Aus lokalen Stores entfernen
				deleteFile(mediaFile.uid);
				resetExifPositionIfUnchanged();
				// Datum und Uhrzeit bleiben stehen — anders als die Koordinaten sind sie
				// ohne Foto weiterhin plausibel, und `sightingDate` fiele sonst auf
				// „heute" zurück. `appliedExifDateTime` bleibt deshalb ebenfalls gesetzt:
				// Es besagt „diese Werte gehören uns" und erlaubt dem Ersatzfoto, sie zu
				// überschreiben (exifDateTimeApply.ts). Nur der Hinweis im Panel geht.
				onExifDateTimeApplied(false);
				createToast(
					'success',
					m.report_components_form_fields_dropzoneenhanced_text_datei_erfolgreich_geloescht()
				);
			}
		} catch (error) {
			logger.info({ error }, 'Fehler beim Löschen der Datei vom Server.');
			createToast(
				'error',
				m.report_components_form_fields_dropzoneenhanced_text_fehler_beim_loeschen_der_datei()
			);
		}
	}

	/**
	 * Löscht alle Dateien und setzt den Komponenten-State zurück
	 *
	 * Aufräum-Schritte:
	 * 1. Object URLs freigeben (Memory Leaks vermeiden)
	 * 2. Alle Dateien vom Server löschen
	 * 3. UI-State komplett zurücksetzen
	 * 4. GPS-Formulardaten zurücknehmen — aber NUR, wenn sie noch dem zuletzt aus
	 *    EXIF übernommenen Wert entsprechen und der Nutzer sie nicht inzwischen
	 *    manuell überschrieben hat (siehe `resetExifPositionIfUnchanged`)
	 */
	function handleClear() {
		try {
			dropzoneFiles = [];

			// Nur die eigenen Dateien (siehe `ownedMediaFiles`). Im Positions-Schritt
			// ist „Neu auswählen" der einzige Ausweg aus der Foto-Karte; unbegrenzt
			// gedacht löschte dieser eine Klick auch die Medien aus Schritt 2 —
			// serverseitig und ohne Rückfrage. Im Medien-Schritt bleibt „Alle
			// löschen" unverändert alles.
			const removed = ownedMediaFiles;
			const removedUids = new Set(removed.map((mediaFile: MediaFile) => mediaFile.uid));

			// Vormerkungen der entfernten Dateien zurücknehmen, bevor der Store leer
			// ist — sonst blieben verwaiste uids im sessionStorage stehen.
			for (const mediaFile of removed) {
				unmarkPositionFile(mediaFile.uid);
			}

			// Clear media files im Store
			updateMediaFiles(
				mediaStore.mediaFiles.filter((mediaFile) => !removedUids.has(mediaFile.uid))
			);

			// Die zugehörigen hochgeladenen Dateien vom Server löschen
			const removedUploads = uploadedFiles.filter((uf: UploadedFileInfo) =>
				removedUids.has(uf.uid)
			);
			deleteMultipleFiles(removedUploads);

			uploadedFiles = uploadedFiles.filter((uf: UploadedFileInfo) => !removedUids.has(uf.uid));
			resetExifPositionIfUnchanged();
			// Siehe `handleFileRemoved`: Werte bleiben, nur der Hinweis geht.
			onExifDateTimeApplied(false);

			triggerChange('uploadedFiles', uploadedFiles);
			createToast(
				'success',
				m.report_components_form_fields_dropzoneenhanced_text_alle_dateien_erfolgreich_geloescht()
			);
		} catch (_error) {
			createToast(
				'error',
				m.report_components_form_fields_dropzoneenhanced_text_fehler_beim_loeschen_aller_dateien()
			);
		}
	}
</script>

<div class="space-y-4">
	<!-- Enhanced Preview Section mit EXIF-Daten (only for non-GPS mode or multiple files) -->
	{#if !isPositionStep && mediaFiles && mediaFiles.length > 0}
		<div class="bg-base-200 rounded-lg p-4">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-sm font-semibold">
					{m.report_components_form_fields_dropzoneenhanced_text_datei_plural({
						count: mediaFiles.length
					})}
					<!-- {previewFiles.length > 0 ? '(wird verarbeitet...)' : 'hochgeladen'} -->
				</h3>
				<!-- `min-h-11` hält das 44-px-Touch-Target, das `btn-sm` sonst
				     unterschreitet (design-system.md, A11y-Mindestanforderungen). -->
				<button
					type="button"
					class="btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content min-h-11"
					onclick={handleClear}
				>
					{m.report_components_form_fields_dropzoneenhanced_text_alle_loeschen()}
				</button>
			</div>

			<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				<!-- Uploaded files -->
				{#each mediaFiles as mediaFile (mediaFile.uid)}
					<!-- Media File Card -->
					{#if mediaFile}
						<div class="card bg-base-100 shadow-raised">
							<div class="card-body p-3">
								{#await mediaFile.metadata then fileMetadata}
									<!-- Thumbnail -->
									<div class="relative">
										<div
											class="bg-base-200 flex h-20 items-center justify-center overflow-hidden rounded"
										>
											{#if mediaFile.thumbnail}
												<img
													src={mediaFile.thumbnail}
													alt={mediaFile.fileName}
													class="h-full w-full object-contain"
												/>
											{:else}
												<span
													class="text-xl"
													role="img"
													aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_file_type_icon()}
												>
													{getFileIcon(fileMetadata.mimeType)}
												</span>
											{/if}
										</div>

										<!-- Position step indicator -->
										{#if mediaFile.isFromPositionStep}
											<div
												class="bg-primary text-primary-content absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs"
											>
												{m.report_components_form_fields_dropzoneenhanced_text_position()}
											</div>
										{/if}

										{#await mediaFile.uploadedFile}
											<!-- Loading spinner overlay. Liegt über der hochgeladenen Bildvorschau,
											     also über fremdem Inhalt: bg-scrim/<n> und text-on-scrim
											     (--scrim-surface in tokens.css). -->
											<div
												class="bg-scrim/60 absolute inset-0 flex items-center justify-center rounded"
											>
												<div class="loading loading-spinner loading-sm text-on-scrim"></div>
											</div>

											<!-- Prozent statt „Upload…": Bei einem Video von 100 MB steht der
											     Spinner sonst minutenlang unverändert da, und der Melder hält
											     die Übertragung für hängengeblieben. -->
											<div
												class="bg-info text-info-content absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs tabular-nums"
											>
												{mediaFile.uploadPercent !== undefined
													? `${mediaFile.uploadPercent} %`
													: 'Upload…'}
											</div>

											{#if mediaFile.abortUpload}
												<!-- Kein `min-h-11 min-w-11` nötig: `.btn-circle` bezieht das
												     44-px-Touch-Target bereits zentral aus app.css
												     (Touch-Targets-Block). -->
												<button
													type="button"
													class="btn btn-circle btn-sm btn-ghost text-on-scrim absolute right-1 bottom-1"
													onclick={() => mediaFile.abortUpload?.()}
													aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_upload_von_filename_abbrechen(
														{ fileName: mediaFile.fileName }
													)}
												>
													<Icon icon="lucide:x" width="16" aria-hidden="true" />
												</button>
											{/if}
										{:then}
											<!-- Remove button. `min-h-11 min-w-11` hält das 44-px-Touch-Target
											     (design-system.md); der Button ist absolut positioniert und
											     kann das Datei-Grid in Schritt 2 deshalb nicht umbrechen.
											     `btn-error:hover` war eine tote Klasse — diese Schreibweise
											     erzeugt Tailwind nicht (Variante wäre `hover:…`). -->
											<button
												type="button"
												class="btn btn-circle btn-sm btn-error text-error-content absolute -top-2 -right-2 min-h-11 min-w-11"
												onclick={() => handleFileRemoved(mediaFile.uid)}
												aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_datei_entfernen()}
											>
												<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M6 18L18 6M6 6l12 12"
													></path>
												</svg>
											</button>
										{/await}
									</div>
								{/await}
								<!-- File Info -->
								<div class="mt-2">
									<h4 class="truncate text-xs font-medium" title={mediaFile.fileName}>
										{mediaFile.fileName}
									</h4>
									<p class="text-base-content/60 text-xs">
										{formatFileSize(mediaFile.size)}
									</p>
								</div>

								{#await mediaFile.metadata then fileMetadata}
									<!-- GPS Info -->
									{#if fileMetadata.exifData?.latitude && fileMetadata.exifData?.longitude}
										<div class="bg-success/10 mt-1 rounded p-1.5">
											<div class="flex items-center gap-1">
												<Icon icon="lucide:map-pin" width="12" class="text-success-strong" />
												<span class="text-success-strong text-xs font-medium"
													>{m.report_components_form_fields_dropzoneenhanced_text_gps()}</span
												>
												{#if isInBalticArea(fileMetadata.exifData.longitude, fileMetadata.exifData.latitude)}
													<span class="badge badge-success badge-xs"
														>{m.report_components_form_fields_dropzoneenhanced_text_ostsee()}</span
													>
												{:else}
													<span class="badge badge-warning badge-xs"
														>{m.report_components_form_fields_dropzoneenhanced_text_ausserhalb()}</span
													>
												{/if}
											</div>
											<!-- Koordinaten sind Fließtext auf einem Tint, also base-content:
											     text-success misst 3,81:1 und unter /80 noch weniger. Die
											     Statusfarbe trägt hier das Icon und die Beschriftung darüber
											     (design-system.md, „Die *-content-Regel"). -->
											<p class="text-base-content/70 mt-0.5 text-xs">
												{formatLocation(
													fileMetadata.exifData.longitude,
													fileMetadata.exifData.latitude
												)}
											</p>
										</div>
									{:else if fileMetadata.mimeType.startsWith('image/')}
										<div class="bg-base-300/50 mt-1 rounded p-1.5">
											<p class="text-base-content/60 flex items-center gap-1 text-xs">
												<Icon icon="lucide:map-pin" width="12" class="text-base-content/60" />
												{m.report_components_form_fields_dropzoneenhanced_text_keine_gps_daten()}
											</p>
										</div>
									{/if}

									<!-- Additional EXIF Info -->
									{#if mediaFile.timestamp}
										<div class="mt-1">
											<p class="text-base-content/60 flex items-center gap-1 text-xs">
												<Icon icon="lucide:calendar" width="12" height="12" class="text-primary" />
												{mediaFile.timestamp.toLocaleString(aufnahmeLocale, {
													timeZone: 'Europe/Berlin'
												})}
											</p>
										</div>
									{/if}
								{/await}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<!-- Map View (when GPS data available) or Preview/Dropzone -->
	{#if isPositionStep && positionMediaFile}
		{#await positionMediaFile.metadata}
			<!-- Loading state while metadata is being extracted -->
			<div class="bg-base-100 border-base-300 rounded-lg border p-4">
				<div
					class="flex items-center justify-center gap-2 py-8"
					role="status"
					aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_analysiere_bilddaten()}
				>
					<div class="loading loading-spinner loading-md text-primary"></div>
					<span class="text-base-content/60 text-sm"
						>{m.report_components_form_fields_dropzoneenhanced_text_analysiere_bilddaten()}</span
					>
				</div>
			</div>
		{:then positionMediafileMetadata}
			{#if positionMediafileMetadata.exifData?.latitude && positionMediafileMetadata.exifData?.longitude}
				{#if showPositionMap}
					<!-- Map Display with GPS Position -->
					<div class="bg-base-100 border-base-300 rounded-lg border p-4">
						<!-- `flex-wrap gap-2`: Die Zeile trägt drei Elemente, darunter ein
						     `text-nowrap`-Badge mit den Koordinaten. Seit der Button auf
						     `btn-sm` steht, passt sie auf schmalen Geräten nicht mehr
						     zwingend in eine Zeile — ohne Umbruch liefe sie über. -->
						<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<Icon icon="lucide:map-pin" class="text-success-strong h-[18px] w-[18px]" />
								<h4 class="text-sm font-semibold">
									{m.report_components_form_fields_dropzoneenhanced_text_gps_position()}
								</h4>
							</div>
							<div class="badge badge-success badge-sm text-nowrap">
								{formatLocation(
									positionMediafileMetadata.exifData?.longitude,
									positionMediafileMetadata.exifData?.latitude
								)}
							</div>
							{#await positionMediaFile.uploadedFile}
								<div class="loading loading-spinner loading-sm text-primary">
									{m.report_components_form_fields_dropzoneenhanced_text_upload_laeuft_im_hintergrund()}
								</div>
							{:then}
								<!-- `min-h-11` hält das 44-px-Touch-Target (design-system.md). -->
								<button
									type="button"
									class="btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content min-h-11"
									onclick={handleClear}
								>
									{m.report_components_form_fields_dropzoneenhanced_text_neu_auswaehlen()}
								</button>
							{/await}
						</div>

						<div
							class="bg-base-200 border-base-300 overflow-hidden rounded-lg border"
							style="height: 300px;"
						>
							<OLMap
								latitude={positionMediafileMetadata.exifData.latitude!}
								longitude={positionMediafileMetadata.exifData.longitude!}
								zoom={13}
								readonly={true}
								--map-height="300px"
							/>
						</div>

						{#if positionMediaFile.timestamp}
							<div class="mt-3 text-center">
								<p class="text-base-content/60 flex items-center justify-center gap-1 text-xs">
									<Icon icon="lucide:calendar" width="12" height="12" class="text-primary" />
									{m.report_components_form_fields_dropzoneenhanced_text_aufnahmezeit()}
									{positionMediaFile.timestamp.toLocaleString(aufnahmeLocale, {
										timeZone: 'Europe/Berlin'
									})}
								</p>
							</div>
						{/if}

						<!-- Show upload progress if still uploading -->
						{#await positionMediaFile.uploadedFile}
							<div
								class="mt-3 flex items-center justify-center gap-2"
								role="status"
								aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_upload_laeuft()}
							>
								<div class="loading loading-spinner loading-sm"></div>
								<span class="text-base-content/60 text-sm"
									>{m.report_components_form_fields_dropzoneenhanced_text_upload_laeuft_im_hintergrund_2()}</span
								>
							</div>
						{/await}
					</div>
				{:else}
					<!-- Kompakte Bestätigungszeile (Zustand B der Spezifikation): Miniaturbild,
					     Dateiname, eine Zeile über das Übernommene, Entfernen. Die Karte
					     zeigt der Aufrufer — genau einmal und interaktiv. -->
					<div
						class="bg-base-100 border-base-300 flex items-center gap-3 rounded-lg border p-3"
						data-testid="photo-position-summary"
					>
						{#if positionMediaFile.thumbnail}
							<img
								src={positionMediaFile.thumbnail}
								alt={positionMediaFile.fileName}
								class="bg-base-200 h-12 w-12 shrink-0 rounded object-cover"
							/>
						{:else}
							<div class="bg-base-200 flex h-12 w-12 shrink-0 items-center justify-center rounded">
								<Icon
									aria-hidden="true"
									icon="lucide:image"
									width="20"
									class="text-base-content/60"
								/>
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium" title={positionMediaFile.fileName}>
								{positionMediaFile.fileName}
							</p>
							<!-- Tint-freie Fläche, trotzdem `text-base-content`: Die Statusfarbe
							     trägt allein das Icon (design-system.md). -->
							<p class="text-base-content/70 flex items-center gap-1 text-xs">
								<Icon
									aria-hidden="true"
									icon="lucide:check"
									width="14"
									class="text-success-strong shrink-0"
								/>
								{m.report_components_form_fields_dropzoneenhanced_text_position_datum_und_uhrzeit_aus()}
							</p>
						</div>

						{#await positionMediaFile.uploadedFile}
							<div
								class="loading loading-spinner loading-sm text-primary shrink-0"
								role="status"
								aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_upload_laeuft_2()}
							></div>
						{:then}
							<!-- `min-h-11` hält das 44-px-Touch-Target (design-system.md). -->
							<button
								type="button"
								class="btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content min-h-11 shrink-0"
								onclick={handleClear}
							>
								{m.report_components_form_fields_dropzoneenhanced_text_neu_auswaehlen_2()}
							</button>
						{/await}
					</div>
				{/if}
			{:else}
				<!-- Image uploaded but no GPS data - show preview with info -->
				<div class="bg-base-100 border-base-300 rounded-lg border p-4">
					<div class="mb-3 flex items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<Icon icon="lucide:image" class="text-primary h-[18px] w-[18px]" />
							<h4 class="text-sm font-semibold">
								{m.report_components_form_fields_dropzoneenhanced_text_foto_hochgeladen()}
							</h4>
						</div>
						{#await positionMediaFile.uploadedFile}
							<div class="loading loading-spinner loading-sm text-primary"></div>
						{:then}
							<!-- `min-h-11` hält das 44-px-Touch-Target (design-system.md). -->
							<button
								type="button"
								class="btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content min-h-11"
								onclick={handleClear}
							>
								{m.report_components_form_fields_dropzoneenhanced_text_neu_auswaehlen_3()}
							</button>
						{/await}
					</div>

					<!-- Thumbnail preview -->
					{#if positionMediaFile.thumbnail}
						<div
							class="bg-base-200 flex h-40 items-center justify-center overflow-hidden rounded-lg"
						>
							<img
								src={positionMediaFile.thumbnail}
								alt={positionMediaFile.fileName}
								class="h-full w-full object-contain"
							/>
						</div>
					{/if}

					<!-- Warning: No GPS data — entfällt, wenn der Aufrufer den Fall selbst
					     erklärt (siehe Prop `showNoGpsWarning`). -->
					{#if showNoGpsWarning}
						<div class="alert alert-warning mt-3">
							<Icon icon="lucide:map-pin-off" width="20" />
							<div>
								<h4 class="font-medium">
									{m.report_components_form_fields_dropzoneenhanced_text_keine_gps_daten_im_foto()}
								</h4>
								<p class="text-sm">
									{m.report_components_form_fields_dropzoneenhanced_text_bitte_waehlen_sie_die_position()}
								</p>
							</div>
						</div>
					{/if}

					{#if positionMediaFile.timestamp}
						<div class="mt-3 text-center">
							<p class="text-base-content/60 flex items-center justify-center gap-1 text-xs">
								<Icon icon="lucide:calendar" width="12" height="12" class="text-primary" />
								{m.report_components_form_fields_dropzoneenhanced_text_aufnahmezeit()}
								{positionMediaFile.timestamp.toLocaleString(aufnahmeLocale, {
									timeZone: 'Europe/Berlin'
								})}
							</p>
						</div>
					{/if}

					<!-- Show upload progress if still uploading -->
					{#await positionMediaFile.uploadedFile}
						<div
							class="mt-3 flex items-center justify-center gap-2"
							role="status"
							aria-label={m.report_components_form_fields_dropzoneenhanced_aria_label_upload_laeuft_3()}
						>
							<div class="loading loading-spinner loading-sm"></div>
							<span class="text-base-content/60 text-sm"
								>{m.report_components_form_fields_dropzoneenhanced_text_upload_laeuft_im_hintergrund_3()}</span
							>
						</div>
					{/await}
				</div>
			{/if}
		{:catch}
			<!-- Ohne diesen Zweig schlägt eine abgelehnte Metadaten-Promise als
			     Svelte-Fehler durch (plus unbehandelte Rejection) und der Nutzer sieht
			     gar nichts. Die Datei selbst ist da — was fehlt, sind nur die
			     EXIF-Angaben. Deshalb Hinweis statt Abbruch, mit demselben Ausweg wie
			     im GPS-losen Fall. -->
			<div class="alert alert-warning" role="status" data-testid="photo-analysis-failed">
				<Icon aria-hidden="true" icon="lucide:circle-alert" width="20" class="shrink-0" />
				<div>
					<p class="text-sm">
						{m.report_components_form_fields_dropzoneenhanced_text_die_bilddaten_dieses_fotos_konnten()}
					</p>
					<div class="mt-3">
						<button
							type="button"
							class="btn btn-outline btn-sm min-h-11"
							onclick={handleClear}
							data-testid="photo-analysis-failed-reset"
						>
							{m.report_components_form_fields_dropzoneenhanced_text_neu_auswaehlen_4()}
						</button>
					</div>
				</div>
			</div>
		{/await}
	{:else}
		<!-- Unified Dropzone

		     `title` rechnet mit `ownedMediaFiles` wie das Datei-Limit oben: Über den
		     ganzen Store gezählt hieß die Fläche im Positions-Schritt „Foto
		     ersetzen", sobald irgendwo ein Medium aus Schritt 2 lag — auch wenn
		     dieser Schritt gar kein Foto hat. Das trifft nicht nur die Beschriftung,
		     sondern über `zoneTriggerAttributes` auch den zugänglichen Namen der
		     Fläche (WCAG 4.1.2). -->
		<UnifiedDropzone
			{config}
			{actionLabel}
			{compact}
			bind:files={dropzoneFiles}
			onFilesAdded={handleFilesAdded}
			onFileRemoved={handleFileRemoved}
			onClear={handleClear}
			multiple={!isSingleFileMode}
			title={title ||
				(ownedMediaFiles.length > 0
					? isSingleFileMode
						? m.report_components_form_fields_dropzoneenhanced_title_foto_ersetzen()
						: m.report_components_form_fields_dropzoneenhanced_title_weitere_dateien_hinzufuegen()
					: isSingleFileMode
						? m.report_components_form_fields_dropzoneenhanced_title_foto_hochladen()
						: m.report_components_form_fields_dropzoneenhanced_title_medien_hochladen())}
			{additionalText}
			showPreview={false}
		/>
	{/if}
</div>
