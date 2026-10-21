import { berlinOffsetHoursForWallClock } from '#lib/utils/format/berlinWallClock.ts';

/**
 * Rechnet eine deutsche Wanduhrzeit in den echten UTC-Zeitpunkt um.
 *
 * Ist der Prozess-Offset 0, erzeugt `combineToDate` aus der Formulareingabe ein
 * `Date`, dessen UTC-Felder die *Wanduhrzeit* tragen (14:30 Eingabe → 14:30Z).
 * Diese Funktion zieht den passenden MEZ/MESZ-Offset ab und macht daraus den
 * tatsächlichen Zeitpunkt.
 *
 * Bei einem Offset ungleich 0 hat `combineToDate` per `setHours` bereits einen
 * Offset angewandt — dann ist diese Funktion ein No-op.
 *
 * Die Bedingung ist bewusst der **Offset**, nicht der Name der Zeitzone.
 * Entscheidend ist allein, was `setHours` in `combineToDate` gerechnet hat.
 * Zonen mit Offset 0, die nicht `UTC` heißen (`Europe/London` im Winter,
 * `Atlantic/Reykjavik`), verhalten sich dort identisch zu UTC und brauchen
 * dieselbe Korrektur — ein Namensvergleich würde sie fälschlich überspringen
 * und die Wanduhrzeit ununterschieden speichern.
 *
 * WICHTIG: `date` trägt Wanduhrzeit, keinen echten UTC-Zeitpunkt. Die
 * Umstellungsgrenzen unten liegen deshalb ebenfalls auf Wanduhrzeit (02:00 bzw.
 * 03:00) und nicht auf dem UTC-Instant der Umstellung (01:00Z).
 *
 * @param date - Als UTC verpackte deutsche Wanduhrzeit. Wird in-place verändert.
 * @returns Dasselbe (mutierte) Date-Objekt, um den MEZ/MESZ-Offset zurückgesetzt.
 */
export function correctCestOffsetUTC(date: Date): Date {
	// Nur bei Prozess-Offset 0 trägt `date` Wanduhrzeit und muss umgerechnet
	// werden (siehe Kopfkommentar — Offset, nicht Zonenname).
	if (date.getTimezoneOffset() !== 0) {
		return date;
	}

	date.setHours(date.getHours() - berlinOffsetHoursForWallClock(date));
	return date;
}
