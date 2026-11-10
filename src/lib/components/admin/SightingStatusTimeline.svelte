<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
	import { SIGHTING_STATUS_PRESENTATION, verdictToStatus } from './sightingStatus';
	import { buildSightingHistory, VERDICT_LOG_LABEL } from './sightingStatusLog';
	import type { SightingStatusLogEntry } from './sightingStatusLog';

	let {
		entries,
		failed = false,
		anonymizedAt = null
	}: {
		entries: SightingStatusLogEntry[];
		/** Die Historie konnte nicht geladen werden — siehe Markup, nicht dasselbe wie „leer". */
		failed?: boolean;
		/** `anonymisiert_am` der Sichtung — wird als Eintrag eingereiht, siehe `buildSightingHistory`. */
		anonymizedAt?: Date | string | null | undefined;
	} = $props();

	const items = $derived(buildSightingHistory(failed ? [] : entries, anonymizedAt));
	const emptyHint = $derived(
		`${items.length === 0 ? 'Keine Einträge.' : 'Keine Prüfentscheidungen aufgezeichnet.'} ` +
			'Die Aufzeichnung beginnt mit der Einführung der Historie — ältere Entscheidungen sind nur als aktueller Status erhalten.'
	);
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
	     ohne diesen Satz liest sich das als „nie bearbeitet". Steht eine
	     Anonymisierung darunter, gilt der Satz nur für die Prüfentscheidungen. -->
	<p class="text-base-content/70 text-sm">{emptyHint}</p>
{/if}

<!-- Die Anonymisierung steht auch beim Ladefehler und beim Altbestand da: Ihr
     Zeitpunkt kommt aus der Zeile (`anonymisiert_am`), nicht aus dem Log, und
     ist deshalb immer bekannt. Kein Bearbeiter — der nächtliche Job hat keinen,
     und wer ein Löschersuchen ausgeführt hat, steht im Audit-Log. -->
{#if items.length > 0}
	<ul class="space-y-3" class:mt-3={failed || entries.length === 0}>
		{#each items as item (item.key)}
			<li class="flex items-start gap-3">
				{#if item.kind === 'verdict'}
					{@const status = verdictToStatus(item.entry.verdict)}
					{@const presentation = SIGHTING_STATUS_PRESENTATION[status]}
					<!-- Icon trägt die Bedeutung mit, nicht nur die Farbe: Freigabe und
					     Ablehnung müssen auch ohne Farbwahrnehmung unterscheidbar sein. -->
					<span class="badge {presentation.badgeClass} mt-0.5 shrink-0 gap-1">
						<Icon icon={presentation.icon} width="14" aria-hidden="true" />
						{VERDICT_LOG_LABEL[item.entry.verdict]}
					</span>
					<span class="text-base-content/70 text-sm">
						{formatLocalDateTime(item.at, 'datetime')}{item.entry.editor
							? ` durch ${item.entry.editor}`
							: ''}
					</span>
				{:else}
					<span class="badge badge-ghost mt-0.5 shrink-0 gap-1">
						<Icon icon="lucide:eraser" width="14" aria-hidden="true" />
						Kontaktdaten anonymisiert
					</span>
					<span class="text-base-content/70 text-sm">
						{formatLocalDateTime(item.at, 'datetime')}
					</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
