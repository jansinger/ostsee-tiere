<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { MapCountManager, type CountData } from '$lib/map/countManager';
	import { getDaysInYear } from '$lib/map/dateUtils';
	import type { MapTranslations } from '$lib/map/mapUtils';
	import { SichtungenMap } from '$lib/map/optimizedMapController';
	import { MapTimeSliderManager } from '$lib/map/timeSliderManager';
	import { speciesLabels } from '$lib/report/formOptions/species';
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
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import 'ol/ol.css';
	import LoadingOverlay from './LoadingOverlay.svelte';
	import StatusBlock from '$lib/components/StatusBlock.svelte';
	import FilterPanel from './Panel/FilterPanel.svelte';
	import LegendPanel from './Panel/LegendPanel.svelte';
	import SightingsListView from './SightingsListView.svelte';

	// Props
	let {
		mapContainerId = 'map',
		showTitle = true,
		title = 'Sichtungskarte',
		showLogo = true,
		containerClass = 'relative h-screen w-screen overflow-hidden',
		titleClass = 'glass text-base-content text-sm absolute top-4 left-12 z-30 rounded-lg px-3 py-1.5 font-bold shadow-xl backdrop-blur-md flex items-center gap-2'
	} = $props<{
		mapContainerId?: string;
		showTitle?: boolean;
		title?: string;
		showLogo?: boolean;
		containerClass?: string;
		titleClass?: string;
	}>();

	// Übersetzungen für die Karte
	const translations: MapTranslations = {
		overview: 'Übersichtskarte',
		zoom_title: 'Kartenauschnitt auf alle Meldungen zoomen',
		zoom: 'Alle Meldungen',
		// M6: kein Trailing-Space — der Builder setzt das Datum mit eigenem Trenner
		report_date: 'Sichtung vom',
		language: 'de',
		species: 'Tierart',
		species_legend: 'Tierart [ sichtbar / gesamt ]',
		position: 'Position',
		count: 'Anzahl Tiere',
		young: 'Davon Jungtiere',
		ship: 'Schiffsname',
		name: 'Name',
		area: 'Fahrwasser',
		latitude: 'Breite',
		longitude: 'Länge',
		found_dead: 'Totfund',
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
			(activeFilters.hiddenColors?.length ?? 0) > 0
	);
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

	/**
	 * Lädt die verfügbaren Jahre (QW2a-Endpoint) und ermittelt daraus das
	 * Default-Jahr (QW2b). Fehlerpfad: stiller Fallback auf das bisherige
	 * Verhalten (getDefaultSightingYear()) — kein Fehler-Toast dafür, da es
	 * sich um eine reine Komfort-Optimierung handelt.
	 */
	async function loadAvailableYears(): Promise<number> {
		let fetchedYears: YearWithCount[] = [];
		try {
			const response = await fetch('/api/map/sightings/years');
			if (response.ok) {
				const data = await response.json();
				if (Array.isArray(data?.years)) {
					fetchedYears = data.years;
				}
			}
		} catch (err) {
			console.warn('Konnte verfügbare Jahre nicht laden, nutze Standard-Jahr:', err);
		}

		availableYearsData = fetchedYears;

		return pickDefaultYear(fetchedYears, initialFallbackYear);
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
			hiddenColors: hidden.colors
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

	/**
	 * N6: Stellt Default-Jahr, leere Suche, vollen Zeitraum und alle
	 * Sichtbarkeiten wieder her.
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
	}

	/** Chip-Beschriftung einer Art — speciesLabels ist über SpeciesEnum indiziert. */
	function speciesLabel(speciesId: string): string {
		const labels: Record<string, string> = speciesLabels;
		return labels[speciesId] ?? `Art ${speciesId}`;
	}

	/** Chip-Beschriftung einer Anzahl-Gruppe (analog zum LegendPanel). */
	function colorGroupLabel(colorGroup: string): string {
		if (colorGroup === 'ct0') return String(translations.found_dead);
		return `Anzahl ${legendGroups[colorGroup]?.name ?? colorGroup}`;
	}

	/** ISO-Datum (YYYY-MM-DD) → kompakte deutsche Anzeige „TT.MM." */
	function formatChipDate(iso: string): string {
		const [, month, day] = iso.split('-');
		return `${day}.${month}.`;
	}

	// Modern $effect for map initialization and cleanup
	$effect(() => {
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
					errorMessage = 'Fehler beim Laden der Kartendaten. Bitte versuchen Sie es erneut.';
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
			class="btn btn-primary sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-1/2 focus:z-[70] focus:-translate-x-1/2"
		>
			Karte überspringen
		</a>
	{/if}

	{#if showTitle}
		<h1 class={titleClass}>
			<Icon icon="lucide:map" width="24" height="24" class="text-primary" />
			<span>{title} {currentDisplayedYear}</span>
		</h1>
	{/if}

	<!-- N6: Aktive Filter als einzeln entfernbare Chips über der Karte —
	     sichtbar auch bei geschlossenen Panels. Klick auf einen Chip entfernt
	     genau diesen Filter; „Alle zurücksetzen" stellt den Grundzustand her. -->
	{#if hasActiveFilters}
		<div
			class="absolute top-16 left-1/2 z-30 flex w-max max-w-[92vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2"
			role="group"
			aria-label="Aktive Filter"
		>
			{#if activeFilters.year !== undefined}
				<button
					type="button"
					class="btn btn-sm bg-base-100 min-h-11 gap-1 shadow-lg"
					onclick={() => switchToYear(apiDefaultYear)}
					aria-label="Filter Jahr {activeFilters.year} entfernen und zum Standard-Jahr {apiDefaultYear} wechseln"
				>
					Jahr {activeFilters.year}
					<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
				</button>
			{/if}
			{#if activeFilters.query !== undefined}
				<button
					type="button"
					class="btn btn-sm bg-base-100 min-h-11 max-w-56 gap-1 shadow-lg"
					onclick={clearSearchFilter}
					aria-label="Suchfilter {activeFilters.query} entfernen"
				>
					<span class="truncate">Suche „{activeFilters.query}"</span>
					<Icon icon="lucide:x" width="14" height="14" class="shrink-0" aria-hidden="true" />
				</button>
			{/if}
			{#if activeFilters.from !== undefined && activeFilters.to !== undefined}
				<button
					type="button"
					class="btn btn-sm bg-base-100 min-h-11 gap-1 shadow-lg"
					onclick={resetTimeFilter}
					aria-label="Zeitraum-Filter entfernen und volles Jahr anzeigen"
				>
					Zeitraum {formatChipDate(activeFilters.from)}–{formatChipDate(activeFilters.to)}
					<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
				</button>
			{/if}
			{#each activeFilters.hiddenSpecies ?? [] as speciesId (speciesId)}
				<button
					type="button"
					class="btn btn-sm bg-base-100 min-h-11 gap-1 shadow-lg"
					onclick={() => showSpecies(speciesId)}
					aria-label="{speciesLabel(speciesId)} wieder anzeigen"
				>
					Ohne {speciesLabel(speciesId)}
					<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
				</button>
			{/each}
			{#each activeFilters.hiddenColors ?? [] as colorGroup (colorGroup)}
				<button
					type="button"
					class="btn btn-sm bg-base-100 min-h-11 gap-1 shadow-lg"
					onclick={() => showColorGroup(colorGroup)}
					aria-label="Gruppe {colorGroupLabel(colorGroup)} wieder anzeigen"
				>
					Ohne {colorGroupLabel(colorGroup)}
					<Icon icon="lucide:x" width="14" height="14" aria-hidden="true" />
				</button>
			{/each}
			<button
				type="button"
				class="btn btn-outline btn-sm bg-base-100 min-h-11 shadow-lg"
				onclick={resetAllFilters}
			>
				Alle Filter zurücksetzen
			</button>
		</div>
	{/if}

	<!-- Vollbild-Karte -->
	<div class="relative h-full w-full">
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
		<div
			id={mapContainerId}
			class="sightings-map-target h-full w-full"
			role="application"
			tabindex={viewMode === 'map' ? 0 : -1}
			inert={viewMode === 'list'}
			aria-label="Interaktive Sichtungskarte der Ostsee"
			aria-describedby="map-keyboard-hint"
		></div>
		<p id="map-keyboard-hint" class="sr-only">
			Nach dem Fokussieren der Karte verschieben die Pfeiltasten den Kartenausschnitt, Plus und
			Minus zoomen. Als Alternative steht die Listenansicht über den Umschalter „Karte / Liste" zur
			Verfügung.
		</p>
		<div
			id="info"
			class="border-base-300 bg-base-100 pointer-events-none absolute z-10 hidden max-w-sm rounded border p-2 shadow-lg"
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
				class="bg-base-100 rounded-box absolute top-1/2 left-1/2 z-30 w-[min(24rem,90%)] -translate-x-1/2 -translate-y-1/2"
				style="box-shadow: var(--shadow-floating)"
			>
				<StatusBlock
					variant="empty"
					title="Keine Sichtungen für {currentDisplayedYear} vorhanden"
					description="Für dieses Jahr liegen keine freigegebenen Meldungen vor."
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
				class="bg-base-100 rounded-box absolute top-1/2 left-1/2 z-30 w-[min(24rem,90%)] -translate-x-1/2 -translate-y-1/2"
				style="box-shadow: var(--shadow-floating)"
			>
				<StatusBlock
					variant="empty"
					title="Keine Sichtungen für den aktuellen Filter sichtbar"
					description="Passen Sie den Zeitraum oder die Tierart-Filter an."
				/>
			</div>
		{/if}

		<!-- Error-Toast -->
		{#if errorMessage}
			<div
				role="alert"
				class="alert alert-error fixed top-20 left-1/2 z-[60] max-w-md -translate-x-1/2 transform shadow-lg"
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
					aria-label="Fehlermeldung schließen"
				>
					✕
				</button>
			</div>
		{/if}
		<!-- K3: Listenansicht — barrierefreie Tabellen-Alternative zur Karte -->
		{#if viewMode === 'list'}
			<section
				class="bg-base-100 absolute inset-0 z-20 overflow-y-auto pt-16 pb-24"
				aria-label="Listenansicht der Sichtungen"
			>
				<div class="mx-auto max-w-3xl px-4">
					<SightingsListView entries={listEntries} year={currentDisplayedYear} />
				</div>
			</section>
		{/if}
	</div>

	<!-- K3: Sprungziel des Skip-Links — direkt hinter der Karte, vor den Panels -->
	<div id="map-skip-target" tabindex="-1" class="sr-only">Ende der Karte</div>

	<!-- K3: Umschalter Karte/Liste -->
	<div
		class="absolute bottom-4 left-1/2 z-30 -translate-x-1/2"
		role="group"
		aria-label="Darstellung der Sichtungen wählen"
	>
		<div class="join shadow-lg">
			<button
				type="button"
				class="btn join-item min-h-11 {viewMode === 'map' ? 'btn-primary' : ''}"
				aria-pressed={viewMode === 'map'}
				onclick={() => (viewMode = 'map')}
			>
				Karte
			</button>
			<button
				type="button"
				class="btn join-item min-h-11 {viewMode === 'list' ? 'btn-primary' : ''}"
				aria-pressed={viewMode === 'list'}
				onclick={() => (viewMode = 'list')}
			>
				Liste
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
	/>

	<!-- Tastatur-Hilfe Button -->
	<button
		onclick={() => (showKeyboardHelp = true)}
		class="bg-info text-info-content hover:bg-info/80 fixed bottom-4 left-4 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full shadow-lg transition-colors duration-300"
		aria-label="Tastatur-Hilfe anzeigen"
		title="Tastaturkürzel anzeigen (H oder ?)"
	>
		<span class="text-lg font-bold">?</span>
	</button>

	<!-- Logo (unten rechts) - optional -->
	{#if showLogo}
		<div class="group absolute right-1 bottom-6 z-30">
			<div
				class="border-primary/10 rounded-xl border bg-white/95 p-1 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-105 hover:shadow-2xl"
			>
				<div class="flex flex-col items-center">
					<img
						src="/dmm-logo.png"
						alt="Logo des Deutschen Meeresmuseums - wissenschaftliche Einrichtung für Meeresforschung und Meeresschutz"
						class="h-12 w-auto"
						id="dmm"
						title="Deutsches Meeresmuseum"
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tastatur-Hilfe Modal -->
	{#if showKeyboardHelp}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="help-modal-title"
				class="bg-base-100 max-h-[80vh] max-w-md rounded-lg p-6 shadow-xl"
			>
				<div class="mb-4 flex items-center justify-between">
					<h3 id="help-modal-title" class="text-lg font-bold">Tastaturkürzel</h3>
					<button
						onclick={() => (showKeyboardHelp = false)}
						class="btn btn-ghost btn-sm"
						aria-label="Hilfe schließen"
					>
						✕
					</button>
				</div>

				<div class="space-y-3">
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">H oder ?</kbd>
						<span class="text-sm">Diese Hilfe anzeigen</span>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">F</kbd>
						<span class="text-sm">Filter-Panel öffnen/schließen</span>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">L</kbd>
						<span class="text-sm">Legende-Panel öffnen/schließen</span>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">Z</kbd>
						<span class="text-sm">Auf alle Meldungen zoomen</span>
					</div>
					<div class="flex justify-between">
						<kbd class="kbd kbd-sm">ESC</kbd>
						<span class="text-sm">Dialoge schließen</span>
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
						Die Buchstaben-Kürzel wirken, solange der Fokus auf der Karte liegt
					</p>
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:navigation"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						Karte mit Tab fokussieren, dann mit den Pfeiltasten verschieben und mit + / − zoomen
					</p>
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:list"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						Der Umschalter „Karte / Liste" zeigt alle Sichtungen als Tabelle
					</p>
					<p class="flex items-center gap-2">
						<Icon
							icon="lucide:mouse-pointer"
							width="14"
							height="14"
							class="text-primary"
							aria-hidden="true"
						/>
						Klicken Sie auf Marker für Details
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
