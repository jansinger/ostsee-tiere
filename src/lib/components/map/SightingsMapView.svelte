<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { MapCountManager, type CountData } from '$lib/map/countManager';
	import { getDaysInYear } from '$lib/map/dateUtils';
	import type { MapTranslations } from '$lib/map/mapUtils';
	import { SichtungenMap } from '$lib/map/optimizedMapController';
	import { MapTimeSliderManager } from '$lib/map/timeSliderManager';
	import { getSpeciesOptions } from '$lib/report/formOptions/species';
	import {
		deriveSelectableYears,
		getDefaultSightingYear,
		pickDefaultYear,
		type YearWithCount
	} from '$lib/utils/date/defaultYear';
	import { setMapCountManager } from '$lib/map/mapContext';
	import { toListEntries, type SightingListProperties } from '$lib/map/listViewUtils';
	import { legendGroups } from '$lib/map/styleUtils';
	import {
		buildFilterUrlState,
		dayOfYearFromIsoDate,
		parseMapFilterParams,
		serializeMapFilterParams,
		type MapFilterUrlState
	} from '$lib/map/urlFilterState';
	import { SIGHTING_STATUS_ORDER, type SightingStatus } from '$lib/components/admin/sightingStatus';
	import { DEFAULT_MAP_STATUSES, isPublicStatusSelection } from '$lib/map/statusRequestParams';
	import { createYearsRequestSequencer, resolveYearsUpdate } from '$lib/map/yearsRequestSequencer';
	import { reconcileDisplayedYear } from '$lib/map/yearDisplayReconciliation';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	// Kein `import 'ol/ol.css'` hier: die Datei kommt global aus app.css, und zwar
	// bewusst VOR mapStyles.css. Ein zweiter Import aus einer Komponente hängt
	// ol.css erneut hinter die Projekt-Overrides und macht sie wirkungslos —
	// genau so ist die Titel-Überlappung des Zoom-Controls entstanden.
	import LoadingOverlay from './LoadingOverlay.svelte';
	import StatusBlock from '$lib/components/StatusBlock.svelte';
	import FilterPanel from './Panel/FilterPanel.svelte';
	import LegendPanel from './Panel/LegendPanel.svelte';
	import SightingsListView from './SightingsListView.svelte';

	// `getSpeciesOptions()` (statt der früheren `speciesLabels`-Konstante aus
	// species.ts — die ist seit Aufgabe 3.2 modul-intern) einmalig zu einem
	// Record umgebaut. Bleibt bewusst bei der aktuellen Locale zum Ladezeitpunkt
	// (kein `locale`-Prop hier) — diese Karten-Komponente selbst lokalisierbar
	// zu machen ist außerhalb der Aufgabe 3.2.
	const speciesLabels: Record<string, string> = Object.fromEntries(
		getSpeciesOptions().map((option) => [option.value, option.label])
	);

	// Props
	let {
		mapContainerId = 'map',
		showTitle = true,
		title = 'Sichtungskarte',
		showLogo = true,
		containerClass = 'relative h-screen w-screen overflow-hidden',
		titleClass = 'bg-base-100 text-base-content text-sm z-raised rounded-lg px-3 py-1.5 font-bold shadow-floating flex items-center gap-2'
	}: {
		mapContainerId?: string;
		showTitle?: boolean;
		title?: string;
		showLogo?: boolean;
		containerClass?: string;
		titleClass?: string;
	} = $props();

	// Übersetzungen für die Karte
	const translations: MapTranslations = {
		overview: m.components_map_sightingsmapview_text_uebersichtskarte(),
		zoom_title: m.components_map_sightingsmapview_text_kartenauschnitt_auf_alle_meldungen_zoome(),
		zoom: m.components_map_sightingsmapview_text_alle_meldungen(),
		// M6: kein Trailing-Space — der Builder setzt das Datum mit eigenem Trenner
		report_date: m.components_map_sightingsmapview_text_sichtung_vom(),
		language: 'de',
		species: m.components_map_sightingsmapview_text_tierart(),
		species_legend: m.components_map_sightingsmapview_text_tierart_sichtbar_gesamt(),
		position: m.components_map_sightingsmapview_text_position(),
		count: m.components_map_sightingsmapview_text_anzahl_tiere(),
		young: m.components_map_sightingsmapview_text_davon_jungtiere(),
		ship: m.components_map_sightingsmapview_text_schiffsname(),
		name: m.components_map_sightingsmapview_text_name(),
		area: m.components_map_sightingsmapview_text_fahrwasser(),
		latitude: m.components_map_sightingsmapview_text_breite(),
		longitude: m.components_map_sightingsmapview_text_laenge(),
		found_dead: m.components_map_sightingsmapview_text_totfund(),
		// Importierte Tierartendaten für die Karte verwenden
		speciesMap: speciesLabels
	};

	// Manager-Instanzen
	// $state: Die Instanz entsteht erst nach dem async Jahres-Fetch — der
	// Callback-Registrierungs-$effect unten muss auf die Zuweisung reagieren.
	let mapInstance = $state<SichtungenMap | null>(null);
	let timeSliderManager: MapTimeSliderManager | null = null;

	// CountManager wird auf Top-Level erstellt und via Context bereitgestellt,
	// damit Child-Komponenten (LegendPanel) ihn bei ihrer Initialisierung finden.
	// setContext MUSS synchron während der Komponenteninitialisierung aufgerufen werden.
	const countManager = new MapCountManager();
	setMapCountManager(countManager);

	// Reaktive Variablen
	let counts = $state<CountData>({
		speciesCounts: {},
		colorCounts: {}
	});

	// M4: Filterzustand aus der URL — einmalig beim Initialisieren gelesen.
	// Danach ist der Map-Controller die Quelle der Wahrheit, die URL folgt
	// per replaceState (siehe syncFiltersToUrl). Die Route läuft mit ssr=false,
	// window/page.url sind hier also verfügbar.
	const urlFilterState = parseMapFilterParams(page.url.searchParams);

	/* Das Admin-Flag kommt aus dem Root-Layout (`+layout.server.ts`), das es
	   serverseitig aus den Rollen berechnet — `PublicUser` trägt die Rollen
	   bewusst nicht. Superadmins tragen zusätzlich die Rolle `admin`, `showAdminMenu`
	   deckt damit beide Gruppen ab. Das Flag steuert nur die Sichtbarkeit; die
	   Sicherheitsgrenze liegt in der API (statusFilter.ts). */
	let isAdmin = $derived(page.data.showAdminMenu === true);

	/* Nicht-Admins bekommen die URL-Auswahl gar nicht erst zu sehen — sonst
	   liefe eine geteilte Admin-URL bei ihnen in einen 403 und die Karte bliebe leer.

	   Die URL-Auswahl gehört in den Initialwert, nicht in den Aufbau-Block: Sie gilt
	   nur für den ersten Render (danach führt der Controller, siehe `urlSyncEnabled`),
	   und eine Zuweisung dort las sich selbst wieder ein. Hergang und Symptom stehen
	   im Test „ein geteilter Link mit Statusauswahl lädt die Karte“. */
	let statuses = $state<SightingStatus[]>(
		page.data.showAdminMenu === true && urlFilterState.statuses?.length
			? [...urlFilterState.statuses]
			: [...DEFAULT_MAP_STATUSES]
	);

	// Bisheriges Fallback-Jahr, synchron verfügbar für den allerersten Render
	// (bevor GET /api/map/sightings/years geladen ist). Als Konstante erfasst,
	// damit die beiden $state-Deklarationen unten nicht voneinander abhängen.
	const initialFallbackYear = getDefaultSightingYear();
	// Default-Jahr: wird aktualisiert, sobald die verfügbaren Jahre geladen
	// sind (QW2b). Bei fehlgeschlagenem Request bleibt der Fallback. Ein Jahr
	// aus der URL hat Vorrang — es speist das Jahres-Dropdown im FilterPanel.
	let defaultYear = $state(urlFilterState.year ?? initialFallbackYear);
	// Jahr, auf das „Filter zurücksetzen" führt (QW2b-Default, unabhängig von
	// der URL) — Referenz dafür, ob das angezeigte Jahr als Filter-Chip zählt.
	let apiDefaultYear = $state(initialFallbackYear);
	// Rohdaten der verfügbaren Jahre (Antwort von GET /api/map/sightings/years)
	let availableYearsData = $state<YearWithCount[]>([]);
	// N4: Wählbare Jahre für das Filter-Dropdown — alle Jahre mit Daten aus dem
	// Endpoint (vor dem Laden bzw. bei Fehlschlag: Fallback auf die letzten
	// 11 Kalenderjahre), vereint mit dem aktuellen Jahr und einem URL-Jahr (M4).
	const currentCalendarYear = new Date().getFullYear();
	let years = $derived(
		deriveSelectableYears(availableYearsData, currentCalendarYear, urlFilterState.year)
	);
	// Sichtungsanzahl je Jahr für die Jahres-Dropdown-Beschriftung ("2025 (817)")
	let yearCounts = $derived(
		Object.fromEntries(availableYearsData.map((entry) => [entry.year, entry.count]))
	);
	// Jüngstes Jahr mit tatsächlichen Daten (für den Empty-State-Button, QW2b)
	let latestYearWithData = $derived(
		availableYearsData
			.filter((entry) => entry.count > 0)
			.reduce<number | undefined>(
				(latest, entry) => (latest === undefined || entry.year > latest ? entry.year : latest),
				undefined
			)
	);

	// UI-Zustände
	// K3: Umschaltbare Ansicht — die Liste ist die Screenreader-/Tastatur-Alternative
	// zur Karte und zeigt dieselbe gefilterte Datenmenge.
	let viewMode = $state<'map' | 'list'>('map');
	let showKeyboardHelp = $state(false);
	// H5: Panel-Zustände leben hier und werden per bind:isOpen an die Panels
	// gereicht — Tastaturkürzel schalten den State direkt statt DOM-Buttons
	// per querySelector zu klicken.
	let filterOpen = $state(false);
	let legendOpen = $state(false);

	// H6: Es ist immer nur ein Panel offen — beide liegen an derselben Position
	// (Desktop rechts, Mobile als Bottom-Sheet) und würden sich sonst überlagern.
	$effect(() => {
		if (filterOpen) legendOpen = false;
	});
	$effect(() => {
		if (legendOpen) filterOpen = false;
	});
	let isLoadingData = $state(false);
	let isInitialLoading = $state(true);
	let errorMessage = $state<string | null>(null);

	// M4/N6: Sichtbarkeits-States der Legende — hierher gehoben, damit
	// URL-Initialisierung und Filter-Chips dieselben Checkbox-Zustände
	// steuern wie das LegendPanel (bind: an dessen Props).
	let speciesVisibility = $state<Record<string, boolean>>({});
	let colorVisibility = $state<Record<string, boolean>>({});

	// N6: aktuell aktive Filter für die Chips — nach jedem Count-Update aus
	// dem Controller-Zustand neu abgeleitet (Default-Werte sind weggelassen).
	let activeFilters = $state<MapFilterUrlState>({});
	let hasActiveFilters = $derived(
		activeFilters.year !== undefined ||
			activeFilters.query !== undefined ||
			activeFilters.from !== undefined ||
			(activeFilters.hiddenSpecies?.length ?? 0) > 0 ||
			(activeFilters.hiddenColors?.length ?? 0) > 0 ||
			!isPublicStatusSelection(statuses)
	);

	/**
	 * Darstellung der Filter-Chips (UX-Review 2026-07-30: „zu präsent, zu viel
	 * Platz oben").
	 *
	 * Die 44px Trefferfläche bleiben — `min-h-11` ist WCAG 2.5.5 und nicht
	 * verhandelbar. Zurückgenommen wird ausschließlich das Gewicht: halbtransparent
	 * und mit `backdrop-blur` statt deckendem `bg-base-100`, `shadow-lg` entfällt,
	 * Beschriftung auf `text-support` in normaler Schriftstärke.
	 *
	 * „wie der Kartentitel" stand hier bis 2026-08-14 als Vergleich — das trifft
	 * nicht mehr zu: Der Titel ist inzwischen deckend, weil er mit `glass` über
	 * einer dunklen Kachel nur 1,07:1 erreichte. Die Chips bleiben trotzdem
	 * halbtransparent, und das ist kein übersehener Rest: `bg-base-100/80` ist
	 * über einer schwarzen Kachel rgb(171, 175, 180), `text-base-content` darauf
	 * 8,91:1. Der Unterschied zum Titel ist die Deckkraft — `glass` hat gar keine
	 * eigene Fläche, `/80` sehr wohl.
	 *
	 * Der eigentliche Platzfresser war aber nicht das Gewicht, sondern der Umbruch:
	 * mit `flex-wrap` wuchs das Band bei mehreren aktiven Filtern auf zwei bis drei
	 * 44px-Reihen und verdeckte die Karte. Eine Zeile mit horizontalem Scroll
	 * begrenzt es auf konstant eine Reihe, unabhängig von der Anzahl der Filter.
	 *
	 * Der Klassenname steht absichtlich als vollständiges Literal hier: Tailwind
	 * erkennt nur komplette Strings im Quelltext (siehe .claude/rules/daisyui.md).
	 */
	const chipClass =
		'btn btn-sm border-base-300 bg-base-100/80 text-support min-h-11 shrink-0 gap-1 font-normal backdrop-blur-md';

	// URL-Schreiben erst nach applyUrlFilters() freischalten — die Zwischen-
	// stände des Initial-Loads würden die geteilten Params sonst wegkürzen.
	let urlSyncEnabled = false;

	// Aktuell angezeigtes Jahr für den Titel
	let currentDisplayedYear = $state(initialFallbackYear);

	// Feature-Anzahl direkt vom Map-Controller abfragen (robuster als counts-basiert)
	let featureCount = $state(0);
	let totalFeatures = $derived(
		Object.values(counts.speciesCounts).reduce((sum, c) => sum + c.total, 0)
	);
	let visibleFeatures = $derived(
		Object.values(counts.speciesCounts).reduce((sum, c) => sum + c.visible, 0)
	);
	// Die Empty-State-Overlays gehören zur Kartenansicht — in der Listenansicht
	// übernimmt SightingsListView die "Keine Sichtungen"-Meldung (role="status").
	let showNoResults = $derived(
		viewMode === 'map' &&
			!isInitialLoading &&
			!isLoadingData &&
			!errorMessage &&
			featureCount === 0 &&
			totalFeatures === 0
	);
	let showNoVisibleResults = $derived(
		viewMode === 'map' &&
			!isInitialLoading &&
			!isLoadingData &&
			!errorMessage &&
			featureCount > 0 &&
			visibleFeatures === 0
	);

	// K3: Einträge für die Listenansicht — gleiche Datenbasis und gleiche Filter
	// wie die Karte. `counts` dient als reaktiver Trigger: der CountManager feuert
	// nach jeder Filter-, Zeitraum- und Jahresänderung, dadurch bleibt die Liste
	// ohne zweiten Datenpfad synchron zur Karte.
	let listEntries = $derived.by(() => {
		void counts;
		if (!mapInstance) return [];
		const hidden = mapInstance.getHidden();
		const filters = {
			hiddenSpecies: hidden.species,
			hiddenColors: hidden.colors,
			timeFilter: mapInstance.getTimeFilter()
		};
		const propsList = mapInstance
			.getFeatures()
			.map((feature) => feature.getProperties() as unknown as SightingListProperties);
		return toListEntries(propsList, filters, speciesLabels);
	});

	// Event Handler für Cleanup
	let keyboardHandler: ((event: KeyboardEvent) => void) | null = null;

	// Renn-Guard für loadAvailableYears (Review-Befund 1/T7.2): loadSightings im
	// Controller ist per AbortController gegen Überholen abgesichert, dieser
	// Aufruf hier bislang nicht — siehe Docblock in yearsRequestSequencer.ts für
	// die zwei konkreten Fehler (Rapid Toggling, stiller Fehlerpfad), gegen die
	// er absichert.
	const yearsRequestSequencer = createYearsRequestSequencer();

	/**
	 * Lädt die verfügbaren Jahre (QW2a-Endpoint) und ermittelt daraus das
	 * Default-Jahr (QW2b). Fehlerpfad: stiller Fallback auf das bisherige
	 * Verhalten (getDefaultSightingYear()) — kein Fehler-Toast dafür, da es
	 * sich um eine reine Komfort-Optimierung handelt.
	 *
	 * `availableYearsData` wird nur geschrieben, wenn diese Anfrage sowohl
	 * noch aktuell ist (kein Überholen durch einen zweiten Statuswechsel) ALS
	 * AUCH erfolgreich war — ein Fehlschlag lässt die vorher geladene Liste
	 * unangetastet. Für den allerersten Aufruf ist die „vorherige Liste"
	 * bereits leer, der stille Fallback oben bleibt also unverändert.
	 */
	async function loadAvailableYears(): Promise<number> {
		const requestId = yearsRequestSequencer.begin();
		let fetchedYears: YearWithCount[] = [];
		let succeeded = false;
		try {
			const query =
				statuses.length > 0 && !isPublicStatusSelection(statuses)
					? `?status=${statuses.join(',')}`
					: '';
			const response = await fetch(`/api/map/sightings/years${query}`);
			if (response.ok) {
				succeeded = true;
				const data = await response.json();
				if (Array.isArray(data?.years)) {
					fetchedYears = data.years;
				}
			} else {
				console.warn(
					`Konnte verfügbare Jahre nicht laden (HTTP ${response.status}), behalte bisherige Liste:`
				);
			}
		} catch (err) {
			console.warn('Konnte verfügbare Jahre nicht laden, behalte bisherige Liste:', err);
		}

		const update = resolveYearsUpdate(
			yearsRequestSequencer.isCurrent(requestId),
			succeeded ? { ok: true, years: fetchedYears } : { ok: false }
		);
		if (update !== null) {
			availableYearsData = update;
		}

		/* Das Default-Jahr muss aus der Liste kommen, die tatsächlich gilt, nicht
		   aus `fetchedYears`: Bei einem überholten oder fehlgeschlagenen Abruf
		   bleibt `availableYearsData` bewusst stehen — ein Default aus der
		   verworfenen Antwort ginge an genau der Liste vorbei, die wir eben
		   behalten haben, und `reconcileDisplayedYear` würde damit auf ein Jahr
		   schalten, das zur angezeigten Auswahl nicht gehört (Review PR #872).
		   Nach der Zuweisung oben ist `availableYearsData` in beiden Fällen die
		   wirksame Liste. */
		return pickDefaultYear(availableYearsData, initialFallbackYear);
	}

	/**
	 * Schaltet das angezeigte Jahr um — über denselben Pfad wie das
	 * Jahres-Dropdown im Filter-Panel (DOM-Wert setzen + `change`-Event), damit
	 * genau ein Code-Pfad für den Jahreswechsel existiert. Wird vom
	 * Empty-State-Button (QW2b) verwendet.
	 */
	function switchToYear(year: number) {
		const yearSelect = document.getElementById('year-select') as HTMLSelectElement | null;
		if (!yearSelect) return;
		yearSelect.value = year.toString();
		yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
	}

	/**
	 * Wendet den beim Start aus der URL gelesenen Filterzustand an (M4).
	 * Läuft einmalig nach dem ersten Daten-Load (siehe onLoading-Callback).
	 * Jahr und Suchbegriff sind zu dem Zeitpunkt bereits über initialYear/
	 * initialSearchTerm des Controllers aktiv — hier fehlen noch Zeitraum
	 * und Sichtbarkeiten.
	 */
	function applyUrlFilters(): void {
		if (!mapInstance) return;
		const year = mapInstance.getDisplayedYear();

		// Ausgeblendete Arten/Farbgruppen — nur bekannte Keys übernehmen,
		// damit Tippfehler aus geteilten URLs nicht dauerhaft mitgeschleppt werden.
		for (const id of urlFilterState.hiddenSpecies ?? []) {
			if (id in speciesLabels) {
				speciesVisibility[id] = false;
				countManager.setSpeciesVisibility(id, false);
			}
		}
		for (const key of urlFilterState.hiddenColors ?? []) {
			if (key in legendGroups) {
				colorVisibility[key] = false;
				countManager.setColorVisibility(key, false);
			}
		}

		// Zeitraum: über denselben Pfad wie die Slider-Bedienung (DOM-Werte
		// setzen + input-Event), damit Slider-Stellung und Datenfilter nicht
		// auseinanderlaufen. Daten aus einem anderen Jahr liefern null und
		// werden ignoriert.
		const startDay = urlFilterState.from ? dayOfYearFromIsoDate(urlFilterState.from, year) : null;
		const endDay = urlFilterState.to ? dayOfYearFromIsoDate(urlFilterState.to, year) : null;
		if (startDay === null && endDay === null) return;

		const startSlider = document.getElementById('time-range-start') as HTMLInputElement | null;
		const endSlider = document.getElementById('time-range-end') as HTMLInputElement | null;
		if (!startSlider || !endSlider) return;

		// max explizit setzen — das reaktive max-Attribut des FilterPanels ist
		// zu diesem Zeitpunkt möglicherweise noch nicht auf das Jahr geflusht.
		const maxValue = (getDaysInYear(year) - 1).toString();
		startSlider.max = maxValue;
		endSlider.max = maxValue;
		if (endDay !== null) endSlider.value = endDay.toString();
		if (startDay !== null) startSlider.value = startDay.toString();
		// Beide Werte sind gesetzt, bevor Events feuern — der Clamping-Code im
		// TimeSliderManager sieht damit bereits das konsistente Paar.
		endSlider.dispatchEvent(new Event('input', { bubbles: true }));
		startSlider.dispatchEvent(new Event('input', { bubbles: true }));
	}

	/** Liest den aktuellen Filterzustand aus dem Controller (Defaults weggelassen). */
	function readCurrentFilterState(): MapFilterUrlState {
		if (!mapInstance) return {};
		const hidden = mapInstance.getHidden();
		return buildFilterUrlState({
			year: mapInstance.getDisplayedYear(),
			defaultYear: apiDefaultYear,
			searchTerm: mapInstance.getSearchTerm(),
			timeFilter: mapInstance.getTimeFilter(),
			hiddenSpecies: hidden.species,
			hiddenColors: hidden.colors,
			statuses
		});
	}

	/**
	 * M4: Spiegelt den Filterzustand per replaceState in die URL — keine
	 * Navigation, kein History-Eintrag, damit Zurück nicht durch jede
	 * Filteränderung läuft.
	 */
	function syncFiltersToUrl(state: MapFilterUrlState): void {
		const query = serializeMapFilterParams(state);
		const search = query ? `?${query}` : '';
		if (window.location.search === search) return;
		// Hash beibehalten — z. B. #map-skip-target nach Nutzung des Skip-Links.
		replaceState(`${window.location.pathname}${search}${window.location.hash}`, page.state);
	}

	// --- N6: Aktionen der Filter-Chips -------------------------------------

	/** Leert die Suche über denselben Pfad wie das Suchfeld (input-Event). */
	function clearSearchFilter(): void {
		const input = document.getElementById('filter-input') as HTMLInputElement | null;
		if (!input) return;
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	/** Stellt den vollen Jahres-Zeitraum wieder her (Slider + Datenfilter). */
	function resetTimeFilter(): void {
		if (!mapInstance) return;
		const year = mapInstance.getDisplayedYear();
		timeSliderManager?.reset(getDaysInYear(year));
		mapInstance.setFilter(
			new Date(year, 0, 1).getTime(),
			new Date(year, 11, 31, 23, 59, 59, 999).getTime()
		);
	}

	function showSpecies(speciesId: string): void {
		speciesVisibility[speciesId] = true;
		countManager.setSpeciesVisibility(speciesId, true);
	}

	function showColorGroup(colorGroup: string): void {
		colorVisibility[colorGroup] = true;
		countManager.setColorVisibility(colorGroup, true);
	}

	/** Wechselt die Bearbeitungszustände: Karte neu laden und Jahreszahlen nachziehen. */
	async function handleStatusChange(next: SightingStatus[]): Promise<void> {
		const previous = statuses;
		statuses = next;
		if (!mapInstance) return;
		const result = await mapInstance.setStatuses(next);
		/* Ein neuerer Wechsel hat übernommen: Der ist jetzt für Jahresliste, URL
		   und Chip zuständig. Hier nichts weiter tun und vor allem NICHT
		   zurückrollen — das überschriebe die neuere Auswahl. */
		if (result === 'superseded') return;
		/* Fehlgeschlagen (z. B. abgelaufene Session): Die Karte zeigt weiterhin
		   den alten Bestand. Ohne diesen Rückbau behaupteten Kästchen, Chip und
		   URL eine Auswahl, die nirgends gilt — der Fehler-Toast erklärt den
		   Rückbau (Review PR #872). */
		if (result === 'failed') {
			statuses = previous;
			return;
		}
		// Die Jahres-Zahlen zählen dieselbe Grundmenge — ohne diesen zweiten
		// Aufruf zeigt das Dropdown Zahlen, die auf der Karte nicht auftauchen.
		const loadedDefaultYear = await loadAvailableYears();
		// Pre-Merge-Review (zweimal unabhängig gefunden): Die neu geladene
		// Jahresliste kann das bisher angezeigte Jahr nicht mehr enthalten (z. B.
		// 2024 hat unter „Offen" keine Treffer und fällt aus `years`) — ohne
		// diesen Abgleich zeigt das Dropdown dann kommentarlos ein anderes Jahr
		// als die Karte tatsächlich lädt, weil keine `<option>` mehr `selected`
		// trägt (siehe FilterPanel.svelte). `years` ist zu diesem Zeitpunkt
		// bereits auf `availableYearsData` neu abgeleitet (derselbe `$derived`,
		// synchron gelesen). Über `switchToYear()` — denselben Pfad wie jeder
		// andere Jahreswechsel —, damit es nicht einen zweiten Code-Pfad gibt,
		// der Dropdown und Karte auseinanderlaufen lassen könnte.
		const targetYear = reconcileDisplayedYear(
			mapInstance.getDisplayedYear(),
			years,
			loadedDefaultYear
		);
		if (targetYear !== null) {
			switchToYear(targetYear);
		}
		countManager.updateCounts();
		syncFiltersToUrl(readCurrentFilterState());
	}

	/** Setzt die Auswahl auf die öffentliche Grundmenge zurück (Chip-Aktion). */
	function resetStatusFilter(): void {
		void handleStatusChange([...DEFAULT_MAP_STATUSES]);
	}

	/**
	 * N6: Stellt Default-Jahr, leere Suche, vollen Zeitraum und alle
	 * Sichtbarkeiten wieder her.
	 *
	 * Der Bearbeitungszustand gehört seit der Produktentscheidung vom
	 * 2026-08-13 dazu: Das Bedienelement sitzt im Filter-Panel und erzeugt
	 * einen Filter-Chip wie jeder andere — es ist damit ein Filter, kein
	 * Ansichtsmodus, und "Alle Filter zurücksetzen" muss einen Admin auf die
	 * Ansicht zurückführen, die auch ein Besucher sieht. Über
	 * `resetStatusFilter()`/`handleStatusChange()`, nicht per direkter
	 * `statuses`-Zuweisung: Nur dieser Pfad lädt Karte UND Jahres-Zahlen im
	 * Gleichschritt neu (siehe `yearsRequestSequencer.ts`) — eine direkte
	 * Zuweisung ließe das Jahres-Dropdown auf der alten Auswahl stehen.
	 */
	function resetAllFilters(): void {
		clearSearchFilter();
		resetTimeFilter();
		// Kopien iterieren: die Handler stoßen Count-Updates an, die
		// activeFilters während der Iteration neu zuweisen.
		[...(activeFilters.hiddenSpecies ?? [])].forEach(showSpecies);
		[...(activeFilters.hiddenColors ?? [])].forEach(showColorGroup);
		if (mapInstance && mapInstance.getDisplayedYear() !== apiDefaultYear) {
			switchToYear(apiDefaultYear);
		}
		// Nur bei abweichender Auswahl neu laden — sonst löst der Reset-Knopf
		// bei bereits öffentlicher Auswahl einen überflüssigen Round-Trip aus.
		if (!isPublicStatusSelection(statuses)) {
			resetStatusFilter();
		}
	}

	/** Chip-Beschriftung einer Art — speciesLabels ist über SpeciesEnum indiziert. */
	function speciesLabel(speciesId: string): string {
		const labels: Record<string, string> = speciesLabels;
		return labels[speciesId] ?? m.components_map_sightingsmapview_text_art_id({ id: speciesId });
	}

	/** Chip-Beschriftung einer Anzahl-Gruppe (analog zum LegendPanel). */
	function colorGroupLabel(colorGroup: string): string {
		if (colorGroup === 'ct0') return String(translations.found_dead);
		return m.components_map_sightingsmapview_text_anzahl_name({
			name: legendGroups[colorGroup]?.name ?? colorGroup
		});
	}

	/* Pre-Merge-Review (Finding 2): Beschriftungen aus Paraglide, identisch zu
	   FilterPanel.svelte — dieselben Message-Keys, denn eine Komponente ist
	   die Fläche der Karte, die andere ihr Panel, aber der Wortlaut pro
	   Bearbeitungsstand ist derselbe. */
	const statusLabels: Record<SightingStatus, string> = {
		open: m.components_map_panel_filterpanel_text_status_offen(),
		approved: m.components_map_panel_filterpanel_text_status_freigegeben(),
		rejected: m.components_map_panel_filterpanel_text_status_abgelehnt()
	};

	/**
	 * Chip-Beschriftung des Bearbeitungsstand-Filters — nennt die gewählten
	 * Zustände statt nur "Bearbeitungsstand" zu zeigen (Pre-Merge-Review,
	 * Finding 2): "Offen + Freigegeben" und "nur Abgelehnt" sahen als Chip
	 * bisher identisch aus, dabei ist dieser Chip auf der Karte selbst der
	 * einzige Hinweis, dass unveröffentlichte Meldungen zu sehen sind.
	 * Feste Reihenfolge über SIGHTING_STATUS_ORDER statt der Auswahlreihenfolge.
	 */
	function statusFilterLabel(): string {
		return SIGHTING_STATUS_ORDER.filter((status) => statuses.includes(status))
			.map((status) => statusLabels[status])
			.join(', ');
	}

	/** ISO-Datum (YYYY-MM-DD) → kompakte deutsche Anzeige „TT.MM." */
	function formatChipDate(iso: string): string {
		const [, month, day] = iso.split('-');
		return `${day}.${month}.`;
	}

	/* Aufbau und Abbau der Karte — `onMount` und ausdrücklich NICHT `$effect`.
	   Der Block liest `statuses` synchron und führte es als `$effect` damit als
	   Abhängigkeit: Jeder Statuswechsel baute die Karte neu auf, eine Zuweisung
	   darin machte den Effekt sogar sich selbst ungültig. `onMount` sagt die
	   Einmaligkeit im Konstrukt zu, statt einzelne Lesezugriffe per `untrack`
	   auszunehmen. Rückgabe bleibt die Aufräumfunktion (läuft beim Zerstören).
	   Belegt durch „ein Statuswechsel lädt nach, statt die Karte neu aufzubauen“. */
	onMount(() => {
		// Check if we have the required DOM element
		const mapElement = document.getElementById(mapContainerId);
		if (!mapElement) {
			return;
		}

		let cancelled = false;
		let firstLoadComplete = false;

		void (async () => {
			// QW2b: Verfügbare Jahre vor Karteninitialisierung laden, damit die
			// Karte direkt mit einem Jahr startet, das tatsächlich Daten hat.
			// M4: Ein Jahr aus der URL hat Vorrang vor dem ermittelten Default.
			// Die URL-Auswahl steht bereits im Initialwert von `statuses` — hier
			// darf sie nicht noch einmal zugewiesen werden (Begründung dort).
			const loadedDefaultYear = await loadAvailableYears();
			if (cancelled) return;

			apiDefaultYear = loadedDefaultYear;
			const initialYear = urlFilterState.year ?? loadedDefaultYear;
			defaultYear = initialYear;

			// Initialisiere Manager
			timeSliderManager = new MapTimeSliderManager();

			// Initialisiere Karte mit Loading-Callback (muss vor initialem setYear gesetzt sein)
			mapInstance = new SichtungenMap({
				translations,
				target: mapContainerId,
				yearSelectorId: 'year-select',
				filterInputId: 'filter-input',
				sliderRangeId: 'slider-range',
				timeStartId: 'time-start',
				timeEndId: 'time-end',
				// N2: GPS-Standort-Control aktiv — Positionsdaten bleiben rein
				// lokal im Browser (kein Request mit Koordinaten).
				enableLocationControl: true,
				initialYear,
				initialSearchTerm: urlFilterState.query ?? '',
				initialStatuses: statuses,
				onLoading: (loading) => {
					isLoadingData = loading;
					if (loading) {
						errorMessage = null;
					} else if (!firstLoadComplete) {
						firstLoadComplete = true;
						// M4: URL-Filter erst nach dem ersten Load anwenden —
						// setYear() setzt den timeFilter nach dem Fetch auf das
						// volle Jahr zurück und würde einen früher gesetzten
						// URL-Zeitraum wieder verwerfen.
						applyUrlFilters();
						urlSyncEnabled = true;
						countManager.updateCounts();
						currentDisplayedYear = mapInstance!.getDisplayedYear();
						isInitialLoading = false;
					}
				},
				onError: (err) => {
					console.error('Map data load failed:', err);
					errorMessage =
						m.components_map_sightingsmapview_text_fehler_beim_laden_der_kartendaten_bitte();
					isLoadingData = false;
					isInitialLoading = false;
				},
				// N2: Geolocation-Fehler (z. B. verweigerte Berechtigung) im
				// bestehenden Fehler-Toast anzeigen statt stumm zu scheitern.
				onGeolocationError: (message) => {
					errorMessage = message;
				}
			});

			// Initialisiere Count Manager und setze Callback
			countManager.initialize(mapInstance, translations);
			const countMapInstance = mapInstance;
			countManager.onCountsUpdated((newCounts) => {
				counts = newCounts;
				featureCount = countMapInstance.getFeatures().length;
				// M4/N6: Der CountManager feuert nach jeder Filter-, Zeitraum-
				// und Jahresänderung — derselbe Trigger hält Chips und URL synchron.
				activeFilters = readCurrentFilterState();
				if (urlSyncEnabled) syncFiltersToUrl(activeFilters);
			});

			// Initialisiere andere Manager
			timeSliderManager.initialize(mapInstance);

			// Tastatur-Navigation Setup
			setupKeyboardNavigation();
		})();

		// Cleanup function (replaces onDestroy) — auch relevant, falls die
		// Komponente zerstört wird, bevor der obige async Block fertig ist.
		return () => {
			cancelled = true;
			cleanup();
		};
	});

	// Effect zum Registrieren des Jahr-Änderungs-Callbacks
	$effect(() => {
		if (mapInstance) {
			const instance = mapInstance;
			instance.setYearChangeCallback((newYear: number) => {
				currentDisplayedYear = newYear;
				// QW4: Zeitslider auf den vollen neuen Jahresbereich zurücksetzen,
				// sonst bleiben die Thumbs auf der zuvor gewählten Position stehen.
				timeSliderManager?.reset(getDaysInYear(newYear));
			});

			return () => {
				instance.setYearChangeCallback(() => {});
			};
		}

		// Return void if map is not available
		return;
	});

	/**
	 * Cleanup-Funktion für Event-Listener und Map-Instanzen
	 */
	function cleanup() {
		// Entferne Event-Listener
		if (keyboardHandler) {
			document.removeEventListener('keydown', keyboardHandler);
			keyboardHandler = null;
		}

		// CountManager-Ressourcen aufräumen
		countManager.dispose();

		// Map-Ressourcen aufräumen (Geolocation, Overlay, Event-Listener)
		if (mapInstance) {
			mapInstance.dispose();
		}

		// Reset Manager
		timeSliderManager = null;
		mapInstance = null;

		// WICHTIG: Stelle sicher, dass body/html wieder scrollbar sind
		// Falls irgendeine Library diese verändert hat
		if (typeof document !== 'undefined') {
			document.body.style.overflow = '';
			document.documentElement.style.overflow = '';
		}
	}

	/**
	 * Fehler-Toast schließen
	 */
	function dismissError() {
		errorMessage = null;
	}

	/**
	 * Tastatur-Navigation für die Karte
	 */
	function setupKeyboardNavigation() {
		keyboardHandler = (event) => {
			// Escape ist kein Zeichen-Shortcut (WCAG 2.1.4 greift nicht) und
			// wirkt global — auch bei Fokus im Suchfeld, deshalb VOR dem
			// Input-Guard behandelt.
			// QW3: Kaskade Popup → Hilfe-Modal → Filter-Panel → Legende.
			// Jede Stufe schließt nur genau eine Ebene pro Tastendruck.
			if (event.key === 'Escape') {
				if (mapInstance?.closePopup()) {
					return;
				}
				if (showKeyboardHelp) {
					showKeyboardHelp = false;
					return;
				}
				if (filterOpen) {
					filterOpen = false;
					return;
				}
				if (legendOpen) {
					legendOpen = false;
				}
				return;
			}

			// Zeichen-Shortcuts: nicht aktiv, wenn ein Eingabe-Element
			// fokussiert ist
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLSelectElement ||
				event.target instanceof HTMLTextAreaElement ||
				(event.target instanceof HTMLElement && event.target.isContentEditable)
			) {
				return;
			}

			// H7 (WCAG 2.1.4): Einzeltasten-Shortcuts nur, wenn der Fokus in
			// der Karten-Region liegt — sonst lösen Spracheingabe oder
			// beiläufiges Tippen sie versehentlich aus.
			const mapElement = document.getElementById(mapContainerId);
			if (!(event.target instanceof Node) || !mapElement?.contains(event.target)) {
				return;
			}

			switch (event.key) {
				case 'h':
				case 'H':
				case '?':
					event.preventDefault();
					showKeyboardHelp = !showKeyboardHelp;
					break;
				case 'f':
				case 'F':
					event.preventDefault();
					filterOpen = !filterOpen;
					break;
				case 'l':
				case 'L':
					event.preventDefault();
					legendOpen = !legendOpen;
					break;
				case 'z':
				case 'Z':
					event.preventDefault();
					mapInstance?.zoomAllFeatures();
					break;
			}
		};
		document.addEventListener('keydown', keyboardHandler);
	}
