<script lang="ts">
	import { browser } from '$app/env';
	import Icon from '#lib/components/Icon.svelte';

	let openApiSpec = $state<string | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Load OpenAPI spec only in browser (avoid SSR fetch warning)
	$effect(() => {
		if (!browser) return;
		(async () => {
			try {
				const response = await fetch('/openapi.yml');
				if (!response.ok) {
					throw new Error('OpenAPI Spec konnte nicht geladen werden');
				}

				const yamlText = await response.text();
				// Simple YAML parsing for display (not full YAML parser)
				// This is just for fallback display purposes
				openApiSpec = yamlText;
				isLoading = false;
			} catch (err) {
				error = err instanceof Error ? err.message : 'Unbekannter Fehler';
				isLoading = false;
			}
		})();
	});
</script>

<svelte:head>
	<title>API-Dokumentation (Fallback) - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Fallback-Ansicht der OpenAPI-Dokumentation für die Ostsee-Tiere API. Vereinfachte Darstellung der API-Spezifikation."
	/>
	<meta
		name="keywords"
		content="API, OpenAPI, Fallback, Dokumentation, Spezifikation, Ostsee, Meerestiere"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="API-Dokumentation (Fallback) - Ostsee-Tiere" />
	<meta
		property="og:description"
		content="Fallback-Ansicht der OpenAPI-Dokumentation für die Ostsee-Tiere API"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="API-Dokumentation (Fallback) - Ostsee-Tiere" />
	<meta
		name="twitter:description"
		content="Fallback-Ansicht der OpenAPI-Dokumentation für die Ostsee-Tiere API"
	/>
</svelte:head>

