/**
 * Enum für den Zustand des Tieres (bei Totfunden)
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum AnimalConditionEnum {
	UNKNOWN = 0,
	EXTREMELY_FRESH = 1,
	FRESH_BEGINNING_DECOMPOSITION = 2,
	MEDIUM_DECOMPOSITION = 3,
	ADVANCED_DECOMPOSITION = 4,
	SEVERE_DECOMPOSITION = 5
}

/**
 * Baut je Locale die Bezeichnungen der Tierzustände aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Der einzige externe Zugriff auf das rohe Record
 * lag in `antworten.json/+server.ts` und ist auf `getAnimalConditionLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort).
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const animalConditionLabelBuilders: Record<AnimalConditionEnum, (locale: Locale) => string> = {
	[AnimalConditionEnum.UNKNOWN]: (locale) => m.formoptions_animalcondition_unknown({}, { locale }),
	[AnimalConditionEnum.EXTREMELY_FRESH]: (locale) =>
		m.formoptions_animalcondition_extremely_fresh({}, { locale }),
	[AnimalConditionEnum.FRESH_BEGINNING_DECOMPOSITION]: (locale) =>
		m.formoptions_animalcondition_fresh_beginning_decomposition({}, { locale }),
	[AnimalConditionEnum.MEDIUM_DECOMPOSITION]: (locale) =>
		m.formoptions_animalcondition_medium_decomposition({}, { locale }),
	[AnimalConditionEnum.ADVANCED_DECOMPOSITION]: (locale) =>
		m.formoptions_animalcondition_advanced_decomposition({}, { locale }),
	[AnimalConditionEnum.SEVERE_DECOMPOSITION]: (locale) =>
		m.formoptions_animalcondition_severe_decomposition({}, { locale })
};

/** Baut die Zustands-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const animalConditionLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(animalConditionLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<AnimalConditionEnum, string>
);

export type AnimalCondition = AnimalConditionEnum;

/**
 * Zustände, die im Formular auswählbar sind — "Unbekannt" am Ende.
 *
 * Anders als bei `seaState`, `visibility` und `sex` bleibt die Nicht-Antwort
 * hier **wählbar**: `deadCondition` ist im Totfund-Zweig ein Pflichtfeld
 * (`when('isDead')` im Schema). Ohne "Unbekannt" gäbe es keinen Ausweg für
 * jemanden, der den Verwesungsgrad am Strand nicht einschätzen kann — der
 * Platzhalter von `BaseSelect` taugt dafür nicht, weil er die Pflicht nicht
 * erfüllt. Sie steht nur nicht mehr an erster Stelle, wohin ihr Enum-Wert `0`
 * sie sortiert hatte.
 *
 * Abgeleitet statt aufgezählt: Die übrigen Stufen sind ordinal
 * (extrem frisch → starke Verwesung).
 */
const SELECTABLE_ANIMAL_CONDITIONS: readonly AnimalConditionEnum[] = [
	...Object.values(AnimalConditionEnum).filter(
		(value): value is AnimalConditionEnum =>
			typeof value === 'number' && value !== AnimalConditionEnum.UNKNOWN
	),
	AnimalConditionEnum.UNKNOWN
];

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getAnimalConditionOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = animalConditionLabelsFor(locale);
	return SELECTABLE_ANIMAL_CONDITIONS.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getAnimalConditionLabel(
	value: AnimalConditionEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_animalcondition_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = animalConditionLabelsFor(locale);
	return (
		labels[numericValue as AnimalConditionEnum] ||
		m.formoptions_animalcondition_invalid({}, { locale })
	);
}

/**
 * Prüft, ob ein Wert ein gültiger AnimalConditionEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger AnimalConditionEnum-Wert ist
 */
export function isValidAnimalCondition(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(AnimalConditionEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(AnimalConditionEnum).includes(value);
	}

	return false;
}
