/**
 * @fileoverview Renn- und Fehler-Guard für `loadAvailableYears`
 * (`SightingsMapView.svelte`, `GET /api/map/sightings/years`).
 *
 * Eigene Datei statt Logik direkt in der Komponente, aus demselben Grund wie
 * bei `statusRequestParams.ts`: Der Controller ist ohne DOM/OpenLayers nicht
 * instanziierbar, die Entscheidung „darf diese Antwort noch übernommen
 * werden?" soll aber ohne Karte prüfbar sein (Review-Befund T7.2).
 *
 * `loadSightings` im Map-Controller ist bereits per `AbortController`
 * gegen Überholen abgesichert — die Karte zeigt also immer die neueste
 * Auswahl. `loadAvailableYears` lief bislang ohne diesen Schutz und mit
 * zwei konkreten Fehlern (Review-Befund 1):
 *
 * - **Rapid Toggling:** Zwei `/years`-Anfragen sind gleichzeitig unterwegs;
 *   antwortet die ältere zuletzt, überschreibt sie das Jahres-Dropdown mit
 *   den Zahlen der *vorherigen* Auswahl, während die Karte bereits die
 *   aktuelle zeigt — genau die Divergenz, gegen die `publicMapConditions.ts`
 *   die geteilte Grundmenge hat.
 * - **Fehlerpfad:** Ein einzelner Fehlschlag (abgelaufene Session → 403,
 *   transienter 500er, Netzwerkfehler) leerte die Jahresliste, obwohl die
 *   Karte ihre Marker behält — der Admin kann dann bis zum Reload das Jahr
 *   nicht mehr wechseln.
 *
 * Beide Fehler haben dieselbe Lösung: Nur die zuletzt gestartete Anfrage darf
 * `availableYearsData` noch schreiben, und nur mit einem Erfolg — ein
 * Fehlschlag lässt die vorherige Liste unangetastet stehen. Für den
 * allerersten Aufruf (Kartenstart) ist „die vorherige Liste" bereits die
 * leere Ausgangsliste; der bestehende stille Fallback auf
 * `getDefaultSightingYear()` bleibt damit unverändert (siehe Docblock von
 * `loadAvailableYears`) — hier ist bewusst keine Sonderbehandlung für den
 * ersten Aufruf nötig.
 */
import type { YearWithCount } from '#lib/utils/date/defaultYear.ts';

/** Vergibt aufsteigende Anfrage-IDs; nur die zuletzt vergebene ist „aktuell". */
export interface YearsRequestSequencer {
	/** Startet eine neue Anfrage und liefert ihre ID. */
	begin(): number;
	/** true, wenn `id` noch die zuletzt vergebene (= aktuelle) Anfrage ist. */
	isCurrent(id: number): boolean;
}

export function createYearsRequestSequencer(): YearsRequestSequencer {
	let latest = 0;
	return {
		begin() {
			latest += 1;
			return latest;
		},
		isCurrent(id: number) {
			return id === latest;
		}
	};
}

/** Ergebnis eines `/years`-Fetches, unabhängig davon, wie es zustande kam. */
export type YearsFetchResult = { ok: true; years: YearWithCount[] } | { ok: false };

/**
 * Entscheidet, ob ein Fetch-Ergebnis `availableYearsData` ersetzen darf.
 *
 * `null` heißt „nichts tun, vorherige Liste behalten" — sowohl für eine
 * inzwischen überholte Anfrage als auch für einen Fehlschlag der aktuellen.
 * Nur eine erfolgreiche **und** noch aktuelle Antwort liefert die neue Liste.
 */
export function resolveYearsUpdate(
	isCurrent: boolean,
	result: YearsFetchResult
): YearWithCount[] | null {
	if (!isCurrent || !result.ok) return null;
	return result.years;
}
