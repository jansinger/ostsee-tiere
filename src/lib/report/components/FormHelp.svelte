<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/env';
	import { createLogger } from '$lib/logger';
	import type { SightingStatistics } from '$lib/server/db/sightingRepository';
	const logger = createLogger('components:FormHelp');
	import SpeciesIdentificationHelp from './form/fields/SpeciesIdentificationHelp.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import StatusBlock from '$lib/components/StatusBlock.svelte';
	import DataUsageNotice from '$lib/components/info/DataUsageNotice.svelte';
	import DeadFindingNotice from '$lib/components/info/DeadFindingNotice.svelte';
	import { getLocale } from '$lib/paraglide/runtime';
	import { resolveDisplayLocale } from '$lib/utils/format/dateTime';

	// Zahlenformat folgt der Anzeigesprache, nicht hartcodiert 'de-DE', sonst
	// bleiben die Statistik-Zahlen unter /en deutsch formatiert.
	const zahlenLocale = $derived(resolveDisplayLocale(getLocale()));

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
				{m.report_components_formhelp_text_hilfe_tipps_fuer_eine()}
			</summary>
			<div class="collapse-content text-base-content/80 text-sm">
				<div class="space-y-4 pt-4">
					<div class="alert alert-info">
						<div>
							<h4 class="flex items-center gap-2 font-semibold">
								<Icon icon="lucide:zap" width="16" class="text-primary" />
								{m.report_components_formhelp_text_warum_ist_ihre_meldung_wichtig()}
							</h4>
							<p class="mt-1">
								{m.report_components_formhelp_text_jede_meldung_hilft_wissenschaftlern_dabe()}
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
										title={m.report_components_formhelp_title_statistiken_konnten_nicht_geladen_werden()}
										description={m.report_components_formhelp_description_das_formular_funktioniert_voll()}
									/>
								{:else}
									<div class="grid grid-cols-2 gap-4 text-center text-sm">
										<div>
											<div class="text-primary font-bold">
												{#if loading}
													<span class="loading loading-dots loading-sm"></span>
												{:else}
													{statistics?.totalSightings.toLocaleString(zahlenLocale) ?? '–'}
												{/if}
											</div>
											<div class="text-xs">
												{m.report_components_formhelp_text_freigegebene_sichtungen()}
											</div>
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
											<div class="text-xs">
												{m.report_components_formhelp_text_beobachter_fuellen_zusatzfelder_aus()}
											</div>
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
								{m.report_components_formhelp_text_schritt_1_position_zeitpunkt()}
							</h4>
							<ul class="space-y-1 text-xs">
								<li>
									<strong>{m.report_components_formhelp_term_gps_koordinaten()}</strong>
									{m.report_components_formhelp_gloss_gps_koordinaten()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_term_gewaessername()}</strong>
									{m.report_components_formhelp_gloss_gewaessername()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_genaue_zeit()}</strong>
									{m.report_components_formhelp_text_hilft_bei_verhaltensanalysen()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_tipp()}</strong>
									{m.report_components_formhelp_text_screenshots_von_navigations_apps_sind_hi()}
								</li>
							</ul>
						</div>

						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:binoculars" width="16" class="text-primary" />
								{m.report_components_formhelp_text_schritt_2_angaben_zum_tier()}
							</h4>
							<ul class="space-y-1 text-xs">
								<li>
									<!-- Kein Duplikat zu /bestimmungshilfe und FieldRenderer.svelte: Auf
									     meeresmuseum.de läuft die App im iframe, dort blenden PublicNavbar und
									     PublicFooter per `{#if isNotIFrame}` aus — und damit jeden Link auf die
									     eigenständige Seite. Für die Mehrheit der Nutzer ist sie so nicht
									     erreichbar, der iframe bleibt (Museum, 2026-08-04).
									     Belege: docs/IFRAME_EINBETTUNG.md -->
									<strong>{m.report_components_formhelp_text_tierart_term()}</strong>
									{m.report_components_formhelp_text_bei_unsicherheit_unbekannte_walart_oder()}
									<SpeciesIdentificationHelp />
								</li>
								<li>
									<strong>{m.report_components_formhelp_term_anzahl()}</strong>
									{m.report_components_formhelp_gloss_anzahl()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_jungtiere()}</strong>
									{m.report_components_formhelp_text_wichtig_fuer_populationsstudien()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_entfernung()}</strong>
									{m.report_components_formhelp_text_hilft_bei_der_einschaetzung_der()}
								</li>
							</ul>
						</div>

						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:eye" width="16" class="text-primary" />
								{m.report_components_formhelp_text_schritt_3_weitere_informationen()}
							</h4>
							<ul class="space-y-1 text-xs">
								<li>
									<strong>{m.report_components_formhelp_text_verhalten()}</strong>
									{m.report_components_formhelp_text_fuetterung_ruhen_springen_etc()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_umwelt()}</strong>
									{m.report_components_formhelp_text_seegang_und_sichtweite_beeinflussen_sich()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_fotos_videos()}</strong>
									{m.report_components_formhelp_text_extrem_hilfreich_fuer_artbestimmung()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_tipp_2()}</strong>
									{m.report_components_formhelp_text_auch_unscharfe_bilder_koennen_nuetzlich()}
								</li>
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
									</strong>
									{m.report_components_formhelp_text_der_beobachter_fuellen_zusatzfelder_aus()}
								</div>
							</div>
						</div>

						<div class="card bg-base-100 p-4">
							<h4 class="mb-2 flex items-center gap-2 font-semibold">
								<Icon icon="lucide:mail" width="16" class="text-primary" />
								{m.report_components_formhelp_text_schritt_4_kontaktdaten()}
							</h4>
							<ul class="space-y-1 text-xs">
								<li>
									<strong>{m.report_components_formhelp_text_e_mail()}</strong>
									{m.report_components_formhelp_text_fuer_bestaetigung_und_rueckfragen()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_boot_info()}</strong>
									{m.report_components_formhelp_text_hilft_bei_stoerungsanalysen()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_datenschutz()}</strong>
									{m.report_components_formhelp_text_nur_sichtungsdaten_werden_oeffentlich()}
								</li>
								<li>
									<strong>{m.report_components_formhelp_text_optional()}</strong>
									{m.report_components_formhelp_text_name_nur_mit_ihrer_zustimmung()}
								</li>
							</ul>
						</div>
					</div>

					<div class="divider"></div>

					<div class="alert alert-success">
						<div>
							<h4 class="mb-4 flex items-center justify-center gap-2 text-center font-semibold">
								<Icon icon="lucide:chart-pie" width="16" class="text-success-strong" />
								{m.report_components_formhelp_text_ihre_daten_machen_den_unterschied()}
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
										{m.report_components_formhelp_text_jahre_mit_freigegebenen_sichtungen()}
									</div>
									<div class="text-base-content/70 mt-1 text-xs">
										{#if !loading && statistics && statistics.uniqueUsers > 0}
											{statistics.uniqueUsers.toLocaleString(zahlenLocale)}
											{m.report_components_formhelp_text_personen_haben_bereits_gemeldet()}
										{:else}
											{m.report_components_formhelp_text_viele_beobachtende_melden_bereits_regelm()}
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
									<div class="text-base-content text-sm font-medium">
										{m.report_components_formhelp_text_mit_fotos_videos()}
									</div>
									<div class="text-base-content/70 mt-1 text-xs">
										{#if !loading && statistics}
											{statistics.sightingsWithMedia.toLocaleString(zahlenLocale)}
											{m.report_components_formhelp_text_freigegebene_sichtungen_mit_medien()}
										{:else}
											{m.report_components_formhelp_text_durch_ihre_fotos_wissenschaftlich_dokume()}
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>

					<!--
						Text und Fachaussage liegen seit /bestimmungshilfe in geteilten
						Komponenten; hier kommt nur die Kennzahl dazu, die es auf der
						Bestimmungshilfe bewusst nicht gibt (die Seite lädt keine Statistiken).
					-->
					<DeadFindingNotice>
						<div class="bg-warning/10 mt-3 rounded-lg p-3">
							<div class="text-center">
								<div class="text-warning-strong mb-1 text-xl font-bold">
									{#if loading}
										<span class="loading loading-dots loading-sm"></span>
									{:else}
										{statistics?.deadAnimalsFound.toLocaleString(zahlenLocale) ?? '–'}
									{/if}
								</div>
								<div class="text-base-content text-xs">
									{m.report_components_formhelp_text_freigegebene_totfunde_bereits_fuer_die()}
								</div>
							</div>
						</div>
					</DeadFindingNotice>

					<DataUsageNotice />
				</div>
			</div>
		</details>
	</div>
</div>
