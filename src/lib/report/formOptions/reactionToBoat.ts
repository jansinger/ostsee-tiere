/**
 * Enum für Reaktionen auf Boote
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum ReactionToBoatEnum {
	NONE = 0,
	APPROACH = 1,
	AVOIDANCE = 2,
	BOW_RIDING = 3,
	COURSE_CHANGE = 4,
	LONGER_DIVING = 5,
	FREQUENT_SURFACING = 6
}

/**
 * Baut je Locale die Bezeichnungen der Bootsreaktionen aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt oder ruft `getReactionToBoatLabel` aus der
 * Legacy-API oder einem Export-Pfad auf — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe, `germanBaseline.testutil.ts` ausgenommen). Keine
 * Locale-Pinnung an einem Verbraucher nötig.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const reactionToBoatLabelBuilders: Record<ReactionToBoatEnum, (locale: Locale) => string> = {
	[ReactionToBoatEnum.NONE]: (locale) => m.formoptions_reactiontoboat_none({}, { locale }),
	[ReactionToBoatEnum.APPROACH]: (locale) => m.formoptions_reactiontoboat_approach({}, { locale }),
	[ReactionToBoatEnum.AVOIDANCE]: (locale) =>
		m.formoptions_reactiontoboat_avoidance({}, { locale }),
	[ReactionToBoatEnum.BOW_RIDING]: (locale) =>
		m.formoptions_reactiontoboat_bow_riding({}, { locale }),
	[ReactionToBoatEnum.COURSE_CHANGE]: (locale) =>
		m.formoptions_reactiontoboat_course_change({}, { locale }),
	[ReactionToBoatEnum.LONGER_DIVING]: (locale) =>
		m.formoptions_reactiontoboat_longer_diving({}, { locale }),
	[ReactionToBoatEnum.FREQUENT_SURFACING]: (locale) =>
		m.formoptions_reactiontoboat_frequent_surfacing({}, { locale })
};

/** Baut die Reaktions-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const reactionToBoatLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(reactionToBoatLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<ReactionToBoatEnum, string>
);

export type ReactionToBoat = ReactionToBoatEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getReactionToBoatOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = reactionToBoatLabelsFor(locale);
	return Object.entries(labels).map(([value, label]) => ({ value: Number(value), label }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getReactionToBoatLabel(
	value: ReactionToBoatEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_reactiontoboat_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = reactionToBoatLabelsFor(locale);
	return (
		labels[numericValue as ReactionToBoatEnum] ||
		m.formoptions_reactiontoboat_invalid({}, { locale })
	);
}

/**
 * Prüft, ob ein Wert ein gültiger ReactionToBoatEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger ReactionToBoatEnum-Wert ist
 */
export function isValidReactionToBoat(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(ReactionToBoatEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(ReactionToBoatEnum).includes(value);
	}

	return false;
}
