/**
 * Kontext, der nur zum Meldezeitpunkt existiert (Zeit-Token aus dem Formular).
 * Nachträgliche Prüfungen (Admin-Modal, E-Mail-Versand) haben ihn nicht —
 * der persistierte Score zum Meldezeitpunkt kann deshalb höher liegen.
 */
export interface SpamSubmissionContext {
	tokenStatus: 'valid' | 'missing' | 'invalid';
	ageSeconds?: number | undefined;
}

/**
 * Ab diesem Score gilt eine Meldung als Hochrisiko. Auch der E-Mail-Versand
 * rekonstruiert `isHighRisk` aus dem persistierten Score über diese Konstante —
 * die Schwelle existiert genau einmal. Sie liegt hier (und nicht im Detektor),
 * damit Verbraucher sie importieren können, ohne dass Test-Mocks des Detektors
 * sie verschlucken.
 */
export const HIGH_RISK_THRESHOLD = 5;

export interface SpamCheckResult {
	score: number;
	isHighRisk: boolean;
	indicators: string[];
	/**
	 * Die Prüfung selbst ist fehlgeschlagen (Fail-Safe-Zweig). Ein solches
	 * Ergebnis darf NICHT als spamScore persistiert werden — score 0 läse
	 * sich in der DB als „geprüft, sauber", das Gegenteil der Aussage.
	 */
	failed?: true | undefined;
}

/**
 * Der zum Meldezeitpunkt persistierte Befund (`spam_score`/`spam_indicators`).
 * Kein `isHighRisk`: Das ist kein gespeichertes Feld, sondern wird überall aus
 * `HIGH_RISK_THRESHOLD` rekonstruiert — eine zweite, mitgelieferte Fassung
 * derselben Aussage könnte davon abweichen.
 */
export interface SpamStoredFinding {
	score: number;
	indicators: string[];
}

/**
 * Liest die Spalte `spam_indicators` als das, was sie zusagt: eine Liste von
 * Strings.
 *
 * Die Spalte ist untypisiertes `jsonb`. Ein bloßes
 * `Array.isArray(v) ? (v as string[]) : []` prüft nur den **Container** — ein
 * Array mit Zahlen oder Objekten kommt unverändert durch, und die API bricht
 * damit ihr eigenes Schema (`items: { type: string }`), ohne dass irgendwo
 * etwas auffällt. Der Cast ist eine Behauptung, die niemand nachprüft; dieser
 * Helfer macht die Zusage stattdessen wahr.
 *
 * **Er sagt nichts über den Score.** Der steht in einer eigenen Spalte und
 * bleibt auch dann gültig, wenn die Indikatorliste unbrauchbar ist — eine
 * leere Liste heißt hier „keine lesbaren Indikatoren", nicht „Score 0".
 *
 * Heute schreibt ausschließlich eigener Code in die Spalte
 * (`saveSighting`, `rescoreSightings`), beide aus `SpamCheckResult.indicators`.
 * Der Fall ist damit nicht erreichbar — nachweisen lässt sich das beim Lesen
 * aber nicht, und die Datenbank teilt sich die App mit dem Altsystem.
 */
export function toStoredIndicators(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((eintrag): eintrag is string => typeof eintrag === 'string')
		: [];
}

/**
 * Antwort von `GET /api/sightings/[id]/spam-check` — **zwei** Befunde, bewusst
 * nebeneinander statt einer Zahl.
 *
 * Vier Indikatoren wiegen je 2 Punkte und existieren nur im Moment des
 * Absendens: Formular-Token fehlt/ungültig, verdächtig schnell abgeschickt und
 * die beiden Duplikat-Signale. Ihre Eingangsdaten (Token, Absendedauer,
 * 24-Stunden- bzw. 7-Tage-Fenster) stehen nirgends in der Zeile, also kann
 * `recomputed` sie nicht rekonstruieren und liegt entsprechend tiefer.
 *
 * Bis 2026-08 lieferte der Endpunkt nur die Neuberechnung. Damit zeigte die
 * Tabelle „Spam 2" und der Check daneben „0" — beide Zahlen richtig, der
 * Widerspruch unerklärlich, weil der Vergleichswert fehlte.
 */
export interface SpamCheckResponse {
	/** `null` heißt „nie bewertet" (Altbestand, Legacy-Eingang) — nicht `0`. */
	stored: SpamStoredFinding | null;
	/** Frischer Lauf über den aktuellen Datensatz, ohne Meldezeitpunkt-Signale. */
	recomputed: SpamCheckResult;
	/**
	 * Die Meldung ist anonymisiert: Die Neuberechnung lief ohne Name und
	 * E-Mail und fällt deshalb zu mild aus. `stored` ist davon nicht betroffen.
	 */
	anonymized: boolean;
}

/**
 * Minimal input type for spam detection.
 * Accepts only the fields actually used by detectSpamIndicators,
 * so callers don't need to pass a full SightingFormValues.
 *
 * Note: `| undefined` is required (not redundant) because this project uses
 * `exactOptionalPropertyTypes: true`. Without it, callers passing Yup's `Maybe<T>`
 * values (which include explicit `undefined`) would fail type-checking.
 */
export interface SpamDetectionInput {
	notes?: string | null | undefined;
	firstName?: string | null | undefined;
	lastName?: string | null | undefined;
	email?: string | null | undefined;
	waterway?: string | null | undefined;
	seaMark?: string | null | undefined;
	species?: number | null | undefined;
	latitude?: number | null | undefined;
	longitude?: number | null | undefined;
	/**
	 * DB-Spalte `ostsee_geo` (Bounding-Box-Prüfung): 0 = außerhalb des
	 * Kartenbereichs, >0 = drin (2 = Altbestand). Der Detektor rechnet die
	 * Geografie nicht selbst — der Wert kommt aus derselben Quelle, die auch
	 * die Spalte füllt (mapFormToSighting bzw. die gespeicherte Zeile).
	 */
	inBalticSeaGeo?: number | null | undefined;
	/** Vom Aufrufer gezählte Duplikat-Signale (countRecentDuplicateSignals). */
	recentDuplicates?: { sameEmail: number; sameNotes: number } | undefined;
	submission?: SpamSubmissionContext | undefined;
}
