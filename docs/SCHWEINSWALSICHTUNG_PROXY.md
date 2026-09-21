# schweinswalsichtung.de: Legacy-API-Proxy + Webseiten-Redirect

Betriebs-Notizen zur alten Domain `schweinswalsichtung.de` (Plesk-Host
`hawking`, `ssh hawking`, Vhost-Config unter
`/var/www/vhosts/system/schweinswalsichtung.de/conf/vhost_nginx.conf`).

> **Stand:** 2026-09-18, nach dem Produktions-Umzug von `ostsee-sichtung.de`
> auf `dmm` (interner Traefik-Hostname zuvor `dmm-prod-ostsee.ha.gecko.de`,
> jetzt `ostsee-tiere.de`).

## Ausgangslage

`schweinswalsichtung.de` ist die alte Domain, an die drei Mobile-Clients
weiterhin fest verdrahtet sind (`OstSeeTiere/8`, `okhttp/3.10.0`,
`OstSeeTiere/6` — siehe `.claude/rules/legacy-api.md`). Die Domain wurde nie
abgeschaltet, weil ein URL-Wechsel bei zwei der drei Clients nicht möglich
ist — sie sind nicht testbar und ihre Nutzer erfahren von einem Fehlschlag
nichts.

Der Dienst dahinter (`legacy-inbox/`, Node/Passenger auf `hawking`) wurde
2026-07-30 gebaut, weil die Produktions-DB von dort aus **nicht direkt**
erreichbar war (Port nicht veröffentlicht, kein Quellcode im
Produktions-Container). Details und Betrieb: `legacy-inbox/README.md`.

Seit dem 2026-08-13 ist dieser Zwischenschritt bereits teilweise
zurückgebaut: Zwei der vier Legacy-Endpunkte laufen live gegen Produktion
(siehe unten), nicht mehr über den Datei-Posteingang. Das war zum jetzigen
Zeitpunkt aber **kaputt** — siehe nächster Abschnitt.

## Befund vom 2026-09-18: toter interner Hostname

`vhost_nginx.conf` verwies für die live geproxyten Pfade auf
`dmm-prod-ostsee.ha.gecko.de` — den internen Traefik-Hostnamen von **vor**
dem Produktions-Umzug auf `ostsee-tiere.de`. Nach dem Umzug kennt Traefik
diesen Host nicht mehr und antwortet mit seinem eigenen generischen
`404 page not found` (erkennbar an `content-length: 19`, Go-Standardtext) —
nicht mit einem Fehler der App. Betroffen waren:

- `GET /rest_sichtungen` (Index der Legacy-API, Datenquelle der Karte in der
  iOS-App)
- `GET /sichtungen/showreports.json`

`/usr/local/sbin/legacy-inbox-status` hatte das korrekt als Befund
(`/rest_sichtungen → 404 (erwartet 200)`) gemeldet — die Kontrolle lief, nur
niemand hatte seit dem Umzug nachgesehen (die Beobachtungsfrist aus
`.claude/rules/legacy-api.md` läuft ohnehin nur bis Oktober 2026 und braucht
frische Zahlen).

**Fix:** `dmm-prod-ostsee.ha.gecko.de` → `ostsee-tiere.de` in beiden
`proxy_pass`/`Host`-Paaren. Verifiziert mit
`sudo /usr/local/sbin/legacy-inbox-status` (0 Befunde) und manuellen Checks
gegen alle vier Endpunkte, siehe „Verifikation" unten.

## Architektur nach diesem Fix

