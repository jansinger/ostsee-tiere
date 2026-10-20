/**
 * @fileoverview Stufe der Melder-Historie — Wort, Farbe, Icon, Schwellen.
 *
 * Eine Quelle für beide Anzeigestellen (Eingangskarte, Kontakt-Karte der
 * Detailansicht), nach dem Vorbild von `SPAM_RISK_PRESENTATION` und
 * `SIGHTING_STATUS_PRESENTATION`.
 *
 * **Die Historie ist kein zweiter Spam-Score.** Sie senkt keinen Score, ändert
 * keine Sichtbarkeit und trifft keine Entscheidung — sie sagt nur, was über
 * diese Adresse schon bekannt ist. Die E-Mail ist nicht verifiziert; wer sie
 * kennt, kann sie eintragen. Deshalb ausschließlich Anzeige (Abgrenzung und
 * Messwerte in `docs/SPAM_DETECTION.md`).
 *
 * Client-sicher: nur der Typ aus `#lib/types/reporterHistory.js`, kein Import aus
 * `#lib/server/**`.
 */
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';

export type ReporterLevel = 'first' | 'pending' | 'new' | 'known' | 'established' | 'flagged';

/** Ab so vielen Freigaben gilt ein Melder als bekannt (Entscheidung Jan, 2026-08-10). */
export const REPORTER_KNOWN_THRESHOLD = 3;

/** Ab so vielen Freigaben als etabliert (Entscheidung Jan, 2026-08-10). */
export const REPORTER_ESTABLISHED_THRESHOLD = 10;

/**
 * Ab diesem Verhältnis von Ablehnungen zu bearbeiteten Meldungen wird gewarnt.
 *
 * Verhältnis und nicht Vorkommen: Eine einzelne Ablehnung unter 29 Freigaben
 * ist ein Fehlgriff, kein Muster — ein dauerhaftes Warn-Badge dafür wäre
 * schlicht falsch. Offene Meldungen gehen nicht in den Nenner ein: Die
 * Ablehnung existiert erst seit 2026-08, unbearbeitete Altmeldungen sind
 * Bearbeitungsstau und kein Qualitätsurteil.
 *
 * Bezugsgröße sind die bearbeiteten Meldungen (Freigaben + Ablehnungen), nicht
 * allein die Freigaben: Bei zwei Freigaben und einer Ablehnung greift die
 * Warnung genau an der Drittel-Schwelle (1 Ablehnung auf 3 bearbeitete
 * Meldungen). `rejected > 0` ist Vorbedingung, damit ein Melder ohne jede
 * bearbeitete Meldung nicht durch eine Division durch 0 fälschlich als
 * `flagged` gilt.
 */
export const REPORTER_FLAGGED_RATIO = 1 / 3;

/**
 * Die Stufe aus den Zahlen — `null`, wo es keine Zahlen gibt.
 *
 * `null` heißt „nicht ermittelt" (Abfrage fehlgeschlagen, keine Adresse) und
 * bekommt bewusst **kein** Badge. Ein graues „Melder: –" läse sich wie ein
 * Befund und wäre die Abwesenheit eines Befunds — dieselbe Unterscheidung wie
 * bei `spam_score IS NULL`.
 */
export function getReporterLevel(
	history: ReporterHistory | null | undefined
): ReporterLevel | null {
	if (!history) return null;

	const { approved, rejected, open } = history;

	if (rejected > 0 && rejected / (approved + rejected) >= REPORTER_FLAGGED_RATIO) return 'flagged';
	if (approved >= REPORTER_ESTABLISHED_THRESHOLD) return 'established';
	if (approved >= REPORTER_KNOWN_THRESHOLD) return 'known';
	if (approved > 0) return 'new';
	if (open > 0) return 'pending';
	return 'first';
}

