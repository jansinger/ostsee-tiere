# Abgleich: DMM-Datenschutzerklärung ↔ tatsächliches Verhalten der App

**Stand:** 2026-08-02 · **Codebasis:** `cc08affd` (main) · **Quelle:** https://www.deutsches-meeresmuseum.de/datenschutz (Fassung 05.11.2024)
**Zweck:** Fundliste als Entscheidungsgrundlage für das Museum. **Keine Rechtsberatung.**

Die App verlinkt die DMM-Erklärung an drei Stellen und hat keine eigene Datenschutzseite
(`find src/routes -iname "*datenschutz*"` ist leer):
[PublicFooter.svelte:42](../../src/lib/components/PublicFooter.svelte#L42),
[about/+page.svelte:330](../../src/routes/about/+page.svelte#L330) sowie die Einwilligungstexte im Formular.

---

## 0. Ausgangsbefund: Die Erklärung kennt die Sichtungsmeldungen

Anders als bei Beginn der Prüfung vermutet, ist die Verarbeitung **nicht unerwähnt**. Wörtlich:

> „Sie haben die Möglichkeit, die wissenschaftliche Arbeit des Deutschen Meeresmuseums zu
> unterstützen und Sichtungen von Meeressäugetieren der Ostsee sowie Totfunde an der Küste
> Mecklenburg-Vorpommerns an uns zu melden. Die im Online-Erhebungsbogen erfassten
> personenbezogenen Daten nutzen wir auf der Basis Ihrer Einwilligung im dort erklärten Umfang
> für die Bereitstellung der Sichtungsinformationen im Internet und die Kontaktaufnahme durch
> unsere Wissenschaftler bei Nachfragen zu den Meldungen. […]"

Das ist ein **Verweis auf den Formulartext** („im dort erklärten Umfang"), keine eigenständige
Beschreibung. Die Erklärung deckt damit das _Ob_ der Verarbeitung ab, delegiert das _Was_ aber an
die App. Alles unten Genannte ist an dieser Formulierung zu messen.

---

## 1. Von der DMM-Erklärung abgedeckt

| Punkt                                                          | Fundstelle im Code                                                                         | Bewertung                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Erhebung von Sichtungsdaten (Datum, Position, Tierart, Anzahl) | [schema.ts:33–58](../../src/lib/server/db/schema.ts#L33-L58)                               | Vom Absatz oben und dem Verweis auf den Erhebungsbogen getragen   |
| Veröffentlichung der Sichtungsinformationen im Internet        | [publicMapConditions.ts:31](../../src/routes/api/map/sightings/publicMapConditions.ts#L31) | Ausdrücklich genannt („Bereitstellung … im Internet")             |
| Kontaktdaten für Rückfragen durch Wissenschaftler              | [schema.ts:63–70](../../src/lib/server/db/schema.ts#L63-L70)                               | Ausdrücklich genannt („Kontaktaufnahme … bei Nachfragen")         |
| Rechtsgrundlage Einwilligung (Art. 6 Abs. 1 lit. a)            | [sightingSchema.ts:1218–1224](../../src/lib/form/validation/sightingSchema.ts#L1218-L1224) | Erklärung nennt Einwilligung als Grundlage für Sichtungsmeldungen |
| Betroffenenrechte, Widerruf, Beschwerderecht                   | —                                                                                          | Vollständig in der DMM-Erklärung (Art. 15–21, 77)                 |
| Verantwortlicher + Datenschutzbeauftragter                     | —                                                                                          | Stiftung DMM, Stralsund; ECOVIS Rostock                           |

---

## 2. Nicht abgedeckt

Nach Wirkung sortiert, nicht nach Aufwand.

### 2.1 Keine Löschfrist für Sichtungen — und `/about` sagt das Gegenteil

> **Erledigt (2026-11).** Auf Weisung des Landesdatenschutzbeauftragten MV
> leert ein täglicher Job die Kontaktdaten jeder Meldung 3 Monate nach Eingang,
> Name und Schiff ohne Einwilligung ebenso; ein HMAC-Hash hält Meldungen einer
> Person verknüpft. Die Frist steht auf `/about` im Text. Konzept:
> `docs/ANONYMISIERUNG_KONZEPT.md`, Umsetzung: `docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md`.
> Ein Textvorschlag für die Datenschutzerklärung des Museums steht dort im
> Abschnitt zu PR 6. Der Befund unten bleibt als Stand vom 2026-08-02 stehen.

Die einzige Aufbewahrungsregel im Code betrifft **verwaiste Uploads (24 h)**
([uploadRetention.ts:15](../../src/lib/constants/uploadRetention.ts#L15)). Für Sichtungen samt Klarnamen,
Anschrift und Telefonnummer existiert weder Frist noch Löschjob; der Bestand reicht bis 2009 zurück.

Die DMM-Erklärung nennt Fristen für Tickets (3 Monate), Kontaktformular (6 Monate) und Bewerbungen
(6 Monate) — **für Sichtungsmeldungen keine**.

Seit PR #700 sagt `/about` jedoch ausdrücklich zu, dass genau das dort stehe
([+page.svelte:324](../../src/routes/about/+page.svelte#L324)):

> „Welche Daten wozu verarbeitet werden, **wie lange sie gespeichert bleiben**, welche Rechte Sie
> haben und an wen Sie sich damit wenden: das steht **vollständig** in der Datenschutzerklärung des
> Deutschen Meeresmuseums."

Von den vier aufgezählten Aspekten liefert die verlinkte Erklärung zwei (Rechte, Ansprechpartner),
einen nur mittelbar über den Verweis auf den Formulartext (welche Daten wozu) und einen **gar
nicht** (wie lange). Die Kürzung hat die alte Falschaussage beseitigt (siehe §3.1) und dabei eine
präzisere an ihre Stelle gesetzt: eine überprüfbare Vollständigkeitszusage über ein fremdes
Dokument.

### 2.2 Fotos: EXIF bleibt in der ausgelieferten Datei

Der Upload speichert den **Rohpuffer ungefiltert**; parallel werden die EXIF-Daten (inkl.
GPS-Position und Gerätekennung) zusätzlich in die Datenbank geschrieben:

- [upload/+server.ts:234–239](../../src/routes/api/files/upload/+server.ts#L234-L239) — `storage.upload(file, buffer, …)` neben `readImageExifData(buffer)`
- [upload/+server.ts:256](../../src/routes/api/files/upload/+server.ts#L256) — `uploadedFile.exifData = metadata`
- [schema.ts:165](../../src/lib/server/db/schema.ts#L165) — Spalte `exif_daten`
- [exifUtils.ts:36–46](../../src/lib/server/media/exifUtils.ts#L36-L46) — gelesen werden u. a. `GPSLatitude`, `GPSLongitude`, `GPSAltitude`, `Make`, `Model`

**Einordnung — die Lücke ist latent, nicht offen.** Die Endpunkte prüfen bei freigegebenen
Sichtungen zwar keine Anmeldung (`isSightingApproved(file)` → `public, max-age=…` in
[uploads/[...path]:105](../../src/routes/uploads/[...path]/+server.ts#L105) und
[api/media/[...path]:193](../../src/routes/api/media/[...path]/+server.ts#L193)) — **aber kein
öffentlicher Endpunkt gibt einen Pfad oder Dateinamen heraus**, geprüft gegen `cc08affd`:

- `GET /api/sightings/[id]` ist die einzige Route mit `uploadedFiles` und admin-gated
  ([+server.ts:44](../../src/routes/api/sightings/[id]/+server.ts#L44))
- `GET /api/sightings`, `showreports.json` und die Kartenabfrage selektieren keine Medienfelder;
  ein `GET /rest_sichtungen` existiert nicht
- Die Medien-UI läuft nur über
  [AdminSightingView.svelte:682](../../src/lib/components/admin/AdminSightingView.svelte#L682)
- Der Pfad besteht aus zwei cuid2-Werten ([local.ts:137](../../src/lib/server/storage/local.ts#L137)) —
  nicht aufzählbar

Ohne Pfad kommt niemand an die Datei. Kein aktives Leck, sondern eine Vorbedingung, die kippt,
sobald Fotos öffentlich angezeigt werden — wofür `mediaConsent`
([schema.ts:105](../../src/lib/server/db/schema.ts#L105)) bereits existiert. Für den Abgleich bleibt
relevant: Die DMM-Erklärung erwähnt Foto-Uploads mit keinem Wort.

**Das Strippen kostet die Admins nichts.** Die EXIF-Daten liegen als eigene Kopie in
`sichtungen_dateien.exif_daten`; die Admin-Ansicht liest diese DB-Kopie
([MediaModal.svelte:55–70](../../src/lib/components/media/MediaModal.svelte#L55-L70) greift auf `file.exifData`
zu, nicht auf die Bilddatei).

### 2.3 Erhobene Felder gehen über das Erwartbare hinaus

Die Erklärung sagt nur „die im Online-Erhebungsbogen erfassten personenbezogenen Daten". Tatsächlich:
**Anschrift** (`strasse`, `plz`, `ort`), **Telefon**, **Fax**, **E-Mail**, **Vor-/Nachname**
([schema.ts:63–70](../../src/lib/server/db/schema.ts#L63-L70)) sowie **Schiffsname, Heimathafen, Bootstyp,
Bootsantrieb** ([schema.ts:57–62](../../src/lib/server/db/schema.ts#L57-L62)). Die vollständige Postanschrift
ist für „Kontaktaufnahme bei Nachfragen" nicht selbsterklärend.

### 2.4 Kartenkacheln übertragen die Besucher-IP an Dritte

Clientseitig geladen, damit fließt die IP jedes Kartenbesuchers ab:

- OpenStreetMap-Basiskarte — [optimizedMapController.ts:254](../../src/lib/map/optimizedMapController.ts#L254)
- OpenSeaMap-Seezeichen — [optimizedMapController.ts:211](../../src/lib/map/optimizedMapController.ts#L211)

Die DMM-Erklärung nennt **Google Maps API**, nicht OSM/OpenSeaMap. Anderer Empfänger, anderer Zweck.

_Gegenprobe — hier ist die Annahme aus dem Auftrag zu korrigieren:_ Die **Wetterdaten laufen
serverseitig** über einen eigenen Endpunkt ([api/weather/historical/+server.ts:73](../../src/routes/api/weather/historical/+server.ts#L73)),
open-meteo sieht also die Server-IP, nicht die des Besuchers. Kein Befund.

### 2.5 Auftragsverarbeiter der Plattform sind nicht benannt

Weder Auth0/Okta (Admin-Login, [auth.ts:13–15](../../src/lib/server/auth/auth.ts#L13-L15)) noch der SMTP-Versand
der Benachrichtigungen ([emailService.ts:351](../../src/lib/server/services/emailService.ts#L351)) tauchen
in der Erklärung auf. Sie listet Ticketing, Google, Meta, YouTube, Podcaster.de sowie „Server in
Frankfurt" für die Apps.

Beim Hosting ist die Lage seit PR #700 zugespitzt: `/about` nennt **GECKO in Rostock** namentlich
([+page.svelte:318](../../src/routes/about/+page.svelte#L318)) — die verlinkte Erklärung kennt diesen
Auftragsverarbeiter nicht. Die App benennt damit konkreter als das Dokument, auf das sie für
Vollständigkeit verweist.

### 2.6 Nicht genannte Verarbeitungen

| Verarbeitung                                                | Fundstelle                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| IP-Adressen im Audit-Log                                    | [schema.ts:203](../../src/lib/server/db/schema.ts#L203)                |
| Browser-Speicherung der Formulareingaben (`sessionStorage`) | [localStorage.ts:55–58](../../src/lib/storage/localStorage.ts#L55-L58) |
| Dauerhafte Kontaktdaten im `localStorage`                   | [localStorage.ts:336](../../src/lib/storage/localStorage.ts#L336)      |
| Server-Sessions mit Auth0-Claims                            | [schema.ts:220](../../src/lib/server/db/schema.ts#L220)                |

Die Browser-Speicherung ist immerhin **einwilligungsgebunden** (`persistentDataConsent`,
[localStorage.ts:336](../../src/lib/storage/localStorage.ts#L336)) und der Entwurf liegt nur in
`sessionStorage` — sauber gebaut, nur eben nirgends erklärt.

---

## 3. Erledigt oder zurückgezogen

Diese drei Punkte standen in der ersten Fassung dieses Dokuments. Zwei sind auf `main` behoben, einer
war falsch. Sie bleiben hier stehen, damit die Prüfung nachvollziehbar bleibt.

### 3.1 ~~„Anonymisierte öffentliche Darstellung"~~ — behoben in PR #700

`/about` versprach wörtlich „Anonymisierte öffentliche Darstellung", während bei vorliegender
Einwilligung Klarnamen ausgegeben werden. Die Aussage ist gestrichen; der Kommentar im Quelltext
([+page.svelte:243–247](../../src/routes/about/+page.svelte#L243-L247)) begründet die Streichung mit derselben
Beobachtung. An ihre Stelle tritt die zutreffende Formulierung „Name und Schiffsname erscheinen nur
öffentlich, wenn Sie dem im Formular ausdrücklich zustimmen"
([+page.svelte:295](../../src/routes/about/+page.svelte#L295)).

Die Kürzung hat zugleich eine neue, überprüfbare Zusage eingeführt — siehe §2.1.

### 3.2 ~~Einwilligungsnachweis wird bei Admin-Bearbeitung überschrieben~~ — kein Befund

**Der Punkt war falsch.** Zwar stempelt `mapFormToSighting` alle vier Zeitpunkte unbedingt mit
`new Date()` ([mapFormToSighting.ts:313–326](../../src/lib/server/db/mapFormToSighting.ts#L313-L326)) — aber der
Admin-Edit schreibt diese Spalten nie: `updateSighting` destrukturiert **Flags und Nachweisspalten**
vor dem `.set()` heraus ([sightingRepository.ts:159–177](../../src/lib/server/db/sightingRepository.ts#L159-L177)).
`PUT /api/sightings/[id]` ist der einzige Aufrufer, keine andere Stelle schreibt `…ConsentAt`.

Abgesichert durch `sightingRepository.test.ts` — „sollte die Nachweisspalten der Einwilligungen vom
Update ausschließen" und „sollte auch die Einwilligungs-Flags vom Update ausschließen". Der
Ausschluss kam mit demselben PR wie die Spalten (6c3aaec8, #672).

Lehre für künftige Prüfungen: `mapFormToSighting` allein zu lesen genügt nicht — die Invariante
entsteht erst im Aufrufer.

### 3.3 ~~`GET /api/sightings` ignoriert die Freigabe~~ — behoben in PR #699

Der Endpunkt filterte nur nach Jahr und gab damit Namen aus ungeprüften Meldungen heraus. Er nutzt
jetzt `approvedOnly()` ([+server.ts:80–84](../../src/routes/api/sightings/+server.ts#L80-L84)). Die Zusage des
Formulartexts („öffentlich auf der Karte angezeigt") und das Verhalten decken sich damit wieder.

---

## 4. Ableitung

**Eine Ergänzung der DMM-Erklärung reicht nicht; eine eigene Datenschutzseite ist der tragfähigere Weg.**

Begründung — nicht die Menge der Lücken, sondern ihre Art:

1. **Die Erklärung verweist auf den Formulartext** („im dort erklärten Umfang"). Damit trägt die App
   die Beschreibungslast bereits heute — aber der Formulartext beschreibt nur die Einwilligungen,
   nicht Empfänger, Fristen oder Drittdienste.
2. **Die offenen Punkte sind plattformspezifisch**: fehlende Löschfrist, EXIF in Uploads,
   OSM/OpenSeaMap-Kacheln, Auth0, GECKO, Browser-Speicherung. In der Museums-Erklärung wären das
   Fremdkörper zwischen Ticketing und Bewerbungsverfahren.
3. **Getrennte Lebenszyklen.** Die Erklärung steht auf 05.11.2024, die App ändert ihre Verarbeitung
   laufend. Eine Seite, die nicht mit dem Code deployt, läuft zwangsläufig hinterher — genau das
   Argument, mit dem der Footer-Kommentar
   ([PublicFooter.svelte:27](../../src/lib/components/PublicFooter.svelte#L27)) die _Kopie_ der Rechtstexte
   ablehnt. Für eine _eigene, abweichende_ Erklärung greift es nicht: Sie dupliziert nichts.
4. **`/about` hat die Delegation seit PR #700 verschärft.** Die Seite sagt jetzt zu, die verlinkte
   Erklärung enthalte alles Nötige — und nennt zugleich einen Auftragsverarbeiter, den diese nicht
   kennt. Solange keine eigene Seite existiert, ist entweder die Zusage zu entschärfen oder die
   fremde Erklärung zu ergänzen.

Impressum bleibt sinnvollerweise verlinkt — Anbieter ist unverändert das Museum.

### Unabhängig von dieser Entscheidung

1. ~~**Löschfrist für Sichtungen klären** (§2.1)~~ — erledigt 2026-11, siehe §2.1.
   Ursprünglicher Punkt: — fachliche Entscheidung des Museums, dann Umsetzung.
   Bis dahin ist die Vollständigkeitszusage auf `/about:324` die einzige heute falsche Aussage der App.
2. **EXIF beim Upload strippen** (§2.2) — nicht dringend, solange keine Fotos öffentlich angezeigt
   werden, aber **zwingende Vorbedingung** dieses Features. Kostet die Admin-Ansicht nichts.
