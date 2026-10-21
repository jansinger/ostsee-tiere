/**
 * @fileoverview Vokabular der Statusreiter über der Sichtungstabelle.
 *
 * Zwei Seiten lesen hier: `+page.server.ts` liefert die Zahlen in der Form von
 * `StatusCounts`, `StatusTabs.svelte` baut daraus die Leiste. Der Typ steht
 * deshalb in einem eigenen, **client-sicheren** Modul und nicht im Loader —
 * ein Import aus `+page.server.ts` zöge server-only Code in den Client-Bundle.
 *
 * Wort und Icon je Zustand kommen aus `SIGHTING_STATUS_PRESENTATION`; hier
 * steht nur, welche Reiter es gibt und welcher Zähler zu welchem gehört. Der
 * Reiter „Alle" trägt den leeren Filterwert — genau den, den die URL zeigt,
 * wenn kein `?verified=` gesetzt ist.
 */
import {
	SIGHTING_STATUS_ORDER,
	SIGHTING_STATUS_PRESENTATION,
	type SightingStatus
} from '#lib/components/admin/sightingStatus.ts';

/** Trefferzahlen der aktuell gefilterten Menge, ohne den Statusfilter selbst. */
export type StatusCounts = {
	all: number;
	open: number;
	approved: number;
	rejected: number;
};

/** Der Wert des Filters `?verified=` — leer heißt „Alle". */
export type StatusTabValue = '' | SightingStatus;

export type StatusTab = {
	value: StatusTabValue;
	label: string;
	/** Schlüssel in `StatusCounts` — für „Alle" die Gesamtzahl. */
	countKey: keyof StatusCounts;
	/** Icon-Name für `#lib/components/Icon.svelte`; „Alle" trägt keines. */
	icon?: string;
};

export const STATUS_TABS: readonly StatusTab[] = [
	{ value: '', label: 'Alle', countKey: 'all' },
	...SIGHTING_STATUS_ORDER.map((status) => ({
		value: status,
		label: SIGHTING_STATUS_PRESENTATION[status].label,
		countKey: status,
		icon: SIGHTING_STATUS_PRESENTATION[status].icon
	}))
];
