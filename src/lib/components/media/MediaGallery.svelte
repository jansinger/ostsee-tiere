<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import type { UploadedFileInfo } from '#lib/types/index.ts';
	import MediaModal from './MediaModal.svelte';
	import MediaThumbnail from './MediaThumbnail.svelte';

	let {
		files = [],
		showTitle = true,
		className = ''
	}: {
		files: UploadedFileInfo[];
		showTitle?: boolean;
		className?: string;
	} = $props();

	let selectedMedia = $state<UploadedFileInfo | null>(null);

	function openModal(file: UploadedFileInfo) {
		selectedMedia = file;
	}

	function closeModal() {
		selectedMedia = null;
	}

	function isImage(mimeType: string): boolean {
		return mimeType.startsWith('image/');
	}

	function isVideo(mimeType: string): boolean {
		return mimeType.startsWith('video/');
	}

	function getFileTypeIcon(mimeType: string) {
		if (isImage(mimeType)) return 'lucide:images';
		if (isVideo(mimeType)) return 'lucide:video';
		return 'lucide:file-text';
	}

	// Gruppiere Dateien nach Typ
	const imageFiles = $derived(files.filter((file) => isImage(file.mimeType)));
	const videoFiles = $derived(files.filter((file) => isVideo(file.mimeType)));
	const otherFiles = $derived(
		files.filter((file) => !isImage(file.mimeType) && !isVideo(file.mimeType))
	);
</script>

{#if files.length > 0}
	<div class={`media-gallery ${className}`}>
		{#if showTitle}
			<div class="mb-4 flex items-center gap-2">
				<Icon icon="lucide:images" width="20" class="text-primary" />
				<h4 class="text-lg font-semibold">
					{m.components_media_mediagallery_text_medien()} ({files.length})
				</h4>
			</div>
		{/if}

		<!-- Bilder -->
		{#if imageFiles.length > 0}
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-2">
					<Icon icon="lucide:images" width="16" class="text-secondary-strong" />
					<h5 class="text-base-content/70 text-sm font-medium">
						{m.components_media_mediagallery_text_bilder()} ({imageFiles.length})
					</h5>
				</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{#each imageFiles as file (file.id)}
						<MediaThumbnail {file} onclick={() => openModal(file)} />
					{/each}
				</div>
			</div>
		{/if}

		<!-- Videos -->
		{#if videoFiles.length > 0}
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-2">
					<Icon icon="lucide:video" width="16" class="text-secondary-strong" />
					<h5 class="text-base-content/70 text-sm font-medium">
						{m.components_media_mediagallery_text_videos()} ({videoFiles.length})
					</h5>
				</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{#each videoFiles as file (file.id)}
						<MediaThumbnail {file} onclick={() => openModal(file)} />
					{/each}
				</div>
			</div>
		{/if}

		<!-- Andere Dateien -->
		{#if otherFiles.length > 0}
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-2">
					<Icon icon="lucide:file-text" width="16" class="text-secondary-strong" />
					<h5 class="text-base-content/70 text-sm font-medium">
						{m.components_media_mediagallery_text_andere_dateien()} ({otherFiles.length})
					</h5>
				</div>
				<div class="space-y-2">
					{#each otherFiles as file (file.id)}
						<div class="bg-base-100 shadow-raised flex items-center gap-3 rounded-lg p-3">
							<Icon icon={getFileTypeIcon(file.mimeType)} width="20" class="text-base-content/60" />
							<div class="min-w-0 flex-1">
								<p class="text-base-content truncate text-sm font-medium">
									{file.originalName}
								</p>
								<p class="text-base-content/60 text-xs">
									{(file.size / 1024).toFixed(1)}
									{m.components_media_mediagallery_text_kb()}
								</p>
							</div>
							<a
								href={`/api/media/${file.filePath}`}
								download={file.originalName}
								class="btn btn-ghost btn-sm"
								aria-label={m.components_media_mediagallery_aria_label_datei_herunterladen()}
							>
								{m.components_media_mediagallery_text_herunterladen()}
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Modal für Vollbildansicht -->
	{#if selectedMedia}
		<MediaModal file={selectedMedia} onClose={closeModal} />
	{/if}
{:else}
	<div class="bg-base-100 flex items-center justify-center rounded-lg p-8 text-center">
		<div class="space-y-3">
			<Icon icon="lucide:images" width="32" class="text-base-content/70 mx-auto" />
			<p class="text-base-content/60 text-sm">
				{m.components_media_mediagallery_text_keine_medien_vorhanden()}
			</p>
		</div>
	</div>
{/if}

<style>
	.media-gallery {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Animation for grid items */
	.grid > * {
		animation: fadeInUp 0.3s ease-out forwards;
	}

	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Accessibility improvements */
	@media (prefers-reduced-motion: reduce) {
		.grid > * {
			animation: none;
		}
	}
</style>
