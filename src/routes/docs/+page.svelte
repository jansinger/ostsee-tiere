<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	// Documentation overview page
</script>

<svelte:head>
	<title>Dokumentation - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Übersicht über die verfügbare Dokumentation der Ostsee-Tiere Plattform. API-Dokumentation, Entwicklerressourcen und Anleitungen."
	/>
	<meta
		name="keywords"
		content="Dokumentation, API, OpenAPI, Entwickler, Anleitung, Ostsee-Tiere, Integration"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="Dokumentation - Ostsee-Tiere" />
	<meta
		property="og:description"
		content="Übersicht über die verfügbare Dokumentation der Ostsee-Tiere Plattform"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Dokumentation - Ostsee-Tiere" />
	<meta
		name="twitter:description"
		content="Übersicht über die verfügbare Dokumentation der Ostsee-Tiere Plattform"
	/>
</svelte:head>

<div class="mx-auto max-w-4xl">
	<div class="mb-8 text-center">
		<h1 class="mb-4 flex items-center justify-center gap-3 text-4xl font-bold">
			<Icon icon="lucide:book-open" width="40" height="40" class="text-primary" />
			Dokumentation
		</h1>
		<p class="text-base-content/70 text-lg">
			Willkommen zur Dokumentation der Ostsee-Tiere Plattform
		</p>
	</div>

	<div class="grid gap-6 md:grid-cols-2">
		<!-- API Documentation Card -->
		<div class="card bg-base-100 shadow-raised">
			<div class="card-body">
				<h2 class="card-title">
					<Icon icon="lucide:zap" width="24" height="24" class="text-primary" />
					API-Dokumentation
					<div class="badge badge-primary">Interactive</div>
				</h2>
				<p class="text-base-content/70 text-sm">
					Umfassende OpenAPI-Dokumentation mit interaktiver Schnittstelle. Testen Sie alle Endpunkte
					direkt im Browser.
				</p>
				<div class="mt-4">
					<h3 class="mb-2 text-sm font-semibold">Verfügbare APIs:</h3>
					<ul class="text-base-content/70 space-y-1 text-xs">
						<li>• Sichtungen verwalten</li>
						<li>• Dateien hochladen</li>
						<li>• Datenexport (CSV, JSON, XML, KML)</li>
						<li>• Authentifizierung</li>
						<li>• Geografische Validierung</li>
					</ul>
				</div>
				<div class="card-actions mt-4 justify-end">
					<a href="/docs/api" class="btn btn-primary"> API-Docs öffnen </a>
					<a href="/docs/api/fallback" class="btn btn-outline btn-sm"> Fallback-Ansicht </a>
				</div>
			</div>
		</div>

		<!-- Getting Started Card -->
		<div class="card bg-base-100 shadow-raised">
			<div class="card-body">
				<h2 class="card-title">
					<Icon icon="lucide:play" width="24" height="24" class="text-primary" />
					Erste Schritte
					<div class="badge badge-secondary">Guide</div>
				</h2>
				<p class="text-base-content/70 text-sm">Schnelleinstieg für Entwickler und API-Nutzer.</p>
				<div class="mt-4">
					<h3 class="mb-2 text-sm font-semibold">Öffentliche Endpunkte:</h3>
					<div class="space-y-2">
						<div class="bg-base-200 rounded p-2 text-xs">
							<code class="text-info-strong">GET /api/sightings</code>
							<span class="text-base-content/60 ml-2">Öffentliche Sichtungen</span>
						</div>
						<div class="bg-base-200 rounded p-2 text-xs">
							<code class="text-info-strong">POST /api/sightings</code>
							<span class="text-base-content/60 ml-2">Neue Sichtung melden</span>
						</div>
						<div class="bg-base-200 rounded p-2 text-xs">
							<code class="text-info-strong">POST /api/files/upload</code>
							<span class="text-base-content/60 ml-2">Dateien hochladen</span>
						</div>
					</div>
				</div>
				<div class="card-actions mt-4 justify-end">
					<a href="/docs/api#getting-started" class="btn btn-outline"> Loslegen </a>
				</div>
			</div>
		</div>

		<!-- Download Card -->
		<div class="card bg-base-100 shadow-raised">
			<div class="card-body">
				<h2 class="card-title">
					<Icon icon="lucide:file-text" width="24" height="24" class="text-primary" />
					OpenAPI Spezifikation
					<div class="badge badge-accent">Download</div>
				</h2>
				<p class="text-base-content/70 text-sm">
					Laden Sie die vollständige OpenAPI-Spezifikation herunter für die Verwendung in Tools wie
					Postman, Insomnia oder zur Code-Generierung.
				</p>
				<div class="mt-4">
					<h3 class="mb-2 text-sm font-semibold">Formate:</h3>
					<ul class="text-base-content/70 space-y-1 text-xs">
						<li>• YAML (empfohlen)</li>
						<li>• JSON (über API)</li>
						<li>• Code-Generierung unterstützt</li>
					</ul>
				</div>
				<div class="card-actions mt-4 justify-end">
					<a href="/openapi.yml" download="ostsee-tiere-api.yml" class="btn btn-accent">
						YAML herunterladen
					</a>
				</div>
			</div>
		</div>

		<!-- Authentication Card -->
		<div class="card bg-base-100 shadow-raised">
			<div class="card-body">
				<h2 class="card-title">
					<Icon icon="lucide:lock" width="24" height="24" class="text-primary" />
					Authentifizierung
					<div class="badge badge-warning">Admin</div>
				</h2>
				<p class="text-base-content/70 text-sm">
					Für Admin-Funktionen ist eine Authentifizierung über Auth0 erforderlich.
				</p>
				<div class="mt-4">
					<h3 class="mb-2 text-sm font-semibold">Authentifizierungs-Flow:</h3>
					<ol class="text-base-content/70 list-inside list-decimal space-y-1 text-xs">
						<li>Login-Endpunkt aufrufen</li>
						<li>Auth0-Flow durchlaufen</li>
						<li>Session-Cookie wird gesetzt</li>
						<li>Admin-Endpunkte verfügbar</li>
					</ol>
				</div>
				<div class="card-actions mt-4 justify-end">
					<a href="/docs/api#authentication" class="btn btn-outline"> Details anzeigen </a>
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Links Section -->
	<div class="bg-base-200 mt-12 rounded-lg p-6">
		<h2 class="mb-4 flex items-center gap-2 text-2xl font-semibold">
			<Icon icon="lucide:zap" width="24" height="24" class="text-primary" />
			Schnellzugriff
		</h2>
		<div class="grid gap-4 md:grid-cols-3">
			<div class="text-center">
				<a href="/map" class="btn btn-ghost btn-lg flex w-full flex-col items-center">
					<Icon icon="lucide:map" width="32" height="32" class="text-primary mb-2" />
					<span class="text-sm">Karte anzeigen</span>
				</a>
			</div>
			<div class="text-center">
				<a href="/" class="btn btn-ghost btn-lg flex w-full flex-col items-center">
					<Icon icon="lucide:pen-line" width="32" height="32" class="text-primary mb-2" />
					<span class="text-sm">Sichtung melden</span>
				</a>
			</div>
			<div class="text-center">
				<a href="/about" class="btn btn-ghost btn-lg flex w-full flex-col items-center">
					<Icon icon="lucide:shield-check" width="32" height="32" class="text-primary mb-2" />
					<!-- „Hintergrund" wie in Navigation und Footer — ein Ziel, ein Name. -->
					<span class="text-sm">Hintergrund</span>
				</a>
			</div>
		</div>
	</div>

	<!-- Project Information -->
	<div class="text-base-content/60 mt-8 text-center text-sm">
		<p>
			Die Ostsee-Tiere Plattform ermöglicht es Bürgern, Forschern und Naturbeobachtern, ihre
			Sichtungen von Walen, Robben und anderen Meerestieren zu melden.
		</p>
		<div class="mt-4 flex justify-center gap-4">
			<span class="badge badge-outline">SvelteKit</span>
			<span class="badge badge-outline">OpenAPI 3.0</span>
			<span class="badge badge-outline">PostGIS</span>
			<span class="badge badge-outline">Auth0</span>
		</div>
	</div>
</div>
