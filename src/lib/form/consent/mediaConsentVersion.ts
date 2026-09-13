/**
 * Fassung des Einwilligungstextes zur Veröffentlichung von Aufnahmen.
 *
 * Art. 7 Abs. 1 DSGVO verlangt, dass sich eine Einwilligung nachweisen lässt.
 * Ein gespeichertes „ja“ allein belegt nicht, **wozu** zugestimmt wurde —
 * deshalb wandert diese Kennung zusammen mit dem Zeitpunkt in die Sichtung.
 *
 * **Regel:** Wird der Wortlaut von `mediaConsent` inhaltlich geändert, muss
 * diese Kennung auf das Datum der Änderung gesetzt werden. Altbestände behalten
 * dadurch die Fassung, der sie tatsächlich zugestimmt haben. Gemeint ist die
 * **gelesene Fläche** — Überschrift und umgebender Text im Markup genauso wie
 * der Ankreuztext in `sightingSchema.ts`; gepinnt in
 * `consentSurfaces.svelte.test.ts`.
 *
 * Auf 2026-08-06 gehoben, obwohl der **Ankreuztext** (`meta.helpText`)
 * unverändert ist: `mediaConsent` ist seit dem 2026-08-05 von der Dropzone
 * auf Schritt 2 (`sections/Media.svelte`) in die gemeinsame
 * Einwilligungsgruppe auf Schritt 4 gezogen (`Step4Contact.svelte`) — neue
 * Überschrift „Optionale Veröffentlichung von Namen und Aufnahmen", neuer
 * Umgebungstext, und das Feld erscheint dort seit Task 15 nur noch, solange
 * `$form.uploadedFiles` tatsächlich eine abgeschlossene Aufnahme enthält
 * (`hasUploadedMedia`). Der Geltungsbereich der Kennung ist die gelesene
 * Einwilligungsfläche, nicht die Zeichenkette im Schema — wie bei
 * `PRIVACY_CONSENT_VERSION` in `consentVersions.ts`. Seit dem 2026-08-06 ist
 * genau das gepinnt (`consentSurfaces.svelte.test.ts`); zur Zeit dieses Umzugs
 * war es nur ein Kommentar, und die Kennung fiel deshalb erst einem Review auf.
 *
 * **Am selben Tag ein zweites Mal geändert** (UX-Review, Punkt 2): Über dem
 * Ankreuzfeld stehen seither die hochgeladenen Aufnahmen namentlich („Ihre 2
 * hochgeladenen Aufnahmen: …", `Step4Contact.svelte`) — bis dahin musste der
 * Melder zwei Schritte nach dem Upload aus dem Gedächtnis wissen, worüber er
 * entscheidet. Die Kennung bleibt `2026-08-06`, weil beide Änderungen an
 * dieselbe Fassung gehen; wäre die vorherige an einem früheren Tag gewesen,
 * müsste hier gehoben werden.
 *
 * Die Aufzählung selbst steht bewusst NICHT im Flächen-Hash
 * (`data-consent-surface-exclude`, Begründung im Markup): Anzahl und
 * Dateinamen sind Nutzerdaten, kein Wortlaut, dem jemand zustimmt. Der Satz,
 * der sie einleitet, ändert sich mit ihnen — im Hash stünde damit die Fixture
 * der Testdatei.
 *
 * Auf 2026-09-13 gehoben, obwohl `mediaConsent` selbst inhaltlich unverändert
 * ist: Die gemeinsame Gruppen-Überschrift wurde auf Wunsch der
 * Datenschutzbeauftragten des DMM (E-Mail 2026-09-02) geändert und der
 * Einleitungssatz der Gruppe um das Leerzeichen vor dem Punkt bereinigt
 * („optional ." → „optional."). Am selben Tag noch einmal nachgeschärft
 * (PR-Review #921, siehe `NAME_CONSENT_VERSION` in `consentVersions.ts` für
 * die Begründung): endgültiger Wortlaut „Optionale Veröffentlichung von Namen
 * und Aufnahmen auf der Sichtungskarte (Website und App)". Die Überschrift
 * gehört zur gelesenen Fläche von `mediaConsent` genauso wie zu
 * `nameConsent`/`shipNameConsent`.
 */
export const MEDIA_CONSENT_VERSION = '2026-09-13';
