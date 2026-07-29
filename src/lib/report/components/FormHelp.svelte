<script lang="ts">
	import { browser } from '$app/environment';
	import { createLogger } from '$lib/logger';
	import type { SightingStatistics } from '$lib/server/db/sightingRepository';
	const logger = createLogger('components:FormHelp');
	import SpeciesIdentificationHelp from './form/fields/SpeciesIdentificationHelp.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import StatusBlock from '$lib/components/StatusBlock.svelte';

	// Keine Platzhalter-Zahlen: Statistiken werden erst angezeigt, wenn sie
	// tatsächlich geladen wurden. Erfundene Fallback-Werte würden Bürgern sonst
	// bei jedem API-Ausfall als echte Zahlen des Meeresmuseums präsentiert.
	// Siehe .claude/rules/design-system.md → "Zahlen in Nutzertexten nur mit Quelle".
	//
	// Alle Zahlen aus /api/statistics beziehen sich ausschließlich auf
	// FREIGEGEBENE Sichtungen — dieselbe Grundmenge wie die öffentliche Karte.
	// Die Beschriftungen müssen das widerspiegeln und dürfen nicht suggerieren,
	// dass jede eingegangene Meldung gemeint ist.
	let statistics = $state<SightingStatistics | null>(null);

	let loading = $state(true);
	const fetchFailed = $derived(!loading && statistics === null);

	// Load statistics only in browser (avoid SSR fetch warning)
	$effect(() => {
		if (!browser) return;
		(async () => {
			try {
				const response = await fetch('/api/statistics');
				if (response.ok) {
					statistics = await response.json();
				} else {
					logger.warn({ status: response.status }, 'Statistics endpoint returned an error');
				}
			} catch (error) {
				logger.warn(
					{ error: error instanceof Error ? error.message : error },
					'Could not load statistics'
				);
			} finally {
				loading = false;
			}
		})();
	});
</script>