export interface ReporterLevelPresentation {
	/**
	 * Flächenfarbe — ohne `-strong`-Suffix (`.claude/rules/design-system.md`).
	 *
	 * **`established` trägt seit dem 2026-08-10 `badge-success`** (Entscheidung
	 * Jan). Davor waren `new`, `known` und `established` alle `badge-ghost` und
	 * damit ununterscheidbar; ein Zwischenschritt mit Tönungen
	 * (`bg-primary/10` und `/20`) war im Betrieb nachweislich nicht zu erkennen
	 * und wurde wieder entfernt — was unsichtbar ist, gehört nicht in den Code.
	 *
	 * Zwei Einwände standen dagegen und sind bewusst überstimmt worden:
	 * Grün trifft rund die Hälfte der offenen Karten (300 von 659 am
	 * 2026-08-10, weil es im Bestand nur 5 Ablehnungen gibt), und
	 * `badge-success` ist zugleich der Sichtungsstatus „Freigegeben"
	 * (`sightingStatus.ts`) — in Tabelle und Detailansicht stehen damit zwei
	 * Grüns nebeneinander, die Verschiedenes meinen. Wer das zurückdreht,
	 * sollte diese zwei Punkte kennen und nicht neu entdecken.
	 *
	 * Kontrast ist **kein** Einwand: `--color-success` mit weißem Text misst
	 * 4,56:1 (`daisyui.md`). Die dortige Warnung gilt weiter — die Lightness
	 * dieser Fläche darf nicht erhöht werden, sonst fällt jedes
	 * `badge-success` im Projekt unter AA.
	 */
	badgeClass: string;
	/** Icon-Name für `#lib/components/Icon.svelte` — die farbunabhängige Unterscheidung. */
	icon: string;
	/** Was die Stufe bedeutet — als `title` und für Screenreader. */
	description: string;
}

export const REPORTER_LEVEL_PRESENTATION: Record<ReporterLevel, ReporterLevelPresentation> = {
	first: {
		badgeClass: 'badge-neutral',
		icon: 'lucide:user-plus',
		description: 'Erste Meldung dieser E-Mail-Adresse — keine Vorgeschichte im Bestand'
	},
	pending: {
		badgeClass: 'badge-ghost',
		icon: 'lucide:users',
		description: 'Weitere Meldungen dieser Adresse sind selbst noch unbearbeitet'
	},
	new: {
		badgeClass: 'badge-soft badge-success',
		icon: 'lucide:user-check',
		description: 'Einzelne frühere Meldungen dieser Adresse wurden freigegeben'
	},
	known: {
		badgeClass: 'badge-soft badge-success',
		icon: 'lucide:user-check',
		description: 'Mehrere frühere Meldungen dieser Adresse wurden freigegeben'
	},
	established: {
		badgeClass: 'badge-success',
		/* Nicht „langjährig": Die Stufe zählt Freigaben, nicht Dauer — zehn
		   Meldungen können aus einer Woche stammen. Wie lange die Adresse meldet,
		   sagt `since` in der Detailansicht, und zwar getrennt davon. */
		icon: 'lucide:user-check',
		description: 'Viele frühere Meldungen dieser Adresse wurden freigegeben'
	},
	flagged: {
		badgeClass: 'badge-warning',
		icon: 'lucide:user-x',
		description: 'Ein erheblicher Teil der bearbeiteten Meldungen dieser Adresse wurde abgelehnt'
	}
};

/**
 * Der Badge-Text — jede Stufe nennt die Zahl, auf die es ankommt.
 *
 * Eine Zahl statt eines Urteils: „23 freigegeben" ist überprüfbar, „hohe
 * Reputation" ist eine Behauptung.
 */
export function reporterBadgeText(level: ReporterLevel, history: ReporterHistory): string {
	if (level === 'first') return 'Erstmeldung';
	if (level === 'pending') return `Melder: ${history.open} offen`;
	if (level === 'flagged') {
		return `Melder: ${history.rejected} von ${history.approved + history.rejected} abgelehnt`;
	}
	return `Melder: ${history.approved} freigegeben`;
}
