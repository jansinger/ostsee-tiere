# Umsetzungsplan: Anonymisierung der Meldedaten nach 3 Monaten

**Stand:** 2026-11-02 · Grundlage: `docs/ANONYMISIERUNG_KONZEPT.md` (Entscheidungen E1–E3
mit dem Museum abgestimmt).

## Was umgesetzt wird

3 Monate nach Eingang werden geleert:

| Feld(er)                        | Bedingung                                  |
| ------------------------------- | ------------------------------------------ |
| E-Mail, Telefon, Fax, Anschrift | immer                                      |
| Vor- und Nachname               | wenn `namensnennung = 0`                   |
| Schiffsname, Heimathafen        | wenn `schiffnamensnennung = 0`             |
| Freitexte                       | nie (Bereinigung von Hand bei der Prüfung) |

Alle Meldungen einer Person bleiben über `melder_hash` (HMAC-SHA256 der E-Mail)
verknüpft.

## Reihenfolge

Sechs Pull Requests, jeder für sich lauffähig und mit Tests zuerst. Die
Reihenfolge ist zwingend: Die Melder-Historie (PR 3) darf erst auf den Hash
umgestellt werden, wenn der Bestand gehasht ist, und der Job (PR 4) darf erst
leeren, wenn die Historie nicht mehr an der E-Mail hängt.

```
PR 1 Log-Fix ─┐
PR 2 Hash ────┴─► Deploy + Backfill ─► PR 3 Historie ─► PR 4 Job ─► PR 5 Admin-UI ─► Rollout
                                                                     PR 6 Doku ──────┘
```

---

## PR 1 — Kontaktdaten aus dem Server-Log entfernen

**Unabhängig von allem anderen, kann sofort.**

`saveSighting` in `src/lib/server/db/sightingRepository.ts` loggt beim Speichern
das ganze `sightingData` (`logger.info({ sightingData }, …)`), also auch Name,
E-Mail und Telefon. Die Daten stünden damit im Log über jede Frist hinaus.

- **Test zuerst:** Logger mocken, `saveSighting` mit vollständigen Kontaktdaten
  aufrufen, prüfen, dass kein geloggtes Objekt `email`, `phone`, `firstName`,
  `lastName`, `street`, `city` enthält.
- **Umsetzung:** Nur ID, Tierart, Eingangskanal und Flags loggen.
- Dabei die übrigen `logger.*`-Aufrufe mit Sichtungsobjekten in `src/lib/server/**`
  und `src/routes/api/**` auf dasselbe Muster prüfen.

**Größe:** S · **Commit:** `fix(security): stop logging reporter contact data`

---

## PR 2 — Melder-Hash: Spalten, Schlüssel, Berechnung, Backfill

### Tests zuerst

