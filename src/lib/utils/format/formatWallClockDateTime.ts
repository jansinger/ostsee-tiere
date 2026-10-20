import * as m from '#lib/paraglide/messages.js';
/** Datum wie es das Formular liefert: "YYYY-MM-DD". */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Uhrzeit wie sie das Formular liefert: "HH:MM". */
const TIME_PATTERN = /^([0-1]?\d|2[0-3]):[0-5]\d$/;

/**
 * Formatiert die Formulareingaben Datum und Uhrzeit für die Anzeige.
 *
 * Beide Werte sind deutsche Wanduhrzeit und werden hier **nur umformatiert** —
 * ohne Umweg über ein `Date`-Objekt, der die Ausgabe an die Zeitzone des
 * Browsers binden würde (westlich von UTC kippt sonst sogar der Kalendertag).
 *
 * @param localDate - Datum als "YYYY-MM-DD"
 * @param localTime - Uhrzeit als "HH:MM" (optional)
 * @returns "DD.MM.YYYY, HH:MM", "DD.MM.YYYY" ohne Uhrzeit, sonst "Nicht angegeben"
 */
export function formatWallClockDateTime(
	localDate: string | null | undefined,
	localTime?: string | null
): string {
	const dateMatch = localDate ? DATE_PATTERN.exec(localDate) : null;
	if (!dateMatch) {
		return m.utils_format_datetime_text_nicht_angegeben();
	}

	const formattedDate = `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`;

	if (localTime && TIME_PATTERN.test(localTime)) {
		return `${formattedDate}, ${localTime}`;
	}

	return formattedDate;
}
