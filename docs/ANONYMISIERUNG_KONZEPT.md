# Konzept: Anonymisierung personenbezogener Meldedaten nach 3 Monaten

**Stand:** 2026-11-02 · **Status:** Entwurf, Entscheidungen E1–E3 getroffen (2026-11-02), noch nicht umgesetzt · **Keine Rechtsberatung.**

## 1. Anlass und Vorgabe

Der Landesdatenschutzbeauftragte Mecklenburg-Vorpommern hat das Deutsche
Meeresmuseum angewiesen, personenbezogene Daten aus Sichtungsmeldungen
**spätestens 3 Monate nach Eingang** zu löschen oder zu anonymisieren, wenn die
meldende Person der Veröffentlichung ihres Namens nicht zugestimmt hat. Die
Meldung selbst (Tier, Ort, Zeit, Beobachtungen) bleibt erhalten, damit
Langzeittrends auf der Karte darstellbar bleiben.

Das schließt den offenen Punkt 2.1 aus
`docs/archive/DATENSCHUTZ_ABGLEICH_DMM_2026-08-02.md`: Bisher gibt es für
Sichtungen weder eine Frist noch einen Löschjob, und der Bestand reicht bis 2009
zurück.

**Mit dem Datenschutz abgestimmt (2026-11):** Meldungen derselben Person sollen
auch nach der Anonymisierung zusammengeführt werden können. Dafür bleibt ein
Hash der E-Mail-Adresse gespeichert, aus dem sich die Adresse nicht berechnen
lässt.

## 2. Überblick

```
Eingang ─► melder_hash = HMAC(E-Mail) wird sofort gesetzt
            │
            │  ≤ 3 Monate: Kontaktdaten vorhanden, Rückfragen möglich
            ▼
Täglicher Job ─► Kontaktdaten leeren, anonymisiert_am setzen
                 melder_hash bleibt → Mehrfachmeldungen bleiben verknüpft
```

Zwei neue Spalten in `sichtungen`:

| Spalte            | Typ           | Bedeutung                                                       |
| ----------------- | ------------- | --------------------------------------------------------------- |
| `melder_hash`     | `varchar(64)` | HMAC-SHA256 der normalisierten E-Mail, hex. `NULL` ohne E-Mail. |
| `anonymisiert_am` | `timestamp`   | Zeitpunkt der Anonymisierung. `NULL` = noch nicht anonymisiert. |

Dazu ein Index auf `melder_hash`. Feldnamen im TypeScript-Schema:
`reporterHash`, `anonymizedAt`.

## 3. Der Hash

### 3.1 Warum HMAC und kein einfaches SHA-256

Ein ungesalzener SHA-256 der E-Mail lässt sich **nicht zurückrechnen, aber
nachrechnen**: Wer eine Adresse vermutet, hasht sie und vergleicht. E-Mail-Adressen
sind gut zu raten (Vorname.Nachname@Anbieter), Adresslisten sind verbreitet, und
weil das Repository öffentlich ist, ist auch das Verfahren bekannt. Mit einem
Datenbank-Dump allein ließe sich dann prüfen, ob eine bestimmte Person gemeldet
hat.

Deshalb **HMAC-SHA256 mit einem geheimen Schlüssel**, der nicht in der Datenbank
liegt:

```ts
reporterHash = HMAC_SHA256((key = REPORTER_HASH_KEY), (message = normalize(email))); // hex, 64 Zeichen
```

Ohne den Schlüssel ist der Hash ein reines Zufallsmerkmal. Mit dem Schlüssel
kann die Anwendung, und nur sie, zu einer **gegebenen** Adresse den Hash bilden.
Genau das braucht man für Auskunfts- und Löschersuchen (siehe 6.2).

