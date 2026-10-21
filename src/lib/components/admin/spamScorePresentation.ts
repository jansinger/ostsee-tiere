/**
 * @fileoverview Risikostufe eines Spam-Scores — Wort, Farbe, Icon, Schwelle.
 *
 * Eine Quelle für die vier Anzeigestellen (Eingangskarte, Spam-Spalte der
 * Tabelle, Spam-Check-Modal, Inline-Karte der Detailansicht), nach dem Vorbild
 * von `SIGHTING_STATUS_PRESENTATION` und `DEAD_FINDING_PRESENTATION`.
 *
 * Vorher lagen dort **drei** Schwellensätze: Eingang und Tabelle färbten ab 5
 * rot und ab 2 gelb, das Modal ab `isHighRisk` rot / ab 2 gelb / sonst **grün**,
 * die Detailansicht ab `isHighRisk` rot / ab **1** gelb / sonst grün. Score 1
 * war damit grau in der Liste, grün im Modal und gelb in der Detailansicht —
 * derselbe Datensatz, drei Aussagen.
 *
 * **`null` ist nicht `0`.** `spam_score IS NULL` heißt „nie bewertet"
 * (Altbestand, Legacy-Eingang), `0` heißt „bewertet, unauffällig"
 * (`docs/SPAM_DETECTION.md`). Deshalb hat `unrated` bewusst **kein** Badge: Ein
 * graues „Spam: –" in der Eingangskarte las sich wie ein Prüfergebnis, war aber
 * die Abwesenheit einer Prüfung.
 *
 * **Farbe trägt die Bedeutung nicht allein** (WCAG 1.4.1) — jede bewertete
 * Stufe hat zusätzlich ein eigenes Icon. An allen vier Stellen fehlte das.
 *
 * Client-sicher: nur Typen und Konstanten aus `#lib/types/spam.js`, kein Import
 * aus `#lib/server/**` (der Bruch fiele erst in `npm run build` auf).
 */
import {
	HIGH_RISK_THRESHOLD,
	type SpamCheckResponse,
	type SpamCheckResult
} from '#lib/types/spam.ts';

export type SpamRisk = 'unrated' | 'clean' | 'suspicious' | 'high';

/**
 * Ab diesem Score wird eine Meldung als auffällig ausgezeichnet.
 *
 * Anders als `HIGH_RISK_THRESHOLD` ist das **keine** Server-Semantik: Der
 * Detektor kennt nur „Hochrisiko ja/nein". Die Zwischenstufe existiert allein
 * für die Triage-Oberfläche und gehört deshalb hierher und nicht nach
 * `#lib/types/spam.js`. Der Wert 2 entspricht genau einem ausgelösten Indikator
 * mittleren Gewichts (Keyword, Großbuchstaben, `noreply@`, Duplikat).
 */
export const SPAM_SUSPICIOUS_THRESHOLD = 2;

/**
 * Risikostufe aus dem rohen Score — für die Listenansichten, denen nur die
 * persistierte Spalte `spam_score` vorliegt.
 *
 * `undefined` wird wie `null` behandelt: Die Spalte ist in manchen
 * Teilauswahlen optional typisiert, und „Feld nicht dabei" ist genauso wenig
 * ein Prüfergebnis wie „nie bewertet".
 */
export function getSpamRisk(score: number | null | undefined): SpamRisk {
	if (score == null) return 'unrated';
	if (score >= HIGH_RISK_THRESHOLD) return 'high';
	if (score >= SPAM_SUSPICIOUS_THRESHOLD) return 'suspicious';
	return 'clean';
}

/**
 * Risikostufe aus einem frischen Prüfergebnis — für Modal und Detailansicht,
 * die `GET /api/sightings/[id]/spam-check` aufrufen.
 *
 * **Warum nicht einfach `getSpamRisk(result.score)`:** `isHighRisk` und
 * `score >= HIGH_RISK_THRESHOLD` sind nicht dasselbe. Für eine geglückte
 * Prüfung stimmen sie überein (`spamDetector.ts` rechnet sie genau so aus) —
 * der **Fail-Safe-Zweig** liefert dagegen Score 0 mit `isHighRisk: true`, damit
 * eine gescheiterte Prüfung nicht als „kein Spam" durchgeht.
 *
 * Wörtlich genommen ergäbe das „Hochrisiko" ohne einen einzigen Indikator. Für
 * die Anzeige ist der ehrliche Zustand derselbe wie bei `NULL` in der
 * Datenbank: Es wurde nichts bewertet. Aus demselben Grund persistiert
 * `saveSighting` ein `failed`-Ergebnis gar nicht erst
 * (`docs/SPAM_DETECTION.md`, Abschnitt „Persistenz").
 */
export function getSpamRiskFromResult(result: SpamCheckResult): SpamRisk {
	if (result.failed) return 'unrated';
	if (result.isHighRisk) return 'high';
	return getSpamRisk(result.score);
}

