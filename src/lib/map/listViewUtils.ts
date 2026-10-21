import * as m from '#lib/paraglide/messages.js';
/**
 * @fileoverview Utilities für die barrierefreie Listenansicht der Sichtungskarte
 *
 * Befund K3 (UX-Review Sichtungskarte 2026-07-28): Die Listenansicht ist die
 * Screenreader- und Tastatur-Alternative zur Kartendarstellung. Sie zeigt
 * exakt dieselbe Datenmenge wie die Karte — gleiches Jahr, gleiche Filter.
 *
 * Die Sichtbarkeitslogik ist deshalb bewusst identisch zu der der Karte
 * (createFeatureStyle in styleUtils.ts bzw. MapCountManager.updateCounts):
 * eine Sichtung ist versteckt, wenn ihre Tierart, ihre Farbgruppe oder ihr
 * Zeitstempel herausgefiltert ist.
 */

import { getLocale } from '#lib/paraglide/runtime.js';
import { resolveDisplayLocale } from '#lib/utils/format/dateTime.ts';
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';
import { getFeatureColorGroup, isBetween } from './styleUtils';

/**
 * Feature-Properties einer Sichtung, wie sie /api/map/sightings als
 * GeoJSON liefert (siehe sightingsToGeoJSON in mapUtils.ts).
 */
export interface SightingListProperties {
	id: number;
	ts: number; // Unix-Zeitstempel in Sekunden
	ta: number; // Tierart (Species-ID)
	ct: number; // Anzahl Tiere
	jt?: number; // Anzahl Jungtiere
	tf?: boolean; // Totfund
	waterway?: string; // Fahrwasser
	st?: SightingStatus; // Bearbeitungszustand
}

/**
 * Aktueller Filterzustand der Karte (Quelle: SichtungenMap.getHidden()
 * und SichtungenMap.getTimeFilter()).
 */
export interface ListFilterState {
	hiddenSpecies: Record<string, boolean>;
	hiddenColors: Record<string, boolean>;
	timeFilter: { lower: number; upper: number }; // Millisekunden
}

/**
 * Aufbereiteter Eintrag für die Tabellen-Darstellung.
 */
export interface SightingListEntry {
	id: number;
	ts: number; // Unix-Zeitstempel in Sekunden
	speciesName: string;
	count: number;
	juveniles: number;
	isDead: boolean;
	waterway: string | null;
	status: SightingStatus;
}

/**
 * Prüft, ob eine Sichtung mit den aktuellen Kartenfiltern sichtbar ist.
 * Grenzwerte des Zeitfilters sind inklusiv (wie isBetween in styleUtils).
 */
export function isSightingVisible(
	props: SightingListProperties,
	filters: ListFilterState
): boolean {
	if (filters.hiddenSpecies[props.ta.toString()]) {
		return false;
	}

	const colorGroup = getFeatureColorGroup({
		ta: props.ta,
		ct: props.ct,
		tf: props.tf ?? false,
		ts: props.ts
	});
	if (filters.hiddenColors[colorGroup]) {
		return false;
	}

	return isBetween(props.ts * 1000, filters.timeFilter.lower, filters.timeFilter.upper);
}

/**
 * Filtert die sichtbaren Sichtungen heraus, mappt sie auf Listeneinträge
 * und sortiert absteigend nach Zeitstempel (neueste zuerst).
 */
export function toListEntries(
	propsList: SightingListProperties[],
	filters: ListFilterState,
	speciesMap: Record<string, string>
): SightingListEntry[] {
	return propsList
		.filter((props) => isSightingVisible(props, filters))
		.map((props): SightingListEntry => ({
			id: props.id,
			ts: props.ts,
			speciesName:
				speciesMap[props.ta.toString()] ??
				m.map_listviewutils_text_unbekannte_art_id({ id: props.ta }),
			count: props.ct,
			juveniles: props.jt ?? 0,
			isDead: props.tf ?? false,
			// || statt ??: die API liefert bei fehlendem Fahrwasser teils '' —
			// die Tabelle soll dann den Gedankenstrich zeigen, keine leere Zelle
			waterway: props.waterway || null,
			// Öffentlich liefert die API immer 'approved'; der Fallback hält alte
			// zwischengespeicherte Features konsistent.
			status: props.st ?? 'approved'
		}))
		.sort((a, b) => b.ts - a.ts);
}

/**
 * Formatiert Unix-Sekunden als lokalisiertes Datum.
 * timeZone explizit setzen, sonst bestimmt die Browser-Zone das Datum (M5).
 * Locale über resolveDisplayLocale, damit /en britisch statt deutsch formatiert.
 */
export function formatEntryDate(ts: number): string {
	return new Date(ts * 1000).toLocaleDateString(resolveDisplayLocale(getLocale()), {
		timeZone: 'Europe/Berlin'
	});
}
