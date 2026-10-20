/**
 * Enum für Entfernungen
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum DistanceEnum {
	LESS_THAN_10M = 1,
	FROM_10_TO_50M = 2,
	FROM_51_TO_100M = 3,
	FROM_101_TO_500M = 4,
	MORE_THAN_500M = 5
}

/**
 * Sentinel für eine fehlende Entfernungsangabe.
 *
 * `DistanceEnum` geht von 1 bis 5 — die `0` der Spalte `entfernung` ist damit
 * keine Kategorie, sondern liegt bewusst außerhalb und wird von
 * `getDistanceLabel` als "Unbekannt" aufgelöst. Anders als bei `tierart`,
 * `verteilung` oder `verhalten` behauptet diese Null also nichts Falsches und
 * braucht keinen eigenen Enum-Wert.
 *
 * Steht hier und nicht bei den Schreibpfaden, weil zwei Stellen sie brauchen:
 * `mapFormToSighting` schreibt sie, und `adminSightingSchema` muss sie beim
 * Bearbeiten von Bestandsdaten wieder annehmen (282 Zeilen).
 */
export const DISTANCE_UNSPECIFIED = 0;

/**
 * Baut je Locale die Bezeichnungen der Entfernungen aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getDistanceLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getDistanceLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const distanceLabelBuilders: Record<DistanceEnum, (locale: Locale) => string> = {
	[DistanceEnum.LESS_THAN_10M]: (locale) => m.formoptions_distance_less_than_10m({}, { locale }),
	[DistanceEnum.FROM_10_TO_50M]: (locale) => m.formoptions_distance_from_10_to_50m({}, { locale }),
	[DistanceEnum.FROM_51_TO_100M]: (locale) =>
		m.formoptions_distance_from_51_to_100m({}, { locale }),
	[DistanceEnum.FROM_101_TO_500M]: (locale) =>
		m.formoptions_distance_from_101_to_500m({}, { locale }),
	[DistanceEnum.MORE_THAN_500M]: (locale) => m.formoptions_distance_more_than_500m({}, { locale })
};

/** Baut die Entfernungs-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const distanceLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(distanceLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<DistanceEnum, string>
);

export type Distance = DistanceEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getDistanceOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = distanceLabelsFor(locale);
	return Object.entries(labels).map(([value, label]) => ({ value: Number(value), label }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getDistanceLabel(
	value: DistanceEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_distance_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = distanceLabelsFor(locale);
	return labels[numericValue as DistanceEnum] || m.formoptions_distance_unknown({}, { locale });
}
/**
 * Prüft, ob ein Wert ein gültiger Distance-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger Distance-Wert ist
 */
export function isValidDistance(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(DistanceEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(DistanceEnum).includes(value);
	}

	return false;
}