Rechtlich ist das eine **Pseudonymisierung** (Art. 4 Nr. 5 DSGVO), keine
Anonymisierung im strengen Sinn. Laut Abstimmung mit dem Datenschutz ist das so
gewollt. Empfehlung: In der Datenschutzerklärung einen Satz dazu aufnehmen (Art.
13 DSGVO), etwa: „Nach Ablauf der Frist werden Ihre Kontaktdaten gelöscht. Damit
mehrere Meldungen derselben Person wissenschaftlich ausgewertet werden können,
bleibt ein nicht umkehrbares Kennzeichen gespeichert."

### 3.2 Normalisierung

`normalize(email) = email.normalize('NFC').trim().toLowerCase()`

Leer oder nur Leerzeichen → kein Hash (`NULL`). Dieselbe Normalisierung, die die
Spam-Erkennung schon für `sameEmail` nutzt (`lower(trim(email))`). Weiter wird
bewusst nicht normalisiert: keine Sonderregeln für Gmail-Punkte oder
`+`-Adressen. Zwei Schreibweisen derselben Person bleiben zwei Gruppen; das ist
hinnehmbar und vorhersagbar.

### 3.3 Schlüsselverwaltung

- Umgebungsvariable `REPORTER_HASH_KEY`, mindestens 32 Byte Zufall
  (`openssl rand -base64 48`). Validierung in `src/lib/server/env.ts`, Doku in
  `docs/ENVIRONMENT.md`.
- **Nicht rotieren.** Nach der Anonymisierung gibt es keine E-Mail mehr, aus der
  man mit einem neuen Schlüssel neu hashen könnte. Ein neuer Schlüssel trennt
  alle künftigen Meldungen von allen bisherigen. Rotation nur bei
  nachgewiesener Kompromittierung, und dann bewusst mit diesem Bruch.
- **Getrennt von der Datenbank sichern** (Passwort-Manager des Museums).
  Schlüssel und Dump zusammen machen die Pseudonymisierung schwächer. Geht der
  Schlüssel verloren, gilt dasselbe wie bei Rotation.
- Staging bekommt einen **eigenen** Schlüssel. Hashes aus Staging und Production
  sind damit nicht vergleichbar.

### 3.4 Fehlender Schlüssel

Zwei Fälle, bewusst unterschiedlich behandelt:

- **Beim Eingang:** Die Meldung wird trotzdem gespeichert, `melder_hash` bleibt
  `NULL`, es wird ein Fehler geloggt. Ein abgewiesener Eingang würde Meldungen
  kosten, auch die der drei Legacy-Clients, deren Nutzer von einem Fehlschlag
  nichts erfahren (siehe CLAUDE.md).
- **Beim Anonymisieren:** Der Job **bricht ab**, bevor er etwas leert. Ohne
  Schlüssel könnte er den Hash nicht nachholen, und die Verknüpfung ginge für
  diese Zeilen endgültig verloren.

## 4. Wann der Hash gesetzt wird

Nicht erst bei der Anonymisierung, sondern **beim Eingang**. Nur so lässt sich
eine Meldung von heute mit einer von vor fünf Jahren verknüpfen, deren E-Mail
längst gelöscht ist.

| Weg                                      | Wo                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Webformular und Legacy-Apps              | einziger Insert in `sightingRepository.ts` (`saveSighting`)              |
| Admin ändert die E-Mail                  | Update in `sightingRepository.ts` (`updateSighting`): Hash neu berechnen |
| Zeilen ohne Hash (Altsystem, Altbestand) | Schritt 1 des Jobs holt ihn nach, solange die E-Mail noch vorhanden ist  |

Das Altsystem schreibt auf dieselbe Datenbank und kennt die Spalte nicht. Seine
Zeilen bekommen den Hash deshalb erst über den Job. Die Frist von 3 Monaten
reicht dafür, solange der Job täglich läuft.

Eine bereits anonymisierte Zeile (`anonymisiert_am IS NOT NULL`) wird nie neu
gehasht, auch wenn ein Admin dort eine E-Mail einträgt. Das wäre ein neuer
Personenbezug und sollte in der Admin-Maske gesperrt sein (siehe 7).

