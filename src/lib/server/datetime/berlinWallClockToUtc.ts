import { berlinWallClockToInstant } from '#lib/utils/format/berlinWallClock.ts';

/** Uhrzeit-Eingabe im Format "HH:MM" (Formular und Legacy-API). */
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Kombiniert Datum und Uhrzeit einer Formulareingabe zum echten UTC-Zeitpunkt.
 *
 * Datum und Uhrzeit sind **deutsche Wanduhrzeit** — so hat der Melder sie
 * eingegeben. Die Funktion baut daraus den tatsächlichen Instant, indem sie den
 * für diesen Kalendertag geltenden MEZ/MESZ-Offset abzieht.
 *
 * Anders als `combineToDate` + `correctCestOffsetUTC` rechnet sie ausschließlich
 * mit UTC-Feldern und hängt damit **nicht** an der Zeitzone des Prozesses. Der
 * Server ist zwar auf `TZ=UTC` gepinnt, das Ergebnis darf davon aber nicht
 * abhängen.
 *
 * @param localDate - Datum als "YYYY-MM-DD" (auch ein ISO-Zeitstempel wird akzeptiert,
 *                    davon zählt dann der UTC-Kalendertag — so liefert die Legacy-API)
 * @param localTime - Uhrzeit als "HH:MM"; fehlt oder passt sie nicht, bleibt die
 *                    Tageszeit aus `localDate` erhalten (i. d. R. Mitternacht)
 * @returns Echter UTC-Zeitpunkt; bei ungültigem Datum der aktuelle Zeitpunkt
 */
export function berlinWallClockToUtc(localDate: string, localTime?: string | null): Date {
	if (!localDate) {
		return new Date();
	}

	const parsed = new Date(localDate);
	if (isNaN(parsed.getTime())) {
		return new Date();
	}

	const timeMatch = localTime ? TIME_PATTERN.exec(localTime) : null;

	return berlinWallClockToInstant({
		year: parsed.getUTCFullYear(),
		month: parsed.getUTCMonth() + 1,
		day: parsed.getUTCDate(),
		hours: timeMatch ? Number(timeMatch[1]) : parsed.getUTCHours(),
		minutes: timeMatch ? Number(timeMatch[2]) : parsed.getUTCMinutes(),
		seconds: timeMatch ? 0 : parsed.getUTCSeconds(),
		milliseconds: timeMatch ? 0 : parsed.getUTCMilliseconds()
	});
}
