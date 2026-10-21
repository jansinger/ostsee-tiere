<script lang="ts">
	import ApiDocumentation from '#lib/components/docs/ApiDocumentation.svelte';
</script>

<svelte:head>
	<title>API-Dokumentation - Admin - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Admin-Bereich: Umfassende OpenAPI-Dokumentation für die Ostsee-Tiere API mit interaktiver Schnittstelle"
	/>
	<meta
		name="keywords"
		content="Admin, API, OpenAPI, Scalar, Ostsee, Meerestiere, Sichtungen, REST"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="Admin: Ostsee-Tiere API Dokumentation" />
	<meta
		property="og:description"
		content="Interaktive API-Dokumentation für Administratoren - Meldung und Verwaltung von Meerestier-Sichtungen"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Admin: Ostsee-Tiere API Dokumentation" />
	<meta
		name="twitter:description"
		content="Interaktive API-Dokumentation für Administratoren - Meldung und Verwaltung von Meerestier-Sichtungen"
	/>
</svelte:head>

<!-- Admin-spezifische API-Dokumentation -->
<div class="pt-6">
	<ApiDocumentation
		title="Admin API-Dokumentation"
		description="Umfassende OpenAPI-Dokumentation für Administratoren. Hier finden Sie alle verfügbaren Endpunkte, Schemas und können die API direkt testen. Als angemeldeter Admin haben Sie Zugriff auf erweiterte Funktionen wie Sichtungsverwaltung, Datenexport und Benutzerstatistiken."
		showQuickStart={true}
		showDownloadButton={true}
		showNavButtons={true}
		containerClass="mx-auto max-w-full"
	/>
</div>

<!-- Admin-spezifische Ergänzungen -->
<div class="mx-auto mt-8 max-w-full">
	<!-- Admin-Hinweise -->
	<div class="bg-primary/10 border-primary/20 mb-8 rounded-lg border p-6">
		<h2 class="text-primary mb-4 text-xl font-semibold">🔑 Admin-Bereich Hinweise</h2>
		<div class="grid gap-6 md:grid-cols-2">
			<div>
				<h3 class="mb-2 text-lg font-medium">Erweiterte Funktionen</h3>
				<p class="text-base-content/70 mb-3 text-sm">
					Als angemeldeter Administrator haben Sie Zugriff auf zusätzliche Endpunkte:
				</p>
				<ul class="space-y-1 text-sm">
					<li>
						• <code class="bg-base-200 rounded px-1">GET /api/sightings</code> - Alle Sichtungen abrufen
						(mit Filtern)
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">PUT /api/sightings/{'{id}'}</code> - Sichtung bearbeiten
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">DELETE /api/sightings/{'{id}'}</code> - Sichtung
						löschen
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">PATCH /api/sightings/{'{id}'}/verify</code> - Sichtung
						prüfen und freigeben
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">GET /api/sightings/export</code> - Datenexport (JSON)
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">GET /api/sightings/export/csv</code> - Datenexport
						(CSV)
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">GET /api/sightings/export/kml</code> - Datenexport
						(KML)
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">GET /api/sightings/export/xml</code> - Datenexport
						(XML)
					</li>
					<li>
						• <code class="bg-base-200 rounded px-1">GET /api/statistics</code> - Detaillierte Statistiken
					</li>
				</ul>
			</div>
			<div>
				<h3 class="mb-2 text-lg font-medium">⚠️ Sicherheitshinweise</h3>
				<div class="bg-warning/10 border-warning/20 rounded border p-4">
					<ul class="space-y-2 text-sm">
						<li class="flex items-start gap-2">
							<span class="text-warning-strong font-bold">•</span>
							<span>API-Schlüssel und Tokens niemals in Client-Code verwenden</span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-warning-strong font-bold">•</span>
							<span>Alle Admin-Aktionen werden protokolliert</span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-warning-strong font-bold">•</span>
							<span>Bei verdächtigen Aktivitäten wird die Session beendet</span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-warning-strong font-bold">•</span>
							<span>Lösch-Operationen können nicht rückgängig gemacht werden</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Admin Tools -->
	<div class="bg-base-200 rounded-lg p-6">
		<h2 class="mb-4 text-xl font-semibold">🛠️ Admin-Tools</h2>
		<div class="grid gap-4 md:grid-cols-3">
			<div class="text-center">
				<a href="/admin" class="btn btn-primary btn-wide">
					📊<br />
					<span class="text-sm">Dashboard</span>
				</a>
				<p class="text-base-content/60 mt-2 text-xs">Übersicht und Statistiken</p>
			</div>
			<div class="text-center">
				<a href="/map" class="btn btn-secondary btn-wide">
					🗺️<br />
					<span class="text-sm">Sichtungs-Karte</span>
				</a>
				<p class="text-base-content/60 mt-2 text-xs">Alle Sichtungen auf der Karte</p>
			</div>
			<div class="text-center">
				<a href="/docs/api" class="btn btn-outline btn-wide">
					📖<br />
					<span class="text-sm">Öffentliche Docs</span>
				</a>
				<p class="text-base-content/60 mt-2 text-xs">Für Entwickler</p>
			</div>
		</div>
	</div>
</div>
