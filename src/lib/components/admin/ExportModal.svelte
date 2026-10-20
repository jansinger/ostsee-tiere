<script lang="ts">
	import { createToast } from '#lib/stores/toastState.svelte.ts';
	import { createLogger } from '#lib/logger.ts';
	import { downloadHandlers, createTimestampedFilename } from '#lib/utils/download.ts';
	import type { FrontendSighting } from '#lib/types/index.ts';
	import { formatFileSize } from '#lib/utils/file/fileSize.ts';
	import { getActiveFiltersDisplay } from '#lib/components/admin/exportFilterDisplay.ts';
	import Icon from '#lib/components/Icon.svelte';

	const logger = createLogger('ExportModal');

	let {
		show = $bindable(false),
		currentFilters,
		totalRecords
	}: {
		show: boolean;
		currentFilters: Record<string, string | boolean>;
		totalRecords: number;
	} = $props();

	// Reine Funktion (exportFilterDisplay.ts), deshalb $derived statt eines
	// Aufrufs im Markup — sonst liefe sie bei jedem Render erneut.
	let aktiveFilter = $derived(getActiveFiltersDisplay(currentFilters));

	let selectedFormat = $state('csv');
	let isLoading = $state(false);
	let loadedSightings = $state<FrontendSighting[]>([]);
	let error = $state<string | null>(null);

	// Format-spezifische Informationen
	const formatInfo = {
		csv: {
			name: 'CSV',
			description: 'Comma-separated values für Excel, Google Sheets',
			mimeType: 'text/csv',
			icon: 'lucide:bar-chart'
		},
		json: {
			name: 'JSON',
			description: 'JavaScript Object Notation für Entwicklungszwecke',
			mimeType: 'application/json',
			icon: 'lucide:braces'
		},
		xml: {
			name: 'XML',
			description: 'Extensible Markup Language für Datenauswertungen',
			mimeType: 'application/xml',
			icon: 'lucide:file-code'
		},
		kml: {
			name: 'KML',
			description: 'Keyhole Markup Language für Google Earth, Kartenprogramme',
			mimeType: 'application/vnd.google-earth.kml+xml',
			icon: 'lucide:map'
		}
	};

	// Geschätzte Dateigröße berechnen (grober Richtwert)
	function estimateFileSize(format: string, recordCount: number): number {
		const bytesPerRecord = {
			csv: 300, // ~300 bytes pro Zeile CSV
			json: 800, // ~800 bytes pro JSON-Objekt (mehr Metadaten)
			xml: 1200, // ~1.2KB pro XML-Element (viele Tags)
			kml: 600 // ~600 bytes pro KML-Placemark
		};

		return recordCount * (bytesPerRecord[format as keyof typeof bytesPerRecord] || 500);
	}

	// Export-Daten laden mit aktuellen Filtern
	async function loadExportData() {
		isLoading = true;
		error = null;

		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const params = new URLSearchParams();

			// Alle aktuellen Filter zu API-Parametern hinzufügen
			Object.entries(currentFilters).forEach(([key, value]) => {
				if (value && value !== 'all' && value !== '') {
					params.set(key, String(value));
				}
			});

			const response = await fetch(`/api/sightings/export?${params.toString()}`);

			if (!response.ok) {
				throw new Error(`Fehler beim Laden der Export-Daten: ${response.statusText}`);
			}

			const data = await response.json();
			loadedSightings = data.sightings;

			logger.info(
				{
					recordCount: loadedSightings.length,
					filters: currentFilters
				},
				'Export data loaded successfully'
			);
		} catch (err) {
			logger.error(err, 'Failed to load export data');
			error = err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden der Export-Daten';
		} finally {
			isLoading = false;
		}
	}

	// Download ausführen
	async function performDownload() {
		if (loadedSightings.length === 0) {
			createToast('error', 'Keine Daten zum Exportieren vorhanden');
			return;
		}

		try {
			// Generiere Server-Export für das gewählte Format
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const params = new URLSearchParams();
			Object.entries(currentFilters).forEach(([key, value]) => {
				if (value && value !== 'all' && value !== '') {
					params.set(key, String(value));
				}
			});
			params.set('format', selectedFormat);

			const response = await fetch(`/api/sightings/export/${selectedFormat}?${params.toString()}`);

			if (!response.ok) {
				throw new Error(`Export fehlgeschlagen: ${response.statusText}`);
			}

			const exportData = await response.text();
			const filename = createTimestampedFilename('sichtungen-export', selectedFormat);

			// Download mit den entsprechenden Handlers ausführen
			downloadHandlers[selectedFormat as keyof typeof downloadHandlers](exportData, filename);

			createToast(
				'success',
				`${formatInfo[selectedFormat as keyof typeof formatInfo].name}-Export erfolgreich heruntergeladen!`
			);

			// Modal schließen nach erfolgreichem Download
			show = false;

			logger.info(
				{
					format: selectedFormat,
					filename,
					recordCount: loadedSightings.length
				},
				'Export download completed'
			);
		} catch (err) {
			logger.error(err, 'Export download failed');
			error = err instanceof Error ? err.message : 'Fehler beim Download';
		}
	}

	// Beim Öffnen des Modals Export-Daten laden
	$effect(() => {
		if (show && totalRecords > 0) {
			loadExportData();
		}
	});

	let dialogElement = $state<HTMLDialogElement | null>(null);

	// Sync dialog open/close with show prop
	$effect(() => {
		if (!dialogElement) return;
		if (show && !dialogElement.open) {
			dialogElement.showModal();
		} else if (!show && dialogElement.open) {
			dialogElement.close();
		}
	});

	function closeModal() {
		show = false;
		error = null;
		loadedSightings = [];
	}
