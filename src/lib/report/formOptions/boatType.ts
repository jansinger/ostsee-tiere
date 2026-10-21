/**
 * Enum für Bootstypen
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum BoatTypeEnum {
	OTHER = 0,
	SAILBOAT = 1,
	MOTORBOAT = 2,
	FERRY = 3,
	FISHING_VESSEL = 4,
	CARGO_SHIP = 5,
	CRUISE_SHIP = 6,
	RESEARCH_VESSEL = 7,
	INFLATABLE_BOAT = 8,
	SAILING_CATAMARAN = 9,
	MOTOR_YACHT = 10
}

/**
 * Baut je Locale die Bezeichnungen der Bootstypen aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt oder ruft `getBoatTypeLabel` aus der
 * Legacy-API oder einem Export-Pfad auf — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe, `germanBaseline.testutil.ts` ausgenommen). Keine
 * Locale-Pinnung an einem Verbraucher nötig.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const boatTypeLabelBuilders: Record<BoatTypeEnum, (locale: Locale) => string> = {
	[BoatTypeEnum.OTHER]: (locale) => m.formoptions_boattype_other({}, { locale }),
	[BoatTypeEnum.SAILBOAT]: (locale) => m.formoptions_boattype_sailboat({}, { locale }),
	[BoatTypeEnum.MOTORBOAT]: (locale) => m.formoptions_boattype_motorboat({}, { locale }),
	[BoatTypeEnum.FERRY]: (locale) => m.formoptions_boattype_ferry({}, { locale }),
	[BoatTypeEnum.FISHING_VESSEL]: (locale) => m.formoptions_boattype_fishing_vessel({}, { locale }),
	[BoatTypeEnum.CARGO_SHIP]: (locale) => m.formoptions_boattype_cargo_ship({}, { locale }),
	[BoatTypeEnum.CRUISE_SHIP]: (locale) => m.formoptions_boattype_cruise_ship({}, { locale }),
	[BoatTypeEnum.RESEARCH_VESSEL]: (locale) =>
		m.formoptions_boattype_research_vessel({}, { locale }),
	[BoatTypeEnum.INFLATABLE_BOAT]: (locale) =>
		m.formoptions_boattype_inflatable_boat({}, { locale }),
	[BoatTypeEnum.SAILING_CATAMARAN]: (locale) =>
		m.formoptions_boattype_sailing_catamaran({}, { locale }),
	[BoatTypeEnum.MOTOR_YACHT]: (locale) => m.formoptions_boattype_motor_yacht({}, { locale })
};

/** Baut die Bootstyp-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const boatTypeLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(boatTypeLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<BoatTypeEnum, string>
);

export type BoatType = BoatTypeEnum;

/**
 * Bootstypen, die im Formular auswählbar sind — "Sonstiger Bootstyp" am Ende.
 *
 * `OTHER` ist die Auffangkategorie und gehört hinter die konkreten Antworten;
 * sein Enum-Wert `0` hatte es davor sortiert. Der gespeicherte Wert bleibt
 * `0`, nur die Reihenfolge der Optionen ändert sich.
 */
const SELECTABLE_BOAT_TYPES: readonly BoatTypeEnum[] = [
	...Object.values(BoatTypeEnum).filter(
		(value): value is BoatTypeEnum => typeof value === 'number' && value !== BoatTypeEnum.OTHER
	),
	BoatTypeEnum.OTHER
];

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getBoatTypeOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = boatTypeLabelsFor(locale);
	return SELECTABLE_BOAT_TYPES.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getBoatTypeLabel(
	value: BoatTypeEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_boattype_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = boatTypeLabelsFor(locale);
	return labels[numericValue as BoatTypeEnum] || m.formoptions_boattype_invalid({}, { locale });
}

/**
 * Prüft, ob ein Wert ein gültiger BoatTypeEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger BoatTypeEnum-Wert ist
 */
export function isValidBoatType(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(BoatTypeEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(BoatTypeEnum).includes(value);
	}

	return false;
}