| Pfad                                          | Methode | Ziel                               | Warum                                                     |
| --------------------------------------------- | ------- | ---------------------------------- | --------------------------------------------------------- |
| `/rest_sichtungen`                            | `GET`   | live → `ostsee-tiere.de`           | Braucht die DB; Karten-Index der iOS-App                  |
| `/rest_sichtungen`                            | `POST`  | lokal → `legacy-inbox` (Passenger) | Sicherheitsnetz, siehe unten — **bewusst nicht geändert** |
| `/rest_sichtungen/antworten.json` (+ `/en/…`) | `GET`   | lokal → `legacy-inbox`             | funktioniert, kein Bug, siehe „Bewusst nicht angefasst"   |
| `/rest_sichtungen/inBaltic.json`              | `GET`   | lokal → `legacy-inbox`             | dito                                                      |
| `/sichtungen/showreports.json`                | `GET`   | live → `ostsee-tiere.de`           | braucht die DB, `legacy-inbox` hat keine                  |
| alles andere (Website-Aufrufe)                | —       | `301` → `https://ostsee-tiere.de/` | siehe unten                                               |

Der GET/POST-Split unter demselben Pfad `/rest_sichtungen` läuft über den
`if`+`error_page 418`-Trick (siehe Kommentar in der Config) — kein direktes
`if { proxy_pass }`, weil das laut nginx-Wiki („If is evil") in einem
Location-`if` undefiniertes Verhalten haben kann.

### Warum `POST /rest_sichtungen` **nicht** live proxied wird

Das war der ursprüngliche Plan (vollständiges Durchreichen aller vier
Pfade), und die Config selbst hatte diese Entscheidung schon vor diesem Fix
dokumentiert. Zwei voneinander unabhängige Befunde bestätigen sie:

1. **Rate-Limit-Kollision.** `POST /rest_sichtungen` auf `ostsee-tiere.de`
   begrenzt auf **20 Meldungen pro Stunde und IP**
   (`src/lib/server/middleware/rateLimit.ts`, `RATE_LIMITS.SIGHTING_SUBMISSION`).
   Ein Live-Proxy über `hawking` lässt alle drei Mobile-Clients unter der
   **einen** IP von `hawking` bei der Produktion ankommen (sofern Traefik
   `X-Forwarded-For` für diesen zusätzlichen Hop nicht explizit korrekt
   durchreicht — nicht geprüft, siehe „Offen" unten). Ein Nutzer, der wie am
   2026-08-12 beobachtet 60 Nachmeldungen auf einmal schickt, würde damit
   **alle** Mobile-Clients für den Rest der Stunde blockieren — exakt die
   Fehlerklasse, die am 09.08. schon einmal 187 Meldungen gekostet hat, nur
   mit einer anderen Ursache.
2. **Sicherheitsnetz für unprüfbare Clients.** `legacy-inbox` schreibt jede
   eingehende Meldung bedingungslos weg, auch offensichtlichen Unsinn
   (`legacy-inbox/README.md`, Abschnitt „Der Leitsatz") — unabhängig davon,
   ob der eingebaute Validator sie ablehnt. Das ist die einzige Stelle, an
   der ein zu Unrecht abgelehnter Request (Validator-Bug, nicht der Client)
   nachträglich auffällt (`abgewiesen/`). Für zwei der drei Clients ist das
   der einzige Kanal, über den ein stiller Datenverlust überhaupt sichtbar
   werden kann.

Der lokale Posteingang-Sync (`legacy-inbox-sync`, alle 15 Min,
`legacy-inbox-report` täglich 07:20) bleibt deshalb **aktiv**. Details zum
Sync, den Rechten und der Störungsmeldung: `legacy-inbox/README.md`,
Abschnitt „Betrieb als Zeitplan".

### Bewusst nicht angefasst: `antworten.json` und `inBaltic.json`

Beide laufen weiterhin lokal über `legacy-inbox` (eigene JSON-Datei bzw.
eigener Geo-Index, siehe `legacy-inbox/data/` und
`legacy-inbox/src/geo/`) statt live gegen Produktion. Anders als bei
`POST` gibt es dafür keinen Sicherheitsgrund — beide sind zustandslose
`GET`s ohne Schreibrisiko. Grund, es trotzdem nicht anzufassen: Am
2026-09-18 lieferten beide Quellen **byte-identische** Antworten (siehe
Verifikation unten), es lag also kein Bug vor, den ein Umbau hätte beheben
müssen. Ein Live-Proxy hätte nur eine zweite, unnötige Abhängigkeit von der
Erreichbarkeit von `ostsee-tiere.de` für zwei Endpunkte eingeführt, die
bisher unabhängig davon funktionieren.

**Bekannte Diskrepanz, nicht neu und hier nicht behoben:** Das
Sprachpräfix-Verhalten von `legacy-inbox` deckt sich nicht mit der
Spezifikation. `/en/rest_sichtungen/antworten.json` wird bedient (mit einer
separaten Datei `antworten.en.json` — inhaltlich am 2026-09-18 identisch zur
deutschen, aber als eigene Datei mit eigenem Pflegeaufwand), `/de/…` dagegen
gar nicht (404), und `/rest_sichtungen/inBaltic.json` kennt überhaupt kein
Präfix. Die Spezifikation (`docs/LEGACY_API_SPECIFICATION.md`, Abschnitt
„Sprachpräfix") verlangt beides vor allen vier Pfaden. Kein bekannter Client
nutzt das Präfix nachweislich, und dieser Fix hat keinen Beleg für neuen
Bedarf geliefert — deshalb hier nur festgehalten, nicht angefasst.

## Der Webseiten-Redirect

```nginx
location = /map {
    return 301 https://ostsee-tiere.de/map;
}
location = /map/ {
    return 301 https://ostsee-tiere.de/map;
}

location / {
    return 301 https://ostsee-tiere.de/;
}
```

`/map` ist der einzige Pfad mit Ziel-Erhalt (2026-09-18 auf Wunsch ergänzt —
vermutlich der einzige Deep-Link, den Nutzer sich von der alten Domain
gemerkt haben). Alles andere fällt auf die Startseite. Beide `/map`-Varianten
(mit und ohne Trailing Slash) sind nötig, weil `location =` exakt matcht.

Der generische Redirect (`location /`) trifft alles, was keine der
spezifischeren Locations (`=`, `@named`, `^~`) oben bedient. **Falle
dabei:** Drei Pfade hatten vorher **keine eigene**
Location und liefen über den impliziten Fallback auf das serverweite
`passenger_enabled on` — `/health`, `/rest_sichtungen/antworten.json` und
`/rest_sichtungen/inBaltic.json` (`/en/rest_sichtungen/antworten.json`
ebenso). Ein `return` in einer neu hinzugefügten `location /` kapert diesen
Fallback vollständig, weil `return` in einer Location sofort greift, egal
was der Server-Kontext sonst vererbt — beim ersten Rollout genau so
passiert (`/health` und `antworten.json` lieferten kurzzeitig `301` statt
`200`). Behoben durch je eine **leere** `location = <pfad> { }` für die vier
betroffenen Pfade vor dem Redirect-Block — nginx zieht exakte Matches jeder
Präfix-Location vor, der Effekt ist identisch zum bisherigen impliziten
Fallback, nur nicht mehr unsichtbar.

**Wer diese Config künftig um einen fünften lokal bedienten Pfad
erweitert, muss ihm ebenfalls eine solche Leer-Location geben** — sonst
wird er stillschweigend zum Redirect-Ziel `https://ostsee-tiere.de/`
umgeleitet, statt seine Antwort zu liefern.

## Verifikation (2026-09-18, nach dem Fix)

```bash
ssh hawking "sudo -n /usr/local/sbin/legacy-inbox-status"
# → Keine Auffälligkeiten. /health, /rest_sichtungen, /rest_sichtungen/antworten.json alle 200.

curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://schweinswalsichtung.de/
# → 301 -> https://ostsee-tiere.de/

curl -s -o /dev/null -w '%{http_code}\n' https://schweinswalsichtung.de/rest_sichtungen        # GET-Index
curl -s -o /dev/null -w '%{http_code}\n' 'https://schweinswalsichtung.de/sichtungen/showreports.json?year=2024'
# → beide 200 (vorher: 404, siehe Befund oben)

diff <(curl -s https://schweinswalsichtung.de/rest_sichtungen/antworten.json) \
     <(curl -s https://ostsee-tiere.de/rest_sichtungen/antworten.json)
# → identisch
```

**Nicht getestet:** `POST /rest_sichtungen` mit echten Daten — jede
angenommene Meldung wird von `legacy-inbox` unbedingt weggeschrieben, vom
Sync innerhalb von 15 Minuten an Produktion gesendet und löst dort eine
Benachrichtigungs-E-Mail aus (`legacy-inbox/README.md`, Abschnitt „Import").
Ein Test-POST hätte eine echte, falsche Sichtung samt Mail erzeugt. Der
POST-Pfad wurde durch diesen Fix nicht verändert (siehe oben), ein Regressionsrisiko
bestand hier nicht.

## Offen

- **Behoben 2026-09-21: Client-IP in Produktion.** Am 2026-09-18 loggte
  **jeder** Request gegen `ostsee-tiere.de` dieselbe interne `clientIp`
  (`100.64.1.2`), unabhängig von `hawking`. Ursache: `ADDRESS_HEADER`/
  `XFF_DEPTH` (`docs/ENVIRONMENT.md`) fehlten in der Prod-`.env` auf `dmm`.
  Nach dem Setzen kommen echte öffentliche IPs an, und ein gefälschter
  `X-Forwarded-For` (auch als Kette) wird nicht übernommen. Vor der
  Korrektur galt das 20/Std.-Kontingent von `POST /rest_sichtungen` für alle
  Melder gemeinsam. Herleitung und Testmethode: Projekt-Memory
  `prod-client-ip-nicht-durchgereicht-2026-09-18`.
- **IP über den `hawking`-Hop (getestet 2026-09-21).** Bei Requests über den
  Proxy loggt die App die Ausgangs-IP von `hawking`, nicht
  die des Melders: Die Kette ist einen Eintrag länger als bei Direktzugriff,
  und `XFF_DEPTH` greift genau diesen Eintrag heraus. Betroffen sind nur
  `GET /rest_sichtungen` und `showreports.json`, die die IP ausschließlich
  loggen (kein Rate-Limit). Bewusst nicht behoben: Eine Sonderbehandlung
  vertrauenswürdiger Proxy-IPs in `getClientIp` wäre sicherheitsrelevanter
  Code für reine Log-Genauigkeit.
- **Warum `POST` trotz funktionierender Client-IP lokal bleibt.** Die IP war
  nur einer von vier Gründen und der schwächste. Bleibend sind: das
  20/Std.-Limit der App gegenüber 500/Std. im Posteingang (60 Nachmeldungen
  auf einmal würden nach 20 abgewiesen), die Entkopplung von Ausfällen und
  Deployments auf `dmm` (Posteingang nimmt an, Proxy liefert 502) und
  `abgewiesen/` als einziger Kanal für zu Unrecht abgelehnte Meldungen. Eine
  Komplettumstellung bräuchte vorher ein höheres Legacy-`POST`-Limit, die
  Proxy-IP-Behandlung und das Ablegen abgelehnter Meldungen in der App.
  Bei rund 4 Meldungen/Tag rechtfertigt der Nutzen das nicht. Der Sync läuft
  unter der `hawking`-IP und ist deshalb auf 20 Meldungen/Std. begrenzt;
  Rückstände laufen entsprechend langsam ab.
- **Traefik-Konfiguration auf `dmm`** kann von hier aus nicht geändert
  werden (Produktions-Compose ist eigenständig, siehe
  `docs/PREPROD_HAWKING.md` und die Projekt-Memory zu `dmm`). Dieser Fix
  kommt deshalb bewusst ausschließlich über `hawking`s nginx aus, ohne
  jede Voraussetzung auf der Produktionsseite.
- **Laufende Beobachtung fortführen.** Der Datumsstand in
  `.claude/rules/legacy-api.md` („bis etwa Oktober 2026") gilt unverändert;
  `legacy-inbox-status` sollte nach diesem Fix weiterhin regelmäßig
  gegengeprüft werden, nicht nur beim nächsten Vorfall.
