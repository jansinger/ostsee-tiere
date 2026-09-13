/**
 * Fassungen der übrigen Einwilligungstexte des Sichtungsformulars.
 *
 * Art. 7 Abs. 1 DSGVO verlangt, dass sich eine Einwilligung nachweisen lässt.
 * Ein gespeichertes „ja“ allein belegt weder **wann** noch **wozu** zugestimmt
 * wurde — deshalb wandern diese Kennungen zusammen mit dem Zeitpunkt in die
 * Sichtung (siehe `mapFormToSighting`).
 *
 * Die Medien-Einwilligung führt denselben Nachweis seit dem 2026-07-28, hat aber
 * einen eigenen Lebenszyklus und bleibt deshalb in `mediaConsentVersion.ts`.
 *
 * **Regel:** Wird der Wortlaut einer Einwilligung inhaltlich geändert, muss die
 * zugehörige Kennung auf das Datum der Änderung gesetzt werden. Altbestände
 * behalten dadurch die Fassung, der sie tatsächlich zugestimmt haben. Gemeint
 * ist die **gelesene Fläche** — Überschrift und umgebender Text im Markup
 * genauso wie der Ankreuztext in `sightingSchema.ts`.
 * `consentSurfaces.svelte.test.ts` erzwingt das über gepinnte Hashes der
 * gerenderten Flächen — ein Kommentar allein trägt diese Zusicherung nicht.
 *
 * Die Datumswerte stammen aus der Historie des Wortlauts, nicht aus dem Tag der
 * Einführung dieser Spalten: `privacyConsent` wurde zuletzt mit der
 * Medien-Einwilligung überarbeitet (6ec70dc4, 2026-07-28), `nameConsent` und
 * `shipNameConsent` zuletzt mit der Einstiegsseiten-Einführung (2026-08-06,
 * siehe unten).
 */

/**
 * Fassung des Textes zu `nameConsent` (Veröffentlichung von Vor- und Nachname).
 *
 * Auf 2026-09-13 gehoben (Änderungswunsch der Datenschutzbeauftragten des DMM,
 * E-Mail 2026-09-02), am selben Tag noch einmal nachgeschärft: Der Ankreuztext
 * wurde zunächst wörtlich wie von der DMM vorgegeben auf „…öffentlich auf der
 * Karte angezeigt werden darf." verengt. Das PR-Review (Copilot, #921) fand
 * dabei einen echten Widerspruch — die Legacy-Endpunkte
 * `GET /sichtungen/showreports.json` und `GET /rest_sichtungen` liefern `na`
 * unauthentifiziert, gesteuert über dasselbe Flag, und `rest_sichtungen`
 * versorgt außerdem die Kartenansicht der bestehenden iOS/Android-Apps (siehe
 * `docs/LEGACY_API_SPECIFICATION.md`). Die verengte Zusage „nur auf der
 * Karte der Website" war damit unrichtig, nicht nur unvollständig. Endgültiger
 * Wortlaut deshalb: „…öffentlich auf der Sichtungskarte angezeigt werden
 * darf — sowohl auf der Website ostsee-tiere.de als auch in der zugehörigen
 * App." Die Gruppen-Überschrift folgt derselben Korrektur
 * („…auf der Sichtungskarte (Website und App)"); „und Aufnahmen" bleibt
 * weiterhin bewusst stehen (Review-Befund 1, Task 14,
 * `Step4Contact.svelte.test.ts`). Dem DMM zur Bestätigung vorgelegt. Vorherige
 * Hebung: 2026-08-06 (gemeinsame Überschrift mit
 * `shipNameConsent`/`mediaConsent` eingeführt).
 */
export const NAME_CONSENT_VERSION = '2026-09-13';

/**
 * Fassung des Textes zu `shipNameConsent` (Veröffentlichung des Schiffsnamens).
 *
 * Auf 2026-09-13 gehoben und am selben Tag nachgeschärft — dieselbe
 * Korrektur wie bei `NAME_CONSENT_VERSION` oben (Änderungswunsch DMM,
 * E-Mail 2026-09-02, nachgeschärft nach PR-Review #921: der Schiffsname
 * erscheint über dasselbe Legacy-API-Flag ebenfalls in
 * `showreports.json`/`rest_sichtungen` und der App-Kartenansicht). Vorherige
 * Hebung: 2026-08-06.
 */
export const SHIP_NAME_CONSENT_VERSION = '2026-09-13';

/**
 * Fassung des Textes zu `privacyConsent` (Pflicht-Einwilligung der Meldung).
 *
 * Auf 2026-09-13 gehoben (Änderungswunsch der Datenschutzbeauftragten des DMM,
 * E-Mail 2026-09-02): Der erste Satz in `RequiredConsent.svelte` wurde ersetzt
 * durch „Damit Ihre Meldung für die Forschung des Deutschen Meeresmuseums
 * gespeichert und genutzt werden kann, benötigen wir Ihre Zustimmung."
 * Vorherige Hebung: 2026-08-04.
 */
export const PRIVACY_CONSENT_VERSION = '2026-09-13';
