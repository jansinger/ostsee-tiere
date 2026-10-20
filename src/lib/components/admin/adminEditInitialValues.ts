import { hasCoordinates } from '#lib/report/components/form/coordinateValue.ts';
import type { FrontendSighting } from '#lib/types/FrontendSighting.ts';
import { splitDateTime } from '#lib/utils/format/dateTime.ts';

/**
 * Baut die Startwerte des Admin-Bearbeitungsformulars aus einer gespeicherten
 * Sichtung.
 *
 * **Der Rückgabewert ist der vollständige Datensatz, nicht nur das Sichtbare.**
 * Das Formular zeigt weder Kontaktdaten noch Adresse an — beide überstehen eine
 * Bearbeitung nur, weil sie hier unverändert in den Formularzustand wandern und
 * von dort unverändert wieder an `PUT /api/sightings/[id]` gehen. Wer diese
 * Funktion umbaut, entscheidet damit über den Bestand der Melderdaten:
 * `mapFormToSighting` schreibt jedes Feld zurück, das im Body steht.
 *
 * Umgeformt werden nur die drei Felder, deren Form im Formular eine andere ist
 * als in der Datenbank:
 *
 * - `sightingDate`/`sightingTime` — ein UTC-Zeitstempel wird zu Datum und
 *   Uhrzeit in deutscher Wanduhrzeit; `berlinWallClockToUtc` rechnet das beim
 *   Speichern zurück.
 * - `hasPosition` — steuert, ob das Formular die Koordinatenfelder oder die
 *   Gewässerbeschreibung zeigt.
 *
 * **Die Koordinaten werden bewusst nicht gerundet.** Bis 2026-08-02 stand hier
 * `Number(sighting.latitude)?.toFixed(4)`. Die Spalten sind `numeric(8,6)` —
 * jede Speicherung kürzte den Bestand damit von sechs auf vier
 * Nachkommastellen (19.421 von 19.880 Zeilen, bis zu ~6 m Versatz), und zwar
 * auch dann, wenn der Admin die Position gar nicht angefasst hat. Eine
 * Anzeige-Rundung gehört ins Eingabefeld, nicht in den gespeicherten Wert.
 *
 * `Number(null)` ist `0`, eine Sichtung **ohne** Position startete deshalb mit
 * `'0.0000'`. In die Datenbank kam diese Null nie: `handleSubmit` reicht das von
 * Yup gecastete Objekt weiter, dort ist der String längst die Zahl `0`, und die
 * fällt in `mapFormToSighting` in den Null-Zweig. Der Startwert bleibt trotzdem
 * falsch — er behauptet eine Position, wo keine ist, und die nächste Änderung an
 * einer der beiden Stellen macht daraus einen Punkt bei 0°/0°.
 */
export function buildAdminEditInitialValues(sighting: FrontendSighting): Record<string, unknown> {
	const { date, time } = splitDateTime(sighting.sightingDate);

	return {
		...sighting,
		sightingDate: date,
		sightingTime: time,
		hasPosition: hasCoordinates(sighting.latitude, sighting.longitude)
	};
}