<!-- Enhanced Help Text -->
<div class="card bg-base-200/50 border-base-300 mt-8 border">
	<div class="card-body p-2">
		<details class="collapse">
			<summary class="collapse-title flex cursor-pointer items-center gap-2 text-sm font-medium">
				<Icon icon="lucide:circle-help" width="16" class="text-info-strong" />
				Hilfe & Tipps für eine wertvolle Sichtungsmeldung
			</summary>
			<div class="collapse-content text-base-content/80 text-sm">
				<div class="space-y-4 pt-4">
					<div class="alert alert-info">
						<div>
							<h4 class="flex items-center gap-2 font-semibold">
								<Icon icon="lucide:zap" width="16" class="text-primary" />
								Warum ist Ihre Meldung wichtig?
							</h4>
							<p class="mt-1">
								Jede Sichtung hilft Wissenschaftlern dabei, Wanderrouten zu verstehen, Populationen
								zu überwachen und Schutzmaßnahmen zu entwickeln. Ihre Beobachtung trägt direkt zum
								Artenschutz bei!
							</p>
							<div class="bg-base-100 mt-3 rounded-lg p-3">
								{#if !loading && fetchFailed}
									<!--
										Vorher eine graue Zeile ohne Form und ohne Einordnung: Sie sah
										aus wie ein Platzhalter und ließ offen, ob jetzt das Formular
										kaputt ist. Der StatusBlock sagt beides — was fehlt und was
										trotzdem geht.
									-->
									<!--
										`announce="status"`: Der Abruf startet beim Seitenaufbau, nicht
										auf Knopfdruck — und er steckt in einem zugeklappten `<details>`.
										Ein `role="alert"` würde den Screenreader hier über etwas
										unterbrechen, das der Nutzer nicht angestoßen hat und gar nicht
										sieht.
									-->
									<StatusBlock
										variant="failed"
										announce="status"
										title="Statistiken konnten nicht geladen werden"
										description="Das Formular funktioniert vollständig — nur die Zahlen in diesem Hilfetext fehlen."
									/>
								{:else}
									<div class="grid grid-cols-2 gap-4 text-center text-sm">
										<div>
											<div class="text-primary font-bold">
												{#if loading}
													<span class="loading loading-dots loading-sm"></span>
												{:else}
													{statistics?.totalSightings.toLocaleString('de-DE') ?? '–'}
												{/if}
											</div>
											<div class="text-xs">freigegebene Sichtungen</div>
										</div>
										<div>
											<div class="text-primary font-bold">
												{#if loading}
													<span class="loading loading-dots loading-sm"></span>
												{:else if statistics}
													{statistics.completionRate}%
												{:else}
													–
												{/if}
											</div>
											<div class="text-xs">Beobachter füllen Zusatzfelder aus</div>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:map-pin" width="16" class="text-primary" />
								Schritt 1: Position & Zeit
							</h4>
							<ul class="space-y-1 text-xs">
								<li><strong>GPS-Koordinaten:</strong> Am wertvollsten für die Forschung</li>
								<li><strong>Gewässername:</strong> Falls keine GPS-Daten verfügbar</li>
								<li><strong>Genaue Zeit:</strong> Hilft bei Verhaltensanalysen</li>
								<li>
									<strong>Tipp:</strong> Screenshots von Navigations-Apps sind hilfreich
								</li>
							</ul>
						</div>

						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:binoculars" width="16" class="text-primary" />
								Schritt 2: Sichtungsdetails
							</h4>
							<ul class="space-y-1 text-xs">
								<li>
									<strong>Tierart:</strong> Bei Unsicherheit „Unbekannte Walart" oder „Unbekannte
									Robbenart" wählen <SpeciesIdentificationHelp />
								</li>
								<li><strong>Anzahl:</strong> Auch Schätzungen sind wertvoll</li>
								<li><strong>Jungtiere:</strong> Wichtig für Populationsstudien</li>
								<li>
									<strong>Entfernung:</strong> Hilft bei der Einschätzung der Beobachtung
								</li>
							</ul>
						</div>

						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:eye" width="16" class="text-primary" />
								Schritt 3: Beobachtungen
							</h4>
							<ul class="space-y-1 text-xs">
								<li><strong>Verhalten:</strong> Fütterung, Ruhen, Springen, etc.</li>
								<li>
									<strong>Umwelt:</strong> Seegang und Sichtweite beeinflussen Sichtungen
								</li>
								<li><strong>Fotos/Videos:</strong> Extrem hilfreich für Artbestimmung</li>
								<li><strong>Tipp:</strong> Auch unscharfe Bilder können nützlich sein</li>
							</ul>
							<div class="bg-success/10 mt-2 rounded p-2">
								<div class="text-base-content/70 text-xs">
									✅ <strong>
										{#if loading}
											<span class="loading loading-dots loading-xs"></span>
										{:else if statistics}
											{Math.round((statistics.averageOptionalFields / 12) * 100)}%
										{:else}
											–
										{/if}
									</strong> der Beobachter füllen Zusatzfelder aus - Sie helfen bei Populationsmodellen
								</div>
							</div>
						</div>

						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:mail" width="16" class="text-primary" />
								Schritt 4: Kontaktdaten
							</h4>
							<ul class="space-y-1 text-xs">
								<li><strong>E-Mail:</strong> Für Bestätigung und Rückfragen</li>
								<li><strong>Boot-Info:</strong> Hilft bei Störungsanalysen</li>
								<li><strong>Datenschutz:</strong> Nur Sichtungsdaten werden öffentlich</li>
								<li><strong>Optional:</strong> Name nur mit Ihrer Zustimmung sichtbar</li>
							</ul>
						</div>
					</div>

					<div class="divider"></div>

					<div class="alert alert-success">
						<div>
							<h4 class="mb-4 flex items-center justify-center gap-2 text-center font-semibold">
								<Icon icon="lucide:chart-pie" width="16" class="text-success-strong" />
								Ihre Daten machen den Unterschied
							</h4>
							<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div class="bg-success/10 border-success/20 rounded-lg border p-4 text-center">
									<div class="text-success-strong mb-2 text-2xl font-bold">
										{#if loading}
											<span class="loading loading-dots loading-sm"></span>
										{:else}
											{statistics?.yearsOfService ?? '–'}
										{/if}
									</div>
									<!-- Bezugsgröße sind freigegebene Sichtungen: Die frühere Angabe (24 Jahre)
									     stützte sich auf 7 Datensätze von 2002, die nie freigegeben wurden. Die
									     freigegebene Reihe beginnt 2009. -->
									<div class="text-base-content text-sm font-medium">
										Jahre mit freigegebenen Sichtungen
									</div>
									<div class="text-base-content/70 mt-1 text-xs">
										{#if !loading && statistics && statistics.uniqueUsers > 0}
											{statistics.uniqueUsers.toLocaleString('de-DE')} Personen haben bereits gemeldet
										{:else}
											viele Beobachtende melden bereits regelmäßig
										{/if}
									</div>
								</div>
								<div class="bg-success/10 border-success/20 rounded-lg border p-4 text-center">
									<div class="text-success-strong mb-2 text-2xl font-bold">
										{#if loading}
											<span class="loading loading-dots loading-sm"></span>
										{:else if statistics && statistics.totalSightings > 0}
											{Math.round(
												(statistics.sightingsWithMedia / statistics.totalSightings) * 100
											)}%
										{:else}
											–
										{/if}
									</div>
									<div class="text-base-content text-sm font-medium">mit Fotos/Videos</div>
									<div class="text-base-content/70 mt-1 text-xs">
										{#if !loading && statistics}
											{statistics.sightingsWithMedia.toLocaleString('de-DE')} freigegebene Sichtungen
											mit Medien dokumentiert
										{:else}
											durch Ihre Fotos wissenschaftlich dokumentiert
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>

					<div class="alert alert-warning">
						<div>
							<h4 class="flex items-center gap-2 font-semibold">
								<Icon icon="lucide:triangle-alert" width="16" class="text-warning-strong" />
								Totfunde - Besonders wichtig!
							</h4>
							<p class="mt-1 text-xs">
								Tote Tiere liefern wichtige Erkenntnisse über Todesursachen und Gesundheit der
								Population.
								<strong>Bitte nicht berühren!</strong> Melden Sie den Fund auch an die örtlichen Behörden
								(Wasserschutzpolizei, Nationalparkamt).
							</p>
							<div class="bg-warning/10 mt-3 rounded-lg p-3">
								<div class="text-center">
									<div class="text-warning-strong mb-1 text-xl font-bold">
										{#if loading}
											<span class="loading loading-dots loading-sm"></span>
										{:else}
											{statistics?.deadAnimalsFound.toLocaleString('de-DE') ?? '–'}
										{/if}
									</div>
									<div class="text-base-content text-xs">
										freigegebene Totfunde bereits für die Wissenschaft dokumentiert
									</div>
								</div>
							</div>
						</div>
					</div>

					<div class="alert alert-info">
						<Icon icon="lucide:info" class="shrink-0" aria-hidden="true" />
						<div>
							<h4 class="font-semibold">Wofür die Daten gebraucht werden</h4>
							<p class="mt-1 text-xs">
								Ihre Meldung wird vom Deutschen Meeresmuseum wissenschaftlich ausgewertet und direkt
								an die internationalen Gremien für den Schutz der Ostsee-Schweinswale weitergegeben:
								an <strong>HELCOM</strong>, die Helsinki-Kommission zum Schutz der Ostsee, und an
								<strong>ASCOBANS</strong>, das internationale Abkommen zum Schutz der Kleinwale. So
								trägt Ihre Beobachtung zum Bild von Verbreitung und Vorkommen der Tiere bei.
							</p>
						</div>
					</div>
				</div>
			</div>
		</details>
	</div>
</div>
