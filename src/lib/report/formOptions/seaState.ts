/**
 * Enum für Seegangzustände
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum SeaStateEnum {
	NONE = 0,
	SMOOTH = 1,
	CALM = 2,
	SLIGHT = 3,
	ROUGH = 4,
	HIGH = 5
}

/**
 * Baut je Locale die Bezeichnungen der Seegangzustände aus dem
 * Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getSeaStateLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getSeaStateLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const seaStateLabelBuilders: Record<SeaStateEnum, (locale: Locale) => string> = {
	[SeaStateEnum.NONE]: (locale) => m.formoptions_seastate_none({}, { locale }),
	[SeaStateEnum.SMOOTH]: (locale) => m.formoptions_seastate_smooth({}, { locale }),
	[SeaStateEnum.CALM]: (locale) => m.formoptions_seastate_calm({}, { locale }),
	[SeaStateEnum.SLIGHT]: (locale) => m.formoptions_seastate_slight({}, { locale }),
	[SeaStateEnum.ROUGH]: (locale) => m.formoptions_seastate_rough({}, { locale }),
	[SeaStateEnum.HIGH]: (locale) => m.formoptions_seastate_high({}, { locale })
};

/** Baut die Seegang-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const seaStateLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(seaStateLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<SeaStateEnum, string>
);

export type SeaState = SeaStateEnum;

/**
 * Seegang-Stufen, die im Formular auswählbar sind.
 *
 * `NONE` ("Keine Angabe") ist bewusst ausgenommen: Das Feld ist optional, und
 * `BaseSelect` rendert ohnehin einen Platzhalter ("Bitte wählen…"), solange
 * nichts gewählt ist. Eine zweite Formulierung derselben Aussage stiftet nur
 * Verwirrung — und sie stand durch den Enum-Wert `0` auch noch an erster
 * Stelle, vor allen echten Kategorien.
 *
 * Der Wert selbst bleibt gültig: `seegang` ist `not null default 0`, im
 * Bestand steht diese `0` also millionenfach und wird von `getSeaStateLabel`
 * weiterhin aufgelöst.
 *
 * Abgeleitet statt aufgezählt: Die Stufen sind ordinal (glatt → hohe See), die
 * Enum-Reihenfolge ist damit die fachlich richtige.
 */
const SELECTABLE_SEA_STATES: readonly SeaStateEnum[] = Object.values(SeaStateEnum).filter(
	(value): value is SeaStateEnum => typeof value === 'number' && value !== SeaStateEnum.NONE
);

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getSeaStateOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = seaStateLabelsFor(locale);
	return SELECTABLE_SEA_STATES.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getSeaStateLabel(
	value: SeaStateEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_seastate_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = seaStateLabelsFor(locale);
	return labels[numericValue as SeaStateEnum] || m.formoptions_seastate_unknown({}, { locale });
}

/**
 * Prüft, ob ein Wert ein gültiger SeaState-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger SeaState-Wert ist
 */
export function isValidSeaState(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(SeaStateEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(SeaStateEnum).includes(value);
	}

	return false;
}