</script>

<div class="{containerClass} map-container-wrapper">
	<!-- K3: Skip-Link — erstes fokussierbares Element, überspringt die Karte.
	     Nur in der Kartenansicht: in der Liste gibt es nichts zu überspringen. -->
	{#if viewMode === 'map'}
		<a
			href="#map-skip-target"
			class="btn btn-primary focus:z-skip sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-1/2 focus:-translate-x-1/2"
		>
			{m.components_map_sightingsmapview_text_karte_ueberspringen()}
		</a>
	{/if}

	<!-- Kopfzeile der Karte: Titel-Badge und aktive Filter.

	     Beide standen bis 2026-08-14 einzeln absolut positioniert da — der Titel
	     linksbündig auf top-4, das Chip-Band zentriert auf top-16. Die 64px des
	     Bandes waren fast vollständig die reservierte Titelzeile: Zwischen beiden
	     lagen nur 12px, und weil das Badge nur ~200px breit ist, blieb der Platz
	     rechts daneben leer. Ab md stehen sie deshalb in EINER Zeile; die Frage,
	     wie breit das zentrierte Band werden darf, ohne den Titel zu treffen,
	     stellt sich damit gar nicht mehr (eine max-width-Rechnung hätte an jeder
	     Übersetzung des Titels neu gestimmt oder eben nicht).

	     right-14 hält die Zeile vom Panel-Reiter frei (44px mobil, 32px ab md).
	     Vorher endete das Band bei max-w-[92vw] rechnerisch 28px UNTER dem
	     Reiter — bei vielen Filtern scrollten die letzten Chips darunter.

	     pointer-events-none am Container ist Pflicht: Er liegt als unsichtbares
	     Band über der Karte, und ohne die Ausnahme schluckte er dort das Ziehen
	     der Karte. Die Kinder holen es sich per pointer-events-auto zurück. -->
	{#if showTitle || hasActiveFilters}
		<div
			class="z-raised pointer-events-none absolute top-2 right-14 left-12 flex flex-col items-start gap-1.5 md:top-4 md:flex-row md:items-center md:gap-2"
		>
			{#if showTitle}
				<!-- shrink-0 und pointer-events-auto stehen hier und NICHT im
				     titleClass-Default: Beide tragen das Layout dieser Zeile, der
				     Prop trägt das Aussehen. Ein Aufrufer, der titleClass setzt —
				     wofür der Prop existiert —, würde sie sonst stillschweigend
				     mit entfernen; der Titel quetschte dann ab md auf wenige
				     Zeichen pro Zeile bzw. würde klickdurchlässig.

				     Die Platte im Default ist deckendes `bg-base-100` und NICHT
				     `glass`: Glass lässt die Kachel durch, und
				     `text-base-content` darauf misst über heller See 12,25:1,
				     über dunklem Land aber 1,07:1 (gemessen 2026-08-14). Jetzt
				     16,50:1, unabhängig von der Kachel.

				     Das ist derselbe Flächenbedarf wie bei der Logo-Platte
				     weiter unten — eine helle Fläche des Themes, kein Schleier;
				     ein `bg-scrim` gehörte hierher nur, wenn die Kachel
				     durchscheinen SOLL. Anders als dort aber ohne /95-Suffix:
				     Die Logo-Platte trägt keinen Text, hier hängt an der vollen
				     Deckung, ob axe den Knoten überhaupt entscheiden kann.
				     Abgesichert in e2e/design-tokens.spec.ts → „Kontrast über
				     fremdem Bildmaterial". -->
				<h1 class="pointer-events-auto shrink-0 {titleClass}">
					<Icon icon="lucide:map" width="24" height="24" class="text-primary" />
					<span>{title} {currentDisplayedYear}</span>
				</h1>
			{/if}

			<!-- N6: Aktive Filter als einzeln entfernbare Chips über der Karte —
			     sichtbar auch bei geschlossenen Panels. Klick auf einen Chip entfernt
			     genau diesen Filter; „Alle zurücksetzen" stellt den Grundzustand her. -->
			{#if hasActiveFilters}
				<div
					class="scroll-styled pointer-events-auto flex w-max max-w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto px-1 pb-1"
					role="group"
					aria-label={m.components_map_sightingsmapview_aria_label_aktive_filter()}
				>
					{#if activeFilters.year !== undefined}
						<button
							type="button"
							class={chipClass}
							onclick={() => switchToYear(apiDefaultYear)}
							aria-label={m.components_map_sightingsmapview_aria_label_filter_jahr_year_entfernen_und(
								{
									year: activeFilters.year,
									apiDefaultYear: apiDefaultYear
								}
							)}
						>
							{m.components_map_sightingsmapview_text_jahr_year({ year: activeFilters.year })}
							<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
						</button>
					{/if}
					{#if activeFilters.query !== undefined}
						<button
							type="button"
							class="{chipClass} max-w-56"
							onclick={clearSearchFilter}
							aria-label={m.components_map_sightingsmapview_aria_label_suchfilter_query_entfernen({
								query: activeFilters.query
							})}
						>
							<span class="truncate"
								>{m.components_map_sightingsmapview_text_suche_query({
									query: activeFilters.query
								})}</span
							>
							<Icon icon="lucide:x" width="14" height="14" class="shrink-0" aria-hidden="true" />
						</button>
					{/if}
					{#if activeFilters.from !== undefined && activeFilters.to !== undefined}
						<button
							type="button"
							class={chipClass}
							onclick={resetTimeFilter}
							aria-label={m.components_map_sightingsmapview_aria_label_zeitraum_filter_entfernen_und_volles_jah()}
						>
							{m.components_map_sightingsmapview_text_zeitraum_from_bis_to({
								from: formatChipDate(activeFilters.from),
								to: formatChipDate(activeFilters.to)
							})}
							<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
						</button>
					{/if}
					{#each activeFilters.hiddenSpecies ?? [] as speciesId (speciesId)}
						<button
							type="button"
							class={chipClass}
							onclick={() => showSpecies(speciesId)}
							aria-label={m.components_map_sightingsmapview_aria_label_specieslabel_wieder_anzeigen(
								{
									speciesLabel: speciesLabel(speciesId)
								}
							)}
						>
							{m.components_map_sightingsmapview_text_ohne_label({
								label: speciesLabel(speciesId)
							})}
							<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
						</button>
					{/each}
					{#each activeFilters.hiddenColors ?? [] as colorGroup (colorGroup)}
						<button
							type="button"
							class={chipClass}
							onclick={() => showColorGroup(colorGroup)}
							aria-label={m.components_map_sightingsmapview_aria_label_gruppe_colorgrouplabel_wieder_anzeigen(
								{ colorGroupLabel: colorGroupLabel(colorGroup) }
							)}
						>
							{m.components_map_sightingsmapview_text_ohne_label({
								label: colorGroupLabel(colorGroup)
							})}
							<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
						</button>
					{/each}
					{#if !isPublicStatusSelection(statuses)}
						<button
							type="button"
							class={chipClass}
							onclick={resetStatusFilter}
							aria-label={m.components_map_sightingsmapview_aria_label_bearbeitungsstand_labels_entfernen_und(
								{ labels: statusFilterLabel() }
							)}
						>
							<Icon icon="lucide:inbox" width="14" height="14" aria-hidden="true" />
							{m.components_map_sightingsmapview_text_bearbeitungsstand_labels({
								labels: statusFilterLabel()
							})}
							<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
						</button>
					{/if}
					<button type="button" class="{chipClass} btn-outline" onclick={resetAllFilters}>
						{m.components_map_sightingsmapview_text_alle_filter_zuruecksetzen()}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Vollbild-Karte — `absolute inset-0` statt `h-full w-full`:
	     Der Container ist seit 2026-08-03 ein Flex-Item (`flex-1`) statt einer
	     ausgerechneten Höhe. Seine *benutzte* Höhe stimmt damit zwar, seine
	     berechnete `height` bleibt aber `auto` — und `height: 100%` löst gegen
	     `auto` zu 0 auf. Die Kette brach still: OpenLayers meldete nur
	     „No map visible because the map container's width or height are 0",
	     die Seite blieb leer. `inset-0` hängt sich an den Rand des
	     positionierten Containers und braucht keine Höhenkette. -->
	<div class="absolute inset-0">
		<!--
			K3: tabindex="0" macht das OL-Target fokussierbar — damit greifen die
			OpenLayers-Default-Interactions KeyboardPan (Pfeiltasten) und
			KeyboardZoom (+/−), vgl. https://openlayers.org/en/latest/examples/accessible.html
			role="application" bleibt bewusst erhalten: Die Karte ist damit echt
			tastaturbedienbar; der Bedienhinweis hängt per aria-describedby dran.
			In der Listenansicht nimmt inert die Karte samt OL-Controls aus Fokus-
			und AT-Reihenfolge — aria-hidden allein ließe die Zoom-Buttons
			fokussierbar (WCAG 4.1.2, axe "aria-hidden-focus").
		-->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			id={mapContainerId}
			class="sightings-map-target h-full w-full"
			role="application"
			tabindex={viewMode === 'map' ? 0 : -1}
			inert={viewMode === 'list'}
			aria-label={m.components_map_sightingsmapview_aria_label_interaktive_sichtungskarte_der_ostsee()}
			aria-describedby="map-keyboard-hint"
		></div>
		<p id="map-keyboard-hint" class="sr-only">
			{m.components_map_sightingsmapview_text_nach_dem_fokussieren_der_karte()}
		</p>
		<div
			id="info"
			class="border-base-300 bg-base-100 z-raised shadow-floating pointer-events-none absolute hidden max-w-sm rounded border p-2"
		></div>
		<!-- M7: Vollbild-Overlay nur beim Initial-Load — Filter-/Jahreswechsel
		     zeigen stattdessen den Inline-Spinner im Filter-Panel (isLoading-Prop),
		     dessen Toggle-Tab auch bei geschlossenem Panel mitrotiert. -->
		<LoadingOverlay isVisible={isInitialLoading} type="initial" />

		<!--
			Die beiden Leer-Zustände waren zwei handgebaute Glas-Kästchen mit je
			eigener Typografie und eigener Rollenauszeichnung. Inhaltlich sind sie
			derselbe Fall — „hier stünden Daten, es gibt aber keine" — und laufen
			jetzt beide über `StatusBlock`. Der Wrapper trägt nur noch die Position
			und eine deckende Fläche, damit der Text über den Kartenkacheln lesbar
			bleibt; Rolle, Icon und Abstände kommen aus der Komponente.
		-->

		<!-- Keine Sichtungen für das gewählte Jahr -->
		{#if showNoResults}
			<div
				class="bg-base-100 rounded-box z-raised absolute top-1/2 left-1/2 w-[min(24rem,90%)] -translate-x-1/2 -translate-y-1/2"
				style="box-shadow: var(--shadow-floating)"
			>
				<StatusBlock
					variant="empty"
					title={m.components_map_sightingsmapview_title_keine_sichtungen_fuer_currentdisplayedye({
						currentDisplayedYear: currentDisplayedYear
					})}
					description={m.components_map_sightingsmapview_description_fuer_dieses_jahr_liegen()}
					action={latestYearWithData !== undefined && latestYearWithData !== currentDisplayedYear
						? {
								label: `Sichtungen ${latestYearWithData} anzeigen`,
								onClick: () => switchToYear(latestYearWithData!),
								icon: 'lucide:calendar'
							}
						: undefined}
				/>
			</div>
		{/if}

		<!-- Alle Sichtungen durch Filter ausgeblendet -->
		{#if showNoVisibleResults}
			<div
				class="bg-base-100 rounded-box z-raised absolute top-1/2 left-1/2 w-[min(24rem,90%)] -translate-x-1/2 -translate-y-1/2"
				style="box-shadow: var(--shadow-floating)"
			>
				<StatusBlock
					variant="empty"
					title={m.components_map_sightingsmapview_title_keine_sichtungen_fuer_den_aktuellen()}
					description={m.components_map_sightingsmapview_description_passen_sie_den_zeitraum()}
				/>
			</div>
		{/if}

		<!-- Error-Toast.

		     `z-overlay` wie das Tastatur-Hilfe-Modal weiter unten, und damit
		     bewusst NICHT mehr darüber: vorher stand hier `z-[60]` gegen dessen
		     `z-50`, der Toast durchstieß also den Schleier eines
		     `aria-modal="true"`-Dialogs. Auf derselben Stufe entscheidet die
		     DOM-Position, und die gibt dem Modal den Vorrang — was ein Modal
		     gerade ausmacht. Wer den Toast wieder nach oben holen will, hat
		     kein Z-Index-Problem, sondern die Frage zu klären, ob eine Meldung
		     einen modalen Dialog überlagern darf. -->
		{#if errorMessage}
			<div
				role="alert"
				class="alert alert-error z-overlay shadow-floating fixed top-20 left-1/2 max-w-md -translate-x-1/2 transform"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span class="text-sm">{errorMessage}</span>
				<button
					onclick={dismissError}
					class="btn btn-ghost btn-xs"
					aria-label={m.components_map_sightingsmapview_aria_label_fehlermeldung_schliessen()}
				>
					✕
				</button>
			</div>
		{/if}
		<!-- K3: Listenansicht — barrierefreie Tabellen-Alternative zur Karte -->
		{#if viewMode === 'list'}
			<section
				class="bg-base-100 z-raised absolute inset-0 overflow-y-auto pt-16 pb-24"
				aria-label={m.components_map_sightingsmapview_aria_label_listenansicht_der_sichtungen()}
			>
				<div class="mx-auto max-w-3xl px-4">
					<SightingsListView
						entries={listEntries}
						year={currentDisplayedYear}
						showStatus={isAdmin}
					/>
				</div>
			</section>
		{/if}
	</div>

	<!-- K3: Sprungziel des Skip-Links — direkt hinter der Karte, vor den Panels -->
	<div id="map-skip-target" tabindex="-1" class="sr-only">
		{m.components_map_sightingsmapview_text_ende_der_karte()}
	</div>

	<!-- K3: Umschalter Karte/Liste -->
	<div
		class="z-panel absolute bottom-4 left-1/2 -translate-x-1/2"
		role="group"
		aria-label={m.components_map_sightingsmapview_aria_label_darstellung_der_sichtungen_waehlen()}
	>
		<div class="join shadow-floating">
			<button
				type="button"
				class="btn join-item min-h-11 {viewMode === 'map' ? 'btn-primary' : ''}"
				aria-pressed={viewMode === 'map'}
				onclick={() => (viewMode = 'map')}
			>
				{m.components_map_sightingsmapview_text_karte()}
			</button>
			<button
				type="button"
				class="btn join-item min-h-11 {viewMode === 'list' ? 'btn-primary' : ''}"
				aria-pressed={viewMode === 'list'}
				onclick={() => (viewMode = 'list')}
			>
				{m.components_map_sightingsmapview_text_liste()}
			</button>
		</div>
	</div>

	<!-- Filter-Panel Komponente — toggleHidden: solange ein Bottom-Sheet offen
	     ist, verdecken die fixen Tabs auf Mobile sonst dessen Header (H6) -->
	<FilterPanel
		{years}
		{defaultYear}
		{yearCounts}
		isLoading={isLoadingData}
		initialSearch={urlFilterState.query ?? ''}
		toggleHidden={filterOpen || legendOpen}
		showStatusFilter={isAdmin}
		{statuses}
		onStatusChange={(next) => void handleStatusChange(next)}
		bind:isOpen={filterOpen}
	/>

	<!-- Legende-Panel Komponente -->
	<LegendPanel
		{translations}
		{counts}
		toggleHidden={filterOpen || legendOpen}
		bind:isOpen={legendOpen}
		bind:speciesVisibility
		bind:colorVisibility
		onSeamarkToggle={(visible) => mapInstance?.setSeamarkVisibility(visible)}
		showStatusLegend={isAdmin}
	/>

	<!-- Tastatur-Hilfe Button

	     Icon statt eines „?"-Zeichens. Ein sichtbares Zeichen ist für WCAG 2.5.3
	     (Label in Name) Text, der im zugänglichen Namen „Tastatur-Hilfe anzeigen"
	     stehen müsste; axe-core ab 4.14 kann das bei einem reinen Satzzeichen nicht
	     entscheiden und meldet es als offen. `aria-hidden` am Zeichen hilft nicht:
	     axe ermittelt den sichtbaren Text dieser Regel ausdrücklich ohne
	     Rücksicht auf den Accessibility-Tree. Ein SVG trägt keinen Text. -->
	<button
		onclick={() => (showKeyboardHelp = true)}
		class="bg-info text-info-content hover:bg-info/80 z-raised shadow-floating duration-instant fixed bottom-4 left-4 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-colors"
		aria-label={m.components_map_sightingsmapview_aria_label_tastatur_hilfe_anzeigen()}
		title={m.components_map_sightingsmapview_title_tastaturkuerzel_anzeigen_h_oder()}
	>
		<Icon icon="lucide:circle-help" width="24" height="24" aria-hidden="true" />
	</button>

	<!-- Logo (unten rechts) - optional -->
	{#if showLogo}
		<!-- Unterhalb md steht die Platte neben der Karte/Liste-Umschaltung, nicht
		     darüber. Vorher hob `bottom-20` sie auf 80px, weil sie bei h-12 110px
		     breit ist und damit neben dem 136px breiten, zentrierten Umschalter
		     nicht mehr passt (-2px bei 360px Viewport, -22px bei 320px). Das Logo
		     schwebte dadurch sichtbar frei über der Karte statt am Rand zu sitzen.
		     Gelöst über die Breite statt über die Höhe: h-8 macht die Platte 77px
		     breit, und rechts vom Umschalter bleiben ab 320px Viewport 88px — also
		     11px Luft im ungünstigsten Fall (360px: 31px, 390px: 46px). Ab md ist
		     der Platz ohnehin da, dort bleibt es bei h-12. -->
		<div class="z-raised absolute right-1 bottom-4 md:bottom-6">
			<!-- Helle Platte, weil /logo_dmm_positiv.svg einfarbig im Markenblau
			     #003777 zeichnet (relative Luminanz 0,041 — auf Weiß 11,6:1, über
			     einer dunklen Kachel nur noch ~1,2:1) und dort sonst verschwindet.
			     Das ist ein Flächenbedarf, kein Schleier — base-100 ist die helle
			     Fläche des Themes; das /95 bleibt, damit die Karte durchschimmert.
			     Für dunkle Flächen gibt es /logo_dmm_negativ.svg (gleiche Geometrie,
			     weiß) — das nutzt die About-Seite auf bg-primary. -->
			<div
				class="border-primary/10 bg-base-100/95 shadow-floating duration-instant rounded-xl border p-1 backdrop-blur-md transition-all hover:scale-105"
				data-testid="map-logo-plate"
			>
				<!-- Kein flex-Wrapper um das Bild: Tailwinds Preflight setzt img auf
				     display:block, es gibt hier also keine Baseline-Unterlänge zu
				     bändigen. Nachgemessen bleibt die Platte mit und ohne Wrapper
				     exakt 58px hoch. -->
				<img
					src="/logo_dmm_positiv.svg"
					alt={m.components_map_sightingsmapview_alt_logo_des_deutschen_meeresmuseums()}
					class="h-8 w-auto md:h-12"
					id="dmm"
					title={m.components_map_sightingsmapview_title_deutsches_meeresmuseum()}
				/>
			</div>
		</div>
	{/if}

	<!-- Tastatur-Hilfe Modal -->
	{#if showKeyboardHelp}
		<!-- Schleier über der Karte, kein Theme-Ton: bg-scrim/<n>
		     (--scrim-surface in tokens.css). -->
		<div class="bg-scrim/50 z-overlay fixed inset-0 flex items-center justify-center">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="help-modal-title"
				class="bg-base-100 shadow-floating max-h-[80vh] max-w-md rounded-lg p-6"
			>
				<div class="mb-4 flex items-center justify-between">
					<h3 id="help-modal-title" class="text-lg font-bold">
						{m.components_map_sightingsmapview_text_tastaturkuerzel()}
					</h3>
					<button
						onclick={() => (showKeyboardHelp = false)}
						class="btn btn-ghost btn-sm"
						aria-label={m.components_map_sightingsmapview_aria_label_hilfe_schliessen()}
					>
						✕
					</button>
				</div>

				<div class="space-y-3">
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">{m.components_map_sightingsmapview_text_h_oder()}</kbd>
						<span class="text-sm"
							>{m.components_map_sightingsmapview_text_diese_hilfe_anzeigen()}</span
						>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">{m.components_map_sightingsmapview_text_f()}</kbd>
						<span class="text-sm"
							>{m.components_map_sightingsmapview_text_filter_panel_oeffnen_schliessen()}</span
						>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">{m.components_map_sightingsmapview_text_l()}</kbd>
						<span class="text-sm"
							>{m.components_map_sightingsmapview_text_legende_panel_oeffnen_schliessen()}</span
						>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">{m.components_map_sightingsmapview_text_z()}</kbd>
						<span class="text-sm"
							>{m.components_map_sightingsmapview_text_auf_alle_meldungen_zoomen()}</span
						>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">{m.components_map_sightingsmapview_text_esc()}</kbd>
						<span class="text-sm"
							>{m.components_map_sightingsmapview_text_dialoge_schliessen()}</span
						>
					</div>
				</div>

				<div class="text-base-content/60 mt-6 space-y-1 text-xs">
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:info"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						{m.components_map_sightingsmapview_text_die_buchstaben_kuerzel_wirken_solange_de()}
					</p>
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:navigation"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						{m.components_map_sightingsmapview_text_karte_mit_tab_fokussieren_dann()}
					</p>
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:list"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						{m.components_map_sightingsmapview_text_der_umschalter_karte_liste()}
					</p>
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:mouse-pointer"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						{m.components_map_sightingsmapview_text_klicken_sie_auf_marker_fuer()}
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Map styles sind jetzt global in app.css importiert -->

<style>
	/*
	 * K3: Sichtbarer Fokusring für das Karten-Target. Inset-Offset, damit der
	 * Ring trotz overflow-hidden des Vollbild-Containers sichtbar bleibt.
	 */
	.sightings-map-target:focus-visible {
		outline: 3px solid var(--color-primary);
		outline-offset: -3px;
	}
</style>
