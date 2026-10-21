/**
 * Die Sortierung der Sichtungstabelle: sortierbare Spalten, Vorgabe und
 * Auflösung aus der URL — für Loader und Spaltenkopf gemeinsam.
 *
 * **Warum als eigenes Modul.** Die Vorgabe (`sightingDate`/`desc`) stand nur im
 * Loader, der Spaltenkopf las `?sort`/`?order` roh aus der URL. Beim ersten
 * Aufruf steht dort nichts — die Liste war also sortiert, und die Tabelle
 * zeigte an keinem Kopf einen Pfeil. Dasselbe galt für jeden unbekannten Wert:
 * `?sort=quatsch` sortiert im Loader nach Sichtungsdatum, im Kopf leuchtete
 * nichts.
 *
 * **Warum die Liste hier und nicht in `columns.ts`.** Sortierbarkeit und
 * Sichtbarkeit sind nicht dasselbe: `referenceId`, `mediaUpload` und
 * `balticSea` sind Spalten ohne Sortierung, `wind` sortiert über ein Feld
 * (`windForce`), das anders heißt. Die Liste ist die **eine** Quelle für beide
 * Seiten — `+page.server.ts` typisiert seine `sortingMap` als
 * `Record<SortColumn, …>`, ein neuer Eintrag hier erzwingt dort also ein
 * Mapping, statt still auf das Sichtungsdatum zurückzufallen.
 */

import type { ReadonlyURLSearchParams } from '$app/state';

export const SORTABLE_COLUMNS = [
	'sightingDate',
	'created',
	'email',
	'species',
	'distance',
	'totalCount',
	'juvenileCount',
	'distribution',
	'behavior',
	'seaState',
	'wind',
	'visibility',
	'spamScore'
] as const;

export type SortColumn = (typeof SORTABLE_COLUMNS)[number];
export type SortOrder = 'asc' | 'desc';

/** Was der Loader ohne `?sort` tut — hier notiert, damit der Kopf es zeigen kann. */
export const DEFAULT_SORT: SortColumn = 'sightingDate';
export const DEFAULT_ORDER: SortOrder = 'desc';

export interface SortState {
	column: SortColumn;
	order: SortOrder;
}

function isSortColumn(value: string | null): value is SortColumn {
	return SORTABLE_COLUMNS.includes(value as SortColumn);
}

/**
 * Die tatsächlich wirksame Sortierung — nie `null`, weil auch die leere URL sortiert.
 *
 * Der Parameter heißt `searchParams` und nicht kürzer: `tableReturnUrl.test.ts`
 * liest die Query-Parameter der Tabelle per Regex aus dem Quelltext und gleicht
 * sie gegen die Liste ab, die der Rückweg aus der Detailansicht durchreicht.
 * Das Muster verlangt den vollen Ausdruck; ein `params.get('sort')` fiele
 * heraus, und der Abgleich prüfte die Sortierung still nicht mehr mit. Aus
 * demselben Grund steht der Ausdruck hier nicht als Beispiel im Kommentar — er
 * landete sonst als eigener „Parameter" im Ergebnis.
 */
export function resolveSort(searchParams: ReadonlyURLSearchParams): SortState {
	const column = searchParams.get('sort');
	const order = searchParams.get('order');

	return {
		column: isSortColumn(column) ? column : DEFAULT_SORT,
		order: order === 'asc' || order === 'desc' ? order : DEFAULT_ORDER
	};
}

/** Klick auf einen Spaltenkopf: aktive Spalte dreht um, jede andere startet aufsteigend. */
export function naechsteRichtung(aktiv: SortState, geklickt: SortColumn): SortOrder {
	if (aktiv.column !== geklickt) return 'asc';
	return aktiv.order === 'asc' ? 'desc' : 'asc';
}