| Test                                                | Prüft                                                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/privacy/reporterHash.test.ts`       | gleiche Adresse in anderer Groß-/Kleinschreibung oder mit Leerzeichen → gleicher Hash; anderer Schlüssel → anderer Hash; leer/`null` → `null`; Ergebnis 64 Hex-Zeichen; Schlüssel unter 32 Zeichen → Fehler |
| `sightingRepository` (erweitert)                    | `saveSighting` setzt `reporterHash`; ohne Schlüssel wird trotzdem gespeichert (Hash `null`, Fehler geloggt)                                                                                                 |
| `sightingRepository` (erweitert)                    | `updateSighting` berechnet den Hash neu, wenn sich die E-Mail ändert, und lässt ihn sonst unangetastet                                                                                                      |
| `src/lib/server/privacy/piiColumns.test.ts` (Guard) | jede Spalte von `sightings` ist in `PII_COLUMNS` oder `NON_PII_COLUMNS` eingeordnet; eine neue Spalte ohne Einordnung bricht den Test                                                                       |
| Backfill-Werkzeug                                   | hasht nur Zeilen mit E-Mail und ohne Hash; zweiter Lauf ändert nichts; bricht ohne Schlüssel ab                                                                                                             |

### Umsetzung

1. **Schema** (`src/lib/server/db/schema.ts`):
   - `reporterHash: varchar('melder_hash', { length: 64 })`
   - `anonymizedAt: timestamp('anonymisiert_am', { mode: 'date' })`
   - Index `idx_melder_hash` auf `melder_hash`
   - `npm run db:generate`, Migration `drizzle/0009_*.sql` committen.
2. **Umgebungsvariable** `REPORTER_HASH_KEY` in `src/env.ts` eintragen
   (`{ schema: asIs }`, wie `CLEANUP_TOKEN`), Mindestlänge 32 im Modul prüfen.
3. **Modul** `src/lib/server/privacy/reporterHash.ts`:
   - `computeReporterHash(email, key): string | null`, pure, über
     `node:crypto` `createHmac('sha256', key)`.
   - Normalisierung über die vorhandene `normalizeReporterKey` aus
     `src/lib/server/db/reporterHistory.ts`. Eine Gleichheit für Historie und
     Hash, keine zweite.
   - `getReporterHashKey(): string | null` liest und prüft den Schlüssel.
4. **Repository:** `saveSighting` und `updateSighting` setzen den Hash. Eine
   Zeile mit `anonymizedAt` wird nie neu gehasht.
5. **Backfill:** `src/tools/hash-reporters.ts` mit
   `npm run privacy:hash-reporters` und `:dry-run`. Stapel zu 500 Zeilen, in Node
   gehasht, nicht in SQL (der Schlüssel gehört in keine SQL-Anweisung). Dieselbe
   Funktion nutzt später Schritt 1 des Jobs.
6. **Klassifizierung** `src/lib/server/privacy/piiColumns.ts`: welche Spalten
   personenbezogen sind und unter welcher Bedingung sie geleert werden. Die
   Liste ist die einzige Quelle für PR 4.

**Größe:** M · **Commit:** `feat(db): add reporter hash for linking reports without email`

### Nach dem Merge

1. Schlüssel erzeugen (`openssl rand -base64 48`), getrennt für Staging und
   Production, im Passwort-Manager des Museums sichern.
2. Deploy auf Staging, Backfill-Vorschau, Backfill, Stichprobe.
3. Promote to Production, Backfill auf Production.
4. Prüfen: `SELECT count(*) FROM sichtungen WHERE email <> '' AND melder_hash IS NULL;` → 0.

---

## PR 3 — Melder-Historie auf den Hash umstellen

Die Melder-Historie (Badge in Eingang und Detailansicht) zählt heute über
`lower(trim(email))`. Nach der Anonymisierung fände sie nichts mehr.

### Tests zuerst

- `reporterHistory.test.ts`: gruppiert über `reporterHash` statt `email`. Zwei
  Meldungen mit gleichem Hash und **ohne** E-Mail (bereits anonymisiert) zählen
  zusammen. Ohne Hash keine Historie.
- Admin-Liste `/admin/sichtungen`: Der Filter `melder=<hash>` liefert alle
  Meldungen dieses Hashes. Eine Suche nach einer vollständigen E-Mail-Adresse
  findet zusätzlich über den Hash auch anonymisierte Meldungen.
- `AdminSightingView`: Der Link „Meldungen dieses Melders" nutzt `melder=<hash>`
  statt `q=<email>`.

### Umsetzung

- `src/lib/server/db/reporterHistory.ts`: `ReporterHistoryInput` bekommt
  `reporterHash` statt `email`; Abfrage über `melder_hash` (jetzt mit Index, der
  Seq Scan aus dem Dateikommentar entfällt).
- Aufrufer anpassen: `src/routes/admin/+page.server.ts`,
  `src/routes/admin/[id]/+page.ts`, `src/routes/api/sightings/[id]/reporter-history/+server.ts`.
- `src/routes/admin/sichtungen/+page.server.ts`: Parameter `melder`; bei einer
  Suche, die eine vollständige Adresse ist, zusätzlich `OR melder_hash = <hash>`.
- `AdminSightingView.svelte`: `reporterSearchHref` über den Hash. Das beseitigt
  nebenbei die dort kommentierte Ungenauigkeit (`a@b.de` fand auch `xa@b.de`).
- **Legacy** `showreports.json`: Die Admin-Suche bleibt unverändert. Optional
  ergänzend `OR melder_hash = <hash>` bei vollständiger Adresse, ohne den
  bestehenden Pfad zu ersetzen.

**Größe:** M · **Commit:** `feat(admin): link reporter history via reporter hash`

---

## PR 4 — Anonymisierungs-Job

### Tests zuerst

| Test                          | Prüft                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anonymizationPatch.test.ts`  | Feld-Matrix für alle vier Kombinationen aus `namensnennung` × `schiffnamensnennung`; Freitexte, Hash und Einwilligungsnachweise bleiben unberührt                                                           |
| `anonymizationCutoff.test.ts` | Fälligkeit: genau an der Grenze, ein Tag davor und danach, Monatsende (31. Mai → 31. Aug./1. Sep.), Sommerzeitwechsel                                                                                       |
| `anonymizeSightings.test.ts`  | holt fehlende Hashes nach, bevor geleert wird; bricht ohne Schlüssel ab, bevor irgendetwas geleert wird; Vorschau ändert nichts; zweiter Lauf ändert nichts; maßgeblich ist `created`, nicht der Prüfstatus |
| Endpunkt `anonymize`          | 401 ohne Session/Token; Vorschau ist Standard; `mode=execute` leert; Audit-Eintrag ohne personenbezogene Werte                                                                                              |
| `updateSighting` (erweitert)  | Kontaktfelder einer anonymisierten Zeile werden serverseitig abgewiesen                                                                                                                                     |

