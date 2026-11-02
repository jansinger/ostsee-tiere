/**
 * Ziel des Links „Große Karte in neuem Fenster öffnen", den die Karte im iframe
 * auf meeresmuseum.de zeigt. Übernimmt Pfad (samt Locale) und Filter, damit die
 * große Karte dort weitermacht, wo die eingebettete stand.
 *
 * Der Hash fällt weg: Er ist ein Sprungziel innerhalb der eingebetteten Seite
 * (`#map-skip-target`) und setzte im neuen Fenster den Fokus hinter die Karte.
 */
export function standaloneMapHref(location: {
	origin: string;
	pathname: string;
	search: string;
	hash?: string;
}): string {
	return `${location.origin}${location.pathname}${location.search}`;
}
