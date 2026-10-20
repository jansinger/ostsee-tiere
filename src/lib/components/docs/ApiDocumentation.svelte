<script lang="ts">
	import { browser } from '$app/env';
	import Icon from '$lib/components/Icon.svelte';

	// Props
	let {
		title = 'API-Dokumentation',
		description = 'Umfassende OpenAPI-Dokumentation für die Ostsee-Tiere Plattform. Hier finden Sie alle verfügbaren Endpunkte, Schemas und können die API direkt testen.',
		showQuickStart = true,
		showDownloadButton = true,
		showNavButtons = true,
		containerClass = 'mx-auto max-w-full'
	}: {
		title?: string;
		description?: string;
		showQuickStart?: boolean;
		showDownloadButton?: boolean;
		showNavButtons?: boolean;
		containerClass?: string;
	} = $props();

	let isLoading = $state(true);
	let hasError = $state(false);
	let errorMessage = $state('');

	// Modern $effect for API spec verification
	$effect(() => {
		if (browser) {
			(async () => {
				try {
					// Verify OpenAPI spec is available
					const response = await fetch('/openapi.yml');
					if (!response.ok) {
						throw new Error('OpenAPI Spec konnte nicht geladen werden');
					}

					// Set loading to false after verification
					isLoading = false;
				} catch (error) {
					console.error('Failed to load API documentation:', error);
					hasError = true;
					errorMessage =
						error instanceof Error
							? error.message
							: 'API-Dokumentation konnte nicht geladen werden';
					isLoading = false;
				}
			})();
		}
	});
</script>

<div class={containerClass}>
	<!-- Header Section -->
	<div class="mb-8 text-center">
		<h1 class="text-base-content mb-4 text-4xl font-bold">{title}</h1>
		<p class="text-base-content/70 mx-auto max-w-3xl text-lg">
			{description}
		</p>

		{#if showNavButtons}
			<div class="mt-6 flex flex-wrap justify-center gap-4">
				{#if showDownloadButton}
					<a
						href="/openapi.yml"
						download="ostsee-tiere-api.yml"
						class="btn btn-outline btn-primary"
					>
						📄 OpenAPI Spec herunterladen
					</a>
				{/if}
				<a href="#authentication" class="btn btn-ghost"> 🔐 Authentifizierung </a>
				<a href="#getting-started" class="btn btn-ghost"> 🚀 Erste Schritte </a>
			</div>
		{/if}
	</div>

	<!-- Quick Start Guide -->
	{#if showQuickStart}
		<div class="bg-base-200 mb-8 rounded-lg p-6">
			<h2 id="getting-started" class="mb-4 text-2xl font-semibold">🚀 Erste Schritte</h2>
			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<h3 class="mb-2 text-lg font-medium">Öffentliche Endpunkte</h3>
					<p class="text-base-content/70 mb-3 text-sm">
						Einige Endpunkte sind öffentlich verfügbar und benötigen keine Authentifizierung:
					</p>
					<ul class="space-y-1 text-sm">
						<li>
							• <code class="bg-base-200 rounded px-1">GET /api/sightings</code> - Öffentliche Sichtungen
						</li>
						<li>
							• <code class="bg-base-200 rounded px-1">POST /api/sightings</code> - Neue Sichtung melden
						</li>
						<li>
							• <code class="bg-base-200 rounded px-1">GET /api/geo/inBaltic</code> - Koordinaten prüfen
						</li>
						<li>
							• <code class="bg-base-200 rounded px-1">POST /api/files/upload</code> - Dateien hochladen
						</li>
						<li>
							• <code class="bg-base-200 rounded px-1">GET /api/media/{'{path}'}</code> - Sichere Medien
							abrufen
						</li>
					</ul>
				</div>
				<div>
					<h3 id="authentication" class="mb-2 text-lg font-medium">🔐 Admin-Authentifizierung</h3>
					<p class="text-base-content/70 mb-3 text-sm">
						Für Admin-Funktionen ist eine Anmeldung erforderlich:
					</p>
					<ol class="space-y-1 text-sm">
						<li>1. <code class="bg-base-200 rounded px-1">GET /api/auth/login</code> aufrufen</li>
						<li>2. Auth0-Login-Flow durchlaufen</li>
						<li>3. Session-Cookie wird automatisch gesetzt</li>
						<li>4. Admin-Endpunkte sind nun verfügbar</li>
					</ol>
				</div>
			</div>
		</div>
	{/if}

	<!-- API Reference Container -->
	{#if isLoading}
		<div class="text-base-content/60 py-8 text-center">
			<div class="loading loading-spinner loading-lg"></div>
			<p class="mt-4">API-Dokumentation wird geladen...</p>
			<p class="mt-2 text-sm">
				Falls die Dokumentation nicht lädt, versuchen Sie die Seite neu zu laden.
			</p>
		</div>
	{:else if hasError}
		<div class="alert alert-error" role="alert">
			<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
			<div>
				<span>{errorMessage}</span>
				<div class="mt-4 flex gap-2">
					<a href="/docs/api/fallback" class="btn btn-sm btn-primary">
						📄 Fallback-Dokumentation anzeigen
					</a>
					<a href="/openapi.yml" download="ostsee-tiere-api.yml" class="btn btn-sm btn-outline">
						📥 OpenAPI Spec herunterladen
					</a>
					<button class="btn btn-sm btn-ghost" onclick={() => window.location.reload()}>
						🔄 Neu laden
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Scalar API Reference iframe -->
		<div class="scalar-container">
			<iframe
				src="/docs/api/scalar"
				title="Scalar API Documentation"
				class="h-full w-full border-0"
				style="min-height: 100vh;"
				loading="lazy"
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-pointer-lock"
				allow="fullscreen"
				onerror={() => {
					hasError = true;
					errorMessage = 'Scalar API-Dokumentation konnte nicht geladen werden';
				}}
			></iframe>
		</div>

		<!-- Fallback notice -->
		<div class="mt-4 text-center">
			<p class="text-base-content/60 text-sm">
				Falls die interaktive Dokumentation nicht funktioniert, nutzen Sie die
				<a href="/docs/api/fallback" class="link link-primary">Fallback-Dokumentation</a>
				oder laden Sie die
				<a href="/openapi.yml" download="ostsee-tiere-api.yml" class="link link-primary"
					>OpenAPI-Spec</a
				>
				direkt herunter.
			</p>
		</div>
	{/if}
</div>

<style>
	/* Ensure full width for Scalar container */
	.scalar-container {
		width: 100%;
		min-height: 100vh;
		position: relative;
	}

	/* Custom scrollbar for better UX */
	:global(*::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}

	:global(*::-webkit-scrollbar-track) {
		background: var(--color-base-200);
		border-radius: 4px;
	}

	:global(*::-webkit-scrollbar-thumb) {
		background: var(--color-base-300);
		border-radius: 4px;
	}

	:global(*::-webkit-scrollbar-thumb:hover) {
		background: color-mix(in oklab, var(--color-base-300) 80%, var(--color-base-content));
	}
</style>
