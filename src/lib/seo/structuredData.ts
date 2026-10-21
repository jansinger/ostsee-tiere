/**
 * JSON-LD (schema.org) für den Seitenkopf.
 *
 * Der Nutzen liegt nicht in der Rangfolge einer Trefferliste, sondern darin,
 * dass Suchmaschinen **und** KI-Crawler die Anwendung dem Deutschen
 * Meeresmuseum zuordnen können. Ohne diese Angabe steht `ostsee-tiere.de` als
 * namenlose Domain da, deren Verhältnis zum Museum nur aus dem Fließtext
 * hervorgeht.
 *
 * **Bewusst kein `Dataset`-Knoten**, obwohl er für ein Bürgerwissenschafts-
 * Projekt der wertvollste wäre (Google Dataset Search). Ihm fehlen zwei Dinge,
 * die dieses Repository nicht liefern kann:
 *
 * 1. **Eine Lizenz.** Die MIT-Lizenz deckt den Quellcode, nicht den
 *    Datenbestand. Unter welchen Bedingungen die Sichtungsdaten
 *    weiterverwendet werden dürfen, ist eine Entscheidung des Museums — eine
 *    Lizenzangabe hier wäre eine Rechtsaussage im Vorbeigehen, und
 *    `isAccessibleForFree` ohne Lizenz ist die halbe Wahrheit.
 * 2. **Eine belastbare Bezugsquelle.** `/api/map/sightings` liefert zwar
 *    öffentlich GeoJSON aller freigegebenen Sichtungen, ist aber als
 *    Kartenabfrage gebaut und nicht als Massendownload: keine Zwischenspeicher,
 *    eine Datenbankabfrage je Aufruf. Als `distribution.contentUrl`
 *    ausgeschrieben lädt es genau die Crawler ein, für die es nicht ausgelegt
 *    ist — und es steht zudem hinter `Disallow: /api/`.
 *
 * Beides ist lösbar (Lizenzentscheidung, dazu ein zwischengespeicherter
 * Export-Endpunkt), aber nicht von hier aus. Bis dahin ist die ehrliche
 * Aussage die kleinere.
 */
import type { Locale } from '#lib/paraglide/runtime.js';

/** Ein JSON-LD-Knoten. Werte sind bewusst weit typisiert — schema.org ist es auch. */
export interface JsonLdKnoten {
	'@type': string;
	'@id'?: string;
	[schluessel: string]: unknown;
}

export interface JsonLdGraph {
	'@context': string;
	'@graph': JsonLdKnoten[];
}

/**
 * Serialisiert JSON-LD für die Einbettung in ein Skript-Element.
 *
 * Spitze Klammern werden zu `\u003c` und `\u003e`: Ein Wert, der ein
 * schließendes Skript-Tag enthält, beendet sonst das Element, und alles danach
 * wird zu Markup — die klassische Lücke bei JSON in HTML. Die Werte hier sind
 * konstant, aber die Absicherung gehört an die Stelle, die serialisiert, nicht
 * an die, die gerade zufällig harmlose Daten hat.
 *
 * `U+2028`/`U+2029` sind in JSON gültige Zeichen, in einem Skript-Element aber
 * Zeilenumbrüche; sie werden ebenfalls maskiert. Alle vier Ersetzungen erhalten
 * den Wert — beim Parsen steht das ursprüngliche Zeichen wieder da.
 */
export function serializeJsonLd(wert: unknown): string {
	return JSON.stringify(wert)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

const MUSEUM_URL = 'https://www.deutsches-meeresmuseum.de';

/**
 * Organization (das Museum) und WebSite (diese Anwendung), verknüpft über
 * `@id`.
 *
 * Der Verweis statt eines eingebetteten zweiten Objekts ist nicht Kosmetik:
 * Zwei ausgeschriebene Organization-Knoten sind für eine Suchmaschine zwei
 * Organisationen.
 *
 * @param origin Schema + Host ohne Pfad — dieselbe Quelle wie bei hreflang und
 *   Sitemap; schema.org verlangt absolute URLs.
 */
export function buildSiteStructuredData(origin: string, locale: Locale): JsonLdGraph {
	const organisationId = `${origin}/#organization`;

	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Organization',
				'@id': organisationId,
				name: 'Deutsches Meeresmuseum',
				url: MUSEUM_URL,
				logo: `${origin}/logo_dmm_positiv.svg`
			},
			{
				'@type': 'WebSite',
				'@id': `${origin}/#website`,
				name: 'Ostsee-Tiere',
				url: origin,
				inLanguage: locale,
				publisher: { '@id': organisationId }
			}
		]
	};
}
