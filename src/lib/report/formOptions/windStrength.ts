/**
 * Enum für Windstärken (Beaufort-Skala)
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '$lib/i18n/localeMemo';
import * as m from '$lib/paraglide/messages';
import { getLocale, type Locale } from '$lib/paraglide/runtime';

export enum WindStrengthEnum {
	WINDSTILL = 0,
	LEISER_ZUG = 1,
	LEICHTE_BRISE = 2,
	SCHWACHE_BRISE = 3,
	MAESSIGE_BRISE = 4,
	FRISCHE_BRISE = 5,
	STARKER_WIND = 6,
	STEIFER_WIND = 7,
	STUERMISCHER_WIND = 8,
	STURM = 9,
	SCHWERER_STURM = 10,
	ORKANARTIGER_STURM = 11,
	ORKAN = 12
}

/**
 * Baut je Locale die Bezeichnungen der Windstärken aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getWindStrengthLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort).
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const windStrengthLabelBuilders: Record<WindStrengthEnum, (locale: Locale) => string> = {
	[WindStrengthEnum.WINDSTILL]: (locale) => m.formoptions_windstrength_windstill({}, { locale }),
	[WindStrengthEnum.LEISER_ZUG]: (locale) => m.formoptions_windstrength_leiser_zug({}, { locale }),
	[WindStrengthEnum.LEICHTE_BRISE]: (locale) =>
		m.formoptions_windstrength_leichte_brise({}, { locale }),
	[WindStrengthEnum.SCHWACHE_BRISE]: (locale) =>
		m.formoptions_windstrength_schwache_brise({}, { locale }),
	[WindStrengthEnum.MAESSIGE_BRISE]: (locale) =>
		m.formoptions_windstrength_maessige_brise({}, { locale }),
	[WindStrengthEnum.FRISCHE_BRISE]: (locale) =>
		m.formoptions_windstrength_frische_brise({}, { locale }),
	[WindStrengthEnum.STARKER_WIND]: (locale) =>
		m.formoptions_windstrength_starker_wind({}, { locale }),
	[WindStrengthEnum.STEIFER_WIND]: (locale) =>
		m.formoptions_windstrength_steifer_wind({}, { locale }),
	[WindStrengthEnum.STUERMISCHER_WIND]: (locale) =>
		m.formoptions_windstrength_stuermischer_wind({}, { locale }),
	[WindStrengthEnum.STURM]: (locale) => m.formoptions_windstrength_sturm({}, { locale }),
	[WindStrengthEnum.SCHWERER_STURM]: (locale) =>
		m.formoptions_windstrength_schwerer_sturm({}, { locale }),
	[WindStrengthEnum.ORKANARTIGER_STURM]: (locale) =>
		m.formoptions_windstrength_orkanartiger_sturm({}, { locale }),
	[WindStrengthEnum.ORKAN]: (locale) => m.formoptions_windstrength_orkan({}, { locale })
};

/** Baut die Windstärken-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const windStrengthLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(windStrengthLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<WindStrengthEnum, string>
);

export type WindStrength = WindStrengthEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getWindStrengthOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = windStrengthLabelsFor(locale);
	return Object.entries(labels).map(([value, label]) => ({ value: Number(value), label }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getWindStrengthLabel(
	// `string`: die Spalte `windstaerke` ist `varchar` — der Body parst ihn bereits.
	value: WindStrengthEnum | number | string | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_windstrength_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = windStrengthLabelsFor(locale);
	return (
		labels[numericValue as WindStrengthEnum] || m.formoptions_windstrength_unknown({}, { locale })
	);
}
