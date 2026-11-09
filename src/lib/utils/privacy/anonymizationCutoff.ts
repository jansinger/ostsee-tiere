/**
 * @fileoverview Wann eine Meldung anonymisiert wird.
 *
 * Vorwärts vom Eingang gerechnet: `created + 3 Monate − 1 Tag`. Eine rückwärts
 * gerechnete Grenze (`created < now − 3 Monate`) ließe an Monatsenden Meldungen
 * liegen (docs/ANONYMISIERUNG_KONZEPT.md, 5.1).
 *
 * Bildet die SQL-Rechnung des Jobs nach (`anonymizeSightings.ts`):
 * PostgreSQL addiert die Monate und kappt den Tag auf das Monatsende, erst
 * danach wird der Tag abgezogen. Gerechnet wird in UTC, weil `created` ein
 * `timestamp` ohne Zone in UTC ist — Zeitumstellungen spielen keine Rolle.
 *
 * Maßgeblich für den Job bleibt das SQL; diese Funktion dient der Anzeige
 * (Fristhinweis, Vorschau).
 */
import { ANONYMIZE_AFTER_MONTHS } from '#lib/constants/reporterDataRetention.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Zeitpunkt, ab dem eine am `created` eingegangene Meldung fällig ist. */
export function anonymizationDueAt(created: Date): Date {
	const monthIndex = created.getUTCMonth() + ANONYMIZE_AFTER_MONTHS;
	const year = created.getUTCFullYear() + Math.floor(monthIndex / 12);
	const month = monthIndex % 12;
	// Tag 0 des Folgemonats = letzter Tag des Zielmonats
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const shifted = Date.UTC(
		year,
		month,
		Math.min(created.getUTCDate(), lastDay),
		created.getUTCHours(),
		created.getUTCMinutes(),
		created.getUTCSeconds(),
		created.getUTCMilliseconds()
	);
	return new Date(shifted - DAY_MS);
}

export function isAnonymizationDue(created: Date, now: Date): boolean {
	return anonymizationDueAt(created).getTime() <= now.getTime();
}
