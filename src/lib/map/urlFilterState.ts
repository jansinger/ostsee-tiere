/**
 * Pure Funktionen für den URL-Query-Param-Sync der Sichtungskarten-Filter
 * (Befund M4/N6 aus docs/archive/UX_REVIEW_SICHTUNGSKARTE_2026-07-28.md).
 *
 * Query-Params: `year`, `q`, `from`, `to`, `hs` (ausgeblendete Arten-IDs,
 * kommasepariert), `hc` (ausgeblendete Farbgruppen, kommasepariert), `st`
 * (Bearbeitungszustände, kommasepariert).
 *
 * Alle Zeitstempel sind lokale Zeit — Zeitslider und Map-Controller arbeiten
 * in der Browser-Zeitzone (`new Date(year, 0, 1)` usw.), daher darf hier
 * nichts über UTC laufen.
 */

import type { ReadonlyURLSearchParams } from '$app/state';
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';

export interface MapFilterUrlState {
	year?: number;
	query?: string;
	from?: string; // ISO-Datum YYYY-MM-DD (lokale Zeit)
	to?: string; // ISO-Datum YYYY-MM-DD (lokale Zeit)
	hiddenSpecies?: string[]; // numerische Arten-IDs
	hiddenColors?: string[]; // Farbgruppen-Keys wie 'ct0', 'ct1'
	statuses?: SightingStatus[]; // Bearbeitungszustände, nur für Admins wirksam
}

/** Plausibilitätsbereich für das Jahr — außerhalb ist es ein Tippfehler/Angriff. */
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SPECIES_ID_PATTERN = /^\d+$/;
const COLOR_GROUP_PATTERN = /^ct\d+$/;
// Exportiert, damit ein Test gegen SIGHTING_STATUS_ORDER (die Quelle der drei
// Bearbeitungszustände) prüfen kann, dass dieses Muster keinen davon
// stillschweigend verwirft — siehe urlFilterState.test.ts.
export const STATUS_PATTERN = /^(open|approved|rejected)$/;

const MS_PER_DAY = 86_400_000;

/**
 * Parst ein ISO-Datum (YYYY-MM-DD) als lokales Datum. `null` bei falschem
 * Format oder unmöglichem Kalenderdatum (Date-Rollover wie 2025-02-30 → 2. März
 * wird über den Rückvergleich der Datumsteile erkannt).
 */
function parseIsoDate(iso: string): Date | null {
	const match = ISO_DATE_PATTERN.exec(iso);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);

	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return date;
}

/**
 * Splittet einen kommaseparierten Listen-Param, validiert und dedupliziert.
 * Einträge werden vorher getrimmt — handbearbeitete URLs enthalten gern
 * Leerzeichen nach den Kommas (`hs=1, 2`).
 */
function parseListParam(raw: string | null, pattern: RegExp): string[] {
	if (!raw) return [];
	return [
		...new Set(
			raw
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => pattern.test(entry))
		)
	];
}

/**
 * Liest den Filterzustand aus URL-Query-Params.
 * Ungültige Werte werden feldweise ignoriert — das Feld fehlt dann im Ergebnis.
 */
export function parseMapFilterParams(params: ReadonlyURLSearchParams): MapFilterUrlState {
	const state: MapFilterUrlState = {};

	const yearRaw = params.get('year');
	if (yearRaw && /^\d{4}$/.test(yearRaw)) {
		const year = Number(yearRaw);
		if (year >= YEAR_MIN && year <= YEAR_MAX) state.year = year;
	}

	const query = params.get('q')?.trim();
	if (query) state.query = query;

	const from = params.get('from');
	if (from && parseIsoDate(from)) state.from = from;

	const to = params.get('to');
	if (to && parseIsoDate(to)) state.to = to;

	const hiddenSpecies = parseListParam(params.get('hs'), SPECIES_ID_PATTERN);
	if (hiddenSpecies.length > 0) state.hiddenSpecies = hiddenSpecies;

	const hiddenColors = parseListParam(params.get('hc'), COLOR_GROUP_PATTERN);
	if (hiddenColors.length > 0) state.hiddenColors = hiddenColors;

	// Die Reihenfolge der URL bleibt erhalten; der Server dedupliziert erneut.
	const statuses = parseListParam(params.get('st'), STATUS_PATTERN) as SightingStatus[];
	if (statuses.length > 0) state.statuses = statuses;

	return state;
}

