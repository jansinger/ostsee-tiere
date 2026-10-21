/**
 * Enum für Tierverhalten
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

/**
 * **Achtung bei `OTHER = 0`:** Die Spalte `verhalten` ist
 * `integer default(0) notNull` — `0` ist gleichzeitig Default und die Bedeutung
 * "Sonstiges Verhalten". Das Feld ist im Schema nicht `.required()`, eine
 * fehlende Antwort wurde also als aktive Aussage gespeichert (9.192 von 19.880
 * Zeilen, Stand 2026-07-29). Fehlt eine Angabe, gehört sie auf `UNKNOWN`.
 */
export enum AnimalBehaviorEnum {
	OTHER = 0,
	CONSTANT_COURSE = 1,
	VARYING_COURSE = 2,
	SLOW_SWIMMING = 3,
	/**
	 * Es wurde kein Verhalten angegeben.
	 *
	 * Wird ausschließlich serverseitig beim Speichern gesetzt
	 * (`mapFormToSighting`) und ist bewusst nicht auswählbar.
	 */
	UNKNOWN = 4
}

/**
 * Baut je Locale die Bezeichnungen des Tierverhaltens aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Der einzige externe Zugriff auf das rohe Record
 * lag in `antworten.json/+server.ts` und ist auf `getAnimalBehaviorLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getAnimalBehaviorLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const animalBehaviorLabelBuilders: Record<AnimalBehaviorEnum, (locale: Locale) => string> = {
	[AnimalBehaviorEnum.OTHER]: (locale) => m.formoptions_animalbehavior_other({}, { locale }),
	[AnimalBehaviorEnum.CONSTANT_COURSE]: (locale) =>
		m.formoptions_animalbehavior_constant_course({}, { locale }),
	[AnimalBehaviorEnum.VARYING_COURSE]: (locale) =>
		m.formoptions_animalbehavior_varying_course({}, { locale }),
	[AnimalBehaviorEnum.SLOW_SWIMMING]: (locale) =>
		m.formoptions_animalbehavior_slow_swimming({}, { locale }),
	[AnimalBehaviorEnum.UNKNOWN]: (locale) => m.formoptions_animalbehavior_unknown({}, { locale })
};

/** Baut die Verhaltens-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const animalBehaviorLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(animalBehaviorLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<AnimalBehaviorEnum, string>
);

/**
 * Verhaltensweisen, die im Formular auswählbar sind.
 * `UNKNOWN` ist bewusst ausgenommen (siehe Enum-Kommentar).
 *
 * Abgeleitet statt aufgezählt: Ein später ergänzter echter Wert erscheint
 * dadurch automatisch im Formular, statt still zu fehlen.
 *
 * `OTHER` wandert dabei ans Ende der Liste — es ist die Auffangkategorie und
 * stand durch den Enum-Wert `0` bisher an erster Stelle, also vor allen
 * konkreten Antworten (Wunsch des Deutschen Meeresmuseums). Der gespeicherte
 * Wert bleibt `0`; nur die Reihenfolge der Optionen ändert sich.
 */
const SELECTABLE_BEHAVIORS: readonly AnimalBehaviorEnum[] = [
	...Object.values(AnimalBehaviorEnum).filter(
		(value): value is AnimalBehaviorEnum =>
			typeof value === 'number' &&
			value !== AnimalBehaviorEnum.UNKNOWN &&
			value !== AnimalBehaviorEnum.OTHER
	),
	AnimalBehaviorEnum.OTHER
];

export type AnimalBehavior = AnimalBehaviorEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getAnimalBehaviorOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = animalBehaviorLabelsFor(locale);
	return SELECTABLE_BEHAVIORS.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getAnimalBehaviorLabel(
	value: AnimalBehaviorEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_animalbehavior_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = animalBehaviorLabelsFor(locale);
	return (
		labels[numericValue as AnimalBehaviorEnum] ||
		m.formoptions_animalbehavior_invalid({}, { locale })
	);
}

/**
 * Prüft, ob ein Wert ein gültiger AnimalBehaviorEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger AnimalBehaviorEnum-Wert ist
 */
export function isValidAnimalBehavior(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(AnimalBehaviorEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(AnimalBehaviorEnum).includes(value);
	}

	return false;
}
