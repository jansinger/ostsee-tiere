<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import type { ReporterHistory } from '#lib/types/reporterHistory.ts';
	import {
		REPORTER_LEVEL_PRESENTATION,
		getReporterLevel,
		reporterBadgeText
	} from './reporterHistoryPresentation';

	interface Props {
		/** `null`/`undefined` heißt „nicht ermittelt" — dann bleibt das Badge aus. */
		history: ReporterHistory | null | undefined;
	}

	let { history }: Props = $props();

	const level = $derived(getReporterLevel(history));
	const presentation = $derived(level ? REPORTER_LEVEL_PRESENTATION[level] : null);
</script>

{#if level && presentation && history}
	<span
		class="badge badge-sm {presentation.badgeClass}"
		data-testid="reporter-badge"
		title={presentation.description}
	>
		<Icon icon={presentation.icon} width="14" height="14" aria-hidden="true" />
		{reporterBadgeText(level, history)}
		<!-- title ist nur per Maus erreichbar — dieselbe Aussage zusätzlich für
		     Screenreader, damit die Bedeutung nicht allein an Farbe und Tooltip
		     hängt (WCAG 1.4.1, gleiche Konstruktion wie beim Spam-Badge). -->
		<span class="sr-only">{presentation.description}</span>
	</span>
{/if}
