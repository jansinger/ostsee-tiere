/**
 * Enum für Medientypen
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export enum MediaTypeEnum {
	OTHER = 0,
	PHOTO = 1,
	VIDEO = 2,
	AUDIO = 3,
	DRAWING = 4,
	SATELLITE = 5,
	DRONE = 6,
	UNDERWATER = 7
}

/**
 * Baut je Locale die Bezeichnungen der Medientypen aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt oder ruft `getMediaTypeLabel` aus der
 * Legacy-API oder einem Export-Pfad auf — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe, `germanBaseline.testutil.ts` ausgenommen). Anders als
 * bei den übrigen sieben Dateien dieser Gruppe war hier keine
 * Locale-Pinnung an einem Verbraucher nötig.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const mediaTypeLabelBuilders: Record<MediaTypeEnum, (locale: Locale) => string> = {
	[MediaTypeEnum.OTHER]: (locale) => m.formoptions_mediatype_other({}, { locale }),
	[MediaTypeEnum.PHOTO]: (locale) => m.formoptions_mediatype_photo({}, { locale }),
	[MediaTypeEnum.VIDEO]: (locale) => m.formoptions_mediatype_video({}, { locale }),
	[MediaTypeEnum.AUDIO]: (locale) => m.formoptions_mediatype_audio({}, { locale }),
	[MediaTypeEnum.DRAWING]: (locale) => m.formoptions_mediatype_drawing({}, { locale }),
	[MediaTypeEnum.SATELLITE]: (locale) => m.formoptions_mediatype_satellite({}, { locale }),
	[MediaTypeEnum.DRONE]: (locale) => m.formoptions_mediatype_drone({}, { locale }),
	[MediaTypeEnum.UNDERWATER]: (locale) => m.formoptions_mediatype_underwater({}, { locale })
};

/** Baut die Medientyp-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const mediaTypeLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(mediaTypeLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<MediaTypeEnum, string>
);

export type MediaType = MediaTypeEnum;

/**
 * Medienformate, die im Formular auswählbar sind — "Sonstiges Medienformat"
 * am Ende. Auffangkategorie hinter die konkreten Antworten; der gespeicherte
 * Wert bleibt `0`.
 */
const SELECTABLE_MEDIA_TYPES: readonly MediaTypeEnum[] = [
	...Object.values(MediaTypeEnum).filter(
		(value): value is MediaTypeEnum => typeof value === 'number' && value !== MediaTypeEnum.OTHER
	),
	MediaTypeEnum.OTHER
];

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getMediaTypeOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = mediaTypeLabelsFor(locale);
	return SELECTABLE_MEDIA_TYPES.map((value) => ({ value, label: labels[value] }));
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getMediaTypeLabel(
	value: MediaTypeEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_mediatype_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = mediaTypeLabelsFor(locale);
	return labels[numericValue as MediaTypeEnum] || m.formoptions_mediatype_unknown({}, { locale });
}

/**
 * Prüft, ob ein Wert ein gültiger MediaTypeEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger MediaTypeEnum-Wert ist
 */
export function isValidMediaType(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(MediaTypeEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(MediaTypeEnum).includes(value);
	}

	return false;
}
