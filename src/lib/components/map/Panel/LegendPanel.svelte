<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { CountData } from '$lib/map/countManager';
	import { getMapCountManager } from '$lib/map/mapContext';
	import type { MapTranslations } from '$lib/map/mapUtils';
	import {
		clusterStyleSteps,
		legendGroups,
		speciesGroupStyles,
		speciesSymbols,
		MARKER_BACKGROUND_COLOR,
		STATUS_LINE_CAP,
		STATUS_LINE_DASH,
		TOTFUND_RING_COLOR
	} from '$lib/map/styleUtils';
	import type { SightingStatus } from '$lib/components/admin/sightingStatus';
	import Icon from '$lib/components/Icon.svelte';
	import MapPanel from './MapPanel.svelte';

	let {
		translations,
		counts,
		// H6: Parent blendet die Toggle-Tabs auf Mobile aus, solange ein Sheet offen ist
		toggleHidden = false,
		// H5: bindable, damit Tastaturkürzel im Parent das Panel direkt über
		// den State steuern können statt über DOM-Queries.
		isOpen = $bindable(false),
		// M4/N6: Sichtbarkeits-States sind bindable, damit der Parent sie aus
		// der URL initialisieren und über die Filter-Chips zurücksetzen kann —
		// Checkboxen hier und Chips dort bleiben so eine einzige Wahrheit.
		speciesVisibility = $bindable({}),
		colorVisibility = $bindable({}),
		// M3: Seezeichen-Ebene (OpenSeaMap) umschaltbar — der Parent reicht die
		// Sichtbarkeit an den Map-Controller weiter.
		onSeamarkToggle = undefined,
		// Task 8: nur im Admin-Kontext gesetzt — die öffentliche Karte kennt keine
		// Bearbeitungszustände und zeigt diesen Abschnitt deshalb nie.
		showStatusLegend = false
	}: {
		translations: MapTranslations;
		counts: CountData;
		toggleHidden?: boolean;
		isOpen?: boolean;
		speciesVisibility?: Record<string, boolean>;
		colorVisibility?: Record<string, boolean>;
		onSeamarkToggle?: (visible: boolean) => void;
		showStatusLegend?: boolean;
	} = $props();

	// CountManager via typisiertem Svelte Context (Symbol-Key, siehe mapContext.ts)
	const countManager = getMapCountManager();

	// Anzahl-Filtergruppen in Anzeige-Reihenfolge (Totfund zuletzt) — aus styleUtils
	const countGroups = $derived(
		Object.entries(legendGroups).map(([key, group]) => ({
			key,
			label: key === 'ct0' ? String(translations.found_dead) : group.name
		}))
	);

	// Farbschlüssel: Tiergruppen-Ringe plus Totfund-Ring (gleiche Swatch-Darstellung)
	const ringLegendEntries = $derived([
		...Object.values(speciesGroupStyles).map(({ label, color }) => ({ label, color })),
		{ label: String(translations.found_dead), color: TOTFUND_RING_COLOR }
	]);

	// Bearbeitungsstand: Muster und Linienende kommen aus derselben Quelle wie
	// der Marker (styleUtils) — eine abgeschriebene Zahl hier ließe die Legende
	// still etwas anderes zeigen als die Karte. Reihenfolge: der Regelfall
	// zuerst, danach die beiden Abweichungen.
	const statusLegendEntries: {
		status: SightingStatus;
		label: string;
		description: string;
	}[] = $derived([
		{
			status: 'approved',
			label: m.components_map_panel_filterpanel_text_status_freigegeben(),
			description: m.components_map_panel_legendpanel_text_status_freigegeben_erklaerung()
		},
		{
			status: 'open',
			label: m.components_map_panel_filterpanel_text_status_offen(),
			description: m.components_map_panel_legendpanel_text_status_offen_erklaerung()
		},
		{
			status: 'rejected',
			label: m.components_map_panel_filterpanel_text_status_abgelehnt(),
			description: m.components_map_panel_legendpanel_text_status_abgelehnt_erklaerung()
		}
	]);

	// Initialisiere Visibility-States (alle sichtbar). Nur fehlende Keys
	// auffüllen — bereits gesetzte Werte (z. B. aus der URL wiederhergestellte
	// ausgeblendete Arten, M4) dürfen nicht überschrieben werden.
	$effect(() => {
		if (translations && translations.speciesMap) {
			Object.keys(translations.speciesMap).forEach((key) => {
				if (!(key in speciesVisibility)) speciesVisibility[key] = true;
			});

			Object.keys(legendGroups).forEach((colorGroup) => {
				if (!(colorGroup in colorVisibility)) colorVisibility[colorGroup] = true;
			});
		}
	});

	// Event Handler für Species-Checkboxes
	function handleSpeciesToggle(speciesId: string, visible: boolean) {
		speciesVisibility[speciesId] = visible;
		countManager.setSpeciesVisibility(speciesId, visible);
	}

	// Event Handler für Color-Checkboxes
	function handleColorToggle(colorGroup: string, visible: boolean) {
		colorVisibility[colorGroup] = visible;
		countManager.setColorVisibility(colorGroup, visible);
	}

	// `Object.entries(translations.speciesMap)` (Aufrufstelle unten) liefert
	// `speciesName` als `unknown`, nicht als `string` — eine bereits bestehende
	// Typlücke, bisher folgenlos, weil `String(value)` und die reine
	// Textknoten-Interpolation `{value}` jeden Typ klaglos annehmen.
	//
	// Ein generierter Paraglide-Botschaftsaufruf (`m.<key>({...})`) nimmt ein
	// `unknown`-Argument dagegen NICHT klaglos an: Sein Typ ist eine
	// Schnittmenge aus Aufruf-Signatur und `MessageMetadata<Inputs, Options,
	// {}>`, und TypeScript löst den Aufruf bei einem `unknown`-Argument
	// fälschlich gegen die `{}`-Seite der Schnittmenge auf
	// („Type 'unknown' is not assignable to type '{}'", reproduziert isoliert
	// gegen die kompilierten `.d.ts` außerhalb von Svelte — kein
	// Komponenten-spezifischer Bug). `String(...)` am Argument macht daraus
	// wieder ein konkretes `string` und behebt die Fehlmeldung.
	function speciesVisibilityAriaLabel(
		speciesName: unknown,
		visible: number,
		total: number
	): string {
		return m.components_map_panel_legendpanel_aria_label_sichtbarkeit_fuer_value_umschalten_aktue({
			value: String(speciesName),
			visible,
			total
		});
	}

	// M3: Sichtbarkeit der Seezeichen-Ebene — Default an (wie bisher)
	let seamarkVisible = $state(true);
	function handleSeamarkToggle(visible: boolean) {
		seamarkVisible = visible;
		onSeamarkToggle?.(visible);
	}
