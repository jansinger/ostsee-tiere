/**
 * Enum für die Art des Beobachtungsorts
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

/**
 * **Achtung bei `OTHER = 0`:** Die Spalte `vonwo` ist
 * `integer default(0) notNull` — `0` ist also gleichzeitig der Default und die
 * Bedeutung "Sonstiges". Anders als beim Bootsantrieb ist "Sonstiges" hier eine
 * echte, häufig genutzte Kategorie (Kajak, SUP, Mehrzweckschiff, Seebrücke …);
 * 713 der 1.833 Bestandszeilen belegen das über einen Freitext in `vonwo_text`.
 * Deshalb wurde der Bestand NICHT umgeschrieben — nur der Schreibpfad gehärtet.
 */
export enum SightingFromEnum {
	OTHER = 0,
	SAILBOAT = 1,
	MOTORBOAT = 2,
	LAND = 3,
	FERRY = 4,
	/**
	 * Es wurde kein Beobachtungsort angegeben.
	 *
	 * Wird ausschließlich serverseitig beim Speichern gesetzt
	 * (`mapFormToSighting`) und ist bewusst **nicht** auswählbar — "keine
	 * Angabe" ist keine Wahl, die ein Melder trifft.
	 */
	UNKNOWN = 5
}

/**
 * Baut je Locale die Bezeichnungen der Beobachtungsorte aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Der einzige externe Zugriff auf das rohe Record
 * lag in `antworten.json/+server.ts` und ist auf `getSightingFromLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getSightingFromLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const sightingFromLabelBuilders: Record<SightingFromEnum, (locale: Locale) => string> = {
	[SightingFromEnum.OTHER]: (locale) => m.formoptions_sightingfrom_other({}, { locale }),
	[SightingFromEnum.SAILBOAT]: (locale) => m.formoptions_sightingfrom_sailboat({}, { locale }),
	[SightingFromEnum.MOTORBOAT]: (locale) => m.formoptions_sightingfrom_motorboat({}, { locale }),
	[SightingFromEnum.LAND]: (locale) => m.formoptions_sightingfrom_land({}, { locale }),
	[SightingFromEnum.FERRY]: (locale) => m.formoptions_sightingfrom_ferry({}, { locale }),
	[SightingFromEnum.UNKNOWN]: (locale) => m.formoptions_sightingfrom_unknown({}, { locale })
};

/** Baut die Beobachtungsort-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const sightingFromLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(sightingFromLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<SightingFromEnum, string>
);

export type SightingFrom = SightingFromEnum;

/**
 * Beobachtungsorte, die im Formular auswählbar sind — in dieser Reihenfolge.
 * `UNKNOWN` ist bewusst ausgenommen (siehe Enum-Kommentar).
 *
 * **Die Reihenfolge ist aufgezählt und nicht abgeleitet**, anders als bei den
 * übrigen Listen. Sie folgt der gemessenen Häufigkeit im Bestand
 * (2026-08-07, 19.947 Zeilen): Segelschiff 10.362, Land 5.937, Motorboot 1.479,
 * Fähre 281. `OTHER` steht trotz seiner 1.888 Zeilen am Ende — es ist die
 * Auffangkategorie und gehört hinter die konkreten Antworten.
 *
 * Ein neu ergänzter Wert erscheint dadurch NICHT automatisch; er muss hier
 * einsortiert werden. Das ist der Preis dafür, dass die Reihenfolge eine
 * Aussage trifft — `Object.values()` hätte sie nach Enum-Wert sortiert, also
 * nach einer Zahl ohne fachliche Bedeutung.
 */
const SELECTABLE_SIGHTING_FROM: readonly SightingFromEnum[] = [
	SightingFromEnum.SAILBOAT,
	SightingFromEnum.LAND,
	SightingFromEnum.MOTORBOAT,
	SightingFromEnum.FERRY,
	SightingFromEnum.OTHER
];

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getSightingFromOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = sightingFromLabelsFor(locale);
	return SELECTABLE_SIGHTING_FROM.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getSightingFromLabel(
	value: SightingFromEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_sightingfrom_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = sightingFromLabelsFor(locale);
	return (
		labels[numericValue as SightingFromEnum] || m.formoptions_sightingfrom_invalid({}, { locale })
	);
}

/**
 * Prüft, ob ein Wert ein gültiger SightingFromEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger SightingFromEnum-Wert ist
 */
export function isValidSightingFrom(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(SightingFromEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(SightingFromEnum).includes(value);
	}

	return false;
}
