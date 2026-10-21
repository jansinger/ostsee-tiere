/**
 * Enum für Geschlecht der beobachteten Tiere
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum SexEnum {
	UNKNOWN = 0,
	FEMALE = 1,
	MALE = 2
}

/**
 * Baut je Locale die Bezeichnungen der Geschlechter aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getSexLabel(…, baseLocale)`
 * umgestellt (siehe Kommentar dort).
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const sexLabelBuilders: Record<SexEnum, (locale: Locale) => string> = {
	[SexEnum.UNKNOWN]: (locale) => m.formoptions_sex_unknown({}, { locale }),
	[SexEnum.FEMALE]: (locale) => m.formoptions_sex_female({}, { locale }),
	[SexEnum.MALE]: (locale) => m.formoptions_sex_male({}, { locale })
};

/** Baut die Geschlechter-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const sexLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(sexLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<SexEnum, string>
);

export type Sex = SexEnum;

/**
 * Geschlechter, die im Formular auswählbar sind.
 *
 * `UNKNOWN` ("Unbekannt") ist bewusst ausgenommen: `deadSex` ist optional
 * (das Museum hat das Feld am 2026-08-04 aus dem Meldeformular abbestellt, es
 * steht nur noch in der Admin-Maske), und der Platzhalter von `BaseSelect`
 * sagt "nicht angegeben" bereits. Der Enum-Wert `0` hätte "Unbekannt"
 * außerdem vor die beiden echten Antworten sortiert.
 *
 * `totfund_geschlecht` ist `not null default 0`; der Wert bleibt für
 * Bestandsdaten gültig und wird von `getSexLabel` weiterhin aufgelöst.
 */
const SELECTABLE_SEXES: readonly SexEnum[] = [SexEnum.FEMALE, SexEnum.MALE];

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getSexOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = sexLabelsFor(locale);
	return SELECTABLE_SEXES.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getSexLabel(
	value: SexEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined) return m.formoptions_sex_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = sexLabelsFor(locale);
	return labels[numericValue as SexEnum] || m.formoptions_sex_invalid({}, { locale });
}

/**
 *
 * @param value - Der Enum-Wert oder String, der überprüft werden soll
 * @description Überprüft, ob der gegebene Wert ein gültiges Geschlecht ist.
 * Gibt true zurück, wenn der Wert gültig ist, andernfalls false.
 * @example isValidSex(1) // true
 * @returns
 */
export function isValidSex(value: string | number): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(SexEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(SexEnum).includes(value);
	}

	return false;
}