/**
 * Serialisiert den Zustand als Query-String ohne führendes '?'.
 * Leerer Zustand → ''. Feld-Reihenfolge: year, q, from, to, hs, hc.
 */
export function serializeMapFilterParams(state: MapFilterUrlState): string {
	const params = new URLSearchParams();

	if (state.year !== undefined) params.set('year', String(state.year));
	if (state.query) params.set('q', state.query);
	if (state.from) params.set('from', state.from);
	if (state.to) params.set('to', state.to);
	if (state.hiddenSpecies && state.hiddenSpecies.length > 0) {
		params.set('hs', state.hiddenSpecies.join(','));
	}
	if (state.hiddenColors && state.hiddenColors.length > 0) {
		params.set('hc', state.hiddenColors.join(','));
	}
	if (state.statuses && state.statuses.length > 0) {
		params.set('st', state.statuses.join(','));
	}

	return params.toString();
}

/**
 * Baut den URL-Zustand aus dem rohen Controller-Zustand.
 * Default-Werte (Default-Jahr, leere Suche, voller Jahresbereich, nichts
 * ausgeblendet) werden weggelassen, damit die URL im Grundzustand leer bleibt.
 */
export function buildFilterUrlState(input: {
	year: number;
	defaultYear: number;
	searchTerm: string;
	timeFilter: { lower: number; upper: number };
	hiddenSpecies: Record<string, boolean>;
	hiddenColors: Record<string, boolean>;
	statuses: readonly SightingStatus[];
}): MapFilterUrlState {
	const state: MapFilterUrlState = {};

	if (input.year !== input.defaultYear) state.year = input.year;

	const query = input.searchTerm.trim();
	if (query) state.query = query;

	if (!isFullYearRange(input.timeFilter, input.year)) {
		state.from = isoDateFromTimestamp(input.timeFilter.lower);
		state.to = isoDateFromTimestamp(input.timeFilter.upper);
	}

	const hiddenSpecies = Object.keys(input.hiddenSpecies)
		.filter((key) => input.hiddenSpecies[key])
		.sort((a, b) => Number(a) - Number(b));
	if (hiddenSpecies.length > 0) state.hiddenSpecies = hiddenSpecies;

	const hiddenColors = Object.keys(input.hiddenColors)
		.filter((key) => input.hiddenColors[key])
		.sort();
	if (hiddenColors.length > 0) state.hiddenColors = hiddenColors;

	// Die öffentliche Auswahl ist der Default und gehört nicht in die URL —
	// sonst trägt jede geteilte Karten-URL eines Admins einen Parameter, der
	// für Empfänger ohne Rechte einen 403 auslöst.
	const isPublicStatusSelection = input.statuses.length === 1 && input.statuses[0] === 'approved';
	if (!isPublicStatusSelection) state.statuses = [...input.statuses];

	return state;
}

/**
 * Tag-Index (0-basiert) eines ISO-Datums innerhalb von `year`.
 * `null` bei ungültigem Format, unmöglichem Kalenderdatum oder anderem Jahr.
 * `Math.round` gleicht die fehlende Stunde über die Sommerzeit-Grenze aus.
 */
export function dayOfYearFromIsoDate(iso: string, year: number): number | null {
	const date = parseIsoDate(iso);
	if (!date || date.getFullYear() !== year) return null;

	const janFirst = new Date(year, 0, 1);
	return Math.round((date.getTime() - janFirst.getTime()) / MS_PER_DAY);
}

/** Lokales Datum eines Unix-ms-Timestamps als YYYY-MM-DD. */
export function isoDateFromTimestamp(ts: number): string {
	const date = new Date(ts);
	const pad = (value: number): string => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Prüft, ob der Zeitfilter das komplette Jahr abdeckt. `upper` wird mit
 * Sekunden-Genauigkeit verglichen: der Controller setzt 23:59:59.000, der
 * Slider-Endanschlag 23:59:59.999 — beide zählen als volles Jahr.
 */
export function isFullYearRange(
	timeFilter: { lower: number; upper: number },
	year: number
): boolean {
	const yearStart = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
	const yearEnd = new Date(year, 11, 31, 23, 59, 59, 0).getTime();
	return timeFilter.lower <= yearStart && timeFilter.upper >= yearEnd;
}
