# Umsetzungsplan: Anonymisierung der Meldedaten nach 3 Monaten

**Stand:** 2026-11-02, überarbeitet nach Review und Nutzungsabgleich · Grundlage:
`docs/ANONYMISIERUNG_KONZEPT.md` (Entscheidungen E1–E3 mit dem Museum abgestimmt).

## Was umgesetzt wird

3 Monate nach Eingang werden geleert:

| Feld(er)                        | Bedingung                                  |
| ------------------------------- | ------------------------------------------ |
| E-Mail, Telefon, Fax, Anschrift | immer                                      |
| Vor- und Nachname               | wenn `namensnennung = 0`                   |
| Schiffsname, Heimathafen        | wenn `schiffnamensnennung = 0`             |
| Freitexte                       | nie (Bereinigung von Hand bei der Prüfung) |

Alle Meldungen einer Person bleiben über `melder_hash` (HMAC-SHA256 der E-Mail)
verknüpft. **Der Hash verlässt den Server nie**: nicht in API-Antworten, nicht in
Exporten, nicht in URLs.

## Ergebnis des Reviews

Der Abgleich aller Stellen, die die betroffenen Felder lesen oder schreiben
(Abschnitt „Nutzungsabgleich"), hat sieben Punkte ergeben, die die erste Fassung
des Plans nicht oder falsch abgedeckt hatte:

1. **Blocker: Anonymisierte Meldungen wären im Admin nicht mehr speicherbar.**
   `getAdminSightingSchema` übernimmt `firstName`, `lastName` und `email` als
   Pflichtfelder aus dem Meldeformular. Ohne Anpassung scheitert jede Korrektur
   an einer anonymisierten Meldung, auch wenn nur die Tierart geändert wird.
2. **Die Statistik bräche zusammen.** „Eindeutige Melder", „Wiederholungs-Melder"
   und „Top-Beobachter" zählen über die E-Mail und fielen auf die letzten
   3 Monate zurück. Die Top-Beobachter schließen Museums-Adressen
   (`@meeresmuseum.de`) aus; nach der Anonymisierung ist die Domain weg.
3. **Die öffentliche Zahl auf `/about`** („Melder-Adressen insgesamt") zählt
   ebenfalls über die E-Mail und würde öffentlich sichtbar einbrechen.
4. **Der Hash würde nach außen gelangen.** Der JSON-Export und die
   Admin-Detail-API geben die ganze Zeile aus, inklusive neuer Spalten. Der
   erste Plan wollte den Hash außerdem als URL-Parameter verwenden.
5. **Die Spam-Nachbewertung** (`rescoreSightings`, alle Zeilen mit
   `spam_score IS NULL`) würde anonymisierte Altmeldungen ohne E-Mail-Signale
   bewerten und damit verfälschte Werte schreiben.
6. **PR 1 war falsch beschrieben.** Es gibt bereits eine Log-Redaction
   (`src/lib/logger/redaction.ts`), die E-Mail, Telefon und Namen entfernt. Sie
   kennt aber nur die deutschen Namen der Anschrift (`strasse`, `plz`, `ort`),
   nicht die Schlüssel, die der Code tatsächlich verwendet (`street`, `zipCode`,
   `city`), und weder `fax` noch `shipName` oder `homePort`. Genau diese Felder
   stehen heute im Log.
7. **Zeitzone der Frist.** `created` ist ein `timestamp` ohne Zone in UTC (siehe
   die Abfragen mit `NOW() AT TIME ZONE 'UTC'` in der Statistik). Ein Vergleich
   mit `now()` verschöbe die Frist je nach Sommer- oder Winterzeit um ein bis
   zwei Stunden.

Neu im Plan außerdem: die **Freigabe des ersten Laufs** als technische Sperre und
die **Überwachung des automatischen Betriebs** (beides unten).

---

## Nutzungsabgleich

Geprüft wurden alle Lese- und Schreibstellen von `firstName`, `lastName`,
`email`, `phone`, `fax`, `street`, `zipCode`, `city`, `shipName` und `homePort`
in `src/` (ohne Tests). ✓ heißt: funktioniert nach der Anonymisierung
unverändert richtig.

### Schreiben

| Stelle                                             | Befund                                                                     | Maßnahme                                                                  | PR   |
| -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| `saveSighting` (Webformular und `rest_sichtungen`) | einziger Insert                                                            | Hash beim Eingang setzen                                                  | 2    |
| `updateSighting` (Admin-Bearbeitung)               | einziges Update der Kontaktfelder                                          | Hash neu bei E-Mail-Änderung; Kontaktfelder bei `anonymisiert_am` sperren | 2, 4 |
| Altsystem (dieselbe Datenbank)                     | schreibt Zeilen ohne Hash                                                  | Job holt den Hash vor dem Leeren nach                                     | 4    |
| `getAdminSightingSchema`                           | **Name und E-Mail sind Pflicht** → anonymisierte Meldung nicht speicherbar | Pflicht aufheben, wenn `anonymisiert_am` gesetzt ist                      | 4    |

### Admin-Oberfläche und Admin-APIs

| Stelle                                                                                                 | Befund                                                                                 | Maßnahme                                                                                                                                                          | PR   |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Melder-Historie (`reporterHistory.ts`, Badge, `/api/sightings/[id]/reporter-history`)                  | zählt über `lower(trim(email))`                                                        | über `melder_hash`                                                                                                                                                | 3    |
| Link „Meldungen dieses Melders" (`AdminSightingView.svelte`)                                           | `/admin/sichtungen?q=<email>`                                                          | `/admin/sichtungen?gleicherMelder=<id>`; der Server löst die ID in den Hash auf                                                                                   | 3    |
| Admin-Suche (`sightingSearchFilter.ts`)                                                                | `ILIKE` über E-Mail und Name; anonymisierte Meldungen per E-Mail nicht mehr auffindbar | Ist die Suche eine vollständige Adresse, zusätzlich `OR melder_hash = hash(suche)`                                                                                | 3    |
| Statistik: eindeutige Melder, Wiederholungs-Melder                                                     | `COUNT(DISTINCT email)`                                                                | über `melder_hash`                                                                                                                                                | 3    |
| Statistik: Top-Beobachter                                                                              | gruppiert und zeigt E-Mail, schließt `@meeresmuseum.de` aus                            | gruppiert über `melder_hash`; zeigt Name/E-Mail der jüngsten noch nicht anonymisierten Meldung, sonst „anonymisiert"; Ausschluss über neue Spalte `melder_intern` | 2, 3 |
| Statistik: Schiffe (`COUNT(DISTINCT schiffsname)`)                                                     | zählt danach nur noch Schiffe mit Einwilligung                                         | **akzeptiert (2026-11-02)**, beschriften („mit veröffentlichtem Schiffsnamen")                                                                                    | 3    |
| Duplikat-Kandidaten (`duplicateCandidates.ts`)                                                         | gleiche E-Mail in derselben Stunde; betrifft praktisch nur frische Meldungen           | auf `melder_hash` umstellen (nutzt den Index)                                                                                                                     | 3    |
| Spam-Nachbewertung (`rescoreSightings.ts`)                                                             | bewertet anonymisierte Zeilen ohne E-Mail-Signale                                      | anonymisierte Zeilen ausnehmen; vor dem ersten Lauf vollständig nachbewerten                                                                                      | 4    |
| Spam-Prüfung einer Meldung (`/api/sightings/[id]/spam-check`)                                          | Neuberechnung ohne Kontaktdaten liefert ein anderes Ergebnis                           | bei anonymisierten Meldungen gespeicherten Wert mit Hinweis zurückgeben                                                                                           | 4    |
| Spam-Erkennung beim Eingang (`sameEmail`, 24 h)                                                        | ✓ betrachtet nur die letzten 24 Stunden                                                | keine                                                                                                                                                             | —    |
| Admin-Detail-API `GET /api/sightings/[id]`                                                             | gibt die ganze Zeile aus, also auch den Hash                                           | `reporterHash` und `reporterInternal` aus jeder Antwort entfernen                                                                                                 | 2    |
| Liste, Spalten, Sortierung (`inboxColumns.ts`, `columns.ts`, `sortParams.ts`, `SichtungenTable/Cards`) | ✓ zeigen bzw. sortieren leere Werte                                                    | keine                                                                                                                                                             | —    |
| Detailansicht (`AdminSightingView.svelte`)                                                             | leere Kontaktzeilen                                                                    | „Kontaktdaten anonymisiert am …"                                                                                                                                  | 5    |

### Öffentlich und Legacy

| Stelle                                                | Befund                                                             | Maßnahme                                       | PR   |
| ----------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ---- |
| `/about`: „Melder-Adressen insgesamt"                 | `countDistinct(email)` → bräche öffentlich ein                     | über `melder_hash`                             | 3    |
| `/api/sightings`, `/api/map/sightings`, `mapUtils.ts` | ✓ Name und Schiffsname nur mit Einwilligung, und genau die bleiben | keine                                          | —    |
| Öffentliche Namenssuche (`consentGatedSearch.ts`)     | ✓ sucht nur Namen mit Einwilligung                                 | keine                                          | —    |
| Legacy `showreports.json`: `na`, `sh`                 | ✓ nur mit Einwilligung, Werte bleiben                              | keine                                          | —    |
| Legacy `showreports.json`: Admin-Suche über E-Mail    | findet anonymisierte Meldungen nicht mehr                          | dokumentieren; optional ergänzend Hash-Treffer | 3, 6 |
| Legacy `rest_sichtungen` (Eingang)                    | ✓ läuft über `saveSighting`                                        | keine                                          | —    |

### Exporte, Logs, Sonstiges

| Stelle                                       | Befund                                                                 | Maßnahme                                                              | PR  |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | --- |
| CSV-Export                                   | ✓ feste Spaltenliste, leere Werte                                      | keine                                                                 | —   |
| JSON-Export (`jsonExport.ts`)                | übernimmt die ganze Zeile (`{ ...sighting }`)                          | `reporterHash` und `reporterInternal` entfernen                       | 2   |
| KML-/XML-Export                              | ✓ Name nur mit Einwilligung                                            | keine                                                                 | —   |
| Server-Log (`saveSighting`, `LOG_REDACTION`) | `street`, `zipCode`, `city`, `fax`, `shipName`, `homePort` ungefiltert | Redaction ergänzen; Log in `saveSighting` auf ID und Flags reduzieren | 1   |
| Audit-Log                                    | ✓ speichert nur Feldnamen                                              | keine                                                                 | —   |
| Benachrichtigungs-Mail beim Eingang          | ✓ innerhalb der Frist; Postfächer liegen beim Museum                   | Aufbewahrungsregel des Museums                                        | —   |
| Meldeformular, Browser-Speicher              | ✓ nur auf dem Gerät der meldenden Person                               | keine                                                                 | —   |
| `sichtungen_dateien.original_name`           | Dateinamen können Namen enthalten („IMG_Erika_M.jpg")                  | außerhalb dieses Plans, gehört zum Medien-Thema                       | —   |
| Contract-Tests (`src/tests/contract/`)       | Fixtures mit Kontaktdaten                                              | um anonymisierte Fälle ergänzen                                       | 4   |

---

## Reihenfolge

```
PR 1 Log ─────┐
PR 2 Hash ────┴─► Deploy + Hash-Backfill ─► PR 3 Lesestellen ─► PR 4 Job ─► PR 5 Oberfläche ─► Freigabe ─► Betrieb
                                                                            PR 6 Doku ───────┘
```

Die Reihenfolge ist zwingend: Alle Lesestellen (PR 3) müssen auf den Hash
umgestellt sein, bevor der Job (PR 4) die E-Mail leert. Sonst brechen Historie,
Statistik und `/about` am ersten Tag ein.

---

## PR 1 — Log-Redaction vervollständigen

**Unabhängig, kann sofort.**

- **Test zuerst** (`src/lib/logger/redaction.test.ts`): Ein Log-Objekt
  `{ sightingData: { street, zipCode, city, fax, shipName, homePort, … } }` enthält
  nach der Redaction keinen dieser Werte. Zusätzlich die vorhandenen Felder als
  Regression.
- **Umsetzung:**
  - `LOG_REDACTION.paths` um `street`, `zipCode`, `city`, `fax`, `shipName`,
    `homePort`, `schiffsname`, `heimathafen` ergänzen (jeweils mit `*.`).
  - `saveSighting` loggt nur noch ID, Tierart, Eingangskanal und Flags, statt
    sich auf die Redaction allein zu verlassen.

**Größe:** S · `fix(security): redact address and ship fields in logs`

## PR 2 — Melder-Hash: Spalten, Schlüssel, Berechnung, Backfill

**Tests zuerst:**

| Test                                                | Prüft                                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/privacy/reporterHash.test.ts`       | Schreibweise egal → gleicher Hash; anderer Schlüssel → anderer Hash; leer → `null`; 64 Hex-Zeichen; Schlüssel < 32 Zeichen → Fehler       |
| `sightingRepository` (erweitert)                    | `saveSighting` setzt Hash und `melder_intern`; ohne Schlüssel wird trotzdem gespeichert; `updateSighting` rechnet bei E-Mail-Änderung neu |
| `src/lib/server/privacy/piiColumns.test.ts` (Guard) | jede Spalte von `sichtungen` ist eingeordnet; eine neue Spalte ohne Einordnung bricht den Test                                            |
| `reporterHashLeakScan.test.ts` (Guard)              | `reporterHash`/`melder_hash` kommt in keiner Antwort von `src/routes/**` und in keinem Export vor                                         |
| Backfill-Werkzeug                                   | hasht nur Zeilen mit E-Mail und ohne Hash; zweiter Lauf ändert nichts; bricht ohne Schlüssel ab                                           |

**Umsetzung:**

1. Schema: `reporterHash: varchar('melder_hash', { length: 64 })`,
   `reporterInternal: boolean('melder_intern')`,
   `anonymizedAt: timestamp('anonymisiert_am', { mode: 'date' })`, Index
   `idx_melder_hash`; `npm run db:generate`, Migration committen.
2. `REPORTER_HASH_KEY` in `src/env.ts` (`{ schema: asIs }`), Prüfung der
   Mindestlänge im Modul.
3. `src/lib/server/privacy/reporterHash.ts`: `computeReporterHash(email, key)`
   über `node:crypto` `createHmac`, Normalisierung über die vorhandene
   `normalizeReporterKey`. `melder_intern` = Domain in einer Liste
   (`meeresmuseum.de`), dieselbe Bedingung, die die Statistik heute im SQL hat.
4. `saveSighting`/`updateSighting` setzen Hash und `melder_intern`.
5. Backfill `hashReporters` in `src/lib/server/privacy/hashReporters.ts`, Stapel zu
   500 (höchstens 2.000), in Node gehasht. Aufruf auf den Hosts über
   `POST /api/admin/reporter-hash` (Admin-Session oder `CLEANUP_TOKEN`), lokal über
   `npm run privacy:hash-reporters`. **Umgesetzt (2026-11-02):** Werkzeuge aus
   `src/tools/` erreichen die deployten Datenbanken nicht (kein freigegebener
   DB-Port, `src/tools/` nicht im Image) — derselbe Grund wie bei
   `/api/admin/spam-rescore`. Ein Dry-Run entfällt: Der Schritt ist idempotent und
   ändert keine bestehenden Werte.
6. `src/lib/server/privacy/piiColumns.ts`: Klassifizierung der Spalten samt
   Bedingung, einzige Quelle für PR 4.
7. Hash und `melder_intern` aus allen Antworten entfernen, die ganze Zeilen
   ausliefern: `GET`/`PUT /api/sightings/[id]`, `GET /api/sightings/ref/[refId]`,
   JSON-Export. Guard `reporterHashLeakScan.test.ts`: Kein Route- und kein
   Komponenten-Code nennt die Felder.
8. `REPORTER_HASH_KEY` in `docker-compose.production.yml` durchreichen, sonst
   kommt er im Container nicht an.

**Nach dem Merge:** Schlüssel für Staging und Production erzeugen
(`openssl rand -base64 48`) und getrennt sichern, deployen, Backfill über
`POST /api/admin/reporter-hash` wiederholen, bis `"done": true`. Prüfung:
`SELECT count(*) FROM sichtungen WHERE email <> '' AND melder_hash IS NULL` → 0.

**Größe:** M · `feat(db): add reporter hash for linking reports without email`

## PR 3 — Lesestellen auf den Hash umstellen

**Tests zuerst:** je Stelle aus dem Nutzungsabgleich ein Fall mit zwei Meldungen
gleichen Hashes, von denen eine **keine E-Mail mehr hat**. Erwartet: Sie zählen
zusammen (Historie, Statistik, `/about`, Duplikate) bzw. werden gefunden (Suche,
`gleicherMelder`). Top-Beobachter: Gruppe ohne Kontaktdaten erscheint als
„anonymisiert"; `melder_intern = true` erscheint nicht.

**Umsetzung:** `reporterHistory.ts` und Aufrufer, `AdminSightingView.svelte`
(Link über ID), `src/routes/admin/sichtungen/+page.server.ts` (Parameter
`gleicherMelder`), `sightingSearchFilter.ts`,
`src/routes/admin/statistics/+page.server.ts` und `+page.svelte` (Beschriftung
Schiffe), `src/routes/about/+page.server.ts`, `duplicateCandidates.ts`.

**Abweichungen, die gewollt sind.** Der Hash normalisiert (`trim`, Kleinschreibung),
die heutigen Abfragen nicht: `COUNT(DISTINCT email)` zählt `Erika@x.de` und
`erika@x.de` als zwei Melder, `NOT LIKE '%@meeresmuseum.de'` übersieht
`@Meeresmuseum.de`. Nach der Umstellung können „eindeutige Melder" und
`/about` deshalb leicht **sinken** und die Top-Beobachter leicht anders aussehen.
Das ist eine Korrektur, kein Verlust.

**Nachweis vor dem ersten Lauf.** Nach dem Deploy von PR 3, solange die E-Mails
noch vorhanden sind, werden auf Production alte und neue Zählweise
nebeneinander gerechnet (je Jahr: eindeutige Melder, Wiederholungs-Melder,
Top 10, `/about`). Erwartet: Die neue Zahl entspricht der alten Zählung über
`lower(trim(email))` exakt. Das Ergebnis geht mit der Vorschau an das Museum.

**Größe:** M · `feat(admin): read reporter identity from reporter hash`

## PR 4 — Anonymisierungs-Job

**Tests zuerst:**

| Test                          | Prüft                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anonymizationPatch.test.ts`  | Feld-Matrix für alle vier Kombinationen `namensnennung` × `schiffnamensnennung`; Freitexte, Hash und Einwilligungsnachweise unberührt                                                                                |
| `anonymizationCutoff.test.ts` | vorwärts vom Eingang gerechnet, in UTC; genau an der Grenze, ein Tag davor und danach; Monatsende (31. Mai, 30. November → Februar); beide Zeitumstellungen                                                          |
| `anonymizeSightings.test.ts`  | holt Hashes nach, bevor geleert wird; ohne Schlüssel Abbruch vor jeder Änderung; ohne Freischaltung nur Vorschau; Vorschau ändert nichts; zweiter Lauf ändert nichts; maßgeblich ist `created`, nicht der Prüfstatus |
| Endpunkt                      | 401 ohne Session/Token; Vorschau ist Standard; `mode=execute` leert; Audit-Eintrag ohne personenbezogene Werte; 503 ohne Schlüssel                                                                                   |
| Admin-Schema                  | anonymisierte Meldung ohne Name/E-Mail ist speicherbar; nicht anonymisierte weiterhin nur mit                                                                                                                        |
| Löschersuchen                 | anonymisiert die Treffer sofort und leert den Hash; ein anschließender Job-Lauf (Backfill eingeschlossen) stellt den Hash nicht wieder her                                                                           |
| `updateSighting`              | Kontaktfelder einer anonymisierten Zeile werden abgewiesen                                                                                                                                                           |
| `rescoreSightings`            | anonymisierte Zeilen werden nicht bewertet                                                                                                                                                                           |

**Umsetzung:**

- `ANONYMIZE_AFTER_MONTHS = 3` in `src/lib/constants/reporterDataRetention.ts`.
- `buildAnonymizationPatch(row)` in `src/lib/server/privacy/anonymizationPatch.ts`.
- `anonymizeSightings({ mode, limit })` in
  `src/lib/server/privacy/anonymizeSightings.ts`. Fälligkeit:
  `created + INTERVAL '3 months' - INTERVAL '1 day' <= (NOW() AT TIME ZONE 'UTC')`
  (vorwärts vom Eingang; rückwärts gerechnet blieben an Monatsenden Meldungen
  liegen, siehe Konzept 5.1)
  und `anonymisiert_am IS NULL`.
- `POST /api/admin/anonymize` nach dem Muster von `cleanup-orphans`
  (Admin-Session oder Bearer `CLEANUP_TOKEN`, Rate-Limit, Audit
  `privacy.anonymize`); CLI `npm run privacy:anonymize` (`:dry-run`) nur für die
  lokale Datenbank — auf den Hosts läuft alles über den Endpunkt.
- Admin-Schema, Sperre in `updateSighting`, Ausnahme in `rescoreSightings`,
  Hinweis in `spam-check`.

**Größe:** M · `feat(security): anonymize reporter data 3 months after receipt`

## PR 5 — Oberfläche: Freigabe, Überwachung, Hinweise

**Tests zuerst** (Komponenten-Tests): Panel zeigt Vorbedingungen und Vorschau;
die Freischaltung verlangt die Eingabe der Anzahl; nach der Freischaltung gibt
es keinen Weg zurück; Status rot bei Meldungen über der Frist oder bei einem
letzten Lauf vor mehr als 48 Stunden; Detailansicht zeigt „anonymisiert am …";
Eingang zeigt die Frist ab 14 Tagen vorher.

**Umsetzung:** `src/routes/admin/settings/AnonymizationPanel.svelte` neben
`CleanupPanel.svelte`; Hinweisleiste im Admin-Layout bei rotem Status;
`AdminSightingView.svelte`, `AdminSightingEditForm.svelte`,
`SightingInboxCard.svelte`.

**Größe:** M · `feat(admin): add anonymization approval and monitoring`

## PR 6 — Dokumentation

`docs/ENVIRONMENT.md` (`REPORTER_HASH_KEY`), `docs/LEGACY_API_SPECIFICATION.md`
(leere Werte alter Meldungen, Suche), `docs/PRODUCTION_DEPLOYMENT.md`
(Cron-Aufruf), `/about` (Frist nennen), `CLAUDE.md` (Regel „neue Spalte in
`sichtungen` → in `piiColumns.ts` einordnen", Dokumenten-Tabelle), Punkt 2.1 im
Datenschutz-Abgleich als erledigt markieren, Textvorschlag für die
Datenschutzerklärung an das Museum.

**Größe:** S · `docs(security): document reporter data retention`

---

## Freigabe des ersten Laufs

Der erste Lauf leert die Kontaktdaten praktisch des gesamten Bestands seit 2009
(Stand 2026-08: rund 19.900 Meldungen). Er ist nicht umkehrbar. Die Freigabe ist
deshalb **eine technische Sperre**, nicht nur eine Absprache.

**Sperre:** Bis zur Freischaltung führt der Endpunkt auch mit `mode=execute`
nur die Vorschau aus und antwortet mit `skipped: "not_activated"`. Die
Freischaltung ist ein Zeitstempel in `app_config`
(`privacy.anonymization.activatedAt`) und wird nur einmal gesetzt. Die Oberfläche
bietet keinen Weg zurück; abschalten ginge nur direkt in der Datenbank, und das
Panel zeigt dann rot.

**Ablauf:**

| Schritt | Wer         | Was                                                                                                                                                                                                                                |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Entwicklung | Vorbedingungen herstellen. Das Panel zeigt sie als Checkliste: Schlüssel gesetzt; keine Zeile mit E-Mail ohne Hash; Spam-Nachbewertung abgeschlossen (`spam_score IS NULL` = 0); Lesestellen umgestellt (PR 3 deployt).            |
| 2       | Museum      | Datenbank-Backup ziehen, mit festgelegter Löschfrist (höchstens 3 Monate).                                                                                                                                                         |
| 3       | Entwicklung | **Vorschau** erzeugen und dem Museum schicken: Anzahl fälliger Meldungen gesamt und je Jahr; davon Namen geleert und behalten; Schiffsnamen geleert und behalten; davon ungeprüft; Grenzdatum. Keine personenbezogenen Werte.      |
| 4       | Museum      | **Schriftliche Freigabe** per E-Mail mit Bezug auf die Zahlen der Vorschau. Ablage als `docs/archive/ANONYMISIERUNG_FREIGABE_<datum>.md`: wer, wann, welche Zahlen; ohne private Adressen.                                         |
| 5       | Superadmin  | **Freischaltung** im Panel. Der Dialog zeigt die aktuelle Vorschau; bestätigt wird durch Eingabe der Anzahl. Weicht sie deutlich von der freigegebenen ab, ist das der Moment, um anzuhalten. Audit-Eintrag mit Person und Zahlen. |
| 6       | Superadmin  | **Erster Lauf** über „Jetzt ausführen" im Panel oder den Endpunkt. Er arbeitet in Stapeln, bis nichts mehr fällig ist (bei ~20.000 Zeilen etwa 40 Stapel zu 500).                                                                  |
| 7       | Entwicklung | **Prüfung:** Panel grün (0 über der Frist); Stichproben in der Detailansicht; Historie und Statistik plausibel; Legacy-Contract-Tests grün.                                                                                        |

Auf **Staging** wird derselbe Ablauf vorher einmal vollständig durchgespielt.

## Automatischer Betrieb danach

**Täglicher Lauf.** Ein externer Cron ruft einmal täglich, z. B. um 03:15 Uhr,
denselben Endpunkt auf wie die Aufräum-Routine:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" -H "Content-Type: application/json" \
  "https://<host>/api/admin/anonymize?mode=execute"
```

Jeder Lauf:

1. prüft den Schlüssel und bricht ohne ihn mit 503 ab, bevor er etwas ändert;
   `curl -f` meldet das als Fehler;
2. holt fehlende Hashes nach (Altsystem, Meldungen bei zeitweise fehlendem
   Schlüssel);
3. leert alle fälligen Meldungen, im Alltag einige pro Tag, gedeckelt auf
   z. B. 2.000 je Aufruf;
4. schreibt Zeitpunkt und Ergebnis in `app_config`
   (`privacy.anonymization.lastRun`) und einen Audit-Eintrag.

Durch den Puffer von einem Tag hält auch ein Lauf, der ein paar Stunden später
kommt, die Frist ein. Fällt der Cron einen Tag aus, holt der nächste Lauf alles
nach.

**Überwachung.** Ein Cron, der still ausfällt, verletzt die Frist, ohne dass es
jemand merkt. Deshalb:

- **Panel** in den Einstellungen: letzter Lauf, Ergebnis, Anzahl über der Frist.
- **Hinweisleiste** im gesamten Admin-Bereich, sobald Meldungen über der Frist
  liegen oder der letzte Lauf mehr als 48 Stunden zurückliegt.
- **Hinweis im Eingang** an ungeprüften Meldungen, die in 14 Tagen oder früher
  fällig werden („Rückfragen nur noch bis …").

**Cron:** Für `cleanup-orphans` ist in Production ein Cron eingerichtet
(bestätigt 2026-11-02). Der Aufruf von `/api/admin/anonymize` wird dort ergänzt.

---

## Risiken

| Risiko                                           | Gegenmaßnahme                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Erster Lauf mit falschen Annahmen                | technische Sperre, Vorschau, schriftliche Freigabe, Staging-Durchlauf, Backup      |
| Schlüssel geht verloren                          | getrennt gesichert; Verlust trennt nur künftige von alten Meldungen                |
| Cron fällt still aus                             | Panel, Hinweisleiste, 503 ohne Schlüssel, `curl -f`                                |
| Lesestelle übersehen, Zahlen brechen ein         | Nutzungsabgleich oben; PR 3 vor PR 4; Tests mit anonymisierten Meldungen           |
| Hash gelangt nach außen                          | Guard-Test über alle Antworten und Exporte; Verknüpfung nur über IDs               |
| Neue Spalte mit Personenbezug wird vergessen     | Guard-Test `piiColumns.test.ts`                                                    |
| Admin kann anonymisierte Meldung nicht speichern | Admin-Schema in PR 4, mit Test                                                     |
| Legacy-Clients brechen an leeren Feldern         | Ausgabe fängt `NULL` ab (`\|\| ''`); Contract-Tests um anonymisierte Fälle ergänzt |
