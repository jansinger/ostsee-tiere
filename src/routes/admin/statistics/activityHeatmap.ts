import { berlinCalendarDayIso } from '#lib/utils/format/dateTime.ts';

/**
 * Datenmodell der Eingangs-Heatmap („letzte 30 Tage").
 *
 * Die Ableitung stand bis 2026-08-09 als Kette von `{@const}`-Ausdrücken
 * **innerhalb** der 30er-Schleife im Template. Das hatte drei Folgen, die alle
 * hier aufgelöst sind:
 *
 * 1. `Math.max(...)` über die gesamte Aktivitätsliste lief 30-mal identisch
 *    durch, ebenso `new Date(Date.now() …)` je Zelle.
 * 2. Das Raster war `grid-cols-7` über 30 Tage **ohne** Wochentagsbezug — die
 *    Spalten bedeuteten nichts. Ein Wochentagsraster braucht Leerzellen am
 *    Anfang, und die kann das Template nicht nebenbei erzeugen.
 * 3. Die Beschriftung lag nur im `data-tip` des Tooltips und war damit
 *    mausgebunden; Tage ohne Meldung rendeten eine völlig leere Zelle.
 *
 * Wochentagsausrichtung, Beschriftung und Intensitätsstufe sind Logik und
 * gehören deshalb hierher — prüfbar in `activityHeatmap.test.ts` statt nur im
 * Browser.
 */

/** Spaltenüberschriften der Heatmap, Montag zuerst. */
export const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

/**
 * Fünf Intensitätsstufen, gemessen am Maximum des Zeitraums:
 * 0 = keine Meldung, 1 = bis 25 %, 2 = ab 25 %, 3 = ab 50 %, 4 = ab 75 %.
 *
 * Stufe 4 ist damit die oberste **Stufe**, nicht der Spitzentag allein — bei
 * einem Maximum von 100 landen auch 80 Meldungen darin.
 *
 * Die Schwellen (0,25 / 0,5 / 0,75) sind die des Vorgängers — geändert hat sich
 * nur, dass sie einmal an einer Stelle stehen.
 */
export type HeatmapStep = 0 | 1 | 2 | 3 | 4;

export interface HeatmapDay {
	/** Berliner Kalendertag als ISO-Datum (`YYYY-MM-DD`). */
	iso: string;
	/** Vollständige Beschriftung, z. B. „Sonntag, 9. August: 2 Sichtungen". */
	label: string;
	count: number;
	step: HeatmapStep;
}

/** Eine Woche der Heatmap: sieben Spalten, Leerstellen als `null`. */
export type HeatmapWeek = (HeatmapDay | null)[];

export interface ActivityRow {
	date: string;
	count: number | string;
}

const DATE_LABEL = new Intl.DateTimeFormat('de-DE', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	// Die ISO-Strings sind bereits Berliner Kalendertage (`berlinCalendarDate`
	// im Loader). Sie unten als UTC-Mitternacht zu lesen und auch in UTC zu
	// formatieren hält sie unverschoben — eine zweite Zeitzonenumrechnung würde
	// den Tag um bis zu zwei Stunden kippen.
	timeZone: 'UTC'
});

/** UTC-Mitternacht des Kalendertags — reine Datumsarithmetik, keine Ortszeit. */
function atUtcMidnight(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

/** Wochentag mit Montag = 0, damit er als Spaltenindex taugt. */
function weekdayIndex(iso: string): number {
	return (atUtcMidnight(iso).getUTCDay() + 6) % 7;
}

function stepFor(count: number, maxCount: number): HeatmapStep {
	if (count === 0 || maxCount === 0) return 0;
	const intensity = count / maxCount;
	if (intensity >= 0.75) return 4;
	if (intensity >= 0.5) return 3;
	if (intensity >= 0.25) return 2;
	return 1;
}

function labelFor(iso: string, count: number): string {
	const datum = DATE_LABEL.format(atUtcMidnight(iso));
	if (count === 0) return `${datum}: keine Sichtungen`;
	return `${datum}: ${count} Sichtung${count === 1 ? '' : 'en'}`;
}

/**
 * Baut das Wochenraster der letzten `tage` Kalendertage bis einschließlich heute.
 *
 * Zurückgezählt wird in **Kalendertagen** (`setUTCDate`) und nicht in
 * 24-h-Schritten: Über die Zeitumstellung hinweg lieferte die Subtraktion fester
 * Millisekunden einen Kalendertag doppelt und ließ einen anderen aus.
 *
 * Ein Zeitraum ohne Tage liefert **kein** Raster. Ohne diesen Wächter liefe die
 * Rückwärtsrechnung auf `isoVor(-1)`: Die Ausrichtung käme vom Wochentag des
 * *folgenden* Tages, und heraus fiele eine Woche aus lauter Leerzellen — eine
 * Ausgabe, die nach Daten aussieht und keine enthält.
 */
export function buildActivityHeatmap(
	activity: readonly ActivityRow[],
	today: Date,
	tage = 30
): HeatmapWeek[] {
	if (tage <= 0) return [];

	const counts = new Map(activity.map((row) => [row.date, Number(row.count)]));
	const maxCount = activity.reduce((max, row) => Math.max(max, Number(row.count)), 0);

	const anker = atUtcMidnight(berlinCalendarDayIso(today));
	const isoVor = (rueckwaerts: number): string => {
		const tag = new Date(anker);
		tag.setUTCDate(tag.getUTCDate() - rueckwaerts);
		return tag.toISOString().slice(0, 10);
	};

	const days: HeatmapDay[] = [];
	for (let rueckwaerts = tage - 1; rueckwaerts >= 0; rueckwaerts--) {
		const iso = isoVor(rueckwaerts);
		const count = counts.get(iso) ?? 0;
		days.push({ iso, label: labelFor(iso, count), count, step: stepFor(count, maxCount) });
	}

	const weeks: HeatmapWeek[] = [];
	let woche: HeatmapWeek = Array.from({ length: weekdayIndex(isoVor(tage - 1)) }, () => null);
	for (const tag of days) {
		woche.push(tag);
		if (woche.length === 7) {
			weeks.push(woche);
			woche = [];
		}
	}
	if (woche.length > 0) {
		while (woche.length < 7) woche.push(null);
		weeks.push(woche);
	}
	return weeks;
}