### Umsetzung

- **Konstante** `ANONYMIZE_AFTER_MONTHS = 3` in `src/lib/constants/reporterDataRetention.ts`
  (neben `uploadRetention.ts`). Keine Konfiguration: Die Frist ist eine Vorgabe
  der Aufsicht.
- **Pure Funktion** `buildAnonymizationPatch(row)` in
  `src/lib/server/privacy/anonymizationPatch.ts`, gespeist aus `piiColumns.ts`.
- **Ablauf** `anonymizeSightings({ mode, limit, now })` in
  `src/lib/server/privacy/anonymizeSightings.ts`:
  1. Schlüssel prüfen, sonst Abbruch.
  2. Fehlende Hashes nachholen (Funktion aus PR 2).
  3. Fällige Zeilen
     (`created < now - 3 months + 1 day AND anonymisiert_am IS NULL`) in
     Stapeln zu 500 leeren, eine Transaktion pro Stapel, `anonymisiert_am = now()`.
  4. Ergebnis: Anzahl gehasht, Anzahl anonymisiert, Grenzdatum.
- **Endpunkt** `POST /api/admin/anonymize`, aufgebaut wie
  `src/routes/api/admin/cleanup-orphans/+server.ts`: Admin-Session oder Bearer
  `CLEANUP_TOKEN`, Rate-Limit, Audit `privacy.anonymize`.
- **CLI** `src/tools/anonymize-sightings.ts`, `npm run privacy:anonymize` und
  `:dry-run`.
- **Sperre** in `updateSighting`: Kontaktfelder bei `anonymizedAt` nicht
  schreibbar.

**Größe:** M · **Commit:** `feat(security): anonymize reporter data 3 months after receipt`

---

## PR 5 — Admin-Oberfläche

### Tests zuerst (Komponenten-Tests)

- Detailansicht: Bei `anonymizedAt` steht „Kontaktdaten anonymisiert am …"
  statt leerer Zeilen; die Felder im Bearbeiten-Formular sind schreibgeschützt.
- Einstellungen: Panel zeigt letzten Lauf und die Zahl der Meldungen über der
  Frist; > 0 wird als Fehler (`alert-error`) dargestellt.
