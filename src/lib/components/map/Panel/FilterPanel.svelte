<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import { getDaysInYear } from '#lib/map/dateUtils.ts';
	import DualRangeSlider from './DualRangeSlider.svelte';
	import MapPanel from './MapPanel.svelte';
	import {
		SIGHTING_STATUS_ORDER,
		type SightingStatus
	} from '#lib/components/admin/sightingStatus.ts';

	let {
		years = [],
		defaultYear,
		yearCounts = {},
		isLoading = false,
		// M4: Suchbegriff aus der URL wiederhergestellt — nur Anzeige-Startwert,
		// der zugehörige Daten-Fetch läuft über initialSearchTerm des Controllers.
		initialSearch = '',
		// H6: Parent blendet die Toggle-Tabs auf Mobile aus, solange ein Sheet offen ist
		toggleHidden = false,
		// H5: bindable, damit Tastaturkürzel im Parent das Panel direkt über
		// den State steuern können statt über DOM-Queries.
		isOpen = $bindable(false),
		showStatusFilter = false,
		statuses = ['approved'],
		onStatusChange
	}: {
		years?: number[];
		defaultYear?: number;
		yearCounts?: Record<number, number>;
		isLoading?: boolean;
		initialSearch?: string;
		toggleHidden?: boolean;
		isOpen?: boolean;
		showStatusFilter?: boolean;
		statuses?: SightingStatus[];
		onStatusChange?: (statuses: SightingStatus[]) => void;
	} = $props();

	/* Beschriftungen aus Paraglide statt aus SIGHTING_STATUS_PRESENTATION:
	   Jene Konstante trägt deutsche Literale für die Admin-Oberfläche, die
	   Karte ist dagegen eine übersetzte Fläche. */
	const statusLabels: Record<SightingStatus, string> = {
		open: m.components_map_panel_filterpanel_text_status_offen(),
		approved: m.components_map_panel_filterpanel_text_status_freigegeben(),
		rejected: m.components_map_panel_filterpanel_text_status_abgelehnt()
	};

	// Finding 3 (Pre-Merge-Review): Eine refuste Abwahl war bisher stumm — die
	// Checkbox flippt und flippt zurück, ohne dass etwas gesagt wird. Das liest
	// sich wie ein kaputtes Bedienelement, obwohl die Sperre auflösbar ist
	// (erst einen anderen Status anhaken) — nach `.claude/rules/design-system.md`
	// ("Wo die Sperre eine fehlende Eingabe meint, ist eine Fehlermeldung die
	// richtige Form") gehört hier eine Meldung hin, kein stummes Zurückspringen.
	let statusRefusalMessage: string | null = $state(null);
	const statusRefusalId = 'status-filter-refusal';

	function toggleStatus(status: SightingStatus, event: Event): void {
		const next = statuses.includes(status)
			? statuses.filter((entry: SightingStatus) => entry !== status)
			: SIGHTING_STATUS_ORDER.filter((entry) => entry === status || statuses.includes(entry));
		// Leere Auswahl verworfen: Die API antwortet darauf mit 400, und eine
		// Karte ohne Marker liest sich wie ein Datenverlust.
		if (next.length === 0) {
			// `checked={statuses.includes(status)}` ist ein One-Way-Binding: Der
			// Browser hat die Checkbox schon umgestellt, bevor dieser Handler
			// läuft. Bleibt `statuses` unverändert, feuert Svelte kein Re-Render,
			// und die Checkbox zeigt einen Zustand, der nie übernommen wurde —
			// von Hand zurücksetzen ist hier kein überflüssiger Rest.
			(event.currentTarget as HTMLInputElement).checked = statuses.includes(status);
			statusRefusalMessage =
				m.components_map_panel_filterpanel_text_status_mindestens_ein_muss_ausgewaehlt();
			return;
		}
		statusRefusalMessage = null;
		onStatusChange?.([...next]);
	}

	// Explizite User-Auswahl (undefined = noch keine manuelle Wahl getroffen)
	let userSelectedYear: number | undefined = $state(undefined);
	// Effektiv gewähltes Jahr: User-Auswahl hat Vorrang, sonst Prop-Default,
	// sonst das neueste Jahr der absteigend sortierten Liste (N4)
	let selectedYear = $derived(
		userSelectedYear ?? defaultYear ?? years[0] ?? new Date().getFullYear()
	);
	// Bewusst nur der Startwert: danach ist das Eingabefeld (bind:value)
	// die Quelle der Wahrheit.
	// svelte-ignore state_referenced_locally
	let searchValue = $state(initialSearch);

	let daysInYear = $derived(getDaysInYear(selectedYear));

	function handleYearChange(e: Event) {
		const year = parseInt((e.target as HTMLSelectElement).value, 10);
		if (!isNaN(year)) userSelectedYear = year;
	}
</script>

