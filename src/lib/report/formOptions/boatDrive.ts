/**
 * Enum für Bootsantriebsarten
 * Die numerischen Werte werden in der Datenbank gespeichert.
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

/**
 * **Achtung bei `OTHER = 0`:** Die Spalte `bootsantrieb` ist
 * `integer default(0) notNull` — `0` ist also gleichzeitig der Default und die
 * Bedeutung "Sonstiger Bootsantrieb". Wer nie ein Boot hatte, darf deshalb
 * nicht auf `0` landen, sondern bekommt `NONE`.
 */
export enum BoatDriveEnum {
	OTHER = 0,
	MOTOR = 1,
	SAIL = 2,
	DRIFTING = 3,
	ANCHORED = 4,
	/**
	 * Kein Boot im Spiel (Sichtung von Land).
	 *
	 * Wird ausschließlich serverseitig beim Speichern gesetzt
	 * (`mapFormToSighting`) und ist bewusst **nicht** auswählbar — im Formular
	 * erscheint das Antriebsfeld nur bei Segelschiff/Motorboot.
	 */
	NONE = 5,
	/**
	 * Motor war während der Sichtung abgeschaltet.
	 *
	 * **Warum ein neuer Wert und nicht `DRIFTING`/`ANCHORED`:** Ein Motorboot mit
	 * abgeschaltetem Motor als "treibend" zu speichern wäre eine Aussage, die der
	 * Melder nie gemacht hat — für die Einordnung von Unterwasserlärm ist
	 * "treibend" etwas anderes als "vor Anker". Die Alt-Werte 0–4 behalten
	 * deshalb ihre feinere Bedeutung und bleiben in der Admin-Maske wählbar; im
	 * Meldeformular gibt es seit PR 4 (Museum, 2026-08-04) nur noch
	 * `MOTOR`/`MOTOR_OFF` (siehe `PUBLIC_BOAT_DRIVE_OPTIONS`).
	 */
	MOTOR_OFF = 6
}

/**
 * Baut je Locale die Bezeichnungen der Bootsantriebsarten aus dem Botschaftskatalog.
 *
 * Modul-intern (kein Export): Der einzige externe Zugriff auf das rohe Record
 * lag in `antworten.json/+server.ts` und ist auf `getBoatDriveLabel(…,
 * baseLocale)` umgestellt (siehe Kommentar dort). `csvExport.ts` ruft
 * `getBoatDriveLabel` ebenfalls jetzt mit `baseLocale`.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const boatDriveLabelBuilders: Record<BoatDriveEnum, (locale: Locale) => string> = {
	[BoatDriveEnum.OTHER]: (locale) => m.formoptions_boatdrive_other({}, { locale }),
	[BoatDriveEnum.MOTOR]: (locale) => m.formoptions_boatdrive_motor({}, { locale }),
	[BoatDriveEnum.SAIL]: (locale) => m.formoptions_boatdrive_sail({}, { locale }),
	[BoatDriveEnum.DRIFTING]: (locale) => m.formoptions_boatdrive_drifting({}, { locale }),
	[BoatDriveEnum.ANCHORED]: (locale) => m.formoptions_boatdrive_anchored({}, { locale }),
	[BoatDriveEnum.NONE]: (locale) => m.formoptions_boatdrive_none({}, { locale }),
	[BoatDriveEnum.MOTOR_OFF]: (locale) => m.formoptions_boatdrive_motor_off({}, { locale })
};

/** Baut die Antriebs-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const boatDriveLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(boatDriveLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<BoatDriveEnum, string>
);

export type BoatDrive = BoatDriveEnum;

/**
 * Antriebsarten, die im Formular auswählbar sind.
 * `NONE` ist bewusst ausgenommen (siehe Enum-Kommentar).
 *
 * Abgeleitet statt aufgezählt: Ein später ergänzter echter Wert erscheint
 * dadurch automatisch im Formular, statt still zu fehlen.
 *
 * `OTHER` wandert dabei ans Ende — Auffangkategorie hinter die konkreten
 * Antworten, statt durch seinen Enum-Wert `0` davor. Der gespeicherte Wert
 * bleibt `0`. Diese Liste versorgt nur noch die Admin-Maske; das
 * Meldeformular nutzt `PUBLIC_BOAT_DRIVE_OPTIONS` (siehe unten).
 */
