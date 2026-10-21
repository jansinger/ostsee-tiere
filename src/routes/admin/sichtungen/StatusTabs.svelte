<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { STATUS_TABS, type StatusCounts, type StatusTabValue } from './statusTabs';

	interface Props {
		/** Trefferzahlen der aktuellen Filtermenge **ohne** den Statusfilter. */
		counts: StatusCounts;
		/** Der Stand aus der URL (`?verified=`); leer heißt „Alle". */
		active: StatusTabValue;
		/** Meldet den gewählten Wert; das Navigieren macht die Seite. */
		onselect: (value: StatusTabValue) => void;
	}

	let { counts, active, onselect }: Props = $props();
</script>

<!--
	Statusleiste über der Tabelle (WP2). Der Status ist die Haupt-Triage-
	Dimension und steckte bis hierher im aufklappbaren Filter-Panel; das
	`<select>` dort bleibt, beide schreiben denselben URL-Parameter.

	**`join` aus `.btn` statt `tabs tabs-border`** — die offengelassene
	Entscheidung des Auftrags, mit drei Gründen:
	1. Das hier sind keine Reiter im ARIA-Sinn. `role="tab"` verspricht ein
	   Widget mit `tabpanel`, Roving-Tabindex und Pfeiltasten-Navigation; die
	   Leiste navigiert stattdessen die Seite. `aria-current` an einer
	   Schaltfläche sagt genau das, was hier passiert.
	2. Nur `.btn` bekommt über `app.css` die 44px-Touch-Target-Mindestgröße
	   (design-system.md, „Feldmodus und Touch-Targets"). `.tab` bliebe darunter
	   — und diese Leiste ist gerade auf Mobil das wichtigste Bedienelement.
	3. Dieselbe Bauform wie die Ansichten-Leiste direkt darüber: aktiv =
	   `btn-active` (dieselbe „aktueller Zustand"-Optik wie die Seitenzahl in
	   der Paginierung weiter unten), alle übrigen `btn-outline`. `btn-primary`
	   bleibt Export und „Anwenden" vorbehalten (Button-Hierarchie) — sonst
	   sagt dieselbe Vollton-Fläche gleichzeitig „das ist die Aktion hier" und
	   „das ist ausgewählt", und auf breiten Bildschirmen standen bis zu vier
	   solcher Flächen binnen 150px Höhe nebeneinander.

	Waagerecht scrollbar statt umbrechend: Ein Umbruch verschöbe bei jedem
	Filterwechsel die Tabelle darunter.
-->
<nav class="overflow-x-auto" aria-label="Status der Sichtungen">
	<div class="join">
		{#each STATUS_TABS as tab (tab.value)}
			{@const aktiv = tab.value === active}
			<button
				type="button"
				class="btn btn-sm join-item {aktiv ? 'btn-active' : 'btn-outline'}"
				aria-current={aktiv ? 'true' : undefined}
				onclick={() => onselect(tab.value)}
			>
				{#if tab.icon}
					<Icon icon={tab.icon} width="16" height="16" aria-hidden="true" />
				{/if}
				{tab.label}
				<!-- Neutrales Badge ohne Statusfarbe: Die Zahl ist Text, und eine
				     Statusfarbe als Textfarbe verfehlt den Kontrast
				     (design-system.md, „Statusfarben haben zwei Rollen"). Die
				     Bedeutung trägt das Icon davor. -->
				<span class="badge badge-sm" data-testid="status-tab-count">{counts[tab.countKey]}</span>
			</button>
		{/each}
	</div>
</nav>
