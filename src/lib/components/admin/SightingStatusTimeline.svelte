<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
	import { SIGHTING_STATUS_PRESENTATION, verdictToStatus } from './sightingStatus';
	import { VERDICT_LOG_LABEL } from './sightingStatusLog';
	import type { SightingStatusLogEntry } from './sightingStatusLog';

	let {
		entries,
		failed = false
	}: {
		entries: SightingStatusLogEntry[];
		/** Die Historie konnte nicht geladen werden — siehe Markup, nicht dasselbe wie „leer". */
		failed?: boolean;
	} = $props();
</script>

{#if failed}
	<!-- Der dritte Fall, und der Grund, warum es ihn gibt: „leer" und „nicht
	     geladen" sähen sonst identisch aus. Der Satz unten behauptete dann, es
	     habe keine Entscheidungen gegeben — über einen Datensatz, der sehr wohl
	     welche haben kann. Wer nichts weiß, soll wissen, dass er nichts weiß. -->
	<div class="alert alert-warning" role="alert">
		<Icon icon="lucide:triangle-alert" class="shrink-0" aria-hidden="true" />
		<span>
			Die Historie konnte nicht geladen werden. Ob zu dieser Sichtung Einträge vorliegen, ist damit
			offen — der aktuelle Status oben bleibt gültig.
		</span>
	</div>
{:else if entries.length === 0}
	<!-- Eine leere Liste wortlos zu zeigen wäre eine falsche Aussage: Die
	     Aufzeichnung beginnt mit dieser Tabelle, nicht mit der Sichtung. 19.262
	     Freigaben stammen aus dem Altsystem und haben deshalb keinen Eintrag —
	     ohne diesen Satz liest sich das als „nie bearbeitet". -->
	<p class="text-base-content/70 text-sm">
		Keine Einträge. Die Aufzeichnung beginnt mit der Einführung der Historie — ältere Entscheidungen
		sind nur als aktueller Status erhalten.
	</p>
{:else}
	<ul class="space-y-3">
		{#each entries as entry (entry.id)}
			{@const status = verdictToStatus(entry.verdict)}
			{@const presentation = SIGHTING_STATUS_PRESENTATION[status]}
			<li class="flex items-start gap-3">
				<!-- Icon trägt die Bedeutung mit, nicht nur die Farbe: Freigabe und
				     Ablehnung müssen auch ohne Farbwahrnehmung unterscheidbar sein. -->
				<span class="badge {presentation.badgeClass} mt-0.5 shrink-0 gap-1">
					<Icon icon={presentation.icon} width="14" aria-hidden="true" />
					{VERDICT_LOG_LABEL[entry.verdict]}
				</span>
				<span class="text-base-content/70 text-sm">
					{formatLocalDateTime(entry.recordedAt, 'datetime')}{entry.editor
						? ` durch ${entry.editor}`
						: ''}
				</span>
			</li>
		{/each}
	</ul>
{/if}
