/**
 * Enum für Sichtbarkeitszustände
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum VisibilityEnum {
	NONE = 0,
	EXCEPTIONAL = 1,
	CLEAR = 2,
	HAZY = 3,
	FOGGY = 4
}

/**
 * Baut je Locale die Bezeichnungen der Sichtbarkeitszustände aus dem
 * Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getVisibilityLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getVisibilityLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const visibilityLabelBuilders: Record<VisibilityEnum, (locale: Locale) => string> = {
	[VisibilityEnum.NONE]: (locale) => m.formoptions_visibility_none({}, { locale }),
	[VisibilityEnum.EXCEPTIONAL]: (locale) => m.formoptions_visibility_exceptional({}, { locale }),
	[VisibilityEnum.CLEAR]: (locale) => m.formoptions_visibility_clear({}, { locale }),
	[VisibilityEnum.HAZY]: (locale) => m.formoptions_visibility_hazy({}, { locale }),
	[VisibilityEnum.FOGGY]: (locale) => m.formoptions_visibility_foggy({}, { locale })
};

/** Baut die Sichtweiten-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const visibilityLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(visibilityLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<VisibilityEnum, string>
);

export type Visibility = VisibilityEnum;

/**
 * Sichtweiten-Kategorien, die im Formular auswählbar sind.
 *
 * `NONE` ("Keine Angabe") ist bewusst ausgenommen — dieselbe Begründung wie
 * beim Seegang (`seaState.ts`): optionales Feld, der Platzhalter von
 * `BaseSelect` sagt es bereits, und der Enum-Wert `0` hätte die Nicht-Antwort
 * an die erste Stelle sortiert. `sichtweite` ist `not null default 0`, der
 * Wert bleibt für Bestandsdaten gültig und anzeigbar.
 *
 * Abgeleitet statt aufgezählt: Die Kategorien sind ordinal (klar → Nebel).
 */
const SELECTABLE_VISIBILITIES: readonly VisibilityEnum[] = Object.values(VisibilityEnum).filter(
	(value): value is VisibilityEnum => typeof value === 'number' && value !== VisibilityEnum.NONE
);

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getVisibilityOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = visibilityLabelsFor(locale);
	return SELECTABLE_VISIBILITIES.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getVisibilityLabel(
	value: VisibilityEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_visibility_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = visibilityLabelsFor(locale);
	return labels[numericValue as VisibilityEnum] || m.formoptions_visibility_unknown({}, { locale });
}

/**
 * Prüft, ob ein Wert ein gültiger VisibilityEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger VisibilityEnum-Wert ist
 */
export function isValidVisibility(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(VisibilityEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(VisibilityEnum).includes(value);
	}

	return false;
}
