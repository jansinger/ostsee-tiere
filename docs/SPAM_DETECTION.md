# Spam-Erkennung für Sichtungsmeldungen

Die Spam-Erkennung ist eine **Triage-Hilfe, kein Türsteher**. Jede Meldung wird
gespeichert; der Score priorisiert nur die Reihenfolge, in der Admins prüfen.
Das ist bewusst so: Jede Sichtung wird ohnehin manuell freigegeben, bevor sie
öffentlich wird — Spam erreicht die Öffentlichkeit also nie, er kostet nur
Prüfzeit. Ein fälschlich abgewiesener Melder wäre dagegen ein echter
Datenverlust, den niemand bemerkt.

---

## Was bewertet wird

`detectSpamIndicators` (`src/lib/server/spam/spamDetector.ts`) liefert
`score` (0–10), `isHighRisk` (ab `HIGH_RISK_THRESHOLD` = 5) und die Liste der
ausgelösten Indikatoren.

| Signal                                   | Punkte | Anmerkung                                             |
| ---------------------------------------- | ------ | ----------------------------------------------------- |
| URLs/Links im Text                       | 3      | inkl. Shortener ohne Schema und HTML-kodierter Formen |
| Spam-Keywords (DE/EN)                    | 2 je   | **Wortgrenzen**, nicht Substring                      |
| Übermäßige Satzzeichen/Großbuchstaben    | 2      |                                                       |
| Wegwerf-E-Mail-Domain                    | 3      | gepflegte Liste, s. u.                                |
| `noreply@`/`donotreply@`                 | 2      |                                                       |
| ≥ 5 Ziffern vor dem `@`                  | 1      |                                                       |
| E-Mail-Domain ohne MX-Record             | 3      | DNS-Lookup, fail-open                                 |
| Position außerhalb des Kartenbereichs    | 2      | aus `ostsee_geo`, s. u.                               |
| Unbekannte/fehlende Tierart              | 1      |                                                       |
| Identischer Bemerkungstext (7 Tage)      | 2      | ab dem ersten Wiederauftreten                         |
| ≥ 5 Meldungen derselben E-Mail (24 h)    | 2      | Schwelle bewusst hoch, s. u.                          |
| Formular-Token fehlt/ungültig/zu schnell | 2      | nur an der Web-API                                    |

### Entscheidungen, die man leicht zurückdreht

- **Wortgrenzen statt Substring.** „win" matchte in „Wind", „free" in **jeder**
  `freenet.de`-Adresse. Deshalb matcht die Keyword-Prüfung mit `\b` — und die
  **E-Mail-Adresse ist aus dem Keyword-Text herausgenommen** (sie hat ihre
  eigenen Prüfungen). Grenze des Ansatzes: `\b` ist ASCII, ein Keyword direkt
  vor einem Umlaut matcht trotzdem.
- **Die Geografie wird nicht neu gerechnet.** Der Positions-Indikator kommt aus
  der DB-Spalte `ostsee_geo` (`> 0` = drin, inklusive Altbestandswert `2` —
  siehe `docs/OSTSEE_FLAGS.md`), gefüllt von `mapFormToSighting`. Die
  **Polygon-Spalte `ostsee` fließt bewusst nicht ein**: Ein Totfund am Strand
  liegt legitim außerhalb des Wasser-Polygons, und das sind genau die
  Meldungen, die man nicht bestrafen darf.
