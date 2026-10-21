/**
 * Enum für Windrichtungen
 * Die String-Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum WindDirectionEnum {
	NONE = '',
	N = 'N',
	NO = 'NO',
	O = 'O',
	SO = 'SO',
	S = 'S',
	SW = 'SW',
	W = 'W',
	NW = 'NW'
}

/**
 * Baut je Locale die Bezeichnungen der Windrichtungen aus dem
 * Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getWindDirectionLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort).
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const windDirectionLabelBuilders: Record<WindDirectionEnum, (locale: Locale) => string> = {
	[WindDirectionEnum.NONE]: (locale) => m.formoptions_winddirection_none({}, { locale }),
	[WindDirectionEnum.N]: (locale) => m.formoptions_winddirection_n({}, { locale }),
	[WindDirectionEnum.NO]: (locale) => m.formoptions_winddirection_no({}, { locale }),
	[WindDirectionEnum.O]: (locale) => m.formoptions_winddirection_o({}, { locale }),
	[WindDirectionEnum.SO]: (locale) => m.formoptions_winddirection_so({}, { locale }),
	[WindDirectionEnum.S]: (locale) => m.formoptions_winddirection_s({}, { locale }),
	[WindDirectionEnum.SW]: (locale) => m.formoptions_winddirection_sw({}, { locale }),
	[WindDirectionEnum.W]: (locale) => m.formoptions_winddirection_w({}, { locale }),
	[WindDirectionEnum.NW]: (locale) => m.formoptions_winddirection_nw({}, { locale })
};

/** Baut die Windrichtungs-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const windDirectionLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(windDirectionLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<WindDirectionEnum, string>
);

export type WindDirection = WindDirectionEnum;

/**
 * Himmelsrichtungen, die im Formular auswählbar sind.
 *
 * `NONE` (Leerstring, "Keine Angabe") ist bewusst ausgenommen — dieselbe
 * Begründung wie beim Seegang (`seaState.ts`). Hier kommt ein zweiter Grund
 * dazu: `BaseSelect` gibt seinem Platzhalter ebenfalls `value=""`, die
 * Option war also ein exaktes Duplikat des Platzhalters.
 *
 * Der Leerstring bleibt im Yup-Schema (`oneOf`) gültig und wird von
 * `getWindDirectionLabel` weiterhin aufgelöst.
 *
 * Abgeleitet statt aufgezählt: Die Enum-Reihenfolge ist die Kompass-Folge
 * (N → NW) und damit die fachlich richtige.
 */
const SELECTABLE_WIND_DIRECTIONS: readonly WindDirectionEnum[] = Object.values(
	WindDirectionEnum
).filter((value) => value !== WindDirectionEnum.NONE);

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getWindDirectionOptions(
	locale: Locale = getLocale()
): Array<{ value: string; label: string }> {
	const labels = windDirectionLabelsFor(locale);
	return SELECTABLE_WIND_DIRECTIONS.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getWindDirectionLabel(
	value: WindDirectionEnum | string | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_winddirection_not_specified({}, { locale });

	const labels = windDirectionLabelsFor(locale);
	return labels[value as WindDirectionEnum] || m.formoptions_winddirection_unknown({}, { locale });
}