</script>

<MapPanel
	panelId="legend-panel"
	titleId="legend-title"
	title={m.components_map_panel_legendpanel_title_legende()}
	toggleText={m.components_map_panel_legendpanel_title_legende().toLocaleUpperCase()}
	icon="lucide:list"
	togglePositionClass="top-52"
	accentBorderClass="border-secondary/20"
	{toggleHidden}
	bind:isOpen
>
	<!-- Info-Box: wie die Marker codiert sind -->
	<div class="bg-base-300/50 mb-4 rounded-lg p-3 text-sm">
		<div class="flex items-start gap-2">
			<Icon
				icon="lucide:info"
				class="text-info-strong mt-0.5 h-4 w-4 shrink-0"
				aria-hidden="true"
			/>
			<div>
				<strong>{m.components_map_panel_legendpanel_text_so_lesen_sie_die_karte()}</strong>
				{m.components_map_panel_legendpanel_text_die_ringfarbe_zeigt_die_tiergruppe()}
			</div>
		</div>
	</div>

	<!-- Tiergruppen-Farbschlüssel -->
	<div class="mb-4 flex flex-wrap gap-3">
		{#each ringLegendEntries as entry (entry.label)}
			<span class="flex items-center gap-1.5 text-xs">
				<span
					class="inline-block h-4 w-4 rounded-full"
					style="background-color: {MARKER_BACKGROUND_COLOR}; border: 3px solid {entry.color};"
					aria-hidden="true"
				></span>
				{entry.label}
			</span>
		{/each}
	</div>

	<div class="divider">{translations.species_legend}</div>

	<div class="mb-6 space-y-3">
		{#each Object.entries(translations.speciesMap) as [key, value] (key)}
			{@const symbol = speciesSymbols[key]}
			{@const total = counts.speciesCounts[key]?.total || 0}
			{@const visibleCount = counts.speciesCounts[key]?.visible || 0}
			<div
				class="hover:bg-base-200 flex items-center gap-3 rounded-lg p-2 transition-colors"
				data-species-row={key}
			>
				<!-- 0/0-Arten ausgrauen: visuelle Teile abschwächen, Checkbox bleibt bedienbar -->
				<div class="flex flex-1 items-center gap-3 {total === 0 ? 'opacity-60 grayscale' : ''}">
					<div
						class="shadow-raised flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
						style="background-color: {MARKER_BACKGROUND_COLOR}; border: 3px solid {symbol
							? symbol.baseColor
							: speciesGroupStyles.unbekannt.color};"
					>
						{#if symbol}
							<span class="text-base" title={String(value)}>{symbol.symbol}</span>
						{:else}
							<div class="bg-base-content/40 h-4 w-4 rounded-full"></div>
						{/if}
					</div>

					<div class="flex items-center gap-2">
						<span class="text-sm font-medium">{value}</span>
						{#if symbol}
							<span
								class="text-base-content rounded-full border-2 px-2 py-0.5 text-xs font-medium"
								style="border-color: {symbol.baseColor};"
							>
								{speciesGroupStyles[symbol.category].label}
							</span>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<span class="text-base-content/70 font-mono text-xs">
						{visibleCount}/{total}
					</span>
					<input
						type="checkbox"
						class="species-checkbox checkbox checkbox-sm"
						value={key}
						checked={speciesVisibility[key] ?? true}
						onchange={(e) => handleSpeciesToggle(key, (e.target as HTMLInputElement).checked)}
						aria-label={speciesVisibilityAriaLabel(value, visibleCount, total)}
					/>
				</div>
			</div>
		{/each}
	</div>

	<div class="divider">{translations.count}</div>

	<div class="space-y-3">
		{#each countGroups as group (group.key)}
			<div class="hover:bg-base-200 flex items-center gap-3 rounded-lg p-2 transition-colors">
				{#if group.key === 'ct0'}
					<span
						class="shadow-raised h-5 w-5 shrink-0 rounded-full"
						style="background-color: {MARKER_BACKGROUND_COLOR}; border: 3px solid {TOTFUND_RING_COLOR};"
						aria-hidden="true"
					></span>
				{:else}
					<span
						class="text-base-content/70 w-5 shrink-0 text-center font-mono text-xs"
						aria-hidden="true">#</span
					>
				{/if}
				<span class="flex-1 text-sm">{group.label}</span>
				<span class="text-base-content/70 font-mono text-xs"
					>{counts.colorCounts[group.key] || 0}</span
				>
				<input
					type="checkbox"
					class="color-checkbox checkbox checkbox-sm"
					value={group.key}
					checked={colorVisibility[group.key] ?? true}
					onchange={(e) => handleColorToggle(group.key, (e.target as HTMLInputElement).checked)}
					aria-label={m.components_map_panel_legendpanel_aria_label_sichtungen_der_gruppe_label_anzeigen_aus(
						{ label: group.label }
					)}
				/>
			</div>
		{/each}
	</div>

	<div class="divider">{m.components_map_panel_legendpanel_text_kartenebenen()}</div>

	<!-- M3: Seezeichen-Ebene (OpenSeaMap) umschaltbar — sie dominiert ab
	     mittleren Zoomstufen und ist für die Kernaufgabe sekundär -->
	<div class="hover:bg-base-200 flex items-center gap-3 rounded-lg p-2 transition-colors">
		<Icon icon="lucide:anchor" class="text-base-content/70 h-4 w-4 shrink-0" aria-hidden="true" />
		<span class="flex-1 text-sm"
			>{m.components_map_panel_legendpanel_text_seezeichen_tonnen_openseamap()}</span
		>
		<input
			type="checkbox"
			class="seamark-checkbox checkbox checkbox-sm"
			checked={seamarkVisible}
			onchange={(e) => handleSeamarkToggle((e.target as HTMLInputElement).checked)}
			aria-label={m.components_map_panel_legendpanel_aria_label_seezeichen_ebene_openseamap_anzeigen_aus()}
		/>
	</div>

	<div class="divider">{m.components_map_panel_legendpanel_text_cluster()}</div>

	<!-- Cluster-Farbskala erklären (M1) — aus derselben Konstante wie die Karte -->
	<div class="mb-8">
		<div class="mb-2 flex items-center gap-1" aria-hidden="true">
			{#each clusterStyleSteps as step (step.color)}
				<span
					class="inline-block rounded-full"
					style="background-color: {step.color}; width: {step.radius}px; height: {step.radius}px;"
				></span>
			{/each}
		</div>
		<p class="text-base-content/80 text-sm">
			{m.components_map_panel_legendpanel_text_blaue_kreise_fassen_mehrere_sichtungen()}
		</p>
	</div>

	{#if showStatusLegend}
		<div class="space-y-2">
			<h3 class="text-sm font-medium">
				{m.components_map_panel_legendpanel_text_bearbeitungsstand()}
			</h3>
			{#each statusLegendEntries as entry (entry.status)}
				<div class="flex items-center gap-3">
					<!-- Gerendertes Muster statt Prosa („Gestrichelt: …"), wie bei
					     Artring, Totfund-Ring und Cluster-Skala weiter oben. Radius,
					     Strichbreite und Muster entsprechen dem Marker (styleUtils);
					     dekorativ, die Bedeutung steht als Text daneben. -->
					<svg
						data-status-swatch={entry.status}
						class="text-base-content h-8 w-8 shrink-0"
						viewBox="0 0 32 32"
						aria-hidden="true"
					>
						<circle
							cx="16"
							cy="16"
							r="14"
							fill={MARKER_BACKGROUND_COLOR}
							stroke="currentColor"
							stroke-width="3"
							stroke-dasharray={STATUS_LINE_DASH[entry.status]?.join(' ')}
							stroke-linecap={STATUS_LINE_CAP[entry.status]}
						/>
					</svg>
					<span class="text-sm font-medium">{entry.label}</span>
					<span class="text-base-content/70 text-xs">{entry.description}</span>
				</div>
			{/each}
			<!-- Ein Cluster ist eine Menge, kein Einzelfall: Der durchgezogene Ring
			     sagt „alle hier sind freigegeben", nicht „die meisten". Die Muster
			     darüber zeigen den Einzelmarker; ohne diesen Satz liest sich ein
			     gestrichelter Cluster als „diese Sichtungen sind offen". -->
			<p class="text-base-content/70 text-xs">
				{m.components_map_panel_legendpanel_text_status_cluster_erklaerung()}
			</p>
		</div>
	{/if}
</MapPanel>
