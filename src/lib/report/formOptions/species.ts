/**
 * Enum für Tierarten
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum SpeciesEnum {
	// Kleinwale
	HARBOR_PORPOISE = 0,
	DOLPHIN = 3,
	BELUGA = 4,

	// Großwale
	MINKE_WHALE = 5,
	FIN_WHALE = 6,
	HUMPBACK_WHALE = 7,
	UNKNOWN_WHALE = 8,

	// Robben
	GREY_SEAL = 1,
	HARBOR_SEAL = 2,
	RINGED_SEAL = 9,
	UNKNOWN_SEAL = 10
}

/**
 * Baut je Locale die Bezeichnungen der Tierarten aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Außerhalb von `formOptions/` importiert niemand
 * die frühere `speciesLabels`-Konstante direkt — geprüft vor diesem Umbau,
 * jeder Verbraucher geht über `getSpeciesOptions()`/`getSpeciesLabel()`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings: Ein
 * Trockenlauf des Extraktors schlägt für dieses Muster vor, `m.…()` direkt
 * als Wert einzusetzen (`[SpeciesEnum.HARBOR_PORPOISE]: m.formoptions_species_harbor_porpoise({}, { locale })`).
 * Das ist falsch — in einer Modulkonstante würde `m.…()` genau einmal beim
 * ersten Modulladen ausgewertet und die Sprache für die Laufzeit des Prozesses
 * einfrieren. Die Builder-Funktionen werden erst in `speciesLabelsFor`
 * (unten), je Locale, tatsächlich aufgerufen.
 */
const speciesLabelBuilders: Record<SpeciesEnum, (locale: Locale) => string> = {
	[SpeciesEnum.HARBOR_PORPOISE]: (locale) => m.formoptions_species_harbor_porpoise({}, { locale }),
	[SpeciesEnum.GREY_SEAL]: (locale) => m.formoptions_species_grey_seal({}, { locale }),
	[SpeciesEnum.HARBOR_SEAL]: (locale) => m.formoptions_species_harbor_seal({}, { locale }),
	[SpeciesEnum.DOLPHIN]: (locale) => m.formoptions_species_dolphin({}, { locale }),
	[SpeciesEnum.BELUGA]: (locale) => m.formoptions_species_beluga({}, { locale }),
	[SpeciesEnum.MINKE_WHALE]: (locale) => m.formoptions_species_minke_whale({}, { locale }),
	[SpeciesEnum.FIN_WHALE]: (locale) => m.formoptions_species_fin_whale({}, { locale }),
	[SpeciesEnum.HUMPBACK_WHALE]: (locale) => m.formoptions_species_humpback_whale({}, { locale }),
	[SpeciesEnum.UNKNOWN_WHALE]: (locale) => m.formoptions_species_unknown_whale({}, { locale }),
	[SpeciesEnum.RINGED_SEAL]: (locale) => m.formoptions_species_ringed_seal({}, { locale }),
	[SpeciesEnum.UNKNOWN_SEAL]: (locale) => m.formoptions_species_unknown_seal({}, { locale })
};

/** Baut die Artbezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const speciesLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(speciesLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<SpeciesEnum, string>
);

/**
 * Gruppierung der Tierarten für UI-Anzeige.
 *
 * Die drei Schlüssel bleiben deutsche Wörter (`Kleinwale`/`Großwale`/`Robben`):
 * `speciesGroups` wird außerhalb dieses Moduls direkt konsumiert
 * (`SpeciesIdentificationHelp.svelte`, `germanBaseline.testutil.ts`) und dort
 * als fertiges, eingefrorenes Objekt mit genau diesen drei Schlüsseln
 * erwartet — diese Konsumenten auf Lokalisierung umzustellen ist außerhalb
 * der Aufgabe 3.2 (Pilotmodul `species.ts`; siehe Bericht). Innerhalb DIESES
 * Moduls dienen die drei Schlüssel ab jetzt nur noch als interner
 * Nachschlage-Bezeichner: `getSpeciesOptions(true, …)` löst den tatsächlich
 * angezeigten Gruppennamen separat über `speciesGroupNameBuilders` auf,
 * nicht mehr aus dem Schlüssel selbst.
 */
export const speciesGroups = {
	Kleinwale: [SpeciesEnum.HARBOR_PORPOISE, SpeciesEnum.DOLPHIN, SpeciesEnum.BELUGA],
	Großwale: [
		SpeciesEnum.MINKE_WHALE,
		SpeciesEnum.FIN_WHALE,
		SpeciesEnum.HUMPBACK_WHALE,
		SpeciesEnum.UNKNOWN_WHALE
	],
	Robben: [
		SpeciesEnum.GREY_SEAL,
		SpeciesEnum.HARBOR_SEAL,
		SpeciesEnum.RINGED_SEAL,
		SpeciesEnum.UNKNOWN_SEAL
	]
};

/** Lokalisierter Anzeigetext je Gruppen-Schlüssel aus `speciesGroups` (Builder, siehe oben). */
const speciesGroupNameBuilders: Record<keyof typeof speciesGroups, (locale: Locale) => string> = {
	Kleinwale: (locale) => m.formoptions_species_group_small_whales({}, { locale }),
	Großwale: (locale) => m.formoptions_species_group_large_whales({}, { locale }),
	Robben: (locale) => m.formoptions_species_group_seals({}, { locale })
};

/** Baut die Gruppennamen für eine Locale genau einmal und hält sie danach vor. */
const speciesGroupNamesFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(speciesGroupNameBuilders).map(([key, build]) => [key, build(locale)])
		) as Record<keyof typeof speciesGroups, string>
);

export type Species = SpeciesEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param grouped - Ob die Optionen nach Gruppen gruppiert werden sollen
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label (und optional group)
 */
export function getSpeciesOptions(
	grouped = false,
	locale: Locale = getLocale()
): Array<{ value: string; label: string; group?: string }> {
	const labels = speciesLabelsFor(locale);

	if (!grouped) {
		return Object.entries(labels).map(([value, label]) => ({ value: String(value), label }));
	}

	const groupNames = speciesGroupNamesFor(locale);
	return Object.entries(speciesGroups).flatMap(([groupKey, species]) =>
		species.map((speciesValue) => ({
			value: String(speciesValue),
			label: labels[speciesValue],
			group: groupNames[groupKey as keyof typeof speciesGroups]
		}))
	);
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getSpeciesLabel(
	value: SpeciesEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined) {
		return m.formoptions_species_not_specified({}, { locale });
	}

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = speciesLabelsFor(locale);
	return labels[numericValue as SpeciesEnum] || m.formoptions_species_unknown({}, { locale });
}

/**
 * Prüft, ob ein Wert ein gültiger SpeciesEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger SpeciesEnum-Wert ist
 */
export function isValidSpecies(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(SpeciesEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(SpeciesEnum).includes(value);
	}

	return false;
}

/**
 * Konvertiert einen beliebigen Wert in einen SpeciesEnum-Wert, wenn möglich
 * @param value - Der zu konvertierende Wert
 * @returns Den SpeciesEnum-Wert oder undefined, wenn keine Konvertierung möglich ist
 */
export function toSpeciesEnum(value: unknown): SpeciesEnum | undefined {
	if (value === null || value === undefined) return undefined;

	let numValue: number;

	if (typeof value === 'string') {
		numValue = parseInt(value, 10);
		if (isNaN(numValue)) return undefined;
	} else if (typeof value === 'number') {
		numValue = value;
	} else {
		return undefined;
	}

	return isValidSpecies(numValue) ? (numValue as SpeciesEnum) : undefined;
}
