<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import ExportModal from '#lib/components/admin/ExportModal.svelte';
	import { DEAD_FINDING_PRESENTATION } from '#lib/components/admin/deadFinding.ts';
	import { deleteSighting, sendTestEmail } from '#lib/components/admin/sightingActions.ts';
	import DeleteDialog from '#lib/components/ui/Dialog/DeleteDialog.svelte';
	import { createLogger } from '#lib/logger.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { submitVerdict, type SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';
	import {
		SIGHTING_STATUS_PRESENTATION,
		SIGHTING_STATUS_UNDO_MS,
		verdictToStatus,
		type SightingStatus
	} from '#lib/components/admin/sightingStatus.ts';
	import { getEntryChannelOptions } from '#lib/report/formOptions/entryChannel.ts';
	import { toast } from '#lib/stores/toastState.svelte.ts';
	import type { PageData } from './$types';
	import type { SichtungenListRow } from './listColumns';
	import type { SpamCheckResponse } from '#lib/types/spam.ts';
	import SpamFinding from '#lib/components/admin/SpamFinding.svelte';
	import {
		getSpamDrift,
		getSpamRisk,
		getSpamRiskFromResult,
		SPAM_DRIFT_PRESENTATION
	} from '#lib/components/admin/spamScorePresentation.ts';
	import Icon from '#lib/components/Icon.svelte';
	import StatusBlock from '#lib/components/StatusBlock.svelte';
	import { BALTIC_SEA_STATUS_PRESENTATION } from '#lib/utils/geo/balticSeaStatus.ts';
	import { MEDIA_UPLOAD_ANNOUNCED_MISSING } from '#lib/utils/media/photoAnnouncement.ts';
	import { AUFNAHME_LABEL, MELDEART_LABEL } from '#lib/components/admin/filterLabels.ts';
	import { readFilterParams, type FilterParams } from './activeFilters';
	import { buildFilterChips, removeFilterParam } from './filterChips';
	import SichtungenCards from './SichtungenCards.svelte';
	import StatusTabs from './StatusTabs.svelte';
	import type { StatusTabValue } from './statusTabs';
	import SichtungenTable from './SichtungenTable.svelte';
	import { AVAILABLE_COLUMNS, DEFAULT_COLUMN_VISIBILITY } from './columns';
	import { NUR_KOMPAKT, NUR_WEIT_FLEX } from './layoutSwitch';
	import {
		COLUMN_PREFERENCES_STORAGE_KEY,
		isDefaultVisibility,
		loadColumnPreferences,
		serializeColumnPreferences
	} from './columnPreferences';
	import {
		addFilterPreset,
		capturePresetParams,
		FILTER_PRESETS_STORAGE_KEY,
		loadFilterPresets,
		matchesPreset,
		presetUrl,
		removeFilterPreset,
		renameFilterPreset,
		serializeFilterPresets,
		type FilterPreset
	} from './filterPresets';
	import { getHeaderState, isSameIdList } from './bulkSelection';
	import { paginationControls } from './paginationControls';
	import { buildBulkSummary, runBulkVerdict } from './bulkVerdict';

	const logger = createLogger('SichtungenPage');

	/* Feste id statt eines generierten Werts: Das Panel existiert genau einmal,
	   die zwei Auslöser (Mobil-Kopf und Weit-Kopf) verweisen beide per
	   `aria-controls` darauf — ein `crypto.randomUUID()` o. Ä. wäre hier ohne
	   Nutzen, weil nichts dynamisch mehrfach gerendert wird. */
	const FILTER_PANEL_ID = 'sichtungen-filter-panel';

	let { data }: { data: PageData } = $props();

	// Reaktive States mit Runes
	let sightings = $derived(data.sightings);
	/* Der Filterzustand kommt vollständig aus der URL, nicht aus den Feld-States:
	   Die Tabelle zeigt, was in der URL steht. Ein im Panel getippter, aber nicht
	   angewendeter Wert exportierte sonst eine Menge, die die Tabelle nie gezeigt
	   hat, und markierte die Filter-Schaltfläche schon beim Tippen. Für `q` galt
	   das schon länger — jetzt für alle acht.

	   Steht bewusst vor den Feld-States: Sie initialisieren sich daraus, statt die
	   URL ein zweites Mal selbst zu lesen. */
	let currentFilters = $derived(readFilterParams(page.url.searchParams));
	/* `skipVerified`, solange die Statusreiter über der Tabelle stehen: Der
	   aktive Reiter zeigt den Status bereits — ein Status-Chip daneben wäre ein
	   zweites Bedienelement für dieselbe Aussage. */
	let filterChips = $derived(buildFilterChips(currentFilters, { skipVerified: true }));

	/* Für den Leer-Zustand zählt der Status mit — hier also OHNE `skipVerified`.
	   Ein Statusreiter ist ein Filter wie jeder andere; „Abgelehnt" ohne Treffer
	   ist nicht „noch keine Sichtungen erfasst". Trotzdem dieselbe Quelle wie die
	   Chip-Zeile, statt die acht Felder ein zweites Mal abzufragen. */
	let hasActiveFilters = $derived(buildFilterChips(currentFilters).length > 0);

	/* Startwerte des Editier-Puffers. Der `$effect` weiter unten, der ihn nach
	   einer Navigation nachzieht, läuft im SSR-Durchlauf nicht; ohne diese
	   Initialisierung stünde das Suchfeld im servergerenderten Frame leer,
	   obwohl die URL ein `?q=` trägt.

	   Eine eigene, nicht-reaktive Momentaufnahme statt `currentFilters`: Ein
	   `$derived` in einem `$state`-Initialisierer meldet Svelte als
	   `state_referenced_locally` — zu Recht, denn genommen wird hier bewusst nur
	   der Startwert. */
	const startFilter = readFilterParams(page.url.searchParams);
	let fromDate = $state(startFilter.fromDate);
	let toDate = $state(startFilter.toDate);
	/* Ausnahmsweise über `currentFilters`, obwohl `startFilter` danebensteht:
	   `verifiedReadScan.test.ts` lässt den Property-Zugriff `.verified` nur an
	   diesem einen Empfänger zu — er ist dort als Query-Parameter der Tabelle
	   ausgenommen und nicht als Datenbankspalte. Der Wert ist derselbe. */
	// svelte-ignore state_referenced_locally
	let verified = $state(currentFilters.verified);
	// `all` ist das Sentinel des `<select>` für „egal"; in der URL steht dafür
	// gar kein Parameter.
	let selectedChannel = $state(startFilter.entryChannel || 'all');
	let mediaUpload = $state(startFilter.mediaUpload);
	let balticSea = $state(startFilter.balticSea);
	let deadFinding = $state(startFilter.deadFinding);
	let searchTerm = $state(startFilter.q);
	let showDeleteDialog = $state(false);
	let sightingToDelete = $state<SichtungenListRow | null>(null);
	let isFilterPanelOpen = $state(false);
	let showExportModal = $state(false);
	let showColumnDropdown = $state(false);

	/* SSR rendert immer mit dem Default — `localStorage` existiert dort nicht
	   (architecture.md: kein window-Zugriff beim SSR-Rendern). Der `$effect`
	   unten übernimmt den gespeicherten Stand direkt nach der Hydration; ein
	   kurzes Umspringen der Spaltenauswahl im ersten Frame im Browser ist dabei
	   bewusst in Kauf genommen.

	   Direkter `localStorage`-Zugriff statt `#lib/storage/localStorage.js`: Dessen
	   Helfer gehören zum Lebenszyklus des Meldeformulars — `STORAGE_KEYS` trägt
	   den `sichtungen_`-Namespace und `clearStorage()` räumt diese Schlüssel
	   beim Verwerfen des Formulars ab. Eine Admin-UI-Präferenz darf daran nicht
	   hängen; Versionierung und tolerantes Parsen kapselt hier stattdessen
	   `columnPreferences.ts`. */
	let columnVisibility = $state({ ...DEFAULT_COLUMN_VISIBILITY });
	let hatGespeicherteSpaltenGeladen = false;
	/* Serialisierter Stand, den der Lade-Effekt zuletzt gesehen hat (geladener
	   Wert oder unveränderter Default). Der Speicher-Effekt vergleicht dagegen
	   und überspringt den Schreibvorgang, solange sich nichts geändert hat —
	   siehe Begründung dort. */
	let letzterPersistierterStand: string | null = null;
	let istSpaltenauswahlDefault = $derived(
		isDefaultVisibility(columnVisibility, DEFAULT_COLUMN_VISIBILITY)
	);

	// Zwei getrennte Effekte statt einem — die Begründung (Svelte trackt
	// Abhängigkeiten nur aus gelesenen, nicht aus geschriebenen reaktiven
	// Werten; der WP7-Bug entstand genau daraus) steht beim Speicher-Effekt
	// unten, wo sie an derselben Stelle vor einer Regression schützt.
	$effect(() => {
		if (typeof window === 'undefined' || hatGespeicherteSpaltenGeladen) return;
		try {
			// Einmaliges Laden beim Mount. Kaputtes/altes JSON und unbekannte
			// Schlüssel fallen in `loadColumnPreferences` still auf den Default
			// zurück; neue Spalten erscheinen mit ihrem eigenen Default-Wert.
			columnVisibility = loadColumnPreferences(
				window.localStorage.getItem(COLUMN_PREFERENCES_STORAGE_KEY),
				DEFAULT_COLUMN_VISIBILITY
			);
		} catch (err) {
			logger.warn({ err }, 'Gespeicherte Spaltenauswahl kann nicht gelesen werden');
		} finally {
			// Merkt sich den geladenen (oder mangels Storage unveränderten
			// Default-)Stand, damit der Speicher-Effekt seinen ersten Durchlauf
			// nicht sofort wieder zurückschreibt (Fix-Runde 2: genau das
			// passierte vorher bei jedem Seitenaufruf, siehe dortiger
			// Kommentar).
			letzterPersistierterStand = serializeColumnPreferences(columnVisibility);
			hatGespeicherteSpaltenGeladen = true;
		}
	});

	$effect(() => {
		/* `columnVisibility` MUSS gelesen werden, bevor irgendein `return`
		   greifen kann — Svelte trackt die Abhängigkeiten eines Effekts nur aus
		   den in seinem letzten Durchlauf tatsächlich gelesenen reaktiven
		   Werten. `hatGespeicherteSpaltenGeladen` ist ein einfaches `let`, kein
		   `$state` — der Effekt läuft heute nur deshalb ein zweites Mal, weil
		   der Lade-Effekt oben zuerst deklariert ist und das Flag VOR dem
		   ersten Durchlauf dieses Effekts auf `true` setzt. Stünde die
		   Serialisierung hinter dem Guard, würde der allererste Durchlauf beim
		   noch nicht geladenen Stand früh aussteigen, OHNE `columnVisibility`
		   je zu lesen — der Effekt abonnierte sich dann nie auf Änderungen und
		   bliebe für immer stumm, egal in welcher Reihenfolge die Effekte
		   künftig stehen. Genau das war der Bug, der die Aufspaltung oben nötig
		   gemacht hat; ihn hier wieder einzuführen wäre derselbe Fehler eine
		   Ebene tiefer.

		   Zweiter Guard unten (`serialisiert === letzterPersistierterStand`):
		   Weil `hatGespeicherteSpaltenGeladen` beim Laden bereits synchron auf
		   `true` steht, passiert dieser Effekt den ersten Guard schon bei
		   seinem allerersten Durchlauf — ohne den Vergleich schriebe er den
		   gerade erst geladenen (oder unveränderten Default-)Stand sofort
		   zurück nach `localStorage`, bei jedem Seitenaufruf, nicht nur bei
		   einer tatsächlichen Änderung. Da `mergeColumnPreferences` jeden
		   gespeicherten Schlüssel für immer beibehält, hätte das eine spätere
		   Änderung von `DEFAULT_COLUMN_VISIBILITY` nie wieder erreicht. */
		const serialisiert = serializeColumnPreferences(columnVisibility);
		if (typeof window === 'undefined' || !hatGespeicherteSpaltenGeladen) return;
		if (serialisiert === letzterPersistierterStand) return;
		// Jede Änderung (Checkbox im „Spalten"-Dropdown, „Standard
		// wiederherstellen") wird persistiert. `try/catch`, weil `setItem`
		// werfen kann (volle Quota, Safari im privaten Modus) — die
		// Spaltenauswahl ist eine Bequemlichkeit, kein Grund zum Absturz.
		try {
			window.localStorage.setItem(COLUMN_PREFERENCES_STORAGE_KEY, serialisiert);
			letzterPersistierterStand = serialisiert;
		} catch (err) {
			logger.warn(
				{ err },
				'Spaltenauswahl kann nicht gespeichert werden — Storage nicht verfügbar'
			);
		}
	});

	/* Gespeicherte Filteransichten (Spec B4). Persistenz wie bei der
	   Spaltenauswahl in `localStorage`, aber ohne Rückschreib-`$effect`:
	   Ansichten ändern sich nur durch eine ausdrückliche Bedienung (anlegen,
	   umbenennen, löschen), und jede dieser Funktionen speichert selbst. Ein
	   Effect müsste stattdessen einen ersten Durchlauf ausklammern, um den
	   geladenen Stand nicht sofort zurückzuschreiben — die Sonderregel, die bei
	   den Spalten nötig ist, weil dort jede Checkbox den State ändert. */
	let filterPresets = $state<FilterPreset[]>([]);
	/* Nicht per `bind:open` an ein `details`: Nach dem Speichern soll das
	   Formular zugehen, und dafür braucht es einen State, den der Handler
	   setzen kann. */
	let zeigeAnsichtFormular = $state(false);
	let neueAnsichtName = $state('');
	/* id der Ansicht, die gerade umbenannt wird — `null` heißt: keine. */
	let umbenennenId = $state<string | null>(null);
	let umbenennenName = $state('');
	/* Element-Referenzen, um den Fokus in die frisch eingeblendete Eingabezeile
	   zu setzen: Ohne das bliebe er am verschwundenen Auslöser hängen, und wer
	   per Tastatur arbeitet, müsste sich zurück zum Feld tabben. */
	let neueAnsichtFeld = $state<HTMLInputElement | null>(null);
	let umbenennenFeld = $state<HTMLInputElement | null>(null);

	/* Ohne Lade-Wächter: Der Effect liest keinen reaktiven Wert, läuft also
	   genau einmal. Ein `typeof window`-Guard entfällt aus demselben Grund —
	   Effects laufen im SSR-Durchlauf nicht.

	   try/catch aus demselben Grund wie bei der Spaltenauswahl: `localStorage`
	   kann per Browser-Policy werfen. Ohne Storage läuft die Seite dann ohne
	   gespeicherte Ansichten weiter, statt beim Hydratisieren zu crashen. */
	$effect(() => {
		try {
			filterPresets = loadFilterPresets(window.localStorage.getItem(FILTER_PRESETS_STORAGE_KEY));
		} catch (err) {
			logger.warn({ err }, 'Filteransichten können nicht gelesen werden — Storage nicht verfügbar');
		}
	});

	$effect(() => {
		neueAnsichtFeld?.focus();
	});

	$effect(() => {
		umbenennenFeld?.focus();
	});

	function speichereAnsichten(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(
				FILTER_PRESETS_STORAGE_KEY,
				serializeFilterPresets(filterPresets)
			);
		} catch (err) {
			logger.warn(
				{ err },
				'Filteransichten können nicht gespeichert werden — Storage nicht verfügbar'
			);
			toast.error('Die Ansicht konnte nicht dauerhaft gespeichert werden.');
		}
	}

	/* Aktive Ansicht aus der URL abgeleitet, nicht als eigener State: Der
	   Filterzustand steht in der URL, und ein zweiter gemerkter „zuletzt
	   geklickter Chip" liefe bei jedem Filterwechsel, Zurück-Button oder
	   geteilten Link daneben. */
	let aktiveAnsichtId = $derived(
		filterPresets.find((preset) => matchesPreset(preset, page.url))?.id ?? null
	);

	function ansichtAnwenden(preset: FilterPreset): void {
		goto(presetUrl(preset, page.url));
	}

	function ansichtSpeichern(event: SubmitEvent): void {
		event.preventDefault();
		/* Aus der URL, nicht aus den Feld-States: Gespeichert gehört die Menge,
		   die die Tabelle gerade zeigt — nicht eine im Filter-Panel getippte,
		   aber nie angewendete. Derselbe Grund wie bei `currentFilters`. */
		const neu = addFilterPreset(filterPresets, neueAnsichtName, capturePresetParams(page.url));
		/* Unveränderte Liste heißt: Name schon vergeben. Der leere Name kann hier
		   nicht mehr ankommen — den fängt das `required` am Feld ab, samt
		   Browser-Meldung am Feld selbst. Ein stilles `return` wäre an beiden
		   Stellen falsch: Der Knopf täte dann sichtbar nichts. */
		if (neu === filterPresets) {
			toast.error(`Es gibt bereits eine Ansicht „${neueAnsichtName.trim()}".`);
			return;
		}
		filterPresets = neu;
		speichereAnsichten();
		neueAnsichtName = '';
		zeigeAnsichtFormular = false;
	}

	function umbenennenStarten(preset: FilterPreset): void {
		umbenennenId = preset.id;
		umbenennenName = preset.name;
	}

	function umbenennenBestaetigen(event: SubmitEvent): void {
		event.preventDefault();
		if (!umbenennenId) return;
		const neu = renameFilterPreset(filterPresets, umbenennenId, umbenennenName);
		// Gleiche Begründung wie beim Anlegen: unverändert = Name schon vergeben.
		if (neu === filterPresets) {
			toast.error(`Es gibt bereits eine Ansicht „${umbenennenName.trim()}".`);
			return;
		}
		filterPresets = neu;
		speichereAnsichten();
		umbenennenId = null;
	}

	function ansichtLoeschen(preset: FilterPreset): void {
		filterPresets = removeFilterPreset(filterPresets, preset.id);
		speichereAnsichten();
		if (umbenennenId === preset.id) umbenennenId = null;
	}

	/* Zustand der Seiten-Navigation. Als `$derived` und nicht als `{@const}` im
	   Markup: Ein `{@const}` muss unmittelbares Kind eines Blocks sein, und die
	   Navigationsleiste steht in einem gewöhnlichen `<div>`. Begründung der
	   Rechnung selbst in `paginationControls.ts` (Leerfall `totalPages === 0`). */
	let seiten = $derived(paginationControls(data.pagination.page, data.pagination.totalPages));

	/* Die Feld-States sind der Editier-Puffer des Panels und speisen nur noch
	   `applyFilters()`. Nach jeder Navigation — Preset-Klick, Zurück-Button,
	   entfernter Filter — übernehmen sie den URL-Stand, sonst zeigte das Panel
	   veraltete Werte. Wer mitten im Editieren navigiert, hat den Puffer damit
	   bewusst verworfen; ein „wird gerade editiert"-Wächter daneben wäre ein
	   zweiter gemerkter Zustand neben der URL. */
	$effect(() => {
		fromDate = currentFilters.fromDate;
		toDate = currentFilters.toDate;
		verified = currentFilters.verified;
		selectedChannel = currentFilters.entryChannel || 'all';
		mediaUpload = currentFilters.mediaUpload;
		balticSea = currentFilters.balticSea;
		deadFinding = currentFilters.deadFinding;
		searchTerm = currentFilters.q;
	});

	function applyFilters(): void {
		const url = new URL(page.url.href);

		// Datum-Filter
		if (fromDate) url.searchParams.set('fromDate', fromDate);
		else url.searchParams.delete('fromDate');

		if (toDate) url.searchParams.set('toDate', toDate);
		else url.searchParams.delete('toDate');

		// Verified-Filter
		if (verified) url.searchParams.set('verified', verified);
		else url.searchParams.delete('verified');

		// Eingangskanal-Filter
		if (selectedChannel && selectedChannel !== 'all') {
			url.searchParams.set('entryChannel', selectedChannel);
		} else {
			url.searchParams.delete('entryChannel');
		}

		// Aufnahme-Filter
		if (mediaUpload) url.searchParams.set('mediaUpload', mediaUpload);
		else url.searchParams.delete('mediaUpload');

		// Ostsee-Status-Filter
		if (balticSea) url.searchParams.set('balticSea', balticSea);
		else url.searchParams.delete('balticSea');

		// Meldeart-Filter (Totfund/Lebendsichtung)
		if (deadFinding) url.searchParams.set('deadFinding', deadFinding);
		else url.searchParams.delete('deadFinding');

		// Freitext-Suche. Getrimmt, damit ein versehentliches Leerzeichen nicht
		// als aktive Suche in der URL stehen bleibt — der Server verwirft es
		// ohnehin (normalizeSearchTerm). Der getrimmte Wert geht zurück in den
		// State, nicht nur in die URL: Sonst zeigte das Feld nach dem Suchen
		// weiter die ungetrimmte Eingabe, und ein Feld aus lauter Leerzeichen
		// zählte als aktiver Filter — es stünde ein Chip „Suche: ‚   '" über der
		// Tabelle, während die URL gar keine Suche trägt.
		searchTerm = searchTerm.trim();
		if (searchTerm) url.searchParams.set('q', searchTerm);
		else url.searchParams.delete('q');

		url.searchParams.set('page', '1');
		goto(url);
	}

	/**
	 * Absenden der Suche. Läuft über `applyFilters()`, damit ein aktiver
	 * Filter erhalten bleibt und die Seitenzahl auf 1 zurückspringt — sonst
	 * stünde man mit einer frischen Suche auf einer leeren Seite 7.
	 */
	function submitSearch(event: SubmitEvent): void {
		event.preventDefault();
		applyFilters();
	}

	function resetFilters(): void {
		fromDate = '';
		toDate = '';
		verified = '';
		selectedChannel = 'all';
		mediaUpload = '';
		balticSea = '';
		deadFinding = '';
		searchTerm = '';

		const url = new URL(page.url.href);
		url.searchParams.delete('fromDate');
		url.searchParams.delete('toDate');
		url.searchParams.delete('verified');
		url.searchParams.delete('entryChannel');
		url.searchParams.delete('mediaUpload');
		url.searchParams.delete('balticSea');
		url.searchParams.delete('deadFinding');
		url.searchParams.delete('q');
		url.searchParams.set('page', '1');
		goto(url);
	}

	/**
	 * Statusleiste über der Tabelle. Schreibt denselben Parameter wie das
	 * `<select>` im Panel — es gibt keinen zweiten gemerkten Zustand, beide
	 * lesen ihren Stand aus der URL. `page=1`, weil die Trefferzahl mit dem
	 * Status springt und man sonst auf einer leeren Seite 7 landete.
	 */
	function selectStatus(value: StatusTabValue): void {
		const url = new URL(page.url.href);
		if (value) url.searchParams.set('verified', value);
		else url.searchParams.delete('verified');
		url.searchParams.set('page', '1');
		goto(url);
	}

	/**
	 * Einen einzelnen Filter über seinen Chip zurücknehmen. Dieselbe Bauform wie
	 * `selectStatus()` und `applyFilters()` — URL abwandeln, `page=1`, `goto` —,
	 * damit nicht ein zweiter Navigationsweg neben ihnen entsteht; die Rechnung
	 * selbst steht in `filterChips.ts` und ist dort geprüft.
	 */
	function filterEntfernen(param: keyof FilterParams): void {
		goto(removeFilterParam(page.url, param));
	}

	function changePage(newPage: number): void {
		const url = new URL(page.url.href);
		url.searchParams.set('page', newPage.toString());
		goto(url);
	}

	function changeItemsPerPage(newPerPage: number): void {
		const url = new URL(page.url.href);
		url.searchParams.set('perPage', newPerPage.toString());
		url.searchParams.set('page', '1');
		goto(url);
	}

	function viewSightingDetails(sighting: SichtungenListRow): void {
		// Preserve current filter parameters when navigating to detail view
		const currentParams = page.url.searchParams;
		const detailUrl = new URL(`/admin/${sighting.id}`, page.url.origin);

		// Copy current search parameters to maintain filters
		for (const [key, value] of currentParams.entries()) {
			detailUrl.searchParams.set(key, value);
		}

		goto(detailUrl.toString());
	}

	/** Der zuletzt gescheiterte Vorgang; `retry` wiederholt genau ihn. Begründung am `StatusBlock` im Markup. */
	let aktionsFehler = $state<{ title: string; description: string; retry: () => void } | null>(
		null
	);

	function meldeFehlschlag(title: string, description: string, retry: () => void): void {
		aktionsFehler = { title, description, retry };
	}

	async function removeSighting(id: number): Promise<void> {
		const ausgang = await deleteSighting(id, { silent: true });
		if (!ausgang.ok) {
			meldeFehlschlag(
				'Sichtung wurde nicht gelöscht',
				ausgang.message,
				() => void removeSighting(id)
			);
			return;
		}
		aktionsFehler = null;
		// Reload data via SvelteKit's invalidation instead of full page reload
		await invalidateAll();
	}

	async function sendTestEmailMitFehlerflaeche(id: number): Promise<void> {
		const ausgang = await sendTestEmail(id, { silent: true });
		if (!ausgang.ok) {
			meldeFehlschlag(
				'Test-E-Mail wurde nicht gesendet',
				ausgang.message,
				() => void sendTestEmailMitFehlerflaeche(id)
			);
			return;
		}
		aktionsFehler = null;
	}

	let spamCheckModal = $state({
		open: false,
		loading: false,
		sightingId: null as number | null,
		result: null as SpamCheckResponse | null,
		error: null as string | null
	});

	let spamCheckDialogElement = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!spamCheckDialogElement) return;
		if (spamCheckModal.open && !spamCheckDialogElement.open) {
			spamCheckDialogElement.showModal();
		} else if (!spamCheckModal.open && spamCheckDialogElement.open) {
			spamCheckDialogElement.close();
		}
	});

	async function checkSpam(sightingId: number): Promise<void> {
		spamCheckModal.open = true;
		spamCheckModal.loading = true;
		spamCheckModal.sightingId = sightingId;
		spamCheckModal.result = null;
		spamCheckModal.error = null;
		try {
			const response = await fetch(`/api/sightings/${sightingId}/spam-check`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			// Guard against race: discard response if user switched to a different sighting
			if (spamCheckModal.sightingId !== sightingId) return;
			const result = await response.json();
			// Second check: another switch may have occurred during json() parsing
			if (spamCheckModal.sightingId !== sightingId) return;
			spamCheckModal.result = result;
		} catch (err) {
			if (spamCheckModal.sightingId !== sightingId) return;
			logger.error({ err, sightingId }, 'Spam-Check fehlgeschlagen');
			spamCheckModal.error = 'Spam-Check fehlgeschlagen';
		} finally {
			if (spamCheckModal.sightingId === sightingId) {
				spamCheckModal.loading = false;
			}
		}
	}

	/**
	 * Die Zeilen, deren Statuswechsel gerade läuft — **je Zeile**, nicht global.
	 *
	 * Ein einzelner Wert vermischte zwei Zustände: Der Wächter wiese jeden
	 * weiteren Klick ab, während `disabled` nur am Control der laufenden Zeile
	 * hinge. Die übrigen sähen bedienbar aus und täten nichts — schlimmer als
	 * ein sichtbar gesperrtes Element, weil der Fehlschlag unsichtbar bleibt.
	 * Zwei verschiedene Zeilen dürfen gleichzeitig wechseln; zu verhindern ist
	 * allein der Doppelklick auf dieselbe.
	 */
	const statusPending = new SvelteSet<number>();

	async function changeStatus(
		id: number,
		verdict: SightingVerdict,
		previous: SightingStatus
	): Promise<void> {
		if (statusPending.has(id)) return;
		statusPending.add(id);
		/* `finally` statt eines Löschens direkt nach `submitVerdict`: Zwischen dem
		   Entsperren und dem Abschluss von `invalidateAll()` zeigte das Control
		   schon wieder bedienbar, aber noch die alten Daten — ein Klick in diesem
		   Fenster hätte `previous` aus einem veralteten Stand berechnet. Der
		   `finally`-Block deckt zugleich den Fehlerfall (`!ok`) ab, sonst bliebe
		   die Zeile nach einem gescheiterten Versuch dauerhaft gesperrt. */
		try {
			/* `silent` und stattdessen die stehende Fläche: derselbe Grund wie beim
			   Löschen (Docblock an `aktionsFehler`). Der Statuswechsel ist dabei der
			   wichtigste der drei Fälle — er ist die tägliche Aktion dieser Seite,
			   und ein übersehener Fehlschlag lässt eine Meldung unentschieden
			   zurück, ohne dass es irgendwo auffiele. */
			const ok = await submitVerdict(id, verdict, { silent: true });
			if (!ok) {
				const ziel = SIGHTING_STATUS_PRESENTATION[verdictToStatus(verdict)];
				meldeFehlschlag(
					`Status „${ziel.label}" wurde nicht gespeichert`,
					'Die Sichtung steht unverändert in der Liste.',
					() => void changeStatus(id, verdict, previous)
				);
				return;
			}
			aktionsFehler = null;

			await invalidateAll();

			/* Kein Bestätigungsdialog, auch nicht beim Entzug einer Freigabe: Er
			   bremste jeden regulären Vorgang aus. Stattdessen ist der Fehlklick in
			   einem Klick geheilt. Dieselbe Dauer wie das Undo-Fenster der
			   Eingangsseite (`SIGHTING_STATUS_UNDO_MS`). */
			const nach = SIGHTING_STATUS_PRESENTATION[verdictToStatus(verdict)];
			toast.success(`Status: ${nach.label}`, {
				duration: SIGHTING_STATUS_UNDO_MS,
				action: {
					label: 'Rückgängig',
					onClick: () => {
						/* Ohne diese Prüfung griff bei einem Klick während eine andere
						   Aktion auf derselben Zeile noch läuft die `busy`-Wache am Anfang
						   dieser Funktion: Der Toast schloss sich, `changeStatus` kehrte
						   sofort zurück, und nichts geschah — ohne jede Rückmeldung. */
						if (statusPending.has(id)) {
							toast.error('Diese Zeile wird gerade noch bearbeitet — bitte kurz warten.', {
								title: 'Rückgängig nicht möglich',
								dismissible: true
							});
							return;
						}
						void changeStatus(
							id,
							SIGHTING_STATUS_PRESENTATION[previous].verdict,
							verdictToStatus(verdict)
						);
					}
				}
			});
		} finally {
			statusPending.delete(id);
		}
	}

	/* ---------------------------------------------------------------------- */
	/* Bulk-Aktionen (nur Desktop-Tabelle)                                      */
	/* ---------------------------------------------------------------------- */

	/**
	 * Die gewählten Zeilen — immer nur aus der **aktuell sichtbaren** Seite.
	 * Ein Cross-Page-Gedächtnis wäre gefährlich: „Freigeben" löste dann Zeilen
	 * aus, die niemand mehr vor sich hat. Die Rechenregeln stehen in
	 * `bulkSelection.ts`, hier liegt nur der Zustand.
	 */
	let selectedIds = $state<number[]>([]);
	let visibleIds = $derived(sightings.map((sighting) => sighting.id));
	let headerState = $derived(getHeaderState(selectedIds, visibleIds));

	/* Zuletzt gesehene Liste als einfache Variable und nicht als `$state`: Sie ist
	   nur Vergleichsgrundlage des Effekts unten; als reaktiver Wert löste ihr
	   Schreiben denselben Effekt erneut aus. */
	let zuletztGeseheneIds: number[] = [];
	$effect(() => {
		const ids = visibleIds;
		if (isSameIdList(zuletztGeseheneIds, ids)) return;
		// Seitenwechsel, Filterwechsel oder Neuladen nach einer Aktion — die
		// Auswahl gehört geleert, sie bezog sich auf eine andere Liste.
		zuletztGeseheneIds = ids;
		selectedIds = [];
	});

	/** Läuft gerade eine Bulk-Ausführung? Sperrt die Leiste hart (siehe unten). */
	let bulkPending = $state(false);
	let bulkProgress = $state<{ done: number; total: number } | null>(null);

	async function runBulkSequence(
		ids: number[],
		verdict: SightingVerdict,
		options: { skipped?: number; allowUndo: boolean }
	): Promise<void> {
		bulkPending = true;
		bulkProgress = { done: 0, total: ids.length };
		/* Die Zeilen für die Dauer der Schleife sperren — dieselbe Wache wie beim
		   Einzelwechsel. Sonst könnte ein Klick auf das Status-Control einer
		   gerade laufenden Zeile ein zweites Verdict hinterherschicken. */
		for (const id of ids) statusPending.add(id);
		try {
			const outcome = await runBulkVerdict(ids, verdict, {
				/* `silent`: Sonst käme ein Fehler-Toast pro Zeile — bei 40 Zeilen eine
				   Wand statt einer Rückmeldung. Gemeldet wird einmal, unten. */
				submit: (id, v) => submitVerdict(id, v, { silent: true }),
				onProgress: (done, total) => (bulkProgress = { done, total })
			});

			selectedIds = [];
			await invalidateAll();

			const summary = buildBulkSummary(outcome, verdict, options.skipped ?? 0);
			/* Ein Toast statt N — `warning` bei Teilfehlern, damit die Fehlerzahl
			   nicht in einem grünen Erfolgs-Toast untergeht. */
			const zeigeToast = summary.hasFailures ? toast.warning : toast.success;
			/* Die Aktion wird per Spread ergänzt statt als `action: … : undefined`
			   gesetzt: Unter `exactOptionalPropertyTypes` ist ein explizites
			   `undefined` nicht dasselbe wie ein fehlendes Feld. */
			const undoAktion =
				options.allowUndo && outcome.succeeded.length > 0
					? {
							label: 'Rückgängig',
							/* Nur die Erfolge: Ein `reset` auf eine Zeile, deren Wechsel nie
							   ankam, überschriebe einen fremden Zustand. */
							onClick: () => void undoBulk(outcome.succeeded)
						}
					: null;
			zeigeToast(summary.message, {
				duration: SIGHTING_STATUS_UNDO_MS,
				dismissible: true,
				...(undoAktion ? { action: undoAktion } : {})
			});
		} finally {
			for (const id of ids) statusPending.delete(id);
			bulkPending = false;
			bulkProgress = null;
		}
	}

	async function runBulk(verdict: SightingVerdict): Promise<void> {
		if (bulkPending) return;
		const auswahl = [...selectedIds];
		/* Zeilen mit laufender Einzelaktion bleiben außen vor: Ihr Vorgänger-Zustand
		   ist gerade in Bewegung, ein zweites Verdict darüber wäre ein Rennen. */
		const auszufuehren = auswahl.filter((id) => !statusPending.has(id));
		const uebersprungen = auswahl.length - auszufuehren.length;

		if (auszufuehren.length === 0) {
			toast.error('Die gewählten Zeilen werden gerade noch bearbeitet — bitte kurz warten.', {
				title: 'Aktion nicht möglich',
				dismissible: true
			});
			return;
		}

		await runBulkSequence(auszufuehren, verdict, { skipped: uebersprungen, allowUndo: true });
	}

	/** Das Rückgängig des Bulk-Toasts — kein eigenes Undo darauf, sonst pendelt es. */
	async function undoBulk(ids: number[]): Promise<void> {
		if (bulkPending) {
			toast.error('Es läuft noch eine Aktion — bitte kurz warten.', {
				title: 'Rückgängig nicht möglich',
				dismissible: true
			});
			return;
		}
		await runBulkSequence(ids, 'reset', { allowUndo: false });
	}
</script>

<svelte:head>
	<title>Sichtungen - Admin - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Admin-Dashboard zur Verwaltung aller Meerestier-Sichtungen. Überprüfung, Bearbeitung und Verwaltung der gemeldeten Sichtungen in der Ostsee."
	/>
	<meta
		name="keywords"
		content="Admin, Dashboard, Sichtungen, Verwaltung, Meerestiere, Ostsee, Moderation"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="Sichtungsverwaltung - Admin - Ostsee-Tiere" />
	<meta
		property="og:description"
		content="Administrationsbereich zur Verwaltung und Überprüfung von Meerestier-Sichtungen"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Sichtungsverwaltung - Admin - Ostsee-Tiere" />
	<meta
		name="twitter:description"
		content="Administrationsbereich zur Verwaltung und Überprüfung von Meerestier-Sichtungen"
	/>
</svelte:head>

<div class="pt-6">
	<!-- Page Header -->
	<div class="container mx-auto mb-6 px-4 md:px-6">
		<!-- Der Arbeitslisten-Knopf „n Fotos ausstehend" stand bis 2026-08-09 hier.
		     Er ist raus, weil dieselbe Arbeitsliste auf dieser Seite bereits über
		     den Aufnahme-Filter („Angekündigt, fehlt noch") erreichbar ist und der
		     Eingang (`/admin`) den Hinweis samt Zähler ohnehin führt — dort gehört
		     er hin, das ist die Task-Liste. Drei Einstiege in dieselbe Abfrage
		     hießen drei Stellen, die auseinanderlaufen können. -->

		<!-- Kompakter Kopf. Die Grenze kommt aus `layoutSwitch.ts` und ist dieselbe
		     wie bei Kartenliste und Tabelle — vorher schaltete der Kopf bei `sm`,
		     die Inhaltsfläche bei `md`. -->
		<div class="{NUR_KOMPAKT} space-y-3">
			<h1 class="text-display font-bold">Sichtungen</h1>
			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2">
					<!-- Zwei Zustände statt drei: offen (`btn-accent`) oder zu (`btn-outline`).
					     Der frühere `btn-primary`-Zustand „es ist gefiltert" und der
					     Punkt-Badge daneben sind entfallen — die Chip-Zeile darunter sagt
					     jetzt, WAS gefiltert ist, und sie steht in jeder Breite da. Das
					     Punkt-Badge auf Mobil zu behalten hieße, dieselbe Aussage zweimal
					     zu machen, und zwar in der schwächeren Fassung: Es benennt keinen
					     Filter und lässt sich nicht anklicken. Die Chip-Zeile bricht um
					     statt zu scrollen; sie braucht auf schmalen Geräten mehr Höhe,
					     kostet aber keine Bedienbarkeit. -->
					<button
						class="btn btn-sm flex-1 {isFilterPanelOpen ? 'btn-accent' : 'btn-outline'}"
						onclick={() => (isFilterPanelOpen = !isFilterPanelOpen)}
						title="Filter ein-/ausblenden"
						aria-expanded={isFilterPanelOpen}
						aria-controls={FILTER_PANEL_ID}
					>
						<Icon icon="lucide:filter" class="mr-1 h-4 w-4" />
						Filter
					</button>
					<button
						class="btn btn-sm btn-primary flex-1"
						onclick={() => (showExportModal = true)}
						title="Sichtungen exportieren"
						disabled={!data.pagination?.total}
					>
						<Icon icon="lucide:download" class="mr-1 h-4 w-4" />
						Export
					</button>
				</div>
				{#if data.pagination && data.pagination.total}
					<div class="flex flex-wrap items-center justify-center gap-2">
						<span class="badge badge-outline text-sm">{data.pagination.total} Ergebnisse</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Weiter Kopf -->
		<div class="{NUR_WEIT_FLEX} items-center justify-between">
			<h1 class="text-display font-bold">Sichtungen</h1>
			<div class="flex items-center gap-2">
				<details
					class="dropdown dropdown-end"
					bind:open={showColumnDropdown}
					onblur={(e) => {
						// Close when focus leaves the details element entirely
						const related = (e as FocusEvent).relatedTarget as Element | null;
						if (related && !(e.currentTarget as Element).contains(related)) {
							showColumnDropdown = false;
						}
					}}
				>
					<summary class="btn btn-sm btn-outline" title="Spalten ein-/ausblenden">
						<Icon icon="lucide:columns" class="mr-1 h-4 w-4" />
						Spalten
					</summary>
					<div
						class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-raised shadow-floating mt-1 w-64 border p-2"
					>
						<div class="menu-title flex items-center justify-between pb-2">
							<span class="text-sm font-semibold">Spalten anzeigen</span>
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => (showColumnDropdown = false)}
								aria-label="Spalten-Dropdown schließen"
								title="Schließen"
							>
								<Icon icon="lucide:x" class="h-3 w-3" />
							</button>
						</div>
						<div class="max-h-80 overflow-y-auto">
							{#each AVAILABLE_COLUMNS as column (column.key)}
								<label class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded p-1">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										bind:checked={columnVisibility[column.key]}
									/>
									<span class="flex-1 text-sm">{column.label}</span>
								</label>
							{/each}
						</div>
						<button
							class="btn btn-ghost btn-xs mt-2 w-full"
							disabled={istSpaltenauswahlDefault}
							onclick={() => (columnVisibility = { ...DEFAULT_COLUMN_VISIBILITY })}
						>
							Standard wiederherstellen
						</button>
					</div>
				</details>
				<!-- Zwei Zustände, Begründung am Mobil-Zwilling weiter oben. -->
				<button
					class="btn btn-sm {isFilterPanelOpen ? 'btn-accent' : 'btn-outline'}"
					onclick={() => (isFilterPanelOpen = !isFilterPanelOpen)}
					title="Filter ein-/ausblenden"
					aria-expanded={isFilterPanelOpen}
					aria-controls={FILTER_PANEL_ID}
				>
					<Icon icon="lucide:filter" class="mr-1 h-4 w-4" />
					Filter
				</button>
				<button
					class="btn btn-sm btn-primary"
					onclick={() => (showExportModal = true)}
					title="Sichtungen exportieren"
					disabled={!data.pagination?.total}
				>
					<Icon icon="lucide:download" class="mr-1 h-4 w-4" />
					Export
				</button>
				{#if data.pagination && data.pagination.total}
					<span class="badge badge-outline whitespace-nowrap"
						>{data.pagination.total} Ergebnisse</span
					>
				{/if}
			</div>
		</div>

		<!-- Filter Panel.

		     Direkt hinter dem Kopfbereich und vor der Suche: Beide Filter-Auslöser
		     sitzen im Kopf, ein per Tastatur geöffnetes Panel soll deshalb nicht
		     erst hinter Suche, Ansichten und Chip-Zeile liegen. Kein eigener
		     `container mx-auto px-4 md:px-6` mehr — das übernimmt jetzt der
		     umschließende Kopfbereich-Container, eine zweite Verschachtelung hätte
		     den Innenabstand verdoppelt. `mt-3` statt des früheren `mb-4`, damit der
		     Abstand zum Kopf darüber demselben Rhythmus folgt wie Suche, Ansichten
		     und Chip-Zeile weiter unten (jeweils `mt-3` zum Vorgänger).

		     Hier stand `transition-all duration-300`. Das ist als einzige der 19
		     Dauer-Fundstellen NICHT auf ein Motion-Token gewandert, sondern
		     ersatzlos entfallen: Das Panel hängt an einem `{#if}` und wird ein- und
		     ausgehängt statt ein- und ausgeblendet — es gibt keinen Zustand, von
		     dem aus ein Übergang laufen könnte, und die Klasse hat nie gewirkt.
		     Ein `duration-panel` an ihrer Stelle sähe token-konform aus und täte
		     weiterhin nichts. Wer hier wirklich animieren will, braucht
		     `transition:slide` aus `svelte/transition` (design-system.md, „Keine
		     toten Utility-Klassen"). -->
		{#if isFilterPanelOpen}
			<div id={FILTER_PANEL_ID} class="bg-base-200 shadow-raised mt-3 rounded-lg p-3">
				<div class="mb-2 flex items-center justify-between">
					<h2 class="text-base font-semibold">Filter</h2>
					<button
						class="btn btn-ghost btn-xs"
						onclick={() => (isFilterPanelOpen = false)}
						title="Filter ausblenden"
						aria-label="Filter ausblenden"
					>
						<Icon icon="lucide:x" class="h-4 w-4" />
					</button>
				</div>
				<!-- Kein `sm:grid-cols-2`: `sm` ist keine Layout-Grenze (Breakpoint-Vertrag).

				     Vier statt sechs Spalten auf `lg`, zwei statt drei auf `md`: Es sind
				     sieben Felder. Im Sechser-Raster stand „Ostsee" allein in der zweiten
				     Zeile und ließ fünf Zellen leer; bei drei Spalten blieb es dieselbe
				     Waise. Teilerfremd zu 7 ist jede Spaltenzahl — aber bei vier bzw. zwei
				     bleibt genau EINE Lücke statt fünf, und sie liegt am Zeilenende direkt
				     über den Knöpfen, wo sie als Abstand liest statt als Loch. Nebenbei
				     werden die Felder breiter, was den Datumsfeldern zugutekommt. -->
				<div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
					<div class="fieldset w-full">
						<label for="fromDate" class="label py-0">
							<span class="text-support">Sichtung von</span>
						</label>
						<input
							type="date"
							id="fromDate"
							name="fromDate"
							class="input input-sm w-full"
							bind:value={fromDate}
						/>
					</div>
					<div class="fieldset w-full">
						<label for="toDate" class="label py-0">
							<span class="text-support">Sichtung bis</span>
						</label>
						<input
							type="date"
							id="toDate"
							name="toDate"
							class="input input-sm w-full"
							bind:value={toDate}
						/>
					</div>
					<div class="fieldset w-full">
						<label for="verified" class="label py-0">
							<span class="text-support">Status</span>
						</label>
						<select
							id="verified"
							name="verified"
							class="select select-sm w-full"
							bind:value={verified}
						>
							<option value="">Alle</option>
							<option value="open">Offen</option>
							<option value="approved">Freigegeben</option>
							<option value="rejected">Abgelehnt</option>
						</select>
					</div>
					<div class="fieldset w-full">
						<label for="deadFinding" class="label py-0">
							<span class="text-support">Meldeart</span>
						</label>
						<select
							id="deadFinding"
							name="deadFinding"
							class="select select-sm w-full"
							bind:value={deadFinding}
						>
							<option value="">Alle</option>
							<option value="1">{DEAD_FINDING_PRESENTATION.label}</option>
							<option value="0">{MELDEART_LABEL['0']}</option>
						</select>
					</div>
					<div class="fieldset w-full">
						<label for="entryChannel" class="label py-0">
							<span class="text-support">Kanal</span>
						</label>
						<select
							id="entryChannel"
							name="entryChannel"
							class="select select-sm w-full"
							bind:value={selectedChannel}
						>
							<option value="all">Alle</option>
							{#each getEntryChannelOptions() as { value, label } (value)}
								<option value={String(value)}>{label}</option>
							{/each}
						</select>
					</div>
					<div class="fieldset w-full">
						<label for="mediaUpload" class="label py-0">
							<span class="text-support">Aufnahme</span>
						</label>
						<select
							id="mediaUpload"
							name="mediaUpload"
							class="select select-sm w-full"
							bind:value={mediaUpload}
						>
							<option value="">Alle</option>
							<option value="1">{AUFNAHME_LABEL['1']}</option>
							<option value="0">{AUFNAHME_LABEL['0']}</option>
							<option value={MEDIA_UPLOAD_ANNOUNCED_MISSING}
								>{AUFNAHME_LABEL[MEDIA_UPLOAD_ANNOUNCED_MISSING]}</option
							>
						</select>
					</div>
					<div class="fieldset w-full">
						<label for="balticSea" class="label py-0">
							<span class="text-support">Ostsee</span>
						</label>
						<select
							id="balticSea"
							name="balticSea"
							class="select select-sm w-full"
							bind:value={balticSea}
						>
							<option value="">Alle</option>
							{#each Object.entries(BALTIC_SEA_STATUS_PRESENTATION) as [value, presentation] (value)}
								<option {value}>{presentation.label}</option>
							{/each}
						</select>
					</div>
				</div>
				<!-- Kein `md:btn-xs` mehr: Die Höhe hat es ohnehin nie geändert (beide
				     Knöpfe messen die 44px aus dem Touch-Target-Block), es verkleinerte
				     nur Schrift und Innenabstand — und zwar auf dem GRÖSSEREN Schirm, wo
				     Platz kein Argument ist. „Anwenden" ist die Aktion, ohne die das
				     Panel nichts bewirkt; sie auf dem Desktop zu verkleinern lief der
				     Bedeutung entgegen. `btn-sm` bleibt und stimmt mit den übrigen
				     Aktionsknöpfen der Seite überein (Spalten, Filter, Export); die
				     Rangfolge im Panel trägt weiterhin `btn-primary` gegen
				     `btn-outline`, nicht die Größe. -->
				<div class="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
					<button class="btn btn-outline btn-sm" onclick={resetFilters}>Zurücksetzen</button>
					<button class="btn btn-primary btn-sm" onclick={applyFilters}>Anwenden</button>
				</div>
			</div>
		{/if}

		<!--
			Die Freitext-Suche steht bewusst außerhalb des Filter-Panels — sie ist
			der Weg für eine hereinkommende Rückfrage („meine Meldung von gestern",
			eine weitergeleitete Bestätigungsmail) und soll ohne Aufklappen
			erreichbar sein. Serverseitig läuft sie über `sightingSearchFilter.ts`.

			Eigene Zeile unter beiden Kopf-Layouts statt zweier Kopien: Das Feld ist
			in jeder Breite gleich breit nützlich, und ein zweites Exemplar im DOM
			hätte zwei Elemente mit demselben Label (`getByRole('searchbox')` wäre
			mehrdeutig, und Screenreader läsen die Suche doppelt).
			`type="search"` statt `text`: liefert die Rolle `searchbox` und auf
			Mobilgeräten die passende Tastatur mit „Suchen"-Taste.
		-->
		<form class="mt-3 flex items-center gap-2" onsubmit={submitSearch} role="search">
			<!-- `.input` bringt bereits `display:inline-flex`, `align-items:center`
			     und `gap:.5rem` mit (daisyui/components/input.css, 5.7.4 nachgelesen) —
			     `flex items-center gap-2` am Label doppelte das nur bzw. überschrieb
			     dabei `inline-flex` mit `flex`. `flex-1` bleibt: `.input` trägt
			     `width: clamp(3rem, 20rem, 100%)`, ohne `flex-1` bliebe das Feld bei
			     320px stehen statt die Zeile zu füllen. Das `grow` am inneren
			     `<input>` war ebenfalls wirkungslos — `.input & input` setzt
			     `width/height: 100%` bereits über die Elternklasse.

			     Kein `input-sm`: An diesem Element ist der Modifier tote Utility.
			     `src/app.css` trägt ungelayert `.input, .select, .textarea { font-size:
			     var(--text-body) }` (Formularfelder ≥ 16px, WCAG AA + iOS-Auto-Zoom,
			     `daisyui.md` „Vorhandene Overrides respektieren") — das schlägt
			     DaisyUIs gelayerte `--font-size-min` aus `input-sm` unbedingt, exakt
			     dieselbe Kaskaden-Mechanik wie beim Fokus- und Alert-Override dort.
			     Im Browser gemessen: `getComputedStyle(label).fontSize` ist mit UND
			     ohne `input-sm` `16px`. `--in-size-mul` (die zweite Wirkung des
			     Modifiers) ist hier ebenfalls tot, weil `--size` direkt überschrieben
			     wird (siehe unten) — `--in-size-mul` fließt nur in die
			     `--size`-Berechnung ein, die dieser Override ersetzt. `--spin-my`
			     bleibt drittens wirkungslos, weil `type="search"` keinen
			     Number-Spinner hat. `input-sm` täte an diesem Feld also nichts mehr
			     (design-system.md, „Keine toten Utility-Klassen").

			     `--size` überschreibt `.input`s Standardhöhe (2.5rem/40px bei
			     `--size-field: 0.25rem` × `--in-size-mul: 10`) direkt auf die
			     44px-Touch-Target-Höhe (`--target-min`), statt sie über `min-height`
			     zu erzwingen: `.input` setzt `height: var(--size)`, ein `min-height`
			     würde also nichts bewirken. Gleiches Muster wie
			     `.checkbox/.radio/.toggle { --size: … }` in app.css. Der Knopf daneben
			     bekommt seine 44px unbedingt über die projektweite `.btn`-Regel
			     (design-system.md, „Feldmodus und Touch-Targets") — das Feld muss also
			     wachsen, nicht der Knopf schrumpfen.

			     Schriftgröße dadurch nicht mehr symmetrisch zum Knopf: Das Feld zeigt
			     16px (`--text-body`, unveränderlich seit dem App.css-Override), der
			     `btn-sm` daneben 12px (`--fontsize` aus DaisyUIs `.btn-sm`, von diesem
			     Override nicht betroffen). Ob der Knopf auf `btn-md`/Standardgröße
			     wechselt, ist hier bewusst offengelassen — Entscheidung Jan,
			     2026-08-10. -->
			<label class="input flex-1" style="--size: var(--target-min)">
				<Icon icon="lucide:search" class="h-4 w-4 opacity-70" aria-hidden="true" />
				<span class="sr-only">Suche nach Referenz-ID, E-Mail, Name oder Fahrwasser</span>
				<input
					type="search"
					bind:value={searchTerm}
					placeholder="Referenz-ID, E-Mail, Name oder Fahrwasser"
				/>
			</label>
			<!-- Kein `btn-sm`: Das Feld daneben trägt seit dem Höhenabgleich 16px Schrift
			     (`app.css` setzt `.input/.select/.textarea` ungelayert auf `--text-body`
			     und schlägt damit jeden DaisyUI-Größenmodifier). `btn-sm` brächte 12px —
			     der Knopf sähe neben dem Feld kleiner aus, als er ist. Die Höhe ändert
			     sich dadurch nicht: beide standen schon auf den 44px aus dem
			     Touch-Target-Block. -->
			<button type="submit" class="btn btn-outline">Suchen</button>
		</form>

		<!--
			Gespeicherte Filteransichten (Spec B4). Über der Tabelle statt im
			Filter-Panel: Eine Ansicht anzuwenden ist ein Sprung, kein
			Filter-Detail — sie muss ohne Aufklappen erreichbar sein, wie die
			Freitext-Suche darüber.

			Echte `btn` statt klickbar gemachter `badge`: Nur `.btn` bekommt über
			app.css die 44px-Touch-Target-Mindestgröße (design-system.md
			„Feldmodus und Touch-Targets"); ein `badge` bliebe bei ~24px.
			Die aktive Ansicht trägt `btn-active` — dieselbe „aktueller
			Zustand"-Optik wie der aktive Statusreiter direkt darunter und die
			Seitenzahl in der Paginierung. `btn-primary` bleibt Export und
			„Anwenden" vorbehalten: Auf breiten Bildschirmen standen bislang bis
			zu vier Vollton-Flächen binnen 150px Höhe nebeneinander, weil
			`btn-primary` gleichzeitig „das ist die Aktion hier" und „das ist
			ausgewählt" bedeutete (Button-Hierarchie). `aria-current="true"`
			sagt „ausgewählt" weiterhin für Screenreader, die die Farbe nicht
			sehen.
		-->
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if filterPresets.length > 0 || zeigeAnsichtFormular}
				<!-- Ohne gespeicherte Presets und mit geschlossenem Formular stünde das
				     Label vor einem einzelnen „Ansicht speichern“-Knopf — ein Label ohne
				     etwas, das es benennt (UX-Review WP6). Der Knopf selbst bleibt in
				     jedem Fall sichtbar: Er ist der Einstieg ins Feature, nicht Teil der
				     Aufzählung, die er benennt. -->
				<span class="text-support text-base-content/70">Ansichten:</span>
			{/if}

			{#each filterPresets as preset (preset.id)}
				{#if umbenennenId === preset.id}
					<form class="flex items-center gap-1" onsubmit={umbenennenBestaetigen}>
						<label class="sr-only" for="ansicht-umbenennen">Ansicht umbenennen</label>
						<input
							id="ansicht-umbenennen"
							class="input input-sm w-40"
							bind:this={umbenennenFeld}
							bind:value={umbenennenName}
							maxlength="40"
							required
						/>
						<button type="submit" class="btn btn-sm btn-primary">Übernehmen</button>
						<button
							type="button"
							class="btn btn-sm btn-ghost"
							onclick={() => (umbenennenId = null)}
						>
							Abbrechen
						</button>
					</form>
				{:else}
					<div class="join">
						<button
							type="button"
							class="btn btn-sm join-item {aktiveAnsichtId === preset.id
								? 'btn-active'
								: 'btn-outline'}"
							aria-current={aktiveAnsichtId === preset.id ? 'true' : undefined}
							onclick={() => ansichtAnwenden(preset)}
						>
							{preset.name}
						</button>
						<!-- Verwalten im Dropdown, nicht als zwei weitere Chips: Umbenennen und
						     Löschen sind seltene Aktionen und würden die Leiste sonst mit jeder
						     gespeicherten Ansicht verdreifachen. -->
						<details class="dropdown dropdown-end join-item">
							<summary
								class="btn btn-sm btn-outline join-item"
								aria-label="Ansicht „{preset.name}“ verwalten"
								title="Umbenennen oder löschen"
							>
								<Icon icon="lucide:ellipsis-vertical" class="h-4 w-4" aria-hidden="true" />
							</summary>
							<ul
								class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-raised shadow-floating mt-1 w-44 border p-2"
							>
								<li>
									<button type="button" onclick={() => umbenennenStarten(preset)}>
										<Icon icon="lucide:square-pen" class="h-4 w-4" aria-hidden="true" />
										Umbenennen
									</button>
								</li>
								<!-- Auch hier die kanonische destruktive Variante statt eines
								     `text-error` am Menüeintrag. Zwei Gründe, und der zweite ist
								     der härtere:
								     1. Gleiche Aktion = gleiche Variante (Button-Hierarchie).
								     2. DaisyUI färbt einen Menüeintrag beim Hovern mit
								        `base-content` zu 10 % — eine Fläche dunkler als `base-300`,
								        und dort liegt `text-error` schon bei 4,13:1, also unter AA
								        (`design-system.md`, „Bekannte Grenze"). Die Menü-Regel
								        greift ausdrücklich nicht auf `.btn`, der Rahmen-Button
								        entzieht sich ihr also samt Hover-Fläche. -->
								<li>
									<button
										type="button"
										class="btn btn-outline btn-error btn-sm w-full justify-start"
										onclick={() => ansichtLoeschen(preset)}
									>
										<Icon icon="lucide:trash-2" class="h-4 w-4" aria-hidden="true" />
										Löschen
									</button>
								</li>
							</ul>
						</details>
					</div>
				{/if}
			{/each}

			{#if zeigeAnsichtFormular}
				<form class="flex items-center gap-1" onsubmit={ansichtSpeichern}>
					<label class="sr-only" for="ansicht-name">Name der Ansicht</label>
					<!-- `required` statt einer eigenen Prüfung: Die Browser-Constraint-
					     Validierung meldet den leeren Namen am Feld selbst, dort wo er
					     entsteht. Ohne sie täte der Speichern-Knopf sichtbar nichts. -->
					<input
						id="ansicht-name"
						class="input input-sm w-44"
						bind:this={neueAnsichtFeld}
						bind:value={neueAnsichtName}
						placeholder="z. B. Offene Totfunde"
						maxlength="40"
						required
					/>
					<button type="submit" class="btn btn-sm btn-primary">Speichern</button>
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						onclick={() => {
							zeigeAnsichtFormular = false;
							neueAnsichtName = '';
						}}
					>
						Abbrechen
					</button>
				</form>
			{:else}
				<button
					type="button"
					class="btn btn-sm btn-ghost"
					onclick={() => (zeigeAnsichtFormular = true)}
					title="Aktuelle Filter als benannte Ansicht speichern"
				>
					<Icon icon="lucide:bookmark-plus" class="mr-1 h-4 w-4" aria-hidden="true" />
					Ansicht speichern
				</button>
			{/if}
		</div>

		<!--
			Aktive Filter (WP3). Unter den Ansichten und über den Statusreitern: Was
			gefiltert ist, gehört neben die Menge, die es beschreibt — nicht in ein
			Panel, das man dafür aufklappen muss.

			Echte `btn` statt `badge`, gleiche Begründung wie bei den Ansichten-Chips
			darüber: Nur `.btn` bekommt über app.css die 44px-Touch-Target-
			Mindestgröße (design-system.md, „Feldmodus und Touch-Targets").

			`btn-outline` und keine Vollton-Fläche: Die einzige Vollton-Fläche dieses
			Bereichs ist die aktive Ansicht bzw. der aktive Statusreiter
			(Button-Hierarchie). Ein Chip ist eine Nebenaktion.

			Die Beschriftung steht im Knopf, das Entfernen sagt das `aria-label` —
			sonst läse ein Screenreader nur „Sichtung von 01.06.2026" und nichts
			darüber, was ein Klick bewirkt. Das `x`-Icon ist deshalb `aria-hidden`.

			Kein Status-Chip: `filterChips` wird mit `skipVerified` gebaut, der aktive
			Statusreiter direkt darunter zeigt ihn bereits.
		-->
		{#if filterChips.length > 0}
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<span class="text-support text-base-content/70">Aktive Filter:</span>

				{#each filterChips as chip (chip.param)}
					<button
						type="button"
						class="btn btn-sm btn-outline"
						aria-label="Filter {chip.label} entfernen"
						onclick={() => filterEntfernen(chip.param)}
					>
						{chip.label}
						<Icon icon="lucide:x" class="h-4 w-4" aria-hidden="true" />
					</button>
				{/each}

				<!-- Erst ab zwei Chips: Bei einem einzigen Filter ist der Chip selbst
				     schon der Weg zurück, und ein zweiter Knopf daneben verdoppelte
				     dieselbe Handlung. -->
				{#if filterChips.length >= 2}
					<button type="button" class="btn btn-sm btn-ghost" onclick={resetFilters}>
						Alle Filter zurücksetzen
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Statusleiste über beiden Layouts, nicht nur über der Tabelle: Auf Mobil
	     rendert `SichtungenCards`, und gerade dort soll der wichtigste Filter
	     ohne Aufklappen des Panels erreichbar sein. `active` kommt aus der URL
	     (`currentFilters`) — dieselbe Quelle wie das `<select>` im Panel. -->
	<!-- Über den Reitern und über beiden Layouts: Der Fehlschlag betrifft eine
	     Zeile, aber die Zeile kann durch das Neuladen nach einer anderen Aktion
	     ihre Position wechseln — an der Liste festgemacht wäre die Meldung
	     wandernd. Kein `announce`-Override: `failed` meldet sich von sich aus als
	     `alert`, und das ist hier die richtige Rolle — der Fehlschlag ist die
	     Folge einer Nutzeraktion (`StatusBlock`, Kopfkommentar).

	     Warum überhaupt eine stehende Fläche: Löschen, Prüfstatus-Wechsel und
	     Test-Mail meldeten ihren Fehlschlag bis 2026-08-14 in einer Einblendung,
	     die nach fünf Sekunden weg war und die Wiederholung nicht trug
	     (`docs/DESIGN_SYSTEM.md`, „Fehlende Zustände"). Wer daneben sah, hatte
	     einen Vorgang ausgelöst, der nicht stattgefunden hat, und keinen Hinweis
	     darauf. Der Erfolg bleibt dagegen ein Toast: Er bestätigt einen
	     abgeschlossenen Vorgang, und das Ergebnis steht ohnehin in der Liste.

	     Die Fläche verschwindet erst, wenn der wiederholte Aufruf durchgeht —
	     jeder Handler setzt `aktionsFehler` im Erfolgsfall selbst zurück. -->
	{#if aktionsFehler}
		<div class="container mx-auto mb-3 px-4 md:px-6">
			<StatusBlock
				variant="failed"
				title={aktionsFehler.title}
				description={aktionsFehler.description}
				action={{ label: 'Erneut versuchen', onClick: aktionsFehler.retry }}
			/>
		</div>
	{/if}

	<div class="container mx-auto mb-3 px-4 md:px-6">
		<StatusTabs
			counts={data.statusCounts}
			active={currentFilters.verified}
			onselect={selectStatus}
		/>
	</div>

	<SichtungenCards
		{sightings}
		isSuperAdmin={!!data.isSuperAdmin}
		{statusPending}
		{hasActiveFilters}
		onresetfilters={resetFilters}
		onview={viewSightingDetails}
		ontestemail={sendTestEmailMitFehlerflaeche}
		onspamcheck={checkSpam}
		ondelete={(sighting) => {
			sightingToDelete = sighting;
			showDeleteDialog = true;
		}}
		onstatuschange={changeStatus}
	/>

	<SichtungenTable
		{sightings}
		isSuperAdmin={!!data.isSuperAdmin}
		{columnVisibility}
		bind:selectedIds
		{headerState}
		{bulkPending}
		{bulkProgress}
		{statusPending}
		{hasActiveFilters}
		onresetfilters={resetFilters}
		onbulk={runBulk}
		onview={viewSightingDetails}
		ontestemail={sendTestEmailMitFehlerflaeche}
		onspamcheck={checkSpam}
		ondelete={(sighting) => {
			sightingToDelete = sighting;
			showDeleteDialog = true;
		}}
		onstatuschange={changeStatus}
	/>

	<div
		class="container mx-auto mt-6 flex flex-col items-center justify-between gap-4 px-4 md:flex-row md:px-6"
	>
		<div class="flex items-center gap-2 text-center md:text-left">
			<!-- Echtes `label[for]` statt eines `span` daneben: Ohne Verbindung las
			     ein Screenreader hier „Kombinationsfeld, 20" ohne jede Angabe,
			     worüber entschieden wird (WCAG 4.1.2). Es war die einzige Stelle im
			     Admin ohne zugänglichen Namen. -->
			<label class="text-sm font-medium" for="perPage">Einträge pro Seite:</label>
			<!-- Weder `text-sm` noch `min-h-8`: Beide waren wirkungslos und damit tote
			     Utility-Klassen (design-system.md). `app.css` setzt `.input/.select/.textarea`
			     ungelayert auf `--text-body` und schlägt jeden Schriftgrößen-Modifier — das
			     Feld misst mit und ohne `text-sm` 16px. Und `.select` bezieht seine Höhe aus
			     `--size`, das `select-sm` auf 2rem stellt; die `min-height` von `min-h-8` traf
			     denselben Wert und konnte nie greifen. `select-sm` bleibt: Es wirkt als
			     einziges der drei (ohne es misst das Feld 40 statt 32px). -->
			<select
				id="perPage"
				name="perPage"
				class="select select-sm"
				onchange={(e) => changeItemsPerPage(Number(e.currentTarget.value))}
			>
				{#each [10, 20, 50, 100].filter((size) => size <= (data.pagination?.maxPerPage || 50)) as size (size)}
					<option value={size} selected={data.pagination.perPage === size}>{size}</option>
				{/each}
			</select>
		</div>

		<!-- Sperren und Seitenzahl kommen aus `seiten` (= `paginationControls`) und
		     nicht aus Ausdrücken hier: `totalPages` ist bei null Treffern 0, und
		     `page === totalPages` war dann `1 === 0` — „Nächste"/„Letzte" blieben
		     auf einer leeren Trefferliste bedienbar und führten auf Seite 2 bzw. 0.
		     Der Leerfall ist genau der, den man beim Bauen nicht vor sich hat;
		     abgesichert in `paginationControls.test.ts`.

		     `aria-label` an jeder Schaltfläche zusätzlich zum `title`: Die
		     Beschriftung ist nur ein Zeichen, und nach den Accessible-Name-Regeln
		     gewinnt der Inhalt eines Buttons gegen sein `title` — der zugängliche
		     Name war damit „«". Das `title` bleibt für den Maus-Tooltip stehen und
		     weil `e2e/design-tokens.spec.ts` seine renders-Sonde darüber selektiert.
		     Abgesichert in `paginationAccessibleNames.test.ts`. -->
		<nav class="join" aria-label="Seiten-Navigation">
			<button
				class="btn join-item btn-sm"
				onclick={() => changePage(1)}
				disabled={seiten.atFirst}
				title="Erste Seite"
				aria-label="Erste Seite"
			>
				«
			</button>
			<button
				class="btn join-item btn-sm"
				onclick={() => changePage(data.pagination.page - 1)}
				disabled={seiten.atFirst}
				title="Vorherige Seite"
				aria-label="Vorherige Seite"
			>
				‹
			</button>

			<!-- Die Seitenanzeige war ein `<button>` ohne `onclick` — ein Bedienelement,
			     das nichts bewirkt, gehört entfernt (Button-Hierarchie). Als `<span>`
			     mit `.btn`-Optik bleibt das Aussehen der Leiste erhalten, ohne
			     Bedienbarkeit zu behaupten; `aria-current="page"` sagt Screenreadern,
			     wofür die Zahl steht. -->
			<span
				class="btn btn-active join-item btn-sm text-support md:text-label pointer-events-none min-w-32"
				aria-current="page"
			>
				{data.pagination.page} / {seiten.totalPages}
			</span>

			<button
				class="btn join-item btn-sm"
				onclick={() => changePage(data.pagination.page + 1)}
				disabled={seiten.atLast}
				title="Nächste Seite"
				aria-label="Nächste Seite"
			>
				›
			</button>
			<button
				class="btn join-item btn-sm"
				onclick={() => changePage(seiten.totalPages)}
				disabled={seiten.atLast}
				title="Letzte Seite"
				aria-label="Letzte Seite"
			>
				»
			</button>
		</nav>

		<div class="text-base-content/70 text-center text-sm md:text-right">
			{data.pagination.total} Einträge
		</div>
	</div>

	<DeleteDialog
		bind:show={showDeleteDialog}
		onConfirm={() => {
			if (sightingToDelete) {
				removeSighting(sightingToDelete.id);
			}
		}}
		onCancel={() => {
			showDeleteDialog = false;
			sightingToDelete = null;
		}}
	/>

	<ExportModal
		bind:show={showExportModal}
		{currentFilters}
		totalRecords={data.pagination?.total || 0}
	/>
</div>

<!-- Native dialog element with showModal()/close() for proper focus management and ESC handling -->
<dialog
	bind:this={spamCheckDialogElement}
	class="modal"
	aria-labelledby="spam-check-modal-title"
	onclose={() => (spamCheckModal.open = false)}
>
	<div class="modal-box max-w-lg">
		<h3 id="spam-check-modal-title" class="text-lg font-bold">Spam-Analyse</h3>

		{#if spamCheckModal.loading}
			<div class="flex justify-center py-8">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else if spamCheckModal.error}
			<div class="alert alert-error mt-4" role="alert">
				<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
				<span>{spamCheckModal.error}</span>
			</div>
		{:else if spamCheckModal.result}
			{@const response = spamCheckModal.result}
			{@const stored = response.stored}
			{@const drift = SPAM_DRIFT_PRESENTATION[getSpamDrift(response)]}
			<!-- Wort, Farbe, Icon und Schwelle kommen aus `spamScorePresentation.ts` —
			     dieselbe Quelle wie Tabellenspalte, Eingangskarte und Detailansicht.
			     Vorher stand hier ein eigener Schwellensatz, der Score 1 grün zeigte,
			     während die Spalte dahinter grau war. -->

			<!-- Zwei Befunde, und der Erstbefund steht zuerst: Er ist die Zahl aus
			     Tabelle und Eingang und die für die Triage maßgebliche. Stand hier
			     nur die Neuberechnung, widersprach das Modal der Spalte, aus der es
			     geöffnet wurde (`SpamCheckResponse`). -->
			<div class="mt-4">
				<SpamFinding
					title="Beim Eingang"
					risk={stored ? getSpamRisk(stored.score) : 'unrated'}
					score={stored?.score ?? null}
					indicators={stored?.indicators ?? []}
				/>
			</div>

			<div class="divider my-3"></div>

			<SpamFinding
				title="Jetzt nachgerechnet"
				risk={getSpamRiskFromResult(response.recomputed)}
				score={response.recomputed.score}
				indicators={response.recomputed.indicators}
			/>

			{#if drift.note}
				<div class="alert alert-info mt-4" role="note">
					<Icon icon="lucide:info" class="shrink-0" aria-hidden="true" />
					<span class="text-sm">{drift.note}</span>
				</div>
			{/if}
		{/if}

		<div class="modal-action">
			<button class="btn" onclick={() => (spamCheckModal.open = false)}>Schließen</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Modal schließen" onclick={() => (spamCheckModal.open = false)}>
			<span class="sr-only">Modal schließen</span>
		</button>
	</form>
</dialog>