## 5. Was anonymisiert wird

### 5.1 Fälligkeit

`created < now() - interval '3 months' + interval '1 day' AND anonymisiert_am IS NULL`

- Maßgeblich ist `created` (Eingang), **nicht** der Prüfstatus. Sonst blieben
  ungeprüfte oder abgelehnte Meldungen unbegrenzt liegen.
- Ein Tag Puffer, damit ein täglicher Lauf die Grenze „spätestens 3 Monate"
  sicher einhält, auch wenn er einmal ein paar Stunden später läuft.
- Die Frist steht als Konstante neben `ORPHAN_RETENTION_HOURS` in
  `src/lib/constants/`, nicht als Konfigurationswert: Sie ist eine Vorgabe der
  Aufsicht und keine Einstellung.

### 5.2 Feld-Matrix

| Feld(er)                                                               | ohne Namens-Einwilligung | mit Namens-Einwilligung (`namensnennung = 1`) |
| ---------------------------------------------------------------------- | ------------------------ | --------------------------------------------- |
| `vorname`, `name`                                                      | `NULL`                   | bleibt (ist veröffentlicht)                   |
| `email`                                                                | `NULL`                   | `NULL` (E1)                                   |
| `telefon`, `fax`                                                       | `NULL`                   | `NULL` (E1)                                   |
| `strasse`, `plz`, `ort`                                                | `NULL`                   | `NULL` (E1)                                   |
| `schiffsname`, `heimathafen`                                           | bleibt (E2)              | bleibt (E2)                                   |
| Freitexte (`bemerkungen`, `sonstige_auffaelligkeiten`, `*_text`, …)    | bleibt (E3)              | bleibt (E3)                                   |
| `melder_hash`                                                          | bleibt                   | bleibt                                        |
| `anonymisiert_am`                                                      | `now()`                  | `now()`                                       |
| alles andere (Tier, Ort, Zeit, Wetter, Status, Einwilligungsnachweise) | bleibt                   | bleibt                                        |

`NULL` statt Leerstring: Alle Ausgabewege fangen `NULL` bereits ab
(`showreports.json` bildet `na` mit `|| ''`, die Exporte ebenso). Für die
Legacy-API ändern sich weder Feldnamen noch Pfade noch Typen, nur die Werte
alter Meldungen. Das wird in `docs/LEGACY_API_SPECIFICATION.md` dokumentiert.

Die Einwilligungsnachweise (`*_am`, `*_version`) bleiben stehen. Sie belegen
nach Art. 7 Abs. 1 DSGVO, was zugestimmt wurde, und enthalten selbst keinen
Personenbezug.

### 5.3 Entscheidungen (2026-11-02)

- **E1 — Kontaktdaten bei Namens-Einwilligung: leeren.** Die Weisung nennt nur
  Meldungen ohne Namens-Einwilligung. Die Namens-Einwilligung erlaubt aber nur
  die Veröffentlichung von Vor- und Nachname; E-Mail, Telefon und Anschrift
  wurden auch bei diesen Personen „ausschließlich für Rückfragen" erhoben. Sie
  werden deshalb immer geleert, der Name bleibt nur bei Einwilligung. Die
  Mehrfachzuordnung trägt der Hash.
- **E2 — Schiffsname und Heimathafen: nicht leeren.** Beide Felder bleiben
  unabhängig von `schiffnamensnennung` gespeichert; veröffentlicht werden sie
  weiterhin nur mit dieser Einwilligung. Hinweis für die Abstimmung mit dem
  Museum: Bei Sportbooten führen Schiffsname und Heimathafen oft direkt zum
  Eigner. Die Felder bleiben damit personenbeziehbar, und das sollte der
  Datenschutzbeauftragte ausdrücklich mittragen.
