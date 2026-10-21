/**
 * Enum für Eingabekanäle
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum EntryChannelEnum {
	WEB = 0,
	EMAIL = 1,
	MAIL = 2,
	FAX = 3,
	APP = 4,
	PHONE = 5
}

/**
 * Baut je Locale die Bezeichnungen der Eingabekanäle aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Der einzige externe Zugriff auf das rohe Record
 * lag in `antworten.json/+server.ts` und ist auf `getEntryChannelLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort).
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const entryChannelLabelBuilders: Record<EntryChannelEnum, (locale: Locale) => string> = {
	[EntryChannelEnum.WEB]: (locale) => m.formoptions_entrychannel_web({}, { locale }),
	[EntryChannelEnum.EMAIL]: (locale) => m.formoptions_entrychannel_email({}, { locale }),
	[EntryChannelEnum.MAIL]: (locale) => m.formoptions_entrychannel_mail({}, { locale }),
	[EntryChannelEnum.FAX]: (locale) => m.formoptions_entrychannel_fax({}, { locale }),
	[EntryChannelEnum.APP]: (locale) => m.formoptions_entrychannel_app({}, { locale }),
	[EntryChannelEnum.PHONE]: (locale) => m.formoptions_entrychannel_phone({}, { locale })
};

/** Baut die Eingabekanal-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const entryChannelLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(entryChannelLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<EntryChannelEnum, string>
);

export type EntryChannel = EntryChannelEnum;

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getEntryChannelOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = entryChannelLabelsFor(locale);
	return Object.entries(labels).map(([value, label]) => ({ value: Number(value), label }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getEntryChannelLabel(
	value: EntryChannelEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_entrychannel_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = entryChannelLabelsFor(locale);
	return (
		labels[numericValue as EntryChannelEnum] || m.formoptions_entrychannel_invalid({}, { locale })
	);
}

/**
 * Prüft, ob ein Wert ein gültiger EntryChannelEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger EntryChannelEnum-Wert ist
 */
export function isValidEntryChannel(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(EntryChannelEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(EntryChannelEnum).includes(value);
	}

	return false;
}