- Eingang: Hinweis bei ungeprüften Meldungen, die in ≤ 14 Tagen fällig werden
  („Rückfragen nur noch bis …").

### Umsetzung

- `src/lib/components/admin/AdminSightingView.svelte`, `AdminSightingEditForm.svelte`
- `src/routes/admin/settings/`: neues `AnonymizationPanel.svelte` neben
  `CleanupPanel.svelte`, mit Vorschau und Ausführen.
- `SightingInboxCard.svelte`: Fristhinweis.
- Design-System-Regeln beachten (Theme-Tokens, `*-content` nur auf
  Vollton-Flächen, WCAG AA).

**Größe:** M · **Commit:** `feat(admin): show anonymization state and deadline`

---

## PR 6 — Dokumentation

Kann parallel zu PR 4/5 entstehen und mit dem letzten von beiden gemergt werden.

- `docs/ENVIRONMENT.md`: Abschnitt `REPORTER_HASH_KEY` (Pflicht, nie rotieren,
  getrennt sichern, eigener Wert für Staging).
- `docs/LEGACY_API_SPECIFICATION.md`: Name, E-Mail und Schiffsname alter
  Meldungen sind nach 3 Monaten leer; Felder, Pfade und Typen unverändert.
- `docs/RELEASE_PIPELINE.md` bzw. Cron-Doku: Aufruf von `/api/admin/anonymize`.
- `src/routes/about/+page.svelte`: Frist nennen; die Zusage „wie lange sie
  gespeichert bleiben" stimmt damit erstmals.
- `CLAUDE.md`: Eintrag in der Dokumenten-Tabelle; kurze Regel „neue Spalte in
  `sichtungen` → in `piiColumns.ts` einordnen".
- `docs/archive/DATENSCHUTZ_ABGLEICH_DMM_2026-08-02.md`: Punkt 2.1 als erledigt
  markieren.
- **Textvorschlag an das Museum** für die Datenschutzerklärung: Frist von
  3 Monaten, Kennzeichen zur Verknüpfung von Meldungen.

**Größe:** S · **Commit:** `docs(security): document reporter data retention`

---

## Rollout

| Schritt | Wer            | Was                                                                                                                   |
| ------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1       | Entwicklung    | PR 1 und PR 2 mergen, Schlüssel setzen, Backfill auf Staging und Production                                           |
| 2       | Entwicklung    | PR 3 mergen, Melder-Historie auf Production gegen Stichproben prüfen                                                  |
| 3       | Entwicklung    | PR 4–6 mergen, auf Staging Vorschau und echten Lauf testen                                                            |
| 4       | Museum         | **Datenbank-Backup** vor dem ersten Lauf, mit festgelegter Löschfrist (höchstens 3 Monate)                            |
| 5       | Entwicklung    | Vorschau auf Production: Anzahl betroffener Meldungen dem Museum vorlegen                                             |
| 6       | Museum         | **Schriftliche Freigabe** des ersten Laufs. Er leert praktisch den gesamten Bestand seit 2009 und ist nicht umkehrbar |
| 7       | Entwicklung    | Erster Lauf mit `mode=execute`, danach Prüfung: Zahl über der Frist = 0                                               |
| 8       | Entwicklung    | Täglichen Cron einrichten (gemeinsam mit dem Aufräum-Aufruf)                                                          |
| 9       | Museum         | Datenschutzerklärung ergänzen; Aufbewahrungsregel für Benachrichtigungs-Mails und Exporte festlegen                   |
| 10      | Prüfung (Team) | Freitexte ab jetzt bei der Prüfung auf Kontaktdaten durchsehen                                                        |

## Risiken

| Risiko                                       | Gegenmaßnahme                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Schlüssel geht verloren                      | getrennt gesichert; Verlust trennt nur künftige von alten Meldungen, zerstört keine Daten              |
| Cron fällt still aus, Frist wird verletzt    | Panel in den Einstellungen zeigt Meldungen über der Frist als Fehler                                   |
| Altsystem schreibt Zeilen ohne Hash          | Job holt den Hash vor dem Leeren nach                                                                  |
| Neue Spalte mit Personenbezug wird vergessen | Guard-Test `piiColumns.test.ts`                                                                        |
| Legacy-Clients brechen an leeren Feldern     | Ausgabe fängt `NULL` bereits ab (`\|\| ''`); Contract-Tests in `src/tests/contract/` decken das mit ab |