- **E3 — Freitexte: nicht leeren.** Automatisch leeren würde fachliche
  Beobachtungen vernichten. Personenbezogene Angaben in Freitexten
  („bitte Rückruf unter …") bereinigt die Prüfung von Hand innerhalb der 3
  Monate. Eine Erkennung von E-Mail- und Telefonnummern-Mustern als Hinweis in
  der Admin-Ansicht wäre eine mögliche spätere Ausbaustufe.

## 6. Der Job

### 6.1 Ablauf

Ein Lauf, idempotent, in Stapeln (z. B. 500 Zeilen):

1. **Schlüssel prüfen.** Fehlt `REPORTER_HASH_KEY` → Abbruch (siehe 3.4).
2. **Hash nachholen** für Zeilen mit E-Mail und `melder_hash IS NULL`
   (Altsystem, Altbestand). Das geschieht in Node, nicht in SQL: eine einzige
   Implementierung des Hashes, und der Schlüssel landet nicht in einer
   SQL-Anweisung oder Migration.
3. **Anonymisieren** aller fälligen Zeilen nach der Matrix, in einer
   Transaktion pro Stapel.
4. **Audit-Eintrag** `privacy.anonymize` mit Anzahl und Grenzdatum, ohne
   personenbezogene Werte.

Zwei Zugänge, analog zu `POST /api/admin/cleanup-orphans`:

- `POST /api/admin/anonymize`, mit Admin-Session oder `Authorization: Bearer`
  für einen externen Web-Cron. Standard ist die Vorschau (Anzahl der fälligen
  Zeilen); geleert wird nur mit `mode=execute`. Ob dafür `CLEANUP_TOKEN`
  mitbenutzt oder ein eigener Token eingeführt wird, ist bei der Umsetzung zu
  entscheiden. Einfacher ist es, den Schritt in den bestehenden Cron-Aufruf zu
  hängen.
- CLI `npm run privacy:anonymize` und `privacy:anonymize:dry-run` für
  Backfill und Wartung.

### 6.2 Auskunft und Löschung über den Hash

Mit dem Schlüssel lässt sich zu einer **genannten** Adresse der Hash bilden. Damit
findet die Admin-Suche auch anonymisierte Meldungen einer Person:

- **Auskunftsersuchen (Art. 15):** „Welche Meldungen haben Sie von mir?" →
  Adresse hashen, Treffer auflisten.
- **Löschersuchen (Art. 17):** Dieselbe Suche; anschließend den `melder_hash`
  der Treffer auf `NULL` setzen. Die Meldungen bleiben, die Verknüpfung ist weg.
- **Mehrfachmeldungen in der Admin-Ansicht:** „Weitere Meldungen dieser Person
  (n)" über gleichen `melder_hash`.

Die Legacy-Suche in `showreports.json` durchsucht für Admins `email` per
`ILIKE`. Bei anonymisierten Meldungen findet sie nichts mehr. Das ist gewollt
und wird dokumentiert. Eine exakte Suche über den Hash kann ergänzt werden, ohne
den bestehenden Codepfad zu ersetzen.

### 6.3 Überwachung

Ein Cron, der still ausfällt, verletzt die Frist, ohne dass es jemand merkt.
Deshalb im Admin-Bereich (Einstellungen, neben dem Aufräum-Panel) anzeigen:

- Zeitpunkt des letzten erfolgreichen Laufs,
- Anzahl der Meldungen, die **über die Frist** sind und noch Kontaktdaten haben.
  Sobald das mehr als 0 ist: deutlich als Fehler markieren.

## 7. Auswirkungen an anderen Stellen

| Stelle                              | Was zu tun ist                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin-Detailansicht                 | Bei `anonymisiert_am`: „Kontaktdaten anonymisiert am …" statt leerer Felder; Kontaktfelder schreibgeschützt.                                                                                                                                                                                          |
| Admin-Posteingang                   | Optional: Hinweis auf Meldungen, die in den nächsten 14 Tagen fällig werden und noch ungeprüft sind. Danach sind keine Rückfragen mehr möglich.                                                                                                                                                       |
| **Server-Log**                      | `sightingRepository.ts` loggt beim Speichern das ganze `sightingData` (`logger.info({ sightingData }, …)`), also auch Name, E-Mail und Telefon. Das muss auf ID und Flags reduziert werden, sonst bleiben die Daten im Log über die Frist hinaus. Eigener kleiner Fix, unabhängig von diesem Konzept. |
| Benachrichtigungs-Mail an Admins    | Das Template (`notificationEmailDefault.ts`) enthält Name und E-Mail. Die Postfächer liegen außerhalb der Anwendung; das Museum braucht dafür eine eigene Aufbewahrungsregel.                                                                                                                         |
| Exporte (CSV, JSON, XML, KML)       | Exporte nach der Anonymisierung enthalten automatisch keine Kontaktdaten mehr. Bereits heruntergeladene Dateien liegen außerhalb der Anwendung.                                                                                                                                                       |
| Backups                             | Werden nicht umgeschrieben, brauchen aber eine Aufbewahrungsfrist (z. B. höchstens 3 Monate), sonst sind die Daten dort weiter vorhanden.                                                                                                                                                             |
| Audit-Log                           | Unkritisch: `sighting.edit` speichert nur die **Namen** geänderter Felder, keine Werte.                                                                                                                                                                                                               |
| Spam-Erkennung                      | Unberührt: `sameEmail` betrachtet nur die letzten 24 Stunden.                                                                                                                                                                                                                                         |
| Medien (EXIF, Personen auf Bildern) | Eigenes Thema aus dem Datenschutz-Abgleich, hier nicht enthalten.                                                                                                                                                                                                                                     |

## 8. Einführung

1. Migration: Spalten `melder_hash`, `anonymisiert_am` und Index
   (`npm run db:generate`, committen).
2. Schlüssel `REPORTER_HASH_KEY` auf Staging und Production setzen und separat
   sichern.
3. Deploy. Ab jetzt bekommen neue Meldungen den Hash beim Eingang.
4. Backfill der Hashes über den gesamten Bestand: `npm run privacy:anonymize:dry-run`,
   dann der Hash-Schritt.
5. **Vorschau dem Museum vorlegen:** Der erste Lauf leert praktisch den gesamten
   Bestand seit 2009. Das ist nicht umkehrbar.
6. Erster echter Lauf, danach täglich per Cron.
7. Datenschutzerklärung bzw. `/about` um Frist und Pseudonym ergänzen; die
   Zusage auf `/about`, dass dort steht, „wie lange sie gespeichert bleiben",
   ist damit erstmals erfüllt.

## 9. Tests (Test-First)

| Test                             | Prüft                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reporterHash.test.ts`           | gleiche Adresse in anderer Schreibweise → gleicher Hash; anderer Schlüssel → anderer Hash; leer → `null`; 64 Hex-Zeichen                                                                                |
| `anonymizationPatch.test.ts`     | die Feld-Matrix aus 5.2 für alle Kombinationen von `namensnennung` und `schiffnamensnennung`                                                                                                            |
| `anonymizationCutoff.test.ts`    | Grenzfälle der Fälligkeit (genau an der Grenze, ein Tag davor und danach, Monatsende)                                                                                                                   |
| `sightingRepository` (erweitert) | Insert setzt den Hash; E-Mail-Änderung berechnet ihn neu; anonymisierte Zeile wird nie neu gehasht                                                                                                      |
| `anonymize`-Endpunkt             | 401 ohne Session/Token, Vorschau als Standard, Abbruch ohne Schlüssel, Idempotenz                                                                                                                       |
| **Guard** `piiColumns.test.ts`   | Jede Spalte von `sichtungen` ist als „personenbezogen" oder „nicht personenbezogen" eingeordnet. Eine neue Spalte ohne Einordnung bricht den Test, statt still außerhalb der Anonymisierung zu bleiben. |