<div class="mx-auto max-w-6xl p-4">
	<div class="mb-8">
		<h1 class="mb-4 text-3xl font-bold">📄 API-Dokumentation (Fallback)</h1>
		<p class="text-base-content/70 mb-4">
			Diese vereinfachte Ansicht zeigt die OpenAPI-Spezifikation an, falls die interaktive
			Scalar-Dokumentation nicht geladen werden kann.
		</p>

		<div class="mb-6 flex gap-4">
			<a href="/docs/api" class="btn btn-primary"> 🔄 Scalar-Dokumentation erneut versuchen </a>
			<a href="/openapi.yml" download="ostsee-tiere-api.yml" class="btn btn-outline">
				📥 YAML herunterladen
			</a>
			<a href="/docs" class="btn btn-ghost"> 📚 Docs-Übersicht </a>
		</div>
	</div>

	{#if isLoading}
		<div class="py-8 text-center">
			<div class="loading loading-spinner loading-lg"></div>
			<p class="mt-4">OpenAPI-Spezifikation wird geladen...</p>
		</div>
	{:else if error}
		<div class="alert alert-error" role="alert">
			<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
			<span>Fehler beim Laden der API-Spezifikation: {error}</span>
		</div>
	{:else if openApiSpec}
		<!-- Quick API Overview -->
		<div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title text-lg">🔍 Sichtungen</h2>
					<div class="space-y-1 text-sm">
						<div>
							<code class="text-success-strong">GET</code> /sightings - Öffentliche Sichtungen
						</div>
						<div><code class="text-info-strong">POST</code> /sightings - Neue Sichtung</div>
						<div>
							<code class="text-success-strong">GET</code> /sightings/{'{id}'} - Einzelne Sichtung
						</div>
						<div>
							<code class="text-warning-strong">PUT</code> /sightings/{'{id}'} - Sichtung ändern
						</div>
						<div>
							<code class="text-error">DELETE</code> /sightings/{'{id}'} - Sichtung löschen
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title text-lg">🔐 Authentifizierung</h2>
					<div class="space-y-1 text-sm">
						<div><code class="text-success-strong">GET</code> /auth/login - Login starten</div>
						<div><code class="text-success-strong">GET</code> /auth/logout - Logout</div>
						<div><code class="text-success-strong">GET</code> /auth/callback - Auth0 Callback</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title text-lg">📁 Dateien</h2>
					<div class="space-y-1 text-sm">
						<div><code class="text-info-strong">POST</code> /files/upload - Datei hochladen</div>
						<div><code class="text-error">DELETE</code> /files/delete - Datei löschen</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title text-lg">📊 Export</h2>
					<div class="space-y-1 text-sm">
						<div>
							<code class="text-success-strong">GET</code> /sightings/export/json - JSON Export
						</div>
						<div>
							<code class="text-success-strong">GET</code> /sightings/export/csv - CSV Export
						</div>
						<div>
							<code class="text-success-strong">GET</code> /sightings/export/xml - XML Export
						</div>
						<div>
							<code class="text-success-strong">GET</code> /sightings/export/kml - KML Export
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title text-lg">⚙️ Admin</h2>
					<div class="space-y-1 text-sm">
						<div>
							<code class="text-info-strong">PATCH</code> /sightings/{'{id}'}/verify - Prüfen und
							freigeben
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title text-lg">🌍 Geo</h2>
					<div class="space-y-1 text-sm">
						<div><code class="text-success-strong">GET</code> /geo/inBaltic - Ostsee-Prüfung</div>
						<div><code class="text-success-strong">GET</code> /map/sightings - Kartendaten</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Authentication Info -->
		<div class="border-warning/30 bg-warning/10 mb-8 rounded-lg border p-6">
			<h2 class="mb-4 text-xl font-semibold">🔐 Authentifizierung</h2>
			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<h3 class="mb-2 font-medium">Öffentliche Endpunkte</h3>
					<ul class="space-y-1 text-sm">
						<li>• Sichtungen abrufen und melden</li>
						<li>• Dateien hochladen</li>
						<li>• Geografische Validierung</li>
						<li>• Kartendaten abrufen</li>
					</ul>
				</div>
				<div>
					<h3 class="mb-2 font-medium">Admin-Endpunkte (Auth0)</h3>
					<ul class="space-y-1 text-sm">
						<li>• Sichtungen verwalten</li>
						<li>• Datenexport</li>
						<li>• Genehmigung/Verifizierung</li>
						<li>• Einzelne Sichtung abrufen</li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Raw OpenAPI Spec -->
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold">📋 OpenAPI-Spezifikation (Raw)</h2>
			<details class="bg-base-200 collapse">
				<summary class="collapse-title cursor-pointer text-lg font-medium">
					YAML-Inhalt anzeigen
				</summary>
				<div class="collapse-content">
					<pre class="bg-base-200 max-h-96 overflow-auto rounded border p-4 text-xs"><code
							>{openApiSpec}</code
						></pre>
				</div>
			</details>
		</div>

		<!-- Alternative Tools -->
		<div class="border-info/30 bg-info/10 rounded-lg border p-6">
			<h2 class="mb-4 text-xl font-semibold">🔧 Alternative Tools</h2>
			<p class="text-base-content/70 mb-4 text-sm">
				Sie können die OpenAPI-Spezifikation in diesen Tools verwenden:
			</p>
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				<div class="bg-base-100 rounded border p-4">
					<h3 class="mb-2 font-medium">Postman</h3>
					<p class="text-base-content/70 text-xs">Importieren Sie die YAML-Datei für API-Tests</p>
				</div>
				<div class="bg-base-100 rounded border p-4">
					<h3 class="mb-2 font-medium">Insomnia</h3>
					<p class="text-base-content/70 text-xs">Laden Sie die Spezifikation für REST-Tests</p>
				</div>
				<div class="bg-base-100 rounded border p-4">
					<h3 class="mb-2 font-medium">Swagger Editor</h3>
					<p class="text-base-content/70 text-xs">Online-Editor für OpenAPI-Specs</p>
				</div>
			</div>
		</div>
	{/if}
</div>
