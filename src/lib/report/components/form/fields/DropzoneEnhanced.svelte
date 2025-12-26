<script lang="ts">
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
	import UnifiedDropzone from '$lib/components/form/UnifiedDropzone.svelte';
	import OLMap from '$lib/components/map/OLMap.svelte';
	import { createLogger } from '$lib/logger';
	import { getFormContext } from '$lib/report/formContext';
	import { createToast } from '$lib/stores/toastState';
	import type { UploadedFileInfo, ValidationPreset } from '$lib/types';
	import { deleteFileDirect } from '$lib/utils';
	import { formatFileSize } from '$lib/utils/file/fileSize';
	import { getFileIcon } from '$lib/utils/file/fileType';
	import { splitDateTime } from '$lib/utils/format/dateTime';
	import { formatLocation } from '$lib/utils/format/formatLocation';
	import { isInBalticArea } from '$lib/utils/geo/checkBalticSea';
	import { MediaFile } from '$lib/utils/media/MediaFile';
	import { deleteMultipleFiles } from '$lib/utils/upload/fileProcessing';

	import Icon from '$lib/components/Icon.svelte';

	const logger = createLogger('DropzoneEnhanced');
	let { form, handleChange, mediaStore } = getFormContext();

	// Component Props
	let {
		referenceId, // Eindeutige ID für Upload-Referenz (meist sighting.tempId)
		maxFiles = 10, // Maximale Anzahl erlaubter Dateien
		config, // Datei-Validierungskonfiguration (Größe, Typen, etc.)
		enableGPSExtraction = false, // GPS-Extraktionsmodus aktivieren (für Position-Schritt)
		title, // Optionaler Titel für die Dropzone
		additionalText = 'GPS-Daten werden beim Upload verarbeitet'
	} = $props<{
		referenceId: string;
		maxFiles?: number;
		config: ValidationPreset;
		enableGPSExtraction?: boolean;
		title?: string;
		additionalText?: string;
	}>();

	// Lokaler State für Dropzone-Dateien (temporär während des Drag & Drop)
	let dropzoneFiles = $state<File[]>([]);

	// Modus-Bestimmung basierend auf maxFiles
	const isSingleFileMode = maxFiles === 1;
	const isPositionStep = enableGPSExtraction && isSingleFileMode;

	// Initialisierung der Upload-Map mit bestehenden Formulardaten
	let uploadedFiles = $derived($form.uploadedFiles);

	// Direkte Referenz auf mediaStore.mediaFiles für Reaktivität
	// WICHTIG: Nicht als $derived definieren, da wir den Store direkt mutieren müssen
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

		uploadedFiles.forEach((uf) => {
			if (!currentMediaFiles.some((mf) => mf.uid === uf.uid)) {
				updatedFiles.push(MediaFile.fromUploadedFile(uf, referenceId));
				hasChanges = true;
			}
		});

		if (hasChanges) {
			updateMediaFiles(updatedFiles);
		}
	});

	// Mediafile für Positionsdaten - bevorzuge Dateien mit GPS, aber zeige auch erste Datei ohne GPS
	let positionMediaFile = $derived(
		mediaFiles.find((mf) => mf.hasPosition()) ?? (isPositionStep ? mediaFiles[0] : undefined)
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
		triggerChange('uploadedFiles', uploadedFiles);
	}

	$effect(() => {
		if (positionMediaFile) {
			if (positionMediaFile.exifData?.latitude && positionMediaFile.exifData?.longitude) {
				triggerChange('latitude', positionMediaFile.exifData.latitude.toFixed(4));
				triggerChange('longitude', positionMediaFile.exifData.longitude.toFixed(4));
			}
			const timestamp = positionMediaFile.timestamp;
			if (timestamp) {
				const { date: sightingDate, time: sightingTime } = splitDateTime(timestamp);
				logger.info({ sightingDate, sightingTime }, 'New sighting data extracted');
				triggerChange('sightingDate', sightingDate);
				triggerChange('sightingTime', sightingTime);
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
		if (isSingleFileMode && mediaFiles.length > 0) {
			createToast('info', 'Nur eine Datei erlaubt. Bestehende Datei wird ersetzt.');
			await handleClear();
		}

		// Datei-Limit prüfen und ggf. beschränken
		const currentCount = mediaFiles?.length || 0;
		const allowedCount = Math.min(newFiles.length, maxFiles - currentCount);
		const filesToProcess = newFiles.slice(0, allowedCount);

		if (filesToProcess.length < newFiles.length) {
			createToast(
				'warning',
				`Nur ${allowedCount} von ${newFiles.length} Dateien können hinzugefügt werden (Maximum: ${maxFiles}).`
			);
		}

		if (filesToProcess.length === 0) return;

		// Add new files to mediaFiles and process them
		const newMediaFiles = filesToProcess.map((file) => {
			const mediaFile = MediaFile.createMediaFile(referenceId, file, isPositionStep);
			mediaFile.uploadedFile
				.then((uploadedFile) => {
					// Update form data
					addUploadedFile(uploadedFile);
					createToast('success', 'Datei erfolgreich hochgeladen.');
				})
				.catch((error) => {
					logger.error({ error }, 'Fehler beim Hochladen der Datei.');
					deleteFile(mediaFile.uid);
					createToast('error', 'Fehler beim Hochladen der Datei');
				});
			// Trigger positionMediaFile update when metadata is ready
			mediaFile.metadata.then(() => {
				// Trigger store update to refresh derived values
				if (!positionMediaFile && mediaFile.hasPosition()) {
					updateMediaFiles([...mediaStore.mediaFiles]);
				}
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
	 * 4. User-Feedback
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
				createToast('success', 'Datei erfolgreich gelöscht.');
			}
		} catch (error) {
			logger.info({ error }, 'Fehler beim Löschen der Datei vom Server.');
			createToast('error', 'Fehler beim Löschen der Datei.');
		}
	}

	/**
	 * Löscht alle Dateien und setzt den Komponenten-State zurück
	 *
	 * Aufräum-Schritte:
	 * 1. Object URLs freigeben (Memory Leaks vermeiden)
	 * 2. Alle Dateien vom Server löschen
	 * 3. UI-State komplett zurücksetzen
	 * 4. GPS-Formulardaten löschen (im GPS-Modus)
	 */
	function handleClear() {
		try {
			dropzoneFiles = [];

			// Clear media files im Store
			updateMediaFiles([]);

			// Alle hochgeladenen Dateien vom Server löschen
			deleteMultipleFiles(uploadedFiles);

			// Clear uploaded files
			uploadedFiles = [];

			triggerChange('uploadedFiles', uploadedFiles);
			createToast('success', 'Alle Dateien erfolgreich gelöscht.');
		} catch (_error) {
			createToast('error', 'Fehler beim Löschen aller Dateien.');
		}
	}
</script>

<div class="space-y-4">
	<!-- Enhanced Preview Section mit EXIF-Daten (only for non-GPS mode or multiple files) -->
	{#if !isPositionStep && mediaFiles && mediaFiles.length > 0}
		<div class="bg-base-200 rounded-lg p-4">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-sm font-semibold">
					{mediaFiles.length} Datei{mediaFiles.length !== 1 ? 'en' : ''}
					<!-- {previewFiles.length > 0 ? '(wird verarbeitet...)' : 'hochgeladen'} -->
				</h3>
				<button
					type="button"
					class="btn btn-ghost btn-xs text-error hover:bg-error hover:text-white"
					onclick={handleClear}
				>
					Alle löschen
				</button>
			</div>

			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<!-- Uploaded files -->
				{#each mediaFiles as mediaFile (mediaFile.uid)}
					<!-- Media File Card -->
					{#if mediaFile}
						<div class="card bg-base-100 shadow-sm">
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
												<span class="text-xl" role="img" aria-label="File type icon">
													{getFileIcon(fileMetadata.mimeType)}
												</span>
											{/if}
										</div>

										<!-- Position step indicator -->
										{#if mediaFile.isFromPositionStep}
											<div
												class="bg-primary text-primary-content absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs"
											>
												Position
											</div>
										{/if}

										{#await mediaFile.uploadedFile}
											<!-- Loading spinner overlay -->
											<div
												class="absolute inset-0 flex items-center justify-center rounded bg-black/30"
											>
												<div class="loading loading-spinner loading-sm text-white"></div>
											</div>

											<!-- Upload progress indicator -->
											<div
												class="bg-info text-info-content absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs"
											>
												Upload...
											</div>
										{:then}
											<!-- Remove button -->
											<button
												type="button"
												class="btn btn-circle btn-xs btn-error btn-error:hover absolute -top-2 -right-2 text-white"
												onclick={() => handleFileRemoved(mediaFile.uid)}
												aria-label="Datei entfernen"
											>
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
												<Icon icon="lucide:map-pin" width="12" class="text-success" />
												<span class="text-success text-xs font-medium">GPS</span>
												{#if isInBalticArea(fileMetadata.exifData.longitude, fileMetadata.exifData.latitude)}
													<span class="badge badge-success badge-xs">Ostsee</span>
												{:else}
													<span class="badge badge-warning badge-xs">Außerhalb</span>
												{/if}
											</div>
											<p class="text-success/80 mt-0.5 text-xs">
												{formatLocation(
													fileMetadata.exifData.longitude,
													fileMetadata.exifData.latitude
												)}
											</p>
										</div>
									{:else if fileMetadata.mimeType.startsWith('image/')}
										<div class="bg-base-300/50 mt-1 rounded p-1.5">
											<p class="text-base-content/60 text-xs flex items-center gap-1">
										<Icon icon="lucide:map-pin" width="12" class="text-base-content/60" />
										Keine GPS-Daten
									</p>
										</div>
									{/if}

									<!-- Additional EXIF Info -->
									{#if mediaFile.timestamp}
										<div class="mt-1">
											<p class="text-base-content/60 text-xs flex items-center gap-1">
												<Icon icon="lucide:calendar" width="12" height="12" class="text-primary" />
												{mediaFile.timestamp.toLocaleString('de-DE')}
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
				<div class="flex items-center justify-center gap-2 py-8">
					<div class="loading loading-spinner loading-md text-primary"></div>
					<span class="text-base-content/60 text-sm">Analysiere Bilddaten...</span>
				</div>
			</div>
		{:then positionMediafileMetadata}
			{#if positionMediafileMetadata.exifData?.latitude && positionMediafileMetadata.exifData?.longitude}
				<!-- Map Display with GPS Position -->
				<div class="bg-base-100 border-base-300 rounded-lg border p-4">
					<div class="mb-3 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Icon icon="lucide:map-pin" class="h-[18px] w-[18px] text-success" />
							<h4 class="text-sm font-semibold">GPS-Position</h4>
						</div>
						<div class="badge badge-success badge-sm text-nowrap">
							{formatLocation(
								positionMediafileMetadata.exifData?.longitude,
								positionMediafileMetadata.exifData?.latitude
							)}
						</div>
						{#await positionMediaFile.uploadedFile}
							<div class="loading loading-spinner loading-sm text-primary">
								Upload läuft im Hintergrund...
							</div>
						{:then}
							<button
								type="button"
								class="btn btn-ghost btn-xs text-error hover:bg-error hover:text-white"
								onclick={handleClear}
							>
								Neu auswählen
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
							<p class="text-base-content/60 text-xs flex items-center justify-center gap-1">
								<Icon icon="lucide:calendar" width="12" height="12" class="text-primary" />
								Aufnahmezeit: {positionMediaFile.timestamp.toLocaleString('de-DE')}
							</p>
						</div>
					{/if}

					<!-- Show upload progress if still uploading -->
					{#await positionMediaFile.uploadedFile}
						<div class="mt-3 flex items-center justify-center gap-2">
							<div class="loading loading-spinner loading-sm"></div>
							<span class="text-base-content/60 text-sm">Upload läuft im Hintergrund...</span>
						</div>
					{/await}
				</div>
			{:else}
				<!-- Image uploaded but no GPS data - show preview with info -->
				<div class="bg-base-100 border-base-300 rounded-lg border p-4">
					<div class="mb-3 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Icon icon="lucide:image" class="h-[18px] w-[18px] text-primary" />
							<h4 class="text-sm font-semibold">Foto hochgeladen</h4>
						</div>
						{#await positionMediaFile.uploadedFile}
							<div class="loading loading-spinner loading-sm text-primary"></div>
						{:then}
							<button
								type="button"
								class="btn btn-ghost btn-xs text-error hover:bg-error hover:text-white"
								onclick={handleClear}
							>
								Neu auswählen
							</button>
						{/await}
					</div>

					<!-- Thumbnail preview -->
					{#if positionMediaFile.thumbnail}
						<div class="bg-base-200 flex h-40 items-center justify-center overflow-hidden rounded-lg">
							<img
								src={positionMediaFile.thumbnail}
								alt={positionMediaFile.fileName}
								class="h-full w-full object-contain"
							/>
						</div>
					{/if}

					<!-- Warning: No GPS data -->
					<div class="alert alert-warning mt-3">
						<Icon icon="lucide:map-pin-off" width="20" />
						<div>
							<h4 class="font-medium">Keine GPS-Daten im Foto</h4>
							<p class="text-sm">
								Bitte wählen Sie die Position manuell auf der Karte oder laden Sie ein Foto mit GPS-Daten hoch.
							</p>
						</div>
					</div>

					{#if positionMediaFile.timestamp}
						<div class="mt-3 text-center">
							<p class="text-base-content/60 text-xs flex items-center justify-center gap-1">
								<Icon icon="lucide:calendar" width="12" height="12" class="text-primary" />
								Aufnahmezeit: {positionMediaFile.timestamp.toLocaleString('de-DE')}
							</p>
						</div>
					{/if}

					<!-- Show upload progress if still uploading -->
					{#await positionMediaFile.uploadedFile}
						<div class="mt-3 flex items-center justify-center gap-2">
							<div class="loading loading-spinner loading-sm"></div>
							<span class="text-base-content/60 text-sm">Upload läuft im Hintergrund...</span>
						</div>
					{/await}
				</div>
			{/if}
		{/await}
	{:else}
		<!-- Unified Dropzone -->
		<UnifiedDropzone
			{config}
			bind:files={dropzoneFiles}
			onFilesAdded={handleFilesAdded}
			onFileRemoved={handleFileRemoved}
			onClear={handleClear}
			multiple={!isSingleFileMode}
			title={title ||
				(mediaFiles && mediaFiles.length > 0
					? isSingleFileMode
						? 'Foto ersetzen'
						: 'Weitere Dateien hinzufügen'
					: isSingleFileMode
						? 'Foto hochladen'
						: 'Medien hochladen')}
			{additionalText}
			showPreview={false}
		/>
	{/if}
</div>
