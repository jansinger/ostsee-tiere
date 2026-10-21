/**
 * @fileoverview Jahresauswahl der Admin-Statistik (`?jahr=`)
 *
 * Der Wert kommt aus der URL und ist damit Fremdeingabe. Geprüft wird er gegen
 * den plausiblen Bereich — von `EARLIEST_PLAUSIBLE_SIGHTING_DATE` bis zum
 * laufenden Jahr — und **nicht** gegen die Liste der tatsächlich belegten Jahre. Diese
 * Liste entsteht erst im Loader durch eine eigene Abfrage; sie hier zusätzlich
 * als Gültigkeitsquelle heranzuziehen hieße, dieselbe Regel an zwei Orten zu
 * pflegen. Ein belegloses, aber plausibles Jahr liefert eine leere, korrekt
 * beschriftete Auswertung — das ist die ehrlichere Antwort als ein Fehler.
 *
 * Alles Unplausible fällt auf „Alle Jahre" zurück statt auf einen 400er: Die
 * Seite hat immer eine sinnvolle Anzeige, und ein manipulierter Parameter kann
 * damit auch keine Grundmenge verschieben.
 */

import { EARLIEST_PLAUSIBLE_SIGHTING_DATE } from '#lib/server/db/sightingRepository.ts';
import { berlinCalendarDayIso } from '#lib/utils/format/dateTime.ts';

/** Name des URL-Parameters. Deutsch wie die übrigen Admin-Filter. */
export const YEAR_PARAM = 'jahr';

/**
 * Formularwert für „Alle Jahre".
 *
 * Ein eigener Wert statt des leeren Strings: Ein `<option value="">` in einem
 * GET-Formular landet als `?jahr=` in der URL und ist von „Parameter fehlt"
 * nicht mehr zu unterscheiden — beides bedeutet hier zwar dasselbe, aber der
 * sprechende Wert macht die Absicht in der Adresszeile lesbar.
 */
export const ALL_YEARS_VALUE = 'alle';

/** Grenzen einer plausiblen Jahresangabe (beide einschließlich). */
export interface YearRange {
	readonly min: number;
	readonly max: number;
}

/**
 * Plausibler Jahresbereich zum Zeitpunkt `jetzt`.
 *
 * Die Untergrenze ist `EARLIEST_PLAUSIBLE_SIGHTING_DATE` — die Konstante, mit der
 * die Statistiken die Epoch-Platzhalter aus dem Altbestand ausschließen
 * (`sightingRepository.ts`). Sie ist **nicht** die älteste echte Sichtung: Die
 * stammt von 2002, die Grenze liegt bewusst davor (1990), damit sie eine
 * Plausibilitätsschwelle bleibt und nicht bei jedem Fund einer älteren Meldung
 * nachgezogen werden muss. Für die Auswahl heißt das: Die Jahre 1990–2001 sind
 * formal zulässig, stehen aber mangels Daten gar nicht in der Liste.
 *
 * Die Obergrenze wird in **deutscher Ortszeit** bestimmt, weil die ganze Seite
 * kalendarisch in Ortszeit gruppiert (`berlinDatePart`). Am 31.12. um 23:30 UTC
 * ist in Berlin bereits das Folgejahr angebrochen; wäre die Grenze UTC, ließe
 * sich das laufende Jahr in diesen zwei Stunden nicht auswählen.
 */
export function plausibleYearRange(jetzt: Date): YearRange {
	return {
		min: EARLIEST_PLAUSIBLE_SIGHTING_DATE.getUTCFullYear(),
		max: Number(berlinCalendarDayIso(jetzt).slice(0, 4))
	};
}

/** Nur Ziffern — `Number()` würde sonst ' 12 ', '1e3' und '0x7e4' schlucken. */
const NUR_ZIFFERN = /^\d{4}$/;

/**
 * Liest die Jahresauswahl aus dem rohen URL-Parameter.
 *
 * @returns Das gewählte Jahr, oder `null` für „Alle Jahre" (auch bei jeder
 *   Form von Unsinn).
 */
export function parseYearParam(raw: string | null, bereich: YearRange): number | null {
	if (raw === null || raw === ALL_YEARS_VALUE) return null;
	if (!NUR_ZIFFERN.test(raw)) return null;

	const jahr = Number(raw);
	if (jahr < bereich.min || jahr > bereich.max) return null;

	return jahr;
}
