# Legacy REST API Specification

**CRITICAL: 100% Compliance Required**

This specification is derived from the original schweinswalsichtung.de API documentation. The legacy APIs MUST maintain 100% compatibility with it, so that mobile clients built against the original API keep working.

**Status 2026-08-11: three clients are connected.** Established from the access log of `schweinswalsichtung.de`, not assumed:

| Client          | Platform             | Accepted submissions |
| --------------- | -------------------- | -------------------- |
| `OstSeeTiere/8` | iOS                  | 39                   |
| `okhttp/3.10.0` | Android (circa 2018) | 5                    |
| `OstSeeTiere/6` | iOS, older build     | 3                    |

Earlier snapshots of this document named a single client. That was not measured wrongly, it was concluded wrongly: what got counted was what **arrived**. Between 31 July and 9 August 2026 the Android client lost **187** submissions to a forced HTTPS redirect — every single one, for eleven days — and therefore never appeared anywhere anyone was looking. Determining how many clients exist requires the access log, not the inbox: only the log also records what never arrived. That client has been submitting successfully since 10 August 2026; the 187 are gone.

A deviation therefore costs real data and cannot be repaired from this side. Two of the three clients are not available for testing, and their users are not told when a submission fails. Field names, URL paths and data types must only be changed deliberately, and every such change must be documented; obvious defects may of course be fixed, but only as additions, never as replacements of an existing code path.

This is a dated status, not a standing guarantee — re-check whether further clients have been connected before making larger changes. The figures come from an ongoing check running until roughly October 2026; see "Laufende Beobachtung" in `.claude/rules/legacy-api.md`.

## Base URLs

- Test System: `http://test.schweinswalsichtung.de`
- Production System: `http://schweinswalsichtung.de`

## Sprachpräfix `/de/` und `/en/` — gilt für alle Pfade

Jeder in diesem Dokument genannte Pfad ist **zusätzlich** mit vorangestelltem
`/de/` oder `/en/` erreichbar. Frühere Fassungen dieses Dokuments nannten das
Präfix nur bei `antworten.json`; das war eine unvollständige Wiedergabe der
Vorgänger-Anwendung, keine Einschränkung.

Der CakePHP-Router band das Kürzel vor **jede** Route:

```php
Router::connect('/:language/:controller/:action/*', array(), array('language' => 'de|en'));
Router::connect('/:language/:controller', array('action' => 'index'), array('language' => 'de|en'));
Router::connect('/:language', array('controller' => 'sichtungen', 'action' => 'add'), array('language' => 'de|en'));
```

Es gab also `/de/rest_sichtungen/antworten.json` genauso wie
`/en/rest_sichtungen`, `/de/sichtungen/showreports.json` und so weiter.

**Das Präfix ist keine Übersetzung.** Der Übergangsdienst auf hawking
(`legacy-inbox/src/server.js`) liefert unter `/en/rest_sichtungen/antworten.json`
byte-identisch dieselbe deutsche Liste. Es ist reine Routenkosmetik — Responses
unterscheiden sich in keiner Sprachvariante.

| Pfad                              | zusätzlich erreichbar unter                   |
| --------------------------------- | --------------------------------------------- |
| `POST /rest_sichtungen`           | `/de/rest_sichtungen`, `/en/rest_sichtungen`  |
| `/rest_sichtungen/antworten.json` | `/de/rest_sichtungen/antworten.json`, `/en/…` |
| `/rest_sichtungen/inBaltic.json`  | `/de/rest_sichtungen/inBaltic.json`, `/en/…`  |
| `/sichtungen/showreports.json`    | `/de/sichtungen/showreports.json`, `/en/…`    |

Umgesetzt ist das in der aktuellen Anwendung durch den `reroute`-Hook in
`src/hooks.ts`, der das Kürzel abschneidet, bevor SvelteKit die Route auflöst
(`stripLegacyLanguagePrefix` in `src/lib/legacy-api/languagePrefix.ts`). Die
Pfade ohne Präfix ändern sich dadurch nicht — das Präfix kommt additiv dazu.

**Grenzen der Umsetzung**, bewusst gesetzt:

- Nur `de` und `en`, nur in Kleinschreibung — wie im CakePHP-Muster `de|en`.
- Nur vor genau den vier Pfaden aus der Tabelle oben — nicht vor deren
  Verzeichnissen. `/en/rest_sichtungen/view/1840.json` bleibt also 404, und ein
  neuer Legacy-Endpunkt bekommt das Präfix erst, wenn er in `LEGACY_PFADE`
  eingetragen wird.
- `/en/` vor Seitenrouten liefert seit Einführung der Mehrsprachigkeit **nicht
  mehr 404**: `/en` liefert die Startseite in englischer Fassung (HTTP 200).
  Nur `/en/admin` bleibt weiterhin 404 — nicht weil die Anwendung einsprachig
  wäre (das ist sie seitdem nicht mehr), sondern weil `/admin` bewusst von der
  Lokalisierung ausgenommen ist (`NICHT_LOKALISIERT` in
  `src/lib/legacy-api/languagePrefix.ts`). Der Zugriffsschutz auf `/admin`
  selbst ist davon unabhängig: Er ist route-basiert
  (`requireUserRole(url, locals.user, [...])` in
  `src/routes/admin/+layout.server.ts`) und griffe unverändert auch unter
  `/en/admin`, wenn der Pfad lokalisiert wäre.
  **Der Vertrag der vier Legacy-API-Pfade selbst ist davon unberührt:**
  `/de/` und `/en/` vor `/rest_sichtungen` & Co. bleiben reine Routenkosmetik
  mit byte-identischer deutscher Antwort (siehe Tabelle oben) — nur die
  Aussage über Seitenrouten war überholt.
- `/de` bzw. `/en` allein zeigte in CakePHP auf das Meldeformular
  (`sichtungen/add`) und bleibt aus demselben Grund 404.

Ob ein Client das Präfix nutzt, ist offen: Im Zugriffsprotokoll von hawking
wurde am 2026-08-09 keine Präfix-Variante abgerufen — die Protokolle reichen
dort aber nur einen Tag zurück (Plesk rotiert ohne Archiv). Die Unterstützung
kostet nichts und schließt eine Lücke, die von hier aus nicht mehr reparierbar
wäre.

## 1. Creating Sightings

### Endpoint

- **URL**: `/rest_sichtungen`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Request Body (JSON Object)