</script>

<!-- DaisyUI v5 Modal using native dialog element -->
<dialog
	bind:this={dialogElement}
	class="modal"
	onclose={closeModal}
	aria-labelledby="export-modal-title"
>
	<div class="modal-box max-w-2xl">
		<!-- Modal Header -->
		<div class="mb-6 flex items-center justify-between">
			<h3 id="export-modal-title" class="text-lg font-semibold">Sichtungen exportieren</h3>
			<button
				class="btn btn-ghost btn-sm btn-circle"
				onclick={closeModal}
				aria-label="Modal schließen"
			>
				<Icon icon="lucide:x" class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-6">
			<!-- Filter-Info -->
			<div class="bg-base-200 rounded-lg p-4">
				<h4 class="mb-2 text-sm font-medium">Aktuelle Filter:</h4>
				<div class="flex flex-wrap gap-2">
					{#each aktiveFilter as filter, index (index)}
						<span class="badge badge-outline badge-sm">{filter}</span>
					{/each}
				</div>
				<div class="text-base-content/70 mt-2 text-sm">
					{totalRecords} Datensatz{totalRecords !== 1 ? 'e' : ''} gefunden
				</div>
			</div>

			<!-- Format-Auswahl -->
			<div>
				<h4 class="mb-3 text-sm font-medium">Export-Format wählen:</h4>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each Object.entries(formatInfo) as [format, info] (format)}
						<label class="cursor-pointer">
							<input type="radio" bind:group={selectedFormat} value={format} class="peer sr-only" />
							<div
								class="border-base-300 peer-checked:border-primary peer-checked:bg-primary/5 hover:border-primary/50 rounded-lg border-2 p-4 transition-colors"
							>
								<div class="flex items-start gap-3">
									<Icon icon={info.icon} width="24" height="24" class="text-primary mt-1" />
									<div class="min-w-0 flex-1">
										<div class="font-medium">{info.name}</div>
										<div class="text-base-content/70 mt-1 text-xs">{info.description}</div>
										<div class="text-base-content/70 mt-1 text-xs">
											~{formatFileSize(estimateFileSize(format, totalRecords))}
										</div>
									</div>
								</div>
							</div>
						</label>
					{/each}
				</div>
			</div>

			<!-- Loading/Status -->
			{#if isLoading}
				<div class="flex items-center justify-center py-8">
					<div class="loading loading-spinner loading-lg"></div>
					<span class="ml-3">Lade Export-Daten...</span>
				</div>
			{:else if error}
				<div class="alert alert-error">
					<Icon icon="lucide:circle-alert" class="h-6 w-6 shrink-0" />
					<span>{error}</span>
				</div>
			{:else if loadedSightings.length > 0}
				<div class="alert alert-success">
					<Icon icon="lucide:circle-check" class="h-6 w-6 shrink-0" />
					<span>{loadedSightings.length} Datensätze bereit zum Export</span>
				</div>
			{/if}
		</div>

		<!-- Modal Footer -->
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={closeModal}>Abbrechen</button>
			<button
				class="btn btn-primary"
				onclick={performDownload}
				disabled={isLoading || loadedSightings.length === 0}
			>
				<Icon icon="lucide:download" class="mr-2 h-4 w-4" />
				{formatInfo[selectedFormat as keyof typeof formatInfo].name} herunterladen
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Modal schließen"><span class="sr-only">Modal schließen</span></button>
	</form>
</dialog>