<MapPanel
	panelId="filter-panel"
	titleId="filter-title"
	title={m.components_map_panel_filterpanel_title_filter()}
	toggleText="FILTER"
	icon="lucide:filter"
	togglePositionClass="top-20"
	accentBorderClass="border-primary/20"
	{isLoading}
	{toggleHidden}
	bind:isOpen
>
	<div class="space-y-4">
		<div class="fieldset w-full">
			<label for="year-select" class="label py-1">
				<span class="text-sm font-medium">{m.components_map_panel_filterpanel_text_jahr()}</span>
				{#if isLoading}
					<Icon icon="lucide:loader-2" class="text-primary ml-2 h-3 w-3 animate-spin" />
				{/if}
			</label>
			<select
				id="year-select"
				class="select select-sm focus:select-primary w-full text-sm {isLoading ? 'loading' : ''}"
				title={m.components_map_panel_filterpanel_title_waehlen_sie_das_jahr_aus()}
				onchange={handleYearChange}
			>
				{#each years as year (year)}
					<option value={year} selected={year === selectedYear}>
						{yearCounts[year] ? `${year} (${yearCounts[year]})` : year}
					</option>
				{/each}
			</select>
		</div>

		<div class="fieldset w-full">
			<label for="filter-input" class="label py-1">
				<span class="text-sm font-medium">{m.components_map_panel_filterpanel_text_suchen()}</span>
			</label>
			<div class="relative">
				<input
					id="filter-input"
					type="text"
					bind:value={searchValue}
					placeholder={m.components_map_panel_filterpanel_placeholder_fahrwasser_schiffsname_name()}
					class="input input-sm focus:input-primary w-full pr-10"
					title={m.components_map_panel_filterpanel_title_nach_fahrwasser_seezeichen_schiffsname_o()}
					aria-describedby="filter-help"
				/>
				{#if isLoading}
					<div class="absolute top-1/2 right-3 -translate-y-1/2 transform">
						<Icon icon="lucide:loader-2" class="text-primary h-4 w-4 animate-spin" />
					</div>
				{/if}
			</div>
			<!-- Hilfetext ist über aria-describedby verknüpft — bewusst kein zweites
			     <label>, sonst würde er zusätzlich in den Accessible Name einfließen -->
			<div class="label py-0">
				<span id="filter-help" class="text-base-content/60 text-xs">
					{isLoading ? 'Filter wird angewendet...' : 'Filtert automatisch beim Tippen'}
				</span>
			</div>
		</div>

		{#if showStatusFilter}
			<fieldset
				class="fieldset w-full"
				aria-describedby={statusRefusalMessage ? statusRefusalId : undefined}
			>
				<legend class="label py-1">
					<span class="text-sm font-medium">{m.components_map_panel_filterpanel_text_status()}</span
					>
				</legend>
				<div class="flex flex-col">
					{#each SIGHTING_STATUS_ORDER as status (status)}
						<label class="label cursor-pointer justify-start gap-3">
							<input
								type="checkbox"
								class="checkbox checkbox-primary"
								checked={statuses.includes(status)}
								onchange={(event) => toggleStatus(status, event)}
							/>
							<span class="text-sm">{statusLabels[status]}</span>
						</label>
					{/each}
				</div>
				<!-- Erklärt, warum dieser Block überhaupt da ist: Er erscheint nur mit
				     Admin-Session, und ohne den Hinweis wirkt er beim Teilen eines
				     Screenshots wie eine öffentliche Funktion. -->
				<div class="label py-0">
					<span class="text-base-content/70 text-xs">
						{m.components_map_panel_filterpanel_text_status_hinweis()}
					</span>
				</div>
				<!-- Finding 3: role="status" statt role="alert" — eine refuste Abwahl
				     ist kein unterbrechender Fehlerzustand, sondern eine auflösbare
				     Sperre. Kein Toast: der sitzt auf z-overlay über der Karte, während
				     dieses Panel auf Mobile ein Bottom-Sheet ist und genau den Bereich
				     verdeckte, den man gerade bedient hat. -->
				{#if statusRefusalMessage}
					<div class="label py-0" id={statusRefusalId} role="status" aria-live="polite">
						<span class="text-error text-xs">{statusRefusalMessage}</span>
					</div>
				{/if}
			</fieldset>
		{/if}

		<div class="space-y-2">
			<div class="label py-1">
				<span class="text-sm font-medium">{m.components_map_panel_filterpanel_text_zeitraum()}</span
				>
			</div>

			<!-- M10: Ein Track, zwei Griffe, gefüllter Bereich; Datums-Felder als
			     gleichwertige Alternative. DOM-Verträge (IDs, input-Events) bleiben
			     erhalten — timeSliderManager und applyUrlFilters greifen direkt zu. -->
			<DualRangeSlider max={daysInYear - 1} year={selectedYear} />
		</div>
	</div>
</MapPanel>