const SELECTABLE_BOAT_DRIVES: readonly BoatDriveEnum[] = [
	...Object.values(BoatDriveEnum).filter(
		(value): value is BoatDriveEnum =>
			typeof value === 'number' && value !== BoatDriveEnum.NONE && value !== BoatDriveEnum.OTHER
	),
	BoatDriveEnum.OTHER
];

/**
 * Generiert eine Array-Struktur für Select-Komponenten
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 * @returns Array von Objekten mit value und label
 */
export function getBoatDriveOptions(
	locale: Locale = getLocale()
): Array<{ value: number; label: string }> {
	const labels = boatDriveLabelsFor(locale);
	return SELECTABLE_BOAT_DRIVES.map((value) => ({ value, label: labels[value] }));
}

/**
 * Die im **Meldeformular** angebotene Zweier-Auswahl (PR 4, Museum 2026-08-04).
 *
 * Es geht dort allein um Motorgeräusche; die feinere Unterscheidung der
 * Alt-Werte bleibt der Admin-Maske vorbehalten, die weiterhin
 * `getBoatDriveOptions()` verwendet.
 *
 * Als Funktion statt als Modulkonstante (Entscheidung 2026-08-11, mit im
 * Umfang der Etappe-1-Umstellung): eine eingefrorene Array-Konstante hätte
 * `m.…()` genau einmal beim Modulladen ausgewertet — derselbe Fehler, den der
 * Entwurf in 2.3/4.1 für Modulkonstanten beschreibt. Die beiden Texte haben
 * eigene Schlüssel (`formoptions_boatdrive_public_motor_running`/
 * `…_not_running`), nicht `formoptions_boatdrive_motor`/`…_motor_off`: Das
 * sind andere Aussagen ("Motor lief" als Ja/Nein-Antwort auf die
 * Meldeformular-Frage vs. "Motor" als Auswahloption in der Admin-Maske) und
 * dürfen sich in der Übersetzung unterscheiden (siehe Teil 1, `sex.ts`).
 */
export function getPublicBoatDriveOptions(
	locale: Locale = getLocale()
): Array<{ value: BoatDriveEnum; label: string }> {
	return [
		{
			value: BoatDriveEnum.MOTOR,
			label: m.formoptions_boatdrive_public_motor_running({}, { locale })
		},
		{
			value: BoatDriveEnum.MOTOR_OFF,
			label: m.formoptions_boatdrive_public_motor_not_running({}, { locale })
		}
	];
}

/**
 * Hilfsfunktion zum Abrufen des Labels für einen bestimmten Enum-Wert
 * @param value - Der Enum-Wert (z.B. aus der Datenbank)
 * @param locale - Locale für den Anzeigetext; Default die aktuelle Locale
 * @returns Das zugehörige Label oder einen Fallback-Text
 */
export function getBoatDriveLabel(
	value: BoatDriveEnum | number | null | undefined,
	locale: Locale = getLocale()
): string {
	if (value === null || value === undefined)
		return m.formoptions_boatdrive_not_specified({}, { locale });

	const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
	const labels = boatDriveLabelsFor(locale);
	return labels[numericValue as BoatDriveEnum] || m.formoptions_boatdrive_invalid({}, { locale });
}

/**
 * Prüft, ob ein Wert ein gültiger BoatDriveEnum-Wert ist
 * @param value - Der zu prüfende Wert
 * @returns true, wenn der Wert ein gültiger BoatDriveEnum-Wert ist
 */
export function isValidBoatDrive(value: unknown): boolean {
	if (typeof value === 'string') {
		const numValue = parseInt(value, 10);
		return !isNaN(numValue) && Object.values(BoatDriveEnum).includes(numValue);
	}

	if (typeof value === 'number') {
		return Object.values(BoatDriveEnum).includes(value);
	}

	return false;
}