- **Duplikat-Schwellen sind asymmetrisch.** Mehrere Meldungen derselben Person
  an einem Tag sind bei Citizen Science normal (eine Bootstour, fünf
  Schweinswale) — deshalb erst ab 5. Ein **identischer Bemerkungstext** ist
  dagegen schon beim ersten Mal auffällig, ab 20 Zeichen Länge (kürzer wäre
  „schön" jede zweite Meldung).
- **MX-Lookup ist fail-open.** Nur ein eindeutiges „Domain existiert nicht" bzw.
  „keine MX-Records" zählt. Timeouts und DNS-Serverfehler ergeben `unknown` und
  erhöhen den Score nicht — sonst machte ein DNS-Ausfall jede Meldung
  verdächtig. Ergebnisse werden 1 h gecacht (`unknown` nie), der Cache ist auf
  5.000 Einträge begrenzt.
- **Mailserver-_Reputation_ ist bewusst nicht implementiert.** DNSBLs bewerten
  IPs, die Mail _versenden_ — der Melder sendet aber keine Mail, er tippt eine
  Adresse in ein Formular. `gmail.com` hat exzellente Reputation und ist die
  häufigste Absenderdomain in Formular-Spam.

### Wegwerf-Domain-Liste

`src/lib/server/spam/disposableEmailDomains.ts` ist **generiert** aus der
Community-Liste
[disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
(`disposable_email_blocklist.conf`, CC0). Zum Aktualisieren die Datei neu
herunterladen und das Modul neu erzeugen; `tempmail.com` steht als Ergänzung
oben in der Liste (war in der früheren Hartkodierung enthalten, fehlt in der
Community-Liste).

### Zeit-Token

`src/routes/+page.server.ts` stellt beim Laden der Meldeseite ein signiertes
`<timestampMs>.<hmac>` aus, das Formular schickt es als `_formToken` mit. Der
Endpunkt entfernt es **vor** der Feld-Validierung (es ist kein Formularfeld)
und wertet nur aus, wie lange das Formular offen war.

`FORM_TOKEN_SECRET` ist optional (siehe `docs/ENVIRONMENT.md`). Ohne die
Variable gilt ein Zufallswert pro Prozess — nach einem Neustart werden alte
Tokens ungültig, was ausschließlich Score-Punkte kostet und nichts blockiert.

---

## Wo bewertet wird

| Eingang                       | Bewertung                         | Token-Kontext                  |
| ----------------------------- | --------------------------------- | ------------------------------ |
| `POST /api/sightings` (Web)   | ja, beim Speichern                | ja                             |
| `POST /rest_sichtungen` (App) | ja, beim Speichern (rein additiv) | **nein** — Vertrag kennt keins |
| Admin-Modal „Spam prüfen"     | on demand, nicht gespeichert      | nein                           |
| Benachrichtigungs-E-Mail      | zeigt den gespeicherten Score     | —                              |

Der Legacy-Endpunkt bekommt bewusst **keinen** `submission`-Kontext: Ein
„Token fehlt"-Malus würde jede App-Meldung pauschal bestrafen, obwohl der
Legacy-Vertrag gar kein Token vorsieht.

---

## Persistenz

Zwei Spalten in `sichtungen`:

- `spam_score` (`smallint`) — `NULL` heißt **„nie bewertet"** (Altbestand). Das
  ist nicht dasselbe wie `0` („geprüft, unauffällig"). Auch eine
  **fehlgeschlagene** Prüfung wird nicht persistiert: Ihr Fail-Safe-Ergebnis
  trägt `failed: true` und Score 0, und als 0 gespeichert läse es sich als das
  Gegenteil dessen, was es aussagt.
- `spam_indicators` (`jsonb`) — Array der ausgelösten Indikatortexte.

### Wie der Score angezeigt wird

Vier Stellen zeigen ihn — Eingangskarte, Spam-Spalte der Tabelle,
Spam-Check-Modal und Inline-Karte der Detailansicht. Wort, Farbe, Icon und
Schwelle stehen für alle vier in
`src/lib/components/admin/spamScorePresentation.ts`:

| Stufe        | Score               | Badge           | Icon                  |
| ------------ | ------------------- | --------------- | --------------------- |
| `unrated`    | `NULL`              | **kein Badge**  | —                     |
| `clean`      | 0–1                 | `badge-ghost`   | `lucide:shield-check` |
| `suspicious` | 2–4                 | `badge-warning` | `lucide:shield-alert` |
| `high`       | ab 5 (`isHighRisk`) | `badge-error`   | `lucide:shield-x`     |

`unrated` bekommt bewusst kein Badge: Ein graues „Spam: –" läse sich wie
„geprüft, sauber" und ist das Gegenteil der Aussage. Ein **fehlgeschlagenes**
Prüfergebnis (`failed: true`, Score 0 mit `isHighRisk: true`) wird aus demselben
Grund als `unrated` angezeigt — die Prüfung ist nicht durchgelaufen, „Hochrisiko
ohne einen einzigen Indikator" wäre keine ehrliche Auskunft. Das Fail-Safe-Flag
bleibt trotzdem richtig: Es verhindert, dass Score 0 persistiert wird.

In der Admin-Liste gibt es dafür eine sortierbare Spalte „Spam". Die Sortierung
verwendet explizit `NULLS LAST` in **beiden** Richtungen: PostgreSQL sortiert
`DESC` per Vorgabe `NULLS FIRST`, sonst stünde der unbewertete Altbestand über
den Treffern.

### Der Nachlauf ist nicht der Erstbefund — beide werden gezeigt

`GET /api/sightings/[id]/spam-check` (Modal der Tabelle, Karte der
Detailansicht) liefert seit 2026-08 **zwei** Befunde: `stored` aus den beiden
Spalten und `recomputed` als frischen Lauf über den aktuellen Datensatz.

Sie weichen systematisch voneinander ab. Vier Indikatoren wiegen je 2 Punkte
und existieren nur im Moment des Absendens:

| Indikator                                       | Herkunft                            |
| ----------------------------------------------- | ----------------------------------- |
| Formular-Token fehlt / ungültig                 | `submission.tokenStatus`            |
| Formular verdächtig schnell abgeschickt (< 5 s) | `submission.ageSeconds`             |
| Identischer Bemerkungstext wie früher           | `recentDuplicates.sameNotes` (7 d)  |
| Auffällig viele Meldungen derselben E-Mail      | `recentDuplicates.sameEmail` (24 h) |

Ihre Eingangsdaten stehen nirgends in der Zeile — `recomputed` kann sie nicht
rekonstruieren und liegt entsprechend tiefer. Umgekehrt kann er höher liegen,
wenn der Datensatz bearbeitet wurde oder die E-Mail-Domain inzwischen keinen
MX-Record mehr hat.

**Maßgeblich für die Triage bleibt `stored`** — es ist die Zahl aus Tabelle und
Eingang, und der Nachlauf hat weniger Information als sie. Die Oberfläche
richtet Farbe und Überschrift deshalb nach dem Erstbefund und führt nur dort
mit der Neuberechnung, wo es keinen gibt (`stored: null`).

Bis dahin lieferte der Endpunkt **nur** die Neuberechnung. Die Tabelle zeigte
damit „Spam 2" und der Check daneben „0" — beide Zahlen richtig, der
Widerspruch aber unerklärbar, weil der Vergleichswert fehlte. Wer das wieder
auf eine Zahl zusammenzieht, stellt genau diesen Befund wieder her.

Die Einordnung der Differenz macht `getSpamDrift` in
`spamScorePresentation.ts`. `incomparable` deckt zwei Fälle ab, die sich gleich
verhalten: kein Erstbefund (`stored === null`) oder nicht durchgelaufene
Neuberechnung (`failed`). Beide Male fehlt eine Seite, und eine Differenz zu
bilden hieße, mit einer Null zu rechnen, die keine ist.

---

## Backfill bestehender Daten

Die Bewertungslogik steht einmal in `#lib/server/spam/rescoreSightings.ts` und
wird von beiden Wegen benutzt. Sie lädt ausschließlich Zeilen mit
`spam_score IS NULL` und ist damit idempotent — ein abgebrochener Lauf macht
beim nächsten Aufruf dort weiter.

> **Nachträgliche Scores sind systematisch milder** als die einer echten
> Einreichung: Formular-Token und Duplikat-Fenster („letzte 24 h") existieren
> nur zum Meldezeitpunkt. Das ist gewollt und kein Fehler.

### Lokal (Entwicklungs-DB)

```bash
npm run spam:rescore            # bis fertig, Batches à 1000
npm run spam:rescore -- --batch 100
```

### Deployte Umgebungen — nur über den Admin-Endpunkt

Auf **hawking** (Preprod) und **dmm** (Produktion) ist die Datenbank von außen
nicht erreichbar, und `src/tools/` liegt nicht im Runtime-Image. Ein
SQL-Skript scheidet ebenfalls aus, weil die Heuristik MX-DNS-Lookups und
TypeScript-Logik braucht. Deshalb:

```bash
curl -sS -X POST "https://<host>/api/admin/spam-rescore?limit=500" \
  -H "Authorization: Bearer $CLEANUP_TOKEN"
```

Antwort (`SpamRescoreReport`):

```json
{
	"scored": 500,
	"skippedFailed": 0,
	"lastId": 8123,
	"remaining": 19396,
	"done": false,
	"stalled": false,
	"distribution": { "0": 487, "2": 11, "10": 2 }
}
```

**Bei `done: false` erneut aufrufen**, bis `done: true` kommt — z. B.:

```bash
while true; do
  r=$(curl -sS -X POST "https://<host>/api/admin/spam-rescore?limit=500" -H "Authorization: Bearer $CLEANUP_TOKEN")
  echo "$r"
  echo "$r" | grep -q '"done":true' && break
done
```

`done` heißt „hör auf", nicht zwingend „alles bewertet". Es wird auch gesetzt,
wenn ein **voller Batch gar nichts geschrieben hat** (`stalled: true`) — dann
sind alle geladenen Zeilen an der Prüfung gescheitert, und weitere Aufrufe
würden dieselben Zeilen laden. In dem Fall steht die Ursache im Server-Log; ein
Blick auf `remaining` zeigt, wie viele Zeilen noch offen sind.

Zugang wahlweise über eine angemeldete Admin-Session (dann ohne Header, z. B.
aus dem Browser) oder das `CLEANUP_TOKEN` — dieselbe Regelung wie bei
`/api/admin/cleanup-orphans`. Jeder Lauf schreibt einen Audit-Eintrag
(`sighting.spam_rescore`).

**Warum keine Tunnel-Variante dokumentiert ist:** Auf dmm gibt das Compose des
Servers für `db` keinen Port frei (die Repo-Datei
`docker-compose.production.yml` tut das und führt hier in die Irre); auf
hawking meldet `sshd -T` ein `allowtcpforwarding no`, wodurch jeder
`LocalForward` zwar lokal bindet, die Verbindung aber serverseitig sofort
geschlossen wird — das Fehlerbild sieht aus wie eine abstürzende Datenbank und
ist keine.

---

## Melder-Historie — daneben, nicht darin

Eingang und Detailansicht zeigen seit 2026-08 zusätzlich, wie viele **andere**
Meldungen derselben E-Mail-Adresse freigegeben, abgelehnt oder noch offen sind
(`src/lib/server/db/reporterHistory.ts`, Stufen in
`src/lib/components/admin/reporterHistoryPresentation.ts`). Gemessen auf der
lokalen DB (2026-08-10, 659 offene Meldungen): Melder mit Vorgeschichte hatten
einen mittleren Spam-Score von 0,19–0,23 und **keinen** Hochrisiko-Fall; alle 14
Hochrisiko-Meldungen kamen von Adressen ohne Vorgeschichte.

**Sie fließt bewusst nicht in den Score ein.** Drei Gründe:

- Der Score wird beim Eingang **persistiert** und ist eine Momentaufnahme.
  Reputation ändert sich rückwirkend — jede Freigabe von heute veränderte die
  Bewertung von gestern, und ein gespeicherter Anteil wäre ab dem nächsten Klick
  falsch.
- Sie machte den `stored`/`recomputed`-Vergleich unerklärbar. Heute lässt sich
  jede Differenz auf die vier Meldezeitpunkt-Indikatoren zurückführen; ein
  zeitabhängiger Term nähme dieser Erklärung die Grundlage.
- Die Richtung wäre angreifbar. Die E-Mail ist **nicht verifiziert** (kein
  Double-Opt-in, kein Captcha): Ein Bonus, der den Score senkt, ließe sich durch
  Eintragen einer bekannten Adresse abholen. Als danebenstehende Zahl ist
  dieselbe Angabe harmlos — es entscheidet ein Mensch.

**Schwellen** (Entscheidung Jan, 2026-08-10): bekannt ab 3 Freigaben, etabliert
ab 10, gewarnt wird ab einem Anteil von ⅓ abgelehnter unter den **bearbeiteten**
Meldungen. Eine einzelne Ablehnung unter 29 Freigaben ist ein Fehlgriff und kein
Muster.

**Offen zählt nie negativ.** Die Ablehnung gibt es erst seit 2026-08; vorher
blieb Spam unbearbeitet liegen (im Bestand 5 abgelehnte gegen 19.289
freigegebene Zeilen). Eine offene Altmeldung ist Bearbeitungsstau, kein
Qualitätsurteil — wer sie negativ zählt, bestraft den Rückstau des Museums.

**Nichts davon wird persistiert**: keine Spalte, keine Migration, kein Backfill.
Berechnet wird live, ein Query für alle Karten des Eingangs (22 ms auf ~20.000
Zeilen, Seq Scan — kein Index auf `lower(trim(email))`, gleiche Lage wie bei den
Duplikat-Abfragen oben).

---

## Grenzen und bewusst Nicht-Umgesetztes

- **Kein Captcha, keine E-Mail-Bestätigung.** Beides kostet Conversion bei
  einem Formular, bei dem jede echte Meldung zählt. Erst sinnvoll, wenn
  nennenswert Spam mit Score < 5 durchrutscht — dann wären Friendly Captcha
  (DSGVO-freundlich) oder Turnstile die Kandidaten.
- **Keine Drittanbieter-Abfragen** (StopForumSpam o. ä.). Sie wären für
  Formular-Spam zwar gebaut, würden aber personenbezogene Daten an Dritte
  geben — eine DSGVO-Abwägung, die sich ohne akutes Problem nicht lohnt.
- **Die Duplikat-Abfragen laufen ohne passenden Index** (`lower(email)`,
  `trim(bemerkungen)`). Bei der aktuellen Datenmenge (~20.000 Zeilen)
  unkritisch; bei deutlichem Wachstum wären Ausdrucksindizes der nächste
  Schritt.
