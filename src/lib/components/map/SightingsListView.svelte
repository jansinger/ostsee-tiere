<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { formatEntryDate, type SightingListEntry } from '#lib/map/listViewUtils.ts';
	import {
		SIGHTING_STATUS_PRESENTATION,
		type SightingStatus
	} from '#lib/components/admin/sightingStatus.ts';

	// Barrierefreie Tabellen-Alternative zur Kartendarstellung (Befund K3).
	// Zeigt exakt die aktuell auf der Karte sichtbaren Sichtungen.
	let {
		entries,
		year,
		showStatus = false
	}: { entries: SightingListEntry[]; year: number; showStatus?: boolean } = $props();

	// Beschriftungen aus Paraglide statt SIGHTING_STATUS_PRESENTATION.label — jene
	// Literale sind für die deutsche Admin-Oberfläche, die Karte ist eine
	// übersetzte Fläche.
	const statusLabels: Record<SightingStatus, string> = {
		open: m.components_map_panel_filterpanel_text_status_offen(),
		approved: m.components_map_panel_filterpanel_text_status_freigegeben(),
		rejected: m.components_map_panel_filterpanel_text_status_abgelehnt()
	};
</script>

{#if entries.length === 0}
	<p role="status" class="text-base-content p-6 text-center text-sm font-medium">
		{m.components_map_sightingslistview_text_keine_sichtungen_fuer_die_aktuelle()}
	</p>
{:else}
	<div class="overflow-x-auto">
		<table class="table-zebra table">
			<caption class="text-base-content p-3 text-left text-sm font-semibold">
				{m.components_map_sightingslistview_text_sichtungen_jahr_plural({
					year,
					count: entries.length
				})}
			</caption>
			<thead>
				<tr>
					<th scope="col">{m.components_map_sightingslistview_text_datum()}</th>
					<th scope="col">{m.components_map_sightingslistview_text_tierart()}</th>
					<th scope="col">{m.components_map_sightingslistview_text_anzahl()}</th>
					<th scope="col">{m.components_map_sightingslistview_text_totfund()}</th>
					<th scope="col">{m.components_map_sightingslistview_text_fahrwasser()}</th>
					{#if showStatus}
						<th scope="col">{m.components_map_sightingslistview_text_bearbeitungsstand()}</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each entries as entry (entry.id)}
					<tr>
						<td>{formatEntryDate(entry.ts)}</td>
						<td>{entry.speciesName}</td>
						<td>
							{entry.count}{entry.juveniles > 0
								? ` (davon ${entry.juveniles} Jungtier${entry.juveniles > 1 ? 'e' : ''})`
								: ''}
						</td>
						<td>{entry.isDead ? 'Ja' : 'Nein'}</td>
						<td>{entry.waterway ?? '–'}</td>
						{#if showStatus}
							<td>
								<span class="badge {SIGHTING_STATUS_PRESENTATION[entry.status].badgeClass}">
									{statusLabels[entry.status]}
								</span>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
