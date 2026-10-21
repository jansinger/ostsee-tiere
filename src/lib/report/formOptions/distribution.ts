/**
 * Enum für Verteilungen der Tiere
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

/**
 * **Achtung bei `OTHER = 0`:** Die Spalte `verteilung` ist
 * `integer default(0) notNull` — `0` ist gleichzeitig Default und die Bedeutung
 * "Sonstige Verteilung". Das Feld ist im Schema nicht `.required()`, eine
 * fehlende Antwort wurde also als aktive Aussage gespeichert (15.129 von 19.880
 * Zeilen, Stand 2026-07-29). Fehlt eine Angabe, gehört sie auf `UNKNOWN`.
 */
export enum DistributionEnum {
	OTHER = 0,
	SINGLE = 1,
	MOTHER_WITH_YOUNG = 2,
	SCHOOLS = 3,
	/**
	 * Es wurde keine Verteilung angegeben.
	 *
	 * Wird ausschließlich serverseitig beim Speichern gesetzt
	 * (`mapFormToSighting`) und ist bewusst nicht auswählbar.
	 */
	UNKNOWN = 4
}

/**
 * Baut je Locale die Bezeichnungen der Verteilungen aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe). Der einzige externe Zugriff auf das rohe Record lag
 * in `antworten.json/+server.ts` und ist auf `getDistributionLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getDistributionLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const distributionLabelBuilders: Record<DistributionEnum, (locale: Locale) => string> = {
	[DistributionEnum.OTHER]: (locale) => m.formoptions_distribution_other({}, { locale }),
	[DistributionEnum.SINGLE]: (locale) => m.formoptions_distribution_single({}, { locale }),
	[DistributionEnum.MOTHER_WITH_YOUNG]: (locale) =>
		m.formoptions_distribution_mother_with_young({}, { locale }),
	[DistributionEnum.SCHOOLS]: (locale) => m.formoptions_distribution_schools({}, { locale }),
	[DistributionEnum.UNKNOWN]: (locale) => m.formoptions_distribution_unknown({}, { locale })
};

/** Baut die Verteilungs-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const distributionLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(distributionLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<DistributionEnum, string>
);

/**
 * Verteilungen, die im Formular auswählbar sind — in dieser Reihenfolge.
 * `UNKNOWN` ist bewusst ausgenommen (siehe Enum-Kommentar).
 *
 * Aufgezählt statt abgeleitet, aus zwei Gründen: `OTHER` ist die
 * Auffangkategorie und gehört ans Ende (sein Enum-Wert `0` hätte es nach vorn
 * sortiert), und die konkreten Antworten stehen nach gemessener Häufigkeit
 * (2026-08-07): Einzeln 3.066, Deutliche Schulen 1.096, Mutter mit Jungtier
 * 644. Der gespeicherte Wert bleibt jeweils unverändert.
 */
const SELECTABLE_DISTRIBUTIONS: readonly DistributionEnum[] = [
	DistributionEnum.SINGLE,
	DistributionEnum.SCHOOLS,
	DistributionEnum.MOTHER_WITH_YOUNG,
	DistributionEnum.OTHER
];

export type Distribution = DistributionEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getDistributionOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = distributionLabelsFor(locale);
	return SELECTABLE_DISTRIBUTIONS.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getDistributionLabel(
	value: DistributionEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_distribution_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = distributionLabelsFor(locale);
	return (
		labels[numericValue as DistributionEnum] || m.formoptions_distribution_invalid({}, { locale })
	);
}

/**
 * Prüft, ob ein Wert ein gültiger DistributionEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger DistributionEnum-Wert ist
 */
export function isValidDistribution(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(DistributionEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(DistributionEnum).includes(value);
	}

	return false;
}
