<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import type { SightingFile } from '#lib/types/index.ts';
	import type { UploadedFileInfo } from '#lib/types//index.ts';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
	import { formatLocation } from '#lib/utils/format/formatLocation.ts';
	import Icon from '#lib/components/Icon.svelte';

	let {
		file,
		onClose
	}: {
		file: SightingFile | UploadedFileInfo;
		onClose: () => void;
	} = $props();

	let modalElement: HTMLDialogElement;

	function isImage(mimeType: string): boolean {
		return mimeType.startsWith('image/');
	}

	function isVideo(mimeType: string): boolean {
		return mimeType.startsWith('video/');
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function handleModalClick(event: MouseEvent) {
		// Schließe Modal nur wenn auf Backdrop geklickt wird
		if (event.target === modalElement) {
			onClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	// Modal automatisch öffnen
	$effect(() => {
		if (modalElement) {
			modalElement.showModal();
		}
	});

	function hasGPSData(): boolean {
		return !!(file.exifData?.latitude && file.exifData?.longitude);
	}

	function hasCameraData(): boolean {
		return !!(
			file.exifData?.make ||
			file.exifData?.model ||
			file.exifData?.exposureTime ||
			file.exifData?.fNumber ||
			file.exifData?.iso
		);
	}

	function formatCaptureDateTime(): string {
		if (!file.exifData?.dateTimeOriginal) return '';
		return formatLocalDateTime(file.exifData.dateTimeOriginal);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal -->
<dialog
	bind:this={modalElement}
	class="modal"
	onclick={handleModalClick}
	aria-labelledby="modal-title"
	aria-describedby="modal-description"
>
	<!-- `contrast-more:` statt eines @media-Blocks im Style-Block: Beides sind reine
	     Utilities (Rahmenbreite am Dialog, Rahmenfarbe an Kopf- und Fußleiste), und
	     die Variante erzeugt `prefers-contrast: more` — den Wert, den die Engines
	     auswerten. Bis 2026-08-09 stand das unter `prefers-contrast: high`; `high`
	     war der Entwurfsname des Merkmals und greift nirgends (gemessen in Chromium
	     151 und WebKit 26.5, Beleg in e2e/helpers/bannedMediaFeatures.ts). Mit dem
	     Umzug entfällt die Klasse `modal-section`: Sie existierte nur als Anker für
	     jene Regel — die Leisten stehen im Markup direkt nebeneinander, die beiden
	     EXIF-Kästchen im Inneren (ebenfalls bg-base-200, aber ohne Rahmen) bleiben
	     wie zuvor unberührt. -->
	<div
		class="modal-box flex max-h-[90vh] w-11/12 max-w-6xl flex-col overflow-hidden p-0 contrast-more:border-2"
	>
		<!-- Modal Header -->
		<div
			class="bg-base-200 border-base-300 flex items-center justify-between border-b p-4 contrast-more:border-current"
		>
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<Icon icon="lucide:file-type" width="20" class="text-primary flex-shrink-0" />
				<div class="min-w-0 flex-1">
					<h3 id="modal-title" class="text-base-content truncate text-lg font-bold">
						{file.originalName}
					</h3>
					<p id="modal-description" class="text-base-content/60 text-sm">
						{file.mimeType} • {formatFileSize(file.size)}
					</p>
				</div>
			</div>
			<div class="flex flex-shrink-0 items-center gap-2">
				<a
					href={`/api/media/${file.filePath}`}
					download={file.originalName}
					class="btn btn-ghost btn-sm"
					aria-label={m.components_media_mediamodal_aria_label_datei_herunterladen()}
				>
					<Icon icon="lucide:download" width="16" />
					{m.components_media_mediamodal_text_herunterladen()}
				</a>
				<button
					type="button"
					class="btn btn-ghost btn-sm btn-circle"
					onclick={onClose}
					aria-label={m.components_media_mediamodal_aria_label_modal_schliessen()}
				>
					<Icon icon="lucide:x" width="16" />
				</button>
			</div>
		</div>

		<!-- Modal Content -->
		<div class="flex-1 overflow-y-auto">
			<div class="p-4">
				{#if isImage(file.mimeType)}
					<!-- Bild anzeigen -->
					<div class="bg-base-100 flex justify-center overflow-hidden rounded-lg">
						<img
							src={`/api/media/${file.filePath}`}
							alt={file.originalName}
							class="max-h-[50vh] max-w-full object-contain"
							loading="lazy"
							onerror={(e) => {
								console.error('Modal image loading failed:', file.filePath, e);
								// Fallback to original URL if secure endpoint fails
								const img = e.target as HTMLImageElement;
								if (!img.src.includes('fallback=true')) {
									img.src = `${file.url}?fallback=true`;
								}
							}}
						/>
					</div>
				{:else if isVideo(file.mimeType)}
					<!-- Video anzeigen -->
					<div class="bg-base-100 flex justify-center overflow-hidden rounded-lg">
						<video
							src={`/api/media/${file.filePath}`}
							controls
							class="max-h-[50vh] max-w-full"
							preload="metadata"
						>
							<track kind="captions" />
							{m.components_media_mediamodal_text_ihr_browser_unterstuetzt_das_video_eleme()}
						</video>
					</div>
				{:else}
					<!-- Andere Dateitypen - Vorschau nicht möglich -->
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<Icon icon="lucide:file-type" width="48" class="text-base-content/70 mb-4" />
						<h4 class="mb-2 text-lg font-semibold">
							{m.components_media_mediamodal_text_vorschau_nicht_verfuegbar()}
						</h4>
						<p class="text-base-content/60 mb-4">
							{m.components_media_mediamodal_text_fuer_diesen_dateityp_ist_keine()}
						</p>
						<a
							href={`/api/media/${file.filePath}`}
							download={file.originalName}
							class="btn btn-primary"
						>
							<Icon icon="lucide:download" width="16" />
							{m.components_media_mediamodal_text_datei_herunterladen()}
						</a>
					</div>
				{/if}
			</div>
		</div>

		<!-- Modal Footer -->
		<div class="bg-base-200 border-base-300 space-y-4 border-t p-4 contrast-more:border-current">
			<!-- Basis-Informationen -->
			<div class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
				<div class="flex items-center gap-2">
					<Icon icon="lucide:file-type" width="14" class="text-base-content/60" />
					<span class="text-base-content/60">{m.components_media_mediamodal_text_typ()}</span>
					<span class="font-medium">{file.mimeType}</span>
				</div>
				<div class="flex items-center gap-2">
					<Icon icon="lucide:hard-drive" width="14" class="text-base-content/60" />
					<span class="text-base-content/60">{m.components_media_mediamodal_text_groesse()}</span>
					<span class="font-medium">{formatFileSize(file.size)}</span>
				</div>
				<div class="flex items-center gap-2">
					<Icon icon="lucide:calendar" width="14" class="text-base-content/60" />
					<span class="text-base-content/60"
						>{m.components_media_mediamodal_text_hochgeladen()}</span
					>
					<span class="font-medium"
						>{file.uploadedAt ? formatLocalDateTime(file.uploadedAt) : 'Unbekannt'}</span
					>
				</div>
			</div>

			<!-- EXIF-Informationen für Bilder -->
			{#if file.exifData && isImage(file.mimeType)}
				<div class="border-base-300 border-t pt-4">
					<div class="collapse-arrow bg-base-100 collapse">
						<input type="checkbox" class="peer" />
						<h4 class="collapse-title flex items-center gap-2 text-sm font-semibold">
							<Icon icon="lucide:camera" width="16" class="text-primary" />
							{m.components_media_mediamodal_text_exif_daten()}
							{#if hasGPSData()}
								<span class="badge badge-success badge-xs ml-2"
									>{m.components_media_mediamodal_text_gps()}</span
								>
							{/if}
							{#if hasCameraData()}
								<span class="badge badge-secondary badge-xs ml-1"
									>{m.components_media_mediamodal_text_kamera_badge()}</span
								>
							{/if}
						</h4>
						<div class="collapse-content">
							<div class="space-y-3 pt-2">
								<!-- GPS-Daten -->
								{#if hasGPSData()}
									<div class="bg-base-200 rounded-lg p-3">
										<h5 class="mb-2 flex items-center gap-1 text-xs font-medium">
											<Icon icon="lucide:map-pin" width="12" class="text-success-strong" />
											{m.components_media_mediamodal_text_gps_position()}
										</h5>
										<div class="space-y-1 text-xs">
											<div>
												<span class="text-base-content/60"
													>{m.components_media_mediamodal_text_koordinaten()}</span
												>
												<span class="ml-1 font-medium"
													>{formatLocation(file.exifData?.longitude, file.exifData?.latitude)}</span
												>
											</div>
											{#if file.exifData.altitude}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_hoehe()}</span
													>
													<span class="ml-1 font-medium">{file.exifData.altitude.toFixed(1)} m</span
													>
												</div>
											{/if}
										</div>
									</div>
								{/if}

								<!-- Kamera-Daten -->
								{#if hasCameraData()}
									<div class="bg-base-200 rounded-lg p-3">
										<h5 class="mb-2 flex items-center gap-1 text-xs font-medium">
											<Icon icon="lucide:settings" width="12" class="text-secondary-strong" />
											{m.components_media_mediamodal_text_kamera_einstellungen()}
										</h5>
										<div class="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
											{#if file.exifData.make || file.exifData.model}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_kamera()}</span
													>
													<span class="ml-1 font-medium"
														>{[file.exifData.make, file.exifData.model]
															.filter(Boolean)
															.join(' ')}</span
													>
												</div>
											{/if}
											{#if file.exifData.dateTimeOriginal}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_aufgenommen()}</span
													>
													<span class="ml-1 font-medium">{formatCaptureDateTime()}</span>
												</div>
											{/if}
											{#if file.exifData.exposureTime}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_belichtung()}</span
													>
													<span class="ml-1 font-medium">{file.exifData.exposureTime}</span>
												</div>
											{/if}
											{#if file.exifData.fNumber}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_blende()}</span
													>
													<span class="ml-1 font-medium">f/{file.exifData.fNumber}</span>
												</div>
											{/if}
											{#if file.exifData.iso}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_iso()}</span
													>
													<span class="ml-1 font-medium">{file.exifData.iso}</span>
												</div>
											{/if}
											{#if file.exifData.focalLength}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_brennweite()}</span
													>
													<span class="ml-1 font-medium"
														>{file.exifData.focalLength}
														{m.components_media_mediamodal_text_mm()}</span
													>
												</div>
											{/if}
											{#if file.exifData.width && file.exifData.height}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_aufloesung()}</span
													>
													<span class="ml-1 font-medium"
														>{file.exifData.width} × {file.exifData.height}</span
													>
												</div>
											{/if}
											{#if file.exifData.flash !== undefined}
												<div>
													<span class="text-base-content/60"
														>{m.components_media_mediamodal_text_blitz()}</span
													>
													<span class="ml-1 font-medium">{file.exifData.flash ? 'Ja' : 'Nein'}</span
													>
												</div>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Backdrop. Schleier über der Seite dahinter, kein Theme-Ton: bg-scrim/<n>
	     (--scrim-surface in tokens.css). -->
	<form method="dialog" class="modal-backdrop bg-scrim/60 backdrop-blur-sm">
		<button
			onclick={onClose}
			aria-label={m.components_media_mediamodal_aria_label_modal_schliessen_2()}
			>{m.components_media_mediamodal_text_schliessen()}</button
		>
	</form>
</dialog>

<style>
	/* Modal styling improvements */
	.modal-box {
		box-shadow: var(--shadow-floating);
	}

	/* Image styling */
	img {
		border-radius: 0.5rem;
		box-shadow: var(--shadow-raised);
	}

	/* Video styling */
	video {
		border-radius: 0.5rem;
		box-shadow: var(--shadow-raised);
	}

	/* Better mobile responsiveness */
	@media (max-width: 640px) {
		.modal-box {
			width: 95%;
			max-width: 95%;
			max-height: 95vh;
		}

		img,
		video {
			max-height: 40vh;
		}

		/* Hier stand `.grid-cols-1 { grid-template-columns: 1fr }` — Tailwinds
		   eigener Wert, auf sich selbst gesetzt, also wirkungslos. Entfernt statt
		   korrigiert: Eine Utility-Klasse im scoped <style> zu überschreiben ist
		   auch dann falsch, wenn es auffällt, weil Svelte daraus `.grid-cols-1.s-xyz`
		   macht und still gegen die Utility-Ebene gewinnt. Wer das Layout hier
		   ändern will, ändert die Klasse im Markup. */
	}

	/* Accessibility improvements */
	@media (prefers-reduced-motion: reduce) {
		.modal-box,
		img,
		video {
			transition: none;
		}
	}

	/* Focus styles */
	button:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