| Attribute                   | Description                                                                                                  | Data Type / Range                   | Required                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------- |
| `sichtungsdatum`            | Date and time of sighting (German local time, Europe/Berlin — see [Zeitzonen-Semantik](#zeitzonen-semantik)) | DateTime, "YYYY-MM-DD HH:MI"        | Yes                                |
| `anzahl_gesamt`             | Total number of sighted animals. 0 is allowed and interpreted as death finding.                              | Integer                             | Yes                                |
| `vorname`                   | First name                                                                                                   | String (64)                         | Yes                                |
| `name`                      | Last name                                                                                                    | String (64)                         | Yes                                |
| `email`                     | Email address                                                                                                | E-Mail                              | Yes                                |
| `gps_breite`                | Latitude decimal                                                                                             | Decimal, -90 – 90                   | No                                 |
| `gps_laenge`                | Longitude decimal                                                                                            | Decimal, -180 – 180                 | No                                 |
| `fahrwasser`                | Waterway or area                                                                                             | Text                                | No                                 |
| `seezeichen`                | Sea mark or beach section                                                                                    | Text                                | No                                 |
| `vonwo`                     | Sighting location (4 = ferry, 5 = not specified, see note below)                                             | Integer-Range, 0-5                  | No                                 |
| `vonwo_text`                | Other sighting location (when vonwo = 0)                                                                     | Text                                | No                                 |
| `entfernung`                | Distance                                                                                                     | Integer-Range, 1-5                  | No                                 |
| `anzahl_schiffe`            | Number of ships in vicinity                                                                                  | Integer                             | No                                 |
| `anzahl_jung`               | Number of juvenile animals                                                                                   | Integer                             | No                                 |
| `verteilung`                | Distribution of animals (4 = not specified, see note below)                                                  | Integer-Range, 0-4                  | No                                 |
| `verteilung_text`           | Other distribution (when verteilung = 0)                                                                     | Text                                | No                                 |
| `aufnahme`                  | Filename of uploaded media                                                                                   | String (255)                        | No                                 |
| `aufnahmeHochladen`         | Media uploaded flag                                                                                          | Boolean, 0 = false, 1 = true        | No                                 |
| `verhalten`                 | Behavior of animals (4 = not specified, see note below)                                                      | Integer-Range, 0-4                  | No                                 |
| `verhalten_text`            | Other behavior (when verhalten = 0)                                                                          | Text                                | No                                 |
| `reaktion`                  | Reaction of animals                                                                                          | Text                                | No                                 |
| `sonstige_auffaelligkeiten` | Other observations                                                                                           | Text                                | No                                 |
| `seegang`                   | Sea state                                                                                                    | Integer-Range, 0-5                  | No                                 |
| `windrichtung`              | Wind direction                                                                                               | 'N','NW','W','SW','S','SO','O','NO' | No                                 |
| `windstaerke`               | Wind force in Beaufort                                                                                       | 0-12                                | No                                 |
| `sichtweite`                | Visibility                                                                                                   | Integer-Range, 1-4                  | No                                 |
| `schiffsname`               | Ship name                                                                                                    | String (64)                         | No, Yes if schiffnamensnennung = 1 |
| `heimathafen`               | Home port                                                                                                    | String (64)                         | No                                 |
| `bootstyp`                  | Boat type                                                                                                    | String (64)                         | No                                 |
| `bootsantrieb`              | Boat drive (5 = no boat, 6 = motor off, see notes below)                                                     | Integer-Range, 0-6                  | No                                 |
| `bootsantrieb_text`         | Other boat drive (when bootsantrieb = 0)                                                                     | Text                                | No                                 |
| `strasse`                   | Street                                                                                                       | String (64)                         | No                                 |
| `plz`                       | ZIP code                                                                                                     | String (5)                          | No                                 |
| `ort`                       | City                                                                                                         | String (64)                         | No                                 |
| `telefon`                   | Phone number                                                                                                 | String (64)                         | No                                 |
| `fax`                       | Fax number                                                                                                   | String (64)                         | No                                 |
| `namensnennung`             | Name mention desired?                                                                                        | Boolean, 0 = false, 1 = true        | No                                 |
| `schiffnamensnennung`       | Ship name display allowed?                                                                                   | Boolean, 0 = false, 1 = true        | No                                 |
| `bemerkungen`               | Comments                                                                                                     | Text                                | No                                 |
| `eingangskanal`             | Entry channel of report                                                                                      | Integer-Range, 0-5                  | No                                 |
| `tierart`                   | Reported animal species                                                                                      | Integer-Range, 0-10                 | No, Default = 0                    |
| `totfund`                   | Death finding                                                                                                | Boolean, 0 = false, 1 = true        | No                                 |
| `totfund_zustand`           | Condition of animal                                                                                          | Integer-Range, 0-5                  | No                                 |
| `totfund_geschlecht`        | Sex of animal                                                                                                | Integer-Range, 0-2                  | No                                 |
| `totfund_groesse`           | Size of animal in cm                                                                                         | Integer                             | No                                 |
| `totfund_telefon`           | DMM already informed by phone                                                                                | Boolean, 0 = false, 1 = true        | No                                 |

### Umfang der serverseitigen Validierung

**Die Wertebereiche und Längenangaben der Tabelle oben beschreiben den Vertrag —
nicht das, was der Endpunkt erzwingt.** `POST /rest_sichtungen` validiert gegen
`legacyApiSchema` (`src/lib/legacy-api/yup-validation.ts`), und dieses Schema
prüft **keinen einzigen Wertebereich der Aufzählungsfelder**. Bis auf
`gps_breite` und `gps_laenge` steht dort jedes optionale Feld als
`yup.number().nullable().optional()` bzw. `yup.string().nullable().optional()`.

Tatsächlich geprüft wird nur:

| Prüfung                    | Felder                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| Pflichtfeld vorhanden      | `sichtungsdatum`, `vorname`, `name`, `email`, `anzahl_gesamt`        |
| Format                     | `sichtungsdatum` (`YYYY-MM-DD HH:MI`), `email`                       |
| Maximallänge 64            | `vorname`, `name`, `email`                                           |
| Zahl, ganzzahlig, ≥ 0      | `anzahl_gesamt`                                                      |
| Wertebereich               | ausschließlich `gps_breite` (−90 – 90) und `gps_laenge` (−180 – 180) |
| Datentyp der Zahlen-Felder | `"abc"` wird abgelehnt; Ziffern-Strings wie `"6"` werden angenommen  |

Alles Übrige passiert die Validierung: `bootsantrieb: 99`, `vonwo: 42`,
`seegang: 99`, `namensnennung: 5`, ein `schiffsname` mit 300 Zeichen und
unbekannte Felder ebenso wie ein `bootsantrieb: -3` oder `2.7` (am 2026-08-04
direkt gegen `legacyApiSchema` geprüft). Auch `String (64)` und `String (255)`
sind außerhalb von `vorname`/`name`/`email` nirgends erzwungen.

**Ausnahme bei der Typprüfung: `windstaerke`.** Die Tabelle oben nennt das Feld
mit `0-12`, im Schema steht es aber als `yup.string()` — ein `windstaerke: "abc"`
wird deshalb **nicht** abgelehnt, anders als dasselbe `"abc"` in `seegang` oder
`sichtweite`. Aus dem Feld wird erst in `parseWindForce`
(`src/lib/legacy-api/field-mapping.ts`) eine Zahl.

**Das ist ein Befund, keine Aufgabe.** Die fehlende Bereichsprüfung ist der
Bestandszustand dieses Endpunkts. Sie nachzuschärfen wäre eine Vertragsänderung
gegenüber dem angebundenen iOS-Client (`OstSeeTiere/8`) und darf nicht nebenbei
passieren.

**Für die Abweichungs-Abschnitte weiter unten heißt das:** Wenn dort steht, ein
neuer Aufzählungswert werde „zusätzlich akzeptiert", ist damit seine **Bedeutung**
gemeint, nicht eine gelockerte Validierung. Der Schreibpfad nahm denselben Wert
schon vorher an — nur ohne definierte Bedeutung, und `antworten.json` lieferte
keinen Text dazu.

### Response

#### Successful Creation

- **HTTP Status**: `201 Created`
- **Headers**: `Location` header set to resource URL
- **Body**:

```json
{
	"message": "Saved"
}
```

#### Validation Errors

- **HTTP Status**: `400 Bad Request`
- **Body** (example):

```json
{
	"message": "Validation failed.",
	"errors": {
		"anzahl_gesamt": ["Dieses Feld kann nicht leer gelassen werden."]
	}
}
```

#### Server Errors

- **HTTP Status**: `500`

### User-Agent wird gespeichert

Seit 2.22.0 hält der Server den `User-Agent` einer eingehenden Meldung in der
Spalte `sichtungen.eingangs_client` fest. Das ist **kein Vertragsfeld**: Es wird
nicht angefordert, nicht validiert, nicht ausgegeben, und ein Client muss nichts
dafür tun. Fehlt der Header, steht `unbekannt` in der Spalte, nie NULL — `NULL`
steht ausschließlich für Zeilen von vor Einführung der Spalte oder für Zeilen,
die das Altsystem auf derselben Datenbank geschrieben hat.

Der Wert ist die Datengrundlage für den Client-Zensus, den die CLAUDE.md bislang
aus dem Zugriffsprotokoll auf hawking ableitet — er beantwortet vor einer
Vertragsänderung die Frage, welche Clients ein Feld noch senden. Er ist vom
Client frei wählbar und damit ein Hinweis, kein Beweis; auf ihm darf keine
Entscheidung über Gültigkeit oder Zugriff beruhen.

Die OpenAPI-Spec bleibt davon unberührt, weil sich keine Antwort ändert.

## 2. Retrieving Response Options

Retrieves response options for numeric fields as JSON array.

### Endpoint

- **URL**: `/rest_sichtungen/antworten.json`
- **Method**: `GET`

Wie jeder Pfad dieser API ist auch dieser zusätzlich unter `/de/…` und `/en/…`
erreichbar. Die Response ist in allen drei Varianten dieselbe deutsche Liste
(siehe Abschnitt „Sprachpräfix `/de/` und `/en/`" oben).

### Response Format

JSON Object with the following structure:

```json
{
	"verteilung": {
		"0": "Sonstige Verteilung",
		"1": "einzeln",
		"2": "Mutter mit Jungtier",
		"3": "deutliche Schulen",
		"4": "Keine Angabe"
	},
	"verhalten": {
		"0": "Sonstiges Verhalten",
		"1": "Konstanter Kurs, regelmäßiges Tauchen (schwimmen, ziehen)",
		"2": "Unterschiedlicher Kurs, kreisend, unregelmäßiges Tauchen (futtersuchend)",
		"3": "Langsames Schwimmen, längere Zeit an der Wasseroberfläche (ruhend)",
		"4": "Keine Angabe"
	},
	"seegang": {
		"0": "Keine Angabe",
		"1": "Glatte See, keine Wellen",
		"2": "Ruhige See, gekräuselte, kurze Wellen",
		"3": "Leicht bewegte See, Schaumköpfe",
		"4": "Grobe See, lange, brechende Wellen",
		"5": "Hohe See, Wellenberge und Gischt"
	},
	"bootsantrieb": {
		"0": "Sonstiger Bootsantrieb",
		"1": "Motor",
		"2": "Segel",
		"3": "treibend",
		"4": "vor Anker",
		"5": "Kein Boot",
		"6": "Motor aus"
	},
	"eingangskanal": {
		"0": "Web",
		"1": "E-Mail",
		"2": "Post",
		"3": "Fax",
		"4": "App",
		"5": "Telefon"
	},
	"entfernung": {
		"1": "weniger als 10 Meter",
		"2": "10 bis 50 Meter",
		"3": "50 bis 100 Meter",
		"4": "100 bis 500 Meter",
		"5": "mehr als 500 Meter"
	},
	"vonwo": {
		"0": "Sonstiges",
		"1": "Segelschiff",
		"2": "Motorboot",
		"3": "Land",
		"4": "Fähre",
		"5": "Keine Angabe"
	},
	"sichtweite": {
		"1": "Außergewöhnlich klar (mehr als 20km)",
		"2": "Klar (bis 20km)",
		"3": "Diesig (bis 4km)",
		"4": "Nebel (bis 1km)"
	},
	"totfund_zustand": {
		"0": "unbekannt",
		"1": "keine Anzeichen von Verwesung",
		"2": "sehr frisch, als ob gerade gestorben",
		"3": "Aufblähung, leichte Hautablösungen",
		"4": "Fortgeschrittene Verwesung, starke Aufblähung",
		"5": "Starke Verwesung, mumifiziert oder Skelettteile"
	},
	"totfund_geschlecht": {
		"0": "unbekannt",
		"1": "weiblich",
		"2": "männlich"
	},
	"tierart": {
		"0": "Schweinswal",
		"1": "Kegelrobbe",
		"2": "Seehund",
		"3": "Delphin (mehrere Arten)",
		"4": "Beluga",
		"5": "Zwergwal",
		"6": "Finnwal",
		"7": "Buckelwal",
		"8": "Unbekannte Walart",
		"9": "Ringelrobbe",
		"10": "Unbekannte Robbenart"
	}
}
```

## 3. Position Checking

Checks if a position (coordinates) lies in the Baltic Sea or in the live sighting map area.

### Endpoint

- **URL**: `/rest_sichtungen/inBaltic.json`
- **Method**: `GET`

### Parameters

| Parameter  | Description                                                     | Data Type / Range | Required |
| ---------- | --------------------------------------------------------------- | ----------------- | -------- |
| `location` | Position specification: Latitude and longitude, comma separated | Decimal, Decimal  | Yes      |

### Response

JSON Object:

| Attribute     | Description                                  | Data Type / Range |
| ------------- | -------------------------------------------- | ----------------- |
| `inbaltic`    | True if position is in Baltic Sea (in water) | Boolean           |
| `inchartarea` | True if position is in displayed map area    | Boolean           |

### Example

**Request**: `/rest_sichtungen/inBaltic.json?location=53,10`

**Response** (aktuell):

```json
{
	"inbaltic": false,
	"inchartarea": false
}
```

> **Abweichung vom Ursprungs-PDF.** Dort lautet die Antwort auf dieselbe Anfrage
> `{"inbaltic": false, "inchartarea": true}`. Seit der Bereinigung der
> Ostsee-Geometrie am 2026-07-30 liegt die Südgrenze des Kartenbereichs bei
> **53,55° N** statt bei 53,0° — die Beispielkoordinate 53,10 (Raum Hamburg)
> fällt damit aus dem Kartenbereich heraus.
>
> Die Antwort selbst ist also unverändert korrekt berechnet; nur das im PDF
> gewählte Beispiel liegt inzwischen jenseits der Grenze. Wer eine Koordinate
> zum Prüfen von `inchartarea: true` braucht, nimmt einen Punkt innerhalb der
> Ostsee-Bounding-Box, etwa `location=53.63,11.41` (Schwerin).

## 4. Retrieving Sighting Data

> **Zwei Pfade, ein Endpunkt.** Dieselben Daten sind zusätzlich unter
> `GET /rest_sichtungen` erreichbar. Das ist keine Erweiterung, sondern eine
> Lücke dieser Spezifikation, die erst 2026-08 auffiel: Die Vorgänger-Anwendung
> bildete `/rest_sichtungen` mit `Router::mapResources()` ab, wodurch `GET` auf
> `RestSichtungenController::index()` traf — und diese Aktion besteht aus
> denselben zwei Zeilen wie `SichtungenController::showReports()`
> (`parseList()` + `getReports()`). Die Antwort ist in beiden Fällen dasselbe
> blanke Array; `_serialize` als Zeichenkette hüllt in CakePHP nichts um.
>
> Die angebundene iOS-App (`OstSeeTiere/8`) benutzt **diesen** Pfad für ihre
> Karte, nicht `showreports.json`. Bis 2026-08 antwortete er mit `405`, womit
> die Karte in der App leer blieb. Parameter, Filter, Feldnamen und
> Datenschutz-Regeln unten gelten für beide Pfade unverändert — es ist wörtlich
> dieselbe Funktion (`src/routes/rest_sichtungen/+server.ts` re-exportiert sie).
>
> Belege: `docs/archive/legacy-cakephp/` (Originalquellen der Vorgänger-App).

Returns all reports of a year that are approved and marked as lying in the Baltic Sea. Only "public" data is returned. Name, first name and ship name fields are only included if the user has released this data.

### Endpoint

- **URL**: `/sichtungen/showreports.json`
- **Method**: `GET`

### Parameters

| Parameter  | Description                                                                                                                                                                                                                  | Data Type / Range                                                | Required |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| `year`     | Year                                                                                                                                                                                                                         | Year YYYY                                                        | No       |
| `location` | Position specification: Latitude and longitude, comma separated. Returns all reports within radius of this position (default radius 100 km)                                                                                  | Latitude, Longitude                                              | No       |
| `distance` | Distance in meters for radius search, only used with "location"                                                                                                                                                              | Integer                                                          | No       |
| `bbox`     | Area specification defined by lower left and upper right corner in degrees, separated by commas. Format: Longitude lower left, Latitude lower left, Longitude upper right, Latitude upper right. Compatible with OpenLayers. | Longitude min_x, Latitude min_y, Longitude max_x, Latitude max_y | No       |
| `search`   | Searches for given text in fields Email, Name, First name and Ship name. Partial string search (%<text>%). **Restricted for anonymous callers — see [Deviation: consent-gated search](#deviation-consent-gated-search).**    | String                                                           | No       |

### Deviation: consent-gated search

This is the **one deliberate deviation** from the original specification in this
endpoint. Introduced 2026-07-31 after a data-protection review.

| Caller              | Fields searched                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Anonymous (default) | First name + Last name **only if `namensnennung = 1`**, Ship name **only if `schiffnamensnennung = 1`**. Email is **not** searched at all. |
| Logged-in admin     | Email, First name, Last name, Ship name — unrestricted, exactly as specified above.                                                        |

**Why.** The _response_ has always been consent-gated: `na` is only emitted when
the reporter released their name, `sh` only when they released the ship name.
The _result count_ was not. A `search=` request therefore let any anonymous
caller confirm whether a given email address or name exists in the database —
including for reporters who never consented to being named. That is a membership
oracle over personal data and contradicts the promise made in the reporting form
("Ihre Kontaktdaten verwenden wir ausschließlich für Rückfragen zu Ihrer
Meldung"). Email is dropped entirely rather than gated, because the field is
never part of any response and searching it serves no legitimate purpose for a
public client.

The gating mirrors `/api/map/sightings`, so both public surfaces expose the same
subset. Additionally, LIKE wildcards (`%`, `_`, `\`) in the search term are
escaped and matched literally; previously `search=%` matched every record.

Both surfaces build the predicate from `src/lib/server/db/consentGatedSearch.ts`
rather than each spelling it out, so the "same subset" claim above cannot drift
apart in a later edit. The one intended difference stays explicit: this endpoint
passes `ILIKE` (case-insensitive, as specified), the map passes `LIKE`.

**Impact on clients.** A client searching by email, or by the name of a reporter
without consent, now receives an empty array instead of results. No field name,
URL path, data type or response structure changed. Admin clients are unaffected.

Pinned by `src/routes/sichtungen/showreports.json/showreports.test.ts`
(`Datenschutz - Suche über personenbezogene Felder`).

### Response Format

JSON Array with JSON Objects:

| Attribute | Description                                                                             | Data Type / Range                                   |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ts`      | Unix Timestamp                                                                          | Unix Timestamp                                      |
| `id`      | Report ID                                                                               | Integer                                             |
| `dt`      | Date (German local time, Europe/Berlin — see [Zeitzonen-Semantik](#zeitzonen-semantik)) | String, DD.MM.YY                                    |
| `ti`      | Time (German local time, Europe/Berlin — see [Zeitzonen-Semantik](#zeitzonen-semantik)) | String, HH:MI                                       |
| `lat`     | Latitude                                                                                | Decimal (as string)                                 |
| `lon`     | Longitude                                                                               | Decimal (as string)                                 |
| `ct`      | Total number of sighted animals                                                         | Integer                                             |
| `yo`      | Number of juveniles                                                                     | Integer                                             |
| `sh`      | Ship name                                                                               | String                                              |
| `na`      | Sighter name (First name + Last name)                                                   | String                                              |
| `ar`      | Waterway / Area                                                                         | String                                              |
| `bm`      | Result of position check; only delivered for logged in admin                            | Integer: 0 = Outside, 1 = inchartarea, 2 = inbaltic |
| `va`      | Entry checked; only delivered for logged in admin                                       | Boolean: 0 = False, 1 = True                        |

### Example Response

```json
[
	{
		"ts": 1327499400,
		"id": 817,
		"dt": "25.01.12",
		"ti": "14:50",
		"lat": "54.646667",
		"lon": "11.333333",
		"ct": 1,
		"yo": 0,
		"sh": "Fährschiff \"Deutschland\"",
		"na": "Jörg Schneider"
	},
	{
		"ts": 1333116600,
		"id": 826,
		"dt": "30.03.12",
		"ti": "16:10",
		"lat": "56.093587",
		"lon": "10.512543",
		"ct": 1,
		"yo": 0,
		"na": "Jörg Hiller"
	}
]
```

## Verhalten seit SvelteKit 3 (2026-10)

Zwei Änderungen des Frameworks, die die Legacy-Pfade berühren. Beide ändern nichts für
die heute angebundenen Clients — festgehalten, damit niemand sie später als Regression
fehldeutet.

1. **`POST /rest_sichtungen` ohne `Content-Type` und ohne `Origin` wird mit `403`
   abgewiesen**, bevor der Handler läuft („Cross-site POST form submissions are
   forbidden"). Der Zweig im Handler für „Mobile-Clients ohne Content-Type" ist für solche
   Anfragen damit nicht mehr erreichbar; eine Konfigurationsoption, die das zurückholt,
   gibt es nicht (`csrf.trustedOrigins` greift nur bei vorhandenem `Origin`).
   **Heute ohne Folgen:** Die drei Mobile-Clients senden an `schweinswalsichtung.de`, und
   `POST` geht dort bewusst an `legacy-inbox`, nicht an diese App
   (`docs/SCHWEINSWALSICHTUNG_PROXY.md`). Der Import aus dem Posteingang
   (`src/tools/send-legacy-inbox.js`) setzt einen fehlenden `Content-Type` auf
   `application/json`. JSON ist kein Formular-Content-Type und wird von der Prüfung nicht
   erfasst. Formular-Submissions (`application/x-www-form-urlencoded`) ohne `Origin` wies
   schon SvelteKit 2 identisch ab. **Vor einem Live-Proxy von `POST` an diese App muss das
   geprüft werden.**
2. **Weiterleitungen wegen eines abschließenden `/` tragen eine relative `Location`**
   (`/rest_sichtungen/` → `308`, `location: ../rest_sichtungen` statt `/rest_sichtungen`).
   Das Ziel ist dasselbe; HTTP-Clients (auch okhttp und NSURLSession) lösen relative
   `Location`-Header auf. Die Clients rufen laut Vertrag ohnehin die Pfade ohne
   abschließenden `/` auf.

## Critical Implementation Notes

1. **Field Names**: All field names MUST match exactly as specified. Mobile apps depend on exact field names.

2. **Data Types**: Pay special attention to data types:
   - Coordinates in showreports.json MUST be strings, not numbers
   - Boolean fields use 0/1 integers, not true/false
   - Date formats must match exactly (DD.MM.YY for showreports, YYYY-MM-DD HH:MI for input)
   - All date/time values are German local time (Europe/Berlin), never UTC — see [Zeitzonen-Semantik](#zeitzonen-semantik)

3. **URL Paths**: URLs must match exactly - no additional prefixes like `/api/legacy/`

4. **Response Formats**: Response structures must match exactly, including field order and naming

5. **Wind Direction**: Must include all values: 'N','NW','W','SW','S','SO','O','NO' (note 'SO' for southeast)

6. **Backward Compatibility**: Any changes that break existing mobile app functionality are strictly forbidden.

7. **Value Ranges**: The ranges in the request body table are the contract, not an enforced check — `POST /rest_sichtungen` validates no enumeration range at all. See [Umfang der serverseitigen Validierung](#umfang-der-serverseitigen-validierung) before assuming the endpoint rejects an out-of-range value.

## Abweichung von der Ursprungs-PDF: `verteilung = 4` und `verhalten = 4`

Beide Felder kannten ursprünglich nur **0–3**. Seit dem 2026-07-29 gibt es
jeweils zusätzlich **`4` = „Keine Angabe"**.

**Warum:** `verteilung` und `verhalten` sind `integer default(0) notNull`, und
`0` bedeutet dort „Sonstige Verteilung" bzw. „Sonstiges Verhalten" — echte
Kategorien. Beide Felder sind im Formular **nicht** verpflichtend; eine fehlende
Antwort wurde trotzdem als aktive Aussage gespeichert.

Messung 2026-07-29 (19.880 Zeilen):

| Feld         | Zeilen mit `0`  | davon mit Freitext | Freitext-Quote der übrigen Werte |
| ------------ | --------------- | ------------------ | -------------------------------- |
| `verteilung` | 15.129 (76,1 %) | 632 (4,2 %)        | 0,0–0,6 %                        |
| `verhalten`  | 9.192 (46,2 %)  | 892 (9,7 %)        | 0,0–0,4 %                        |

Bei `verteilung` war „Sonstige Verteilung" dadurch mit 76 % die dominierende
Kategorie — vor „Einzeln" (3.046). Rechnet man die Nicht-Antworten heraus, ist
„Einzeln" die häufigste Verteilung und „Sonstige" die seltenste.

**Der Bestand wurde NICHT umgeschrieben.** Die Zeilen mit Freitext sind echte
„Sonstige"-Antworten, und für die übrigen gibt es keine Spalte, aus der
hervorginge, welche nie beantwortet wurden. `4` verhindert nur, dass **neue**
Zeilen dieselbe Doppeldeutigkeit erben.

**Auswirkung auf Clients:** `antworten.json` liefert je einen zusätzlichen
Schlüssel. `POST` bleibt unverändert: Beide Felder werden ohne Bereichsprüfung
validiert ([Umfang der serverseitigen Validierung](#umfang-der-serverseitigen-validierung)),
eine `4` kam also schon vorher durch, neu ist nur ihre Bedeutung. Bestehende
Werte bleiben unverändert. Im Formular ist `4` nicht auswählbar.

## Abweichung von der Ursprungs-PDF: `vonwo = 5`

Die Feldtabelle dieses Dokuments nannte für `vonwo` bis zum 2026-07-29 den
Bereich **0–3**. Das war schon vorher falsch: `4` = „Fähre" existiert seit jeher
und wird von 281 Bestandszeilen benutzt. Korrigiert auf **0–5**.

Neu ist **`5` = „Keine Angabe"**.

**Warum:** Die Spalte `vonwo` ist `integer default(0) notNull`, und `0` bedeutet
„Sonstiges". Wurde nichts angegeben, entstand trotzdem eine `0` — der Datensatz
behauptete also eine Antwort, die nie gegeben wurde.

**Wichtig — der Bestand wurde bewusst NICHT umgeschrieben.** Anders als beim
Bootsantrieb ist „Sonstiges" hier eine echte, häufig genutzte Kategorie: 713 der
1.833 Null-Zeilen tragen einen Freitext in `vonwo_text` (Kajak 91×,
Mehrzweckschiff 37×, SUP 31×, Ruderboot 24×, Seekajak 20× …), 538 einen
Schiffsnamen. Zum Vergleich: bei allen anderen `vonwo`-Werten ist `vonwo_text`
in unter 0,5 % der Zeilen gefüllt. Für die verbleibenden Zeilen ohne jedes Indiz
(709) gibt es keine ableitbare Wahrheit — es existiert keine zweite Spalte, aus
der hervorginge, wo jemand stand. `5` verhindert deshalb nur, dass **neue**
Zeilen dieselbe Doppeldeutigkeit erben.

**Auswirkung auf Clients:** analog zu `bootsantrieb = 5` (siehe unten) —
`antworten.json` liefert einen zusätzlichen Schlüssel. `POST` bleibt unverändert:
`vonwo` wird ohne Bereichsprüfung validiert
([Umfang der serverseitigen Validierung](#umfang-der-serverseitigen-validierung)),
eine `5` kam also schon vorher durch, neu ist nur ihre Bedeutung. Bestehende
Werte bleiben unverändert. `5` ist im Formular nicht auswählbar und entsteht
ausschließlich serverseitig.

## Abweichung von der Ursprungs-PDF: `bootsantrieb = 5`

Die Original-Spezifikation kennt für `bootsantrieb` nur den Bereich **0–4**.
Seit dem 2026-07-29 gibt es zusätzlich **`5` = „Kein Boot"**.

**Warum:** Die Spalte `bootsantrieb` ist `integer default(0) notNull`, und `0`
bedeutet „Sonstiger Bootsantrieb" — nicht „unbekannt" und nicht „kein Boot".
Jede Sichtung von Land (`vonwo = 3`) trug dadurch die aktive Behauptung, es habe
ein Boot mit ungewöhnlichem Antrieb gegeben. Betroffen waren 5.858 von 19.880
Zeilen (29,5 %); „Sonstiger" war dadurch in jeder Antriebs-Auswertung fälschlich
die häufigste Kategorie, vor Motor und Segel.

**Auswirkung auf Clients:**

- `GET /rest_sichtungen/antworten.json` liefert einen zusätzlichen Schlüssel
  `"5": "Kein Boot"`. Clients, die die Liste dynamisch rendern, brauchen keine
  Änderung; Clients mit fest verdrahteter 0–4-Tabelle zeigen für `5` keinen
  Text an und müssen den Wert nachtragen.
- `POST /rest_sichtungen` bleibt unverändert: Der Schreibpfad prüft
  `bootsantrieb` gegen keinen Wertebereich (`yup.number().nullable().optional()`,
  siehe [Umfang der serverseitigen Validierung](#umfang-der-serverseitigen-validierung)).
  Eine `5` kam also schon vorher durch — neu ist allein ihre Bedeutung.
  Bestehende Werte behalten ihre Bedeutung unverändert; es wurde nichts
  umnummeriert.
- `GET /sichtungen/showreports.json` kann `5` in Bestandsdaten zurückgeben.

**Nicht auswählbar im Formular:** `5` entsteht ausschließlich serverseitig
(`mapFormToSighting`). Im Antriebs-Dropdown wird der Wert bewusst nicht
angeboten — dort stehen weiterhin nur 0–4.

**Seit 2026-07-29 ist `5` der generelle Fallback**, nicht nur bei
Land-Sichtungen: Wurde kein Antrieb angegeben, wird `5` geschrieben statt `0`.
`0` entsteht damit nur noch durch eine aktive Auswahl des Melders.

Bekannte Unschärfe: `5` heißt wörtlich „Kein Boot". Bei einer Sichtung von einer
Fähre oder von „Sonstiges" (Kajak, SUP) ist ein Fahrzeug im Spiel, dessen
Antrieb nur niemand angegeben hat — dort ist `5` streng genommen zu stark.
Bewusst in Kauf genommen: Ein eigener Wert „Antrieb unbekannt" wäre eine dritte
Vertragsänderung an derselben Spalte, und eine erfundene Antriebsart wiegt
schwerer als „kein Boot" bei einem Kajak.

## Abweichung von der Ursprungs-PDF: `bootsantrieb = 6`

Die Original-Spezifikation kennt für `bootsantrieb` nur den Bereich **0–4**.
Seit dem 2026-08-04 gibt es zusätzlich **`6` = „Motor aus"**.

**Warum:** Das Deutsche Meeresmuseum hat die Folgefrage zum Antrieb im
Meldeformular auf „Motor an / Motor aus" verengt — es geht dort allein um
Motorgeräusche, und Laien können den Antrieb eines fremden Bootes ohnehin selten
benennen. „Motor an" bleibt `1` („Motor") und ist damit vergleichbar zum
Altbestand. Für „Motor aus" gab es **keinen** passenden vorhandenen Wert:
`3` („treibend") und `4` („vor Anker") behaupten fachlich etwas anderes als ein
Motorboot mit abgeschaltetem Motor, und für die Einordnung von Unterwasserlärm
ist das ein Unterschied. Einen dieser Werte wiederzuverwenden hieße, dem Melder
eine Aussage unterzuschieben, die er nie gemacht hat.

**Auswirkung auf Clients:**

- `GET /rest_sichtungen/antworten.json` liefert einen zusätzlichen Schlüssel
  `"6": "Motor aus"`. Clients, die die Liste dynamisch rendern, brauchen keine
  Änderung; Clients mit fest verdrahteter Tabelle zeigen für `6` keinen Text an
  und müssen den Wert nachtragen.
- `POST /rest_sichtungen` bleibt unverändert: Der Schreibpfad validiert
  `bootsantrieb` ohne Bereichsprüfung
  ([Umfang der serverseitigen Validierung](#umfang-der-serverseitigen-validierung))
  und nimmt `6` deshalb ohne Anpassung an. Bestehende Werte behalten ihre
  Bedeutung — es wurde nichts umnummeriert.
- `GET /sichtungen/showreports.json` **liefert `bootsantrieb` gar nicht aus**.
  Eine `6` in der Datenbank erreicht die angebundene iOS-App (`OstSeeTiere/8`)
  also nie; auch `isLegacyFlagSet` wertet den Wert nicht aus. **Kein laufender
  Client bricht.**

**Die Werte 0–4 bleiben auswählbar** — allerdings nur noch in der Admin-Maske.
Das öffentliche Meldeformular bietet ausschließlich `1` und `6` an; `5` entsteht
weiterhin ausschließlich serverseitig. `bootsantrieb_text` hängt an `0` und ist
damit ebenfalls auf die Admin-Maske beschränkt, bleibt für den Altbestand und
den Legacy-Schreibpfad aber unverändert erhalten.

## Abweichung von der Ursprungs-PDF: `windrichtung` akzeptiert englische Abkürzungen

Der neu gebaute iOS-Client (`OstSeeTiere/8`) sendet Windrichtungen als englische
Abkürzungen, nicht als die in diesem Dokument spezifizierten deutschen. Seit
dem 2026-07-30 akzeptiert `POST /rest_sichtungen` beide Schreibweisen und
normalisiert englische Eingaben serverseitig auf die deutsche Form, weil die
DB-Spalte, das Formular und `antworten.json` ausschließlich die deutsche Form
kennen.

Deutsch und Englisch unterscheiden sich in genau drei der acht Werte:

| Deutsch (Vertrag) | Englisch (neuer Client) |
| ----------------- | ----------------------- |
| `NO`              | `NE`                    |
| `O`               | `E`                     |
| `SO`              | `SE`                    |

`N`, `S`, `W`, `NW` und `SW` sind in beiden Sprachen identisch und brauchen
keine Abbildung.

**Auswirkung auf Clients:** Deutsche Eingaben laufen unverändert durch — für
den alten Client, der nicht mehr testbar ist, ändert sich nichts. Ein
unbekannter Wert (weder eine der acht deutschen Formen noch eine der drei
englischen Abkürzungen) ergibt weiterhin `''`, wie bisher.

## Abweichung von der Ursprungs-PDF: `windstaerke` akzeptiert 0

Die Feldtabelle dieses Dokuments nannte für `windstaerke` bis zum 2026-07-30
den Bereich **1-12**. Das war falsch: Die Beaufort-Skala beginnt bei **0**
(Windstille), und der neue iOS-Client sendet diesen Wert tatsächlich
(beobachtet in fünf Einreichungen). Korrigiert auf **0-12**.

**Warum das vorher brach:** Die serverseitige Umwandlung prüfte `windstaerke`
auf Wahrheitswert (`legacyData.windstaerke ? Number(...) : undefined`). Eine
aktiv gemeldete `0` ist in JavaScript falsy und wurde deshalb wie ein fehlendes
Feld behandelt — die Windstärke ging verloren.

**Auswirkung auf Clients:** `windstaerke: 0` wird jetzt als `0` übernommen,
nicht mehr verworfen. Fehlende Angabe (`undefined`, `null`, leerer String)
ergibt weiterhin `undefined`, wie bisher. Das Feld kommt als Zahl aus
JSON-Submissions oder als String aus Formular-Encoding — beide Formen werden
akzeptiert.

## `namensnennung` und `schiffnamensnennung`: nur eine explizite `1` ist Zustimmung

Der neue iOS-Client sendet weder `namensnennung` noch `schiffnamensnennung`.
Beide werden serverseitig als Zustimmungs-Flags interpretiert
(`nameConsent`/`shipNameConsent`), und ein fehlendes Feld ergibt „nein" (`0`
bzw. `false`) — nicht „ja".

**Das ist beabsichtigt und dient dem Datenschutz.** Name und Schiffsname eines
Melders dürfen nur veröffentlicht werden, wenn eine ausdrückliche Zustimmung
vorliegt. Ein fehlendes Feld ist keine Zustimmung. Würde man das Fehlen als
`1` interpretieren, würde für jede Meldung des neuen Clients eine Einwilligung
erfunden, die nie gegeben wurde.

**Die drei Fälle im Einzelnen** — sie waren bis zum 2026-07-30 nicht sauber
getrennt und dürfen nicht wieder zusammenfallen:

| Übermittelter Wert                     | Ergebnis         |
| -------------------------------------- | ---------------- |
| Feld fehlt (`undefined`, `null`, `''`) | keine Zustimmung |
| explizit `0` bzw. `'0'`                | keine Zustimmung |
| explizit `1` bzw. `'1'`                | **Zustimmung**   |

**Korrektur 2026-07-30:** Der mittlere Fall war fehlerhaft. Die Umwandlung
lautete `legacyData.namensnennung ? true : false`, und über den
Formulardaten-Pfad (`application/x-www-form-urlencoded`, ausgepackt mit
`Object.fromEntries(formData.entries())`) kommt jeder Wert als **String** an.
Ein vertragskonformes `namensnennung=0` war damit `'0'` — in JavaScript
truthy. Ein Melder, der die Veröffentlichung seines Namens ausdrücklich
untersagt hatte, wurde in `showreports.json` mit Namen geführt. Betroffen
waren fünf Flags: `namensnennung`, `schiffnamensnennung`,
`datenschutzEinverstaendnis`, `aufnahmeHochladen` und `totfund_telefon`. Alle
werden jetzt numerisch ausgewertet, wie `totfund` schon vorher.

**Auswirkung auf Clients:** JSON-Submissions mit den Zahlen `0` und `1`
verhalten sich unverändert. Formular-Submissions mit `'0'` werden jetzt als
Ablehnung gewertet statt als Zustimmung.

**Für spätere Bearbeitung festgehalten:** Dass ein **fehlendes** Feld keine
Zustimmung ergibt, ist kein Bug und soll nicht durch einen Default auf `true`
„korrigiert" werden. Wenn der Client diese Felder künftig sendet, greift die
Zustimmung des Melders wie gewohnt.

## Zusätzlich akzeptiert: `sonstige_auffälligkeiten` (Umlaut-Variante)

Vertragsname ist und bleibt `sonstige_auffaelligkeiten` (mit `ae`), so wie ihn
das Originaldokument nennt.

Diese Implementierung las bis zum 2026-07-30 **ausschließlich** die
Umlaut-Schreibweise `sonstige_auffälligkeiten` (`src/lib/legacy-api/types.ts`,
`yup-validation.ts`, `field-mapping.ts`). Ein spec-konformer Client verlor
seinen Freitext dadurch kommentarlos — `otherObservations` wurde `''`, ohne
Validierungsfehler.

**Seit dem 2026-07-30 werden beide Schreibweisen gelesen**, der Vertragsname hat
Vorrang, wenn beide im selben Request stehen. Die Umlaut-Variante ist in
`static/openapi.yml` als `deprecated` markiert und existiert nur, damit bereits
gegen diese App gebaute Clients nichts verlieren. Neue Clients benutzen
`sonstige_auffaelligkeiten`.

Kein Effekt auf Ausgaben: `showreports.json` liefert dieses Feld nicht.

## Korrektur 2026-07-30: Form der Fehlerantwort

Der Abschnitt [Validation Errors](#validation-errors) war schon immer die
verbindliche Form (`message` als String, `errors` daneben) — die
Implementierung wich davon ab und schachtelte
`{"message": {"message": …, "errors": …}}`. `static/openapi.yml` beschrieb mit
`{"error": …, "message": …}` eine dritte, wieder andere Struktur ohne
`errors`-Objekt.

Beide sind seit dem 2026-07-30 auf die flache Form des Originaldokuments
korrigiert. Ein Client, der `message` vertragsgemäß als Text liest, bekam vorher
ein Objekt.

Betroffen sind der 400er-Validierungsfehler, die `"No data send."`-Antwort
(die dieser Endpunkt mit Status **200** ausliefert) und der 500er-Pfad für
unerwartete Fehler.

**Nicht** betroffen ist der 500er nach einem fehlgeschlagenen Schreibvorgang: Er
liefert weiterhin `{"error": "Failed to save sighting", "message": "Internal
server error occurred"}` und damit einen `error`-Schlüssel, den die flache
Vertragsform nicht kennt. `static/openapi.yml` dokumentiert für 500 deshalb
beide Formen.

## Korrektur 2026-07-30: `fax` und `totfund` wurden verworfen

Beide Felder standen in der Validierung, landeten aber nirgends — dieselbe
Fehlerklasse wie bei `sonstige_auffaelligkeiten` oben.

- **`fax`**: Die DB-Spalte `fax` existiert seit immer, aber das Feld fehlte im
  Formular-Schema (`sightingSchema`) und damit in `SightingFormData`. Der
  Legacy-Adapter hatte kein Ziel für den Wert. `fax` ist jetzt im Schema (ohne
  `.meta()`, also kein Formularfeld) und wird von `mapFormToSighting`
  geschrieben.
- **`totfund`**: `isDead` wurde ausschließlich aus `anzahl_gesamt = 0`
  abgeleitet. Ein explizites `totfund: 1` bei `anzahl_gesamt > 0` verschwand.
  Beide Wege gelten jetzt, und beide werden string-tolerant ausgewertet — der
  Formulardaten-Pfad liefert `Object.fromEntries(formData.entries())`, also
  Strings, und `'0' === 0` ist in TypeScript false.

Genau das trifft den neuen iOS-Client: Er sendet `totfund: 1` zusammen mit einem
`anzahl_gesamt` > 0 (beobachtet: 1, 2, 3, 7). Ein Totfund neben lebenden Tieren
ist eine reale Situation (z. B. ein verendetes Jungtier neben einer Gruppe).
Solche Meldungen wurden vorher als lebende Sichtung gespeichert, obwohl sie
gleichzeitig `totfund_zustand`, `totfund_geschlecht`, `totfund_groesse` und
`totfund_telefon` trugen — ein in sich widersprüchlicher Datensatz. Da Totfunde
die zeitkritischen Meldungen für das Deutsche Meeresmuseum sind, war das mehr
als ein Ordnungsproblem.

`totfund` ersetzt die `anzahl_gesamt = 0`-Konvention nicht, sondern ergänzt sie:
Beide sind gleichberechtigte Wege zu einem Totfund. Der alte Client kennt
`totfund` nicht und meldet Totfunde weiterhin ausschließlich über
`anzahl_gesamt = 0`; dieser Weg bleibt unverändert funktionsfähig.

## Bewusst nicht umgesetzt: der Ostsee-Filter in `showreports.json`

Abschnitt 4 beschreibt die Grundmenge als „approved **and marked as lying in the
Baltic Sea**". Der zweite Teil ist **absichtlich nicht implementiert**. Der
Endpunkt filtert ausschließlich `freigegeben_am IS NOT NULL`.

**Grund 1 — `ostsee = 0` heißt „nicht berechnet", nicht „nicht in der Ostsee".**
Die Berechnung des Wertes wurde erst nachträglich eingeführt; für den davor
entstandenen Bestand steht der Default `0` in der Spalte, ohne dass je eine
Positionsprüfung stattgefunden hätte. Der Wert ist damit **kein** Prädikat, auf
das man filtern kann — er ist teilweise unbefüllt.

Messung am 2026-07-30 über die 19.262 freigegebenen Zeilen der lokalen DB:

| Spalte       | `= 1`  | `= 0` | `NULL` |
| ------------ | ------ | ----- | ------ |
| `ostsee`     | 10.028 | 9.234 | 0      |
| `ostsee_geo` | 3.838  |       |        |

Von den 9.234 Zeilen mit `ostsee = 0` liegen **9.135 (98,9 %) im Kartenbereich**
(53–66 N, 9–31 O) — es sind plausible Ostsee-Sichtungen, für die nur niemand die
Prüfung gerechnet hat. Umgekehrt tragen 179 Zeilen mit `ostsee = 1` überhaupt
keine Koordinaten.

Die Quote schwankt jahrgangsweise stark und **nicht monoton** (2012: 93 %, 2020:
27 %, 2021: 73 %). Sie folgt also nicht einfach dem Einführungszeitpunkt — für
einen Backfill heißt das, dass die vorhandenen `1`-Werte nicht automatisch
vertrauenswürdiger sind als die `0`-Werte und die Herkunft der Altwerte mit
geklärt werden muss.

Ein Filter auf `ostsee = 1` würde damit rund **9.100 echte Sichtungen (48 %)**
aus der öffentlichen Ausgabe entfernen. `ostsee = 1 OR ostsee_geo = 1` wären
immer noch 7.383 (38 %).

**Grund 2 — `.claude/rules/api.md` verbietet es.** Dort ist die öffentliche
Grundmenge verbindlich auf `approvedAt IS NOT NULL` festgelegt, ausdrücklich für
die Legacy-API **und** die moderne Karte, mit der Begründung, dass zwei
verschiedene Filter für zwei öffentliche Flächen zwangsläufig auseinanderlaufen.
Beide Flächen beziehen das Prädikat inzwischen aus derselben Quelle —
`approvedOnly()` in `src/lib/server/db/approvalFilter.ts` —, dieser Endpunkt
ebenso wie `/api/map/sightings`. Ein zusätzlicher Marker-Filter nur hier wäre
genau der Divergenzfall, den das verhindern soll.

**Was das für Clients heißt:** Die Ergebnismenge ist eine Obermenge dessen, was
die Spec beschreibt. Ein Client bekommt zusätzliche Meldungen, keine fehlenden —
die verträglichere Richtung. Die Felder `bm`/`va` wären der vertragsgemäße Weg,
das Ergebnis der Positionsprüfung an Clients zu übermitteln — sie werden derzeit
gar nicht ausgeliefert, auch nicht an eingeloggte Admins.

**Offen — Backfill, aber erst nach der Überarbeitung der Geo-Funktion.** Der
Bestand muss nachgerechnet werden, bevor der Filter überhaupt bewertbar ist. Das
darf aber nicht mit der heutigen Prüfung passieren: Die Küstenabgrenzung wird
gerade überarbeitet (Stand `docs/archive/`-Analyse vom 2026-07-29: eine
Distanzschwelle taugt nicht als Kriterium, weil Schlei, Elbe und Trave bis 74 km
„binnenlands" liegen — brauchbar ist nur eine ungeteilte OSM-Küstenlinie). Ein
Backfill mit der alten Funktion müsste danach ein zweites Mal laufen und würde
zwischenzeitlich falsche Werte als geprüft ausweisen.

Reihenfolge also: Geo-Funktion überarbeiten → Backfill → Marker bewerten →
Filter entscheiden. Bis dahin bleibt der Filter aus.

## Zeitzonen-Semantik

Alle Datums-/Uhrzeitwerte dieser Legacy API sind **deutsche Ortszeit
(Europe/Berlin)** — nie UTC. Das gilt für Eingabe und Ausgabe gleichermaßen:

- **Eingabe** — `sichtungsdatum` (`POST /rest_sichtungen`, Format
  `"YYYY-MM-DD HH:MI"`): Der Wert wird als deutsche Wanduhrzeit interpretiert
  und serverseitig nach UTC umgerechnet, bevor er in der Datenbank
  (`sichtungsdatum`, `timestamp without time zone`, echtes UTC) gespeichert
  wird.
- **Ausgabe** — `dt`/`ti` (`GET /sichtungen/showreports.json`): Beide Felder
  werden aus dem gespeicherten UTC-Zeitpunkt zurück nach Europe/Berlin
  konvertiert, nicht roh ausgegeben.

**Warum deutsche Ortszeit und nicht UTC:** Die Ostsee-Daten haben als
fachliche Konvention einen einheitlichen Bezugszeitpunkt — deutsche Ortszeit.
Das gilt bewusst auch für Sichtungen in östlichen Randgewässern (z. B.
estnische/finnische Küste, EET/EEST), die eine Stunde vor Berlin liegen: Es
wird nicht nach Sichtungsort umgerechnet, sondern einheitlich die deutsche
Ortszeit als Referenz verwendet.

Die interne Speicherung als UTC (seit der Migration
`src/tools/migrate-timestamps-to-utc.js`, siehe
`docs/DATABASE_MIGRATION.md`) ist reine Implementierungsdetail und ändert an
dieser vertraglichen Ein-/Ausgabe-Semantik nichts. Referenz für die
zugrundeliegende Zeitzonen-Konvention: `docs/ENVIRONMENT.md`, Abschnitt `TZ`.
