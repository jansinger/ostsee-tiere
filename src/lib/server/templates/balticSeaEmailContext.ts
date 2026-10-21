/**
 * balticSeaEmailContext.ts — Ostsee-Status für die Handlebars-Vorlagen
 *
 * **Warum diese Datei existiert:** Handlebars kann keine TypeScript-Funktion
 * aufrufen. Ohne einen vorberechneten Wert im Kontext baut jede Vorlage die
 * Flag-Logik selbst nach — genau so ist die Benachrichtigungs-Mail von der
 * Admin-Übersicht abgewichen: sie verzweigte über `inBalticSeaGeo`, also über
 * die grobe Bounding Box, und zeigte einer Meldung aus dem Hamburger Hafen ein
 * grünes „Ostsee ✓" (Fehler 4 in `docs/OSTSEE_FLAGS.md`).
 *
 * Der Status kommt deshalb aus `getBalticSeaStatus()` — derselben Funktion, die
 * die Admin-Übersicht und die Detailansicht benutzen — und Label wie Fließtext
 * unverändert aus `BALTIC_SEA_STATUS_PRESENTATION`. Die Vorlage verzweigt danach
 * nur noch über **einen** Wert.
 *
 * Die Farben sind das Einzige, was hier neu entsteht: E-Mail-Clients kennen
 * weder `oklch()` noch die DaisyUI-Klassen der Admin-Seite (`badge-info`,
 * `badge-ghost`, …), sie brauchen inline gesetztes sRGB-Hex. Dieselbe Begründung
 * wie in `emailTokens.ts`, aus dem die Werte kommen.
 */
import {
	BALTIC_SEA_STATUS_PRESENTATION,
	getBalticSeaStatus,
	type BalticSeaFlags,
	type BalticSeaStatus
} from '#lib/utils/geo/balticSeaStatus.ts';
import { EMAIL_COLORS } from './emailTokens';

/**
 * Statusfarben der Mail. Der `Record`-Typ erzwingt Vollständigkeit: ein neuer
 * Zustand in `BalticSeaStatus` bricht hier die Typprüfung, statt in der Mail
 * still ohne Farbe zu erscheinen.
 *
 * **Nicht mit `BALTIC_SEA_STATUS_PRESENTATION` zusammenlegen**, auch wenn beide
 * Records denselben Schlüssel haben und die Doppelung nach Aufräumbedarf
 * aussieht: `balticSeaStatus.ts` wird von `routes/admin/sichtungen/+page.svelte` importiert
 * und landet damit im Client-Bundle. Ein gemeinsamer Record zöge `EMAIL_COLORS`
 * dorthin mit — eine Palette, die im Browser niemand braucht.
 *
 * `surface` ist Fläche, `strong` Text-/Rahmenfarbe — dieselbe Rollenteilung wie
 * im Theme. Auf der Tint-Fläche steht der Text in `EMAIL_COLORS.text`, nicht in
 * der Statusfarbe (`.claude/rules/design-system.md`).
 */
export const BALTIC_SEA_STATUS_EMAIL_COLORS: Record<
	BalticSeaStatus,
	{ surface: string; strong: string }
> = {
	// Kein Grün: „in der Ostsee" ist die Erwartung, kein Erfolg. Info-Blau ist
	// hier dieselbe Wahl wie `badge-info` in der Übersicht.
	baltic: { surface: EMAIL_COLORS.infoSurface, strong: EMAIL_COLORS.infoStrong },
	edge: { surface: EMAIL_COLORS.warningSurface, strong: EMAIL_COLORS.warningStrong },
	outside: { surface: EMAIL_COLORS.errorSurface, strong: EMAIL_COLORS.errorStrong },
	// „ohne Position" ist kein Fehler der Meldung, sondern eine fehlende Angabe —
	// deshalb neutrale Fläche statt Alarmfarbe.
	noPosition: { surface: EMAIL_COLORS.page, strong: EMAIL_COLORS.textMuted }
};

/** Was die Vorlage unter `sighting.balticSea` vorfindet. */
export type BalticSeaEmailContext = {
	status: BalticSeaStatus;
	/** Wortgleich mit dem Badge der Admin-Übersicht. */
	label: string;
	/** Erklärungstext, wortgleich mit dem Tooltip der Admin-Übersicht. */
	title: string;
	surface: string;
	strong: string;
	/**
	 * Alles außer `baltic` gehört dem Prüfenden aufgefallen. Als fertiger
	 * Wahrheitswert, weil Handlebars ohne eigenen Helper nicht auf Gleichheit
	 * prüfen kann — `{{#if sighting.balticSea.needsAttention}}` bleibt damit
	 * eine einzige Verzweigung.
	 */
	needsAttention: boolean;
};

/**
 * Baut den Ostsee-Teil des Template-Kontexts. Erwartet die **Rohwerte** der
 * Zeile (`ostsee`, `ostsee_geo`, `gps_breite`, `gps_laenge`), damit der
 * Altsystem-Wert `2` und fehlende Koordinaten erhalten bleiben — ein `!!` davor
 * würde `noPosition` unerreichbar machen.
 */
export function balticSeaEmailContext(flags: BalticSeaFlags): BalticSeaEmailContext {
	const status = getBalticSeaStatus(flags);
	const { label, title } = BALTIC_SEA_STATUS_PRESENTATION[status];
	const { surface, strong } = BALTIC_SEA_STATUS_EMAIL_COLORS[status];

	return { status, label, title, surface, strong, needsAttention: status !== 'baltic' };
}