/**
 * Verhältnis der Neuberechnung zum persistierten Erstbefund.
 *
 * `incomparable` deckt zwei Fälle ab, die sich hier gleich verhalten: Es gibt
 * keinen Erstbefund (`stored === null`, Altbestand), oder die Neuberechnung ist
 * gar nicht durchgelaufen (`failed`). Beide Male fehlt eine der zwei Seiten —
 * eine Differenz zu bilden hieße, mit einer Null zu rechnen, die keine ist.
 */
export type SpamDrift = 'incomparable' | 'unchanged' | 'lower' | 'higher';

export function getSpamDrift(response: SpamCheckResponse): SpamDrift {
	const { stored, recomputed } = response;
	if (stored == null || recomputed.failed) return 'incomparable';
	if (recomputed.score === stored.score) return 'unchanged';
	return recomputed.score < stored.score ? 'lower' : 'higher';
}

/**
 * Der Satz, der die Abweichung erklärt — `null`, wo es nichts zu erklären gibt.
 *
 * Ohne diesen Text war die Gegenüberstellung nur eine zweite Zahl: Die
 * Oberfläche zeigte „Spam 2" und „0" nebeneinander, und wer die Herkunft der
 * Indikatoren nicht kennt, liest darin einen Defekt.
 */
export const SPAM_DRIFT_PRESENTATION: Record<SpamDrift, { note: string | null }> = {
	incomparable: { note: null },
	unchanged: { note: null },
	lower: {
		note:
			'Niedriger als beim Eingang — das ist der Normalfall: Formular-Token, Absendedauer ' +
			'und Duplikat-Signale gibt es nur im Moment des Absendens und lassen sich nicht ' +
			'nachträglich rekonstruieren. Maßgeblich für die Triage bleibt der Erstbefund.'
	},
	higher: {
		note:
			'Höher als beim Eingang — die Bewertung stützt sich also auf etwas, das beim ' +
			'Absenden noch nicht galt: bearbeitete Angaben oder eine E-Mail-Domain, die ' +
			'inzwischen keine Mails mehr annimmt.'
	}
};

interface SpamRiskBase {
	label: string;
	/** Was die Stufe bedeutet — als `title`/Tooltip und für Screenreader. */
	description: string;
}

/**
 * Badge-Klasse und Icon treten immer gemeinsam auf — deshalb eine Union und
 * nicht zweimal `| null`. Ein `{#if presentation.badgeClass}` an der
 * Aufrufstelle verengt damit auch `icon` auf `string`; sonst bräuchte jede der
 * vier Stellen ein `?? ''`, das nur den Typprüfer beruhigt.
 */
export type SpamRiskPresentation = SpamRiskBase &
	(
		| {
				/**
				 * **Kein Badge.** Für „nie bewertet" gibt es nichts anzuzeigen, und
				 * ein graues Badge wäre eine Aussage über eine Prüfung, die nie
				 * stattgefunden hat.
				 */
				badgeClass: null;
				icon: null;
		  }
		| {
				/** Flächenfarbe — ohne `-strong`-Suffix (`.claude/rules/design-system.md`). */
				badgeClass: string;
				/**
				 * Icon-Name für `#lib/components/Icon.svelte` — die zweite,
				 * farbunabhängige Unterscheidung (WCAG 1.4.1).
				 */
				icon: string;
		  }
	);

export const SPAM_RISK_PRESENTATION: Record<SpamRisk, SpamRiskPresentation> = {
	unrated: {
		label: 'Nicht bewertet',
		badgeClass: null,
		icon: null,
		description: 'Nie auf Spam geprüft — Altbestand, Legacy-Eingang oder fehlgeschlagene Prüfung'
	},
	clean: {
		/* `badge-ghost` und nicht `badge-success`: Der Score ist eine
		   Triage-Hilfe, kein Freigabe-Urteil (`docs/SPAM_DETECTION.md`). Ein
		   grünes Badge in jeder zweiten Tabellenzeile behauptete „geprüft und in
		   Ordnung" — geprüft wird die Meldung erst vom Menschen. */
		label: 'Unauffällig',
		badgeClass: 'badge-ghost',
		icon: 'lucide:shield-check',
		description: 'Bewertet, keine nennenswerten Auffälligkeiten'
	},
	suspicious: {
		label: 'Auffällig',
		badgeClass: 'badge-warning',
		icon: 'lucide:shield-alert',
		description: 'Bewertet, einzelne Spam-Merkmale — vor der Freigabe ansehen'
	},
	high: {
		label: 'Hochrisiko',
		badgeClass: 'badge-error',
		icon: 'lucide:shield-x',
		description: 'Bewertet, deutliche Spam-Merkmale — höchstwahrscheinlich keine echte Meldung'
	}
};
