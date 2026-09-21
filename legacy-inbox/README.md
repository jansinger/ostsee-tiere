# Legacy-Posteingang

Eigenständiger Node-Dienst für den Plesk-Server. Bedient drei Endpunkte der
Legacy-API und legt jede eingehende Sichtung als JSON-Datei ab.

Entwurf und Begründungen: `docs/archive/LEGACY_INBOX_ENTWURF_2026-07-30.md`
Vertrag: `docs/LEGACY_API_SPECIFICATION.md`

## Der Leitsatz

Was den Dienst erreicht hat, wird geschrieben — ausnahmslos, auch wenn es
ungültig, unparsbar oder Unsinn ist. Die Validierung entscheidet nur über die
HTTP-Antwort und das Zielverzeichnis, nie über die Existenz der Daten.

Der zugehörige Test heißt „hinterlässt auch bei vollständigem Unsinn eine
Datei". Fällt er weg, ist der Dienst wieder einer, der Daten verwerfen kann.

## Endpunkte

| URL                                           | Methode |
| --------------------------------------------- | ------- |
| `/rest_sichtungen`                            | POST    |
| `/rest_sichtungen/antworten.json` (+ `/en/…`) | GET     |
| `/rest_sichtungen/inBaltic.json`              | GET     |
| `/health`                                     | GET     |

`/sichtungen/showreports.json` wird bewusst **nicht** bedient — ohne Datenbank
könnte der Dienst dort nur ein falsches leeres Array liefern.

`/health` gehört nicht zum Legacy-Vertrag. Es ist ein zusätzlicher Pfad für die
Überwachung und liefert keine Daten aus dem Posteingang.

## Umgebungsvariablen

| Variable                         | Vorgabe | Bedeutung                                                     |
| -------------------------------- | ------- | ------------------------------------------------------------- |
| `LEGACY_INBOX_DATA_DIR`          | —       | **Pflicht.** Datenverzeichnis, außerhalb des Document-Roots   |
| `PORT`                           | 3000    | Wird von Passenger gesetzt                                    |
| `LEGACY_INBOX_RATE_LIMIT_IP`     | 100     | Requests pro IP und Stunde — weist ab, schreibt aber trotzdem |
| `LEGACY_INBOX_RATE_LIMIT_GLOBAL` | 1000    | Reißleine über alle IPs — weist ohne Schreiben ab             |
| `LEGACY_INBOX_MAX_BODY_BYTES`    | 262144  | Obergrenze des Request-Bodys                                  |

## Einrichtung in Plesk

**1.** Node.js-Extension der Domain aktivieren, Anwendungswurzel auf
`legacy-inbox/` und Startdatei auf `app.js` setzen.

**2.** Genau eine Instanz laufen lassen. `lfd_nr` wird von einer
Warteschlange im Prozessspeicher vergeben (`legacy-inbox/src/store.js`) —
diese Nummer existiert nur innerhalb eines einzigen Prozesses. Bedient
Passenger dieselbe Anwendung über mehrere Prozesse oder Worker, führen zwei
Prozesse unabhängig voneinander Buch und können derselben Sichtung
denselben `lfd_nr` zuweisen. Solange die Zeitstempel im Dateinamen
verschieden sind, entsteht daraus kein Datenverlust, nur eine doppelt
vergebene Nummer. Fallen Zeitstempel und Nummer beider Prozesse aber auf
dieselbe Millisekunde, schlägt das atomare Anlegen der Datei fehl und der
Dienst antwortet mit `500` statt `201` — vermeidbar, indem die Domain in
Plesk auf eine einzige Anwendungsinstanz begrenzt bleibt.

**3.** `npm ci` über die Plesk-Oberfläche oder per SSH.

**4.** Datenverzeichnis **außerhalb** des Document-Roots anlegen und
`LEGACY_INBOX_DATA_DIR` darauf setzen:

    mkdir -p /var/www/vhosts/schweinswalsichtung.de/legacy-inbox-data
    chmod 700 /var/www/vhosts/schweinswalsichtung.de/legacy-inbox-data
    chown <anwendungsbenutzer> /var/www/vhosts/schweinswalsichtung.de/legacy-inbox-data

Läge es im Document-Root, wären Namen, E-Mail-Adressen und Telefonnummern der
Melder über die Domain abrufbar. Das ist die wichtigste einzelne Einstellung des
gesamten Aufbaus.

**5.** `X-Real-IP` in den nginx-Zusatzdirektiven der Domain setzen — sonst kennt
der Dienst nur die Adresse des Proxys und zählt alle Melder als einen:

    passenger_set_header X-Real-IP $remote_addr;

**Nicht `proxy_set_header`.** Plesk bedient Node-Anwendungen über Phusion
Passenger, und `proxy_set_header` gehört zu nginx' Proxy-Modul — es wirkt nur
auf Anfragen, die per `proxy_pass` weitergereicht werden. Bei einer
Passenger-Anwendung läuft die Direktive wirkungslos ins Leere, **ohne
Fehlermeldung**: nginx startet, die Anwendung startet, alles sieht richtig
aus, und der Dienst sieht trotzdem nur `127.0.0.1`. Bei der ersten
Inbetriebnahme am 2026-07-30 genau so passiert — die Direktive ist also keine
theoretische Vorsichtsmaßnahme.

Nach dem Eintragen von außen prüfen — nicht vom Server selbst, sonst ist
`127.0.0.1` die korrekte Antwort. Die empfangene Adresse steht im Umschlag
unter `quelle.ip`.

`X-Forwarded-For` wird bewusst **nicht** ausgewertet: Die Kopfzeile kommt vom
Client, und ein zufälliger Wert je Request würde das Rate-Limit aushebeln.

**6.** Let's Encrypt aktivieren — **ohne** erzwungene HTTPS-Umleitung. Die Spec
nennt `http://` als Basis-URL, und ein `301` auf ein POST lässt bei etlichen
HTTP-Clients den Body verschwinden.

**7.** Prüfen:

    curl -s https://schweinswalsichtung.de/health
    curl -s 'https://schweinswalsichtung.de/rest_sichtungen/inBaltic.json?location=53,10'

Erwartet: `{"status":"ok","datenverzeichnis":"beschreibbar","frei_mb":…}` und
`{"inbaltic":false,"inchartarea":false}`

Die zweite Antwort überrascht auf den ersten Blick, ist aber richtig: Seit der
Bereinigung der Ostsee-Geometrie beginnt der Kartenbereich bei 53,55° N, und
53,10 (Raum Hamburg) liegt südlich davon. Wer prüfen will, dass die Geometrie
überhaupt greift, nimmt zusätzlich eine Koordinate innerhalb des Bereichs:

    curl -s 'https://schweinswalsichtung.de/rest_sichtungen/inBaltic.json?location=54.5,10.5'

Erwartet: `{"inbaltic":true,"inchartarea":true}` (Kieler Bucht, offenes Wasser).

### Beim Prüfen nicht selbst aussperren

Der Dienst liefert keine statischen Dateien aus — jede Anfrage landet beim
Node-Prozess, unbekannte Pfade beantwortet er mit `404`. Wer die Absicherung
nachprüfen will (etwa ob das Datenverzeichnis oder ein Git-Klon über die Domain
erreichbar ist), erzeugt damit zwangsläufig eine Serie von 404ern auf Pfade wie
`/.git/config`.

Genau das ist die Signatur eines Schwachstellen-Scanners, und Plesks fail2ban
reagiert darauf. Am 2026-07-30 wurde bei einer solchen Prüfung die eigene
Adresse nach zwölf Anfragen gesperrt — erkennbar daran, dass anschließend auch
`/health` nicht mehr antwortet, obwohl der Dienst läuft.

Deshalb: Anfragen entzerren, oder vorher wissen, wie man sich wieder befreit.

    fail2ban-client status                    # welche Jails gibt es
    fail2ban-client status <jail>             # gesperrte Adressen
    fail2ban-client set <jail> unbanip <ip>   # Sperre aufheben

Ob der Dienst noch läuft oder wirklich nur die Sperre greift, klärt ein Aufruf
**auf dem Server selbst**. fail2ban sperrt nach Quelladresse und hat
`127.0.0.1` standardmäßig in seiner `ignoreip`-Liste, ein lokaler Aufruf kommt
also durch:

    curl -s -H 'Host: schweinswalsichtung.de' http://127.0.0.1/health

Der `Host`-Kopf ist nötig, damit nginx die Anfrage der richtigen Domain
zuordnet.

Nicht funktionieren würde ein Aufruf direkt gegen den Anwendungsport: `PORT`
setzt Passenger nur in der Umgebung des Anwendungsprozesses, nicht in deiner
Shell — und Passenger fängt `server.listen()` ohnehin ab und verbindet die
Anwendung über einen eigenen Socket. Ob überhaupt ein TCP-Port lauscht, zeigt
`ss -ltnp | grep node`.

Startet der Dienst gar nicht erst, steht der Grund im Passenger-Log. Er bricht
den Start ab, wenn `LEGACY_INBOX_DATA_DIR` fehlt oder das Datenverzeichnis
nicht beschreibbar ist (`legacy-inbox/src/startPruefung.js`) — ein Rechte- oder
Pfadfehler soll beim Deploy auffallen und nicht bei der ersten echten Sichtung.
Knapper Plattenplatz verhindert den Start dagegen **nicht**, sondern wird laut
protokolliert; siehe Abschnitt „Plattenplatz" unten.

### Zwei Startfehler mit eindeutiger Signatur

**`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yup'`**

Im Verzeichnis des Dienstes fehlt `node_modules`. Plesks „NPM install"
arbeitet im Application Root; zeigt der auf einen Symlink, geht die
Installation je nach Plesk-Version ins Leere. Zuverlässig ist der Weg über
SSH, im echten Verzeichnis:

    cd <anwendungswurzel>
    npm ci

Danach die Anwendung neu starten und prüfen:

    ls node_modules | grep -E '^(yup|rbush)$'

**`Error [ERR_REQUIRE_ASYNC_MODULE]: require() cannot be used on an ESM graph with top-level await`**

Passenger lädt die Anwendung per `require()`, und Node lädt ESM aus CJS nur,
wenn der Modulgraph kein Top-Level-`await` enthält. `app.js` hält sich daran
und trägt oben einen Kommentar, der erklärt warum — wer den asynchronen Start
dort wieder auf die oberste Ebene zieht, bricht das Deployment, ohne dass ein
lokales `node app.js` etwas davon merkt.

Der Test „lässt sich laden, wie Passenger es lädt" in `app.test.js` deckt
genau diesen Ladeweg ab.

## In den Posteingang schauen

Es gibt bewusst keine Oberfläche — die Dateien liegen im Dateisystem:

    cd "$LEGACY_INBOX_DATA_DIR"

    ls posteingang | wc -l        # wie viele warten auf den Import
    ls abgewiesen  | wc -l        # Warnsignal, siehe unten
    ls importiert  | wc -l        # bereits übernommen

    # letzter Eingang, ohne die persönlichen Daten
    ls -t posteingang | head -1 | xargs -I{} jq '{empfangen_am, lfd_nr, validierung}' posteingang/{}

    # welche Felder bemängelt wurden — die Frage bei jedem Eintrag in abgewiesen/
    jq -r '.validierung.fehler | keys[]' abgewiesen/*.json | sort | uniq -c | sort -rn

## Betrieb — Voraussetzung, nicht Kür

**Sicherung.** Bis zum Import ist die Platte dieses Servers der einzige Ort, an
dem eine eingegangene Sichtung existiert. Nötig sind beide Hälften: eine
Sicherung des Datenverzeichnisses auf einen **anderen Rechner** und ein
regelmäßiger, kurz getakteter Import. Der Import ist damit nicht nur
Datenübernahme, sondern der eigentliche Schutzmechanismus.

**Überwachung.** Eine **externe** Überwachung muss `/health` regelmäßig abfragen
— extern, weil eine Überwachung auf demselben Server genau dann mit ausfällt,
wenn sie gebraucht wird. Mit zu überwachen: die Anzahl der Dateien in
`abgewiesen/` und das Feld `frei_mb`.

Ein `503` mit `{"status":"fehler","datenverzeichnis":"nicht beschreibbar"}`
heißt: Der Dienst läuft noch, kann aber nicht mehr schreiben — falsche Rechte,
volles Dateisystem oder ein versehentlich entfernter Pfad. Sofort prüfen, denn
jede Sichtung, die in diesem Zustand eintrifft, scheitert am Schreiben und
bekommt vom Client aus gesehen nur ein `500` statt einer Bestätigung.

**Jeder Eintrag in `abgewiesen/` ist ein Warnsignal.** Entweder Missbrauch —
dann kann er weg — oder eine echte Sichtung, die der Validierer zu Unrecht
abgelehnt hat. Der zweite Fall ist stiller Datenverlust und muss auffallen. Der
`jq`-Befehl oben zeigt, welche Felder bemängelt wurden; häufen sich dieselben
Namen, liegen Validierer und reale App auseinander.

**Plattenplatz.** Beim Start prüft der Dienst den freien Platz und meldet
weniger als 500 MB als Ereignis `plattenplatz_knapp` auf Stufe `fehler` ins
Protokoll — er läuft dabei aber weiter und liefert den freien Platz über
`/health` mit. Ein Startabbruch wäre hier das falsche Mittel: Auf einer Domain
mit Kontingent nähme er den Posteingang vollständig vom Netz, und jede
eintreffende Sichtung wäre verloren, ohne dass überhaupt etwas geschrieben
würde — schlimmer als das Problem, vor dem er schützen soll. Der Alarm gehört
deshalb in die Überwachung, nicht in den Startcode. Zu bedenken: Allein der
Geo-Index belegt 33 MB, und innerhalb der globalen Reißleine passen im
schlimmsten Fall rund 6 GB pro Tag auf die Platte (1.000 Requests/Stunde à
256 KB). Die Reißleine schützt vor einer Flut, nicht vor einem geduldigen
Angreifer.

**Aufräumen.** Weder `abgewiesen/` noch `importiert/` räumen sich selbst auf:

- `abgewiesen/` nach Sichtung durch einen Menschen leeren — echte Sichtungen
  von Hand nachtragen, Missbrauch löschen
- `importiert/` nach gesicherter Übernahme in die Datenbank archivieren oder
  löschen. Die Dateien werden nur noch als Herkunftsnachweis gebraucht

## Import

Es gibt zwei Wege. Welcher passt, entscheidet die Erreichbarkeit der
Zieldatenbank — nicht der Geschmack.

### Direkt in die Datenbank (Entwicklung, eigener Server)

    npm run import:legacy-inbox -- /var/www/vhosts/schweinswalsichtung.de/legacy-inbox-data

Läuft im Hauptrepo, nicht auf dem Plesk-Server, und ruft dieselben Bausteine
wie `POST /rest_sichtungen` direkt auf (`mapLegacyToCurrentSchema` und
`saveSighting`), statt über HTTP zu gehen — der Endpunkt begrenzt auf 20
Sichtungen pro Stunde und IP, was einen Sammelimport unbrauchbar machen würde.

Übernommene Dateien wandern nach `importiert/`; was liegen bleibt, ist genau
das, was noch offen ist. Ein zweiter Lauf legt nichts doppelt an, weil bereits
verschobene Dateien nicht mehr in `posteingang/` liegen.

**Jede übernommene Sichtung löst eine Benachrichtigungs-E-Mail aus** — dieselbe,
die auch bei einer Meldung über das Formular verschickt wird. Das ist so gewollt
(der Dienst selbst verschickt bewusst keine Mail, siehe
`docs/archive/LEGACY_INBOX_ENTWURF_2026-07-30.md`, Abschnitt 12), hat aber eine
unangenehme Seite: Wird nach einer Störung ein größerer Rückstand abgearbeitet,
geht für jede einzelne Datei eine Mail heraus. Vor einem solchen Lauf entweder
die Empfänger vorwarnen oder den Versand in der Konfiguration vorübergehend
abschalten.

**Scheitert das Verschieben nach `importiert/`.** Die Sichtung ist zu diesem
Zeitpunkt bereits in der Datenbank angelegt — nur das Aufräumen der Datei ist
fehlgeschlagen (nach mehreren Versuchen, etwa bei kurzzeitig voller Platte).
Der Lauf bricht in diesem Fall sofort ab und meldet Dateiname und die bereits
vergebene Sichtungs-ID auf der Konsole. Die Datei muss dann **von Hand** nach
`importiert/` verschoben werden, bevor der Import erneut läuft — sonst liegt
sie beim nächsten Lauf weiterhin in `posteingang/` und wird ein zweites Mal
angelegt.

### Über HTTP an eine laufende Instanz (Produktion)

    npm run send:legacy-inbox -- https://ostsee-tiere.de

Ohne weitere Angabe holt der Lauf die Dateien per SSH von
`hawking:/var/www/vhosts/schweinswalsichtung.de/legacy-inbox-data` und
verschiebt jede angenommene Datei dort nach `importiert/`. Ein anderer Ort geht
mit `--ssh=host:/pfad` oder `--dir=/pfad` (lokales Verzeichnis).

Warum nicht der direkte Weg von oben? Weil er eine Verbindung zur
Produktionsdatenbank braucht. Deren Port ist auf dem Produktionsserver bewusst
nicht veröffentlicht, und ein Lauf im Container scheidet aus, weil dort kein
Quellcode liegt. Bleibt der Weg, den die App selbst genommen hat:
`POST /rest_sichtungen`.

Das ist kein Notbehelf, sondern die strengere Prüfung. Der Endpunkt validiert
jede Meldung mit demselben Yup-Schema wie eine echte App-Meldung; der direkte
Import ruft nur Mapping und Repository. Was hier durchkommt, hätte die App auch
live einliefern können. Gesendet wird `roh` wörtlich — ein Re-Serialisieren aus
`payload` wäre eine zweite Interpretation der Daten und damit genau die Art
stiller Abweichung, die der Legacy-Vertrag nicht verträgt.

Der Preis ist das Rate-Limit von **20 Meldungen pro Stunde und IP**. Beim
ersten `429` bricht der Lauf ab und meldet, wo er stand. Das ist unkritisch,
weil die Datei das Protokoll ist: Übernommenes liegt in `importiert/`, Offenes
in `posteingang/`. Ein Neustart nach Ablauf des Fensters macht dort weiter und
kann nichts doppelt anlegen. Bei 37 wartenden Dateien sind das zwei Läufe im
Abstand einer Stunde.

Ebenfalls abgebrochen wird bei einem Netzwerkfehler — dann ist unbekannt, ob
die Sichtung angelegt wurde, und blind weiterzusenden hieße, ein mögliches
Duplikat zu verstecken. Eine inhaltlich abgelehnte Datei (HTTP 400) hält den
Lauf dagegen nicht auf: Sie bleibt liegen und wird am Ende aufgeführt — genau
wie ein Eintrag in `abgewiesen/` ein Warnsignal ist und einen Menschen braucht.

**Auch dieser Weg löst je Sichtung eine Benachrichtigungs-E-Mail aus** (siehe
den Hinweis oben). Vor einem Rückstand-Lauf `notification.email.enabled`
abschalten — und danach wieder ein.

### Betrieb als Zeitplan: welcher Abbruch einen Menschen braucht

Auf `hawking` läuft der Versand alle 15 Minuten über einen Plesk-Zeitplan
(`/usr/local/sbin/legacy-inbox-sync`, ruft dieses Werkzeug aus dem deployten
Repo — der Name im Repo ist `sync-root.sh`, `install.sh` benennt ihn um). Der
Wrapper dort beantwortet genau eine Frage — **muss jemand hinsehen?** — und
die drei Abbruchgründe sind dafür ausdrücklich nicht gleichwertig:

| Grund         | heilt sich selbst?                            | Zeitplan meldet |
| ------------- | --------------------------------------------- | --------------- |
| `rate-limit`  | ja, der nächste Lauf macht weiter             | nein            |
| `netzwerk`    | nein — unklar, ob die Sichtung angelegt wurde | ja              |
| `verschieben` | nein — Sichtung angelegt, Datei liegt noch da | ja              |

Das Werkzeug selbst endet bei **jedem** Abbruch mit Exit 1; für einen Aufruf
von Hand ist „nicht fertig geworden" die richtige Auskunft. Erst der Wrapper
stuft `rate-limit` herunter.

Der Grund steht in den Zahlen: Am 2026-08-12 trug ein Nutzer 60 Sichtungen aus
sechs Jahren nach. Bei 20 Meldungen pro Stunde, die die Zielinstanz annimmt,
verteilt sich das über Stunden — und jeder Lauf dazwischen endet am Limit. Mit
vier Läufen je Stunde wären das vier Benachrichtigungen für einen Zustand, der
in Ordnung ist. Nach einer Woche liest sie niemand mehr, und dann geht der eine
echte Fehler darin unter.

Die Ausnahme greift **nur, wenn sonst nichts auffiel**: Kam neben dem
Rate-Limit eine Ablehnung vor, bleibt es bei Meldung und Exit 1. Eine
abgelehnte Meldung braucht einen Menschen, unabhängig vom Limit.

### Wer die Störungsmeldung verschickt — und warum nicht Plesk

**Die Skripte verschicken selbst** (`deploy/melde.sh`), die Benachrichtigung
des Plesk-Zeitplans steht bei beiden Aufgaben auf `ignore`.

Der Grund ist gemessen, nicht vermutet: Am 2026-08-12 scheiterten die
planmäßigen Sync-Läufe mehrfach am Rate-Limit, und eine eigens angelegte
Test-Aufgabe endete mit Exit 1 — in **keinem** Fall entstand eine Mail,
obwohl die Zustellung an die konfigurierte Adresse im Mail-Log nachweisbar
funktioniert. Eine Überwachung, deren Meldeweg im Stillen versagt, ist
schlimmer als keine: Sie erzeugt das Gefühl, informiert zu werden.

Zwei Fallen stecken darin, beide beim Einrichten aufgetreten und beide von der
Sorte „meldet Erfolg und tut nichts":

- **Keine eigene `From`-Kopfzeile setzen.** Der erste Entwurf verwendete
  `noreply@schweinswalsichtung.de`. Der Plesk-Wrapper
  (`/usr/lib/plesk-9.0/postfix-sendmail-wrapper`) verwarf die Mail daraufhin
  stillschweigend: Exit 0, kein Eintrag im Mail-Log, nichts zugestellt — für
  diese Domain gibt es keinen Mail-Dienst und damit kein Postfach, aus dem
  verschickt werden dürfte. Ohne eigene `From`-Zeile setzt der Wrapper den
  ausführenden Benutzer ein und stellt zu.
- **Eigentümer der Dateien beachten.** `sync.sh` läuft als Domain-Benutzer
  (siehe `sync-root.sh`). Liegt `melde.sh` root-eigen mit Modus 640, endet
  jeder Lauf mit `Permission denied` — der Sync überträgt dann gar nichts
  mehr. `config` und `melde.sh` gehören dem Domain-Benutzer.

Geprüft wird das, indem man einen Fehlerfall wirklich auslöst und danach ins
Mail-Log sieht — nicht, indem man den Exit-Code liest:

```bash
ssh hawking "sudo -n /usr/local/sbin/legacy-inbox-report 31/Jul/2026"
ssh hawking "sudo -n grep 'to=<…>' /var/log/maillog | tail -2"
```

Der Pfad ist bewusst `/usr/local/sbin/` und nicht das Deploy-Verzeichnis:
`install.sh` legt die root-Einstiege dorthin und benennt sie dabei um
(`sync-root.sh` → `legacy-inbox-sync`, `client-report.sh` →
`legacy-inbox-report`, `melde.sh` → `legacy-inbox-melde`). Unter `legacy-sync/`
steht nur die `config`.

Zuletzt so geprüft am **2026-08-18**: Der Lauf meldete die 60 gescheiterten
POSTs des 31.07. und die Mail wurde zugestellt (`status=sent`, danach per
dovecot in die INBOX).

### Einrichtung auf dem Server

Zwei Orte, und die Unterscheidung ist der häufigste Stolperstein:

| Ort                                     | Inhalt           | Herkunft                                  |
| --------------------------------------- | ---------------- | ----------------------------------------- |
| `…/repo/legacy-inbox/deploy/`           | die vier Skripte | Repo, kommt mit `plesk ext git --deploy`  |
| `…/schweinswalsichtung.de/legacy-sync/` | nur `config`     | von Hand, aus `config.example` abgeleitet |

Die beiden **root-Einstiege** liegen bewusst außerhalb des Deploy-Verzeichnisses
in `/usr/local/sbin/` (`legacy-inbox-sync`, `legacy-inbox-report`); die
Plesk-Zeitpläne zeigen dorthin. Grund: Der Git-Deploy legt im
Deploy-Verzeichnis alles unter dem Domain-Benutzer an — nachgemessen auch bei
unveränderter Datei. Ein root-Zeitplan, der eine vom Anwendungsbenutzer
beschreibbare Datei ausführt, wäre ein Weg zu root, und der Posteingang-Dienst
läuft unter genau diesem Benutzer und ist aus dem Internet erreichbar.

Installiert werden sie mit einem Befehl, nach jeder Änderung an einem der
beiden:

```bash
sudo /var/www/vhosts/<domain>/repo/legacy-inbox/deploy/install.sh
```

Drei Dinge müssen dabei root gehören, weil root sie **einbindet** — und `.`
ist Ausführen, nicht Lesen:

| Datei                                | Eigentümer    | warum                                                             |
| ------------------------------------ | ------------- | ----------------------------------------------------------------- |
| `/usr/local/sbin/legacy-inbox-*`     | `root:root`   | von root ausgeführt                                               |
| `/usr/local/sbin/legacy-inbox-melde` | `root:root`   | von den root-Skripten eingebunden                                 |
| `legacy-sync/config`                 | `root:psacln` | von den root-Skripten eingebunden; der Dienst liest sie nur (640) |

Die Kopie von `melde.sh` im Deploy-Verzeichnis bleibt bestehen — sie wird von
`sync.sh` eingebunden, das als Domain-Benutzer läuft und dabei keine Grenze
überschreitet.

> **Was der Installationsschritt nicht löst.** `install.sh` liegt im
> Deploy-Verzeichnis und wird als root aufgerufen — an dieser einen Stelle
> führt root also Inhalt aus, den der Anwendungsbenutzer schreiben kann. Das
> lässt sich nicht wegkonfigurieren: Auch wer die beiden `install`-Befehle von
> Hand tippt, kopiert eine Datei aus demselben Verzeichnis nach
> `/usr/local/sbin/`.
>
> Der Unterschied zum Zeitplan ist aber wesentlich, und er ist der Grund für
> diese Anordnung: Der Zeitplan läuft **unbeaufsichtigt alle 15 Minuten** — ein
> kompromittierter Dienst bekäme root von selbst. Der Installationsschritt läuft,
> wenn ein Mensch ihn auslöst, selten und nach einer Änderung, die er kennt. Wer
> ganz sicher gehen will, installiert aus einem vertrauenswürdigen Checkout statt
> aus dem Deploy-Verzeichnis des Servers.

Plesks Post-Deploy-Aktionen können das nicht übernehmen: Sie laufen in der
chroot-Umgebung des Abonnements, deren Shell auf `/bin/false` steht, und
wurden im Test überhaupt nicht ausgeführt — konfiguriert, aktiviert, wirkungslos.
Ein `chown` nach jedem Deploy wäre die andere Möglichkeit gewesen; sie hält
nur, solange jemand daran denkt.

`sync.sh` und `melde.sh` bleiben im Deploy-Verzeichnis und kommen mit jedem
Deploy frisch — `sync.sh` läuft als Domain-Benutzer, `melde.sh` wird nur
eingebunden. Beide werden über `SKRIPT_DIR` aus der `config` gefunden. Die `config` bleibt
außerhalb, weil sie die Empfängeradresse der Störungsmeldungen nennt und
deshalb nicht ins öffentliche Repo gehört. Ihr Pfad steht fest in den Skripten
und lässt sich über die Umgebungsvariable `LEGACY_SYNC_CONFIG` überschreiben —
das ist zugleich der Weg, das Ganze woanders zu betreiben.

Deshalb tauchen in den Beispielen oben beide Pfade auf: `legacy-sync/…` überall
dort, wo es um die Konfiguration geht, `deploy/…` beim Aufruf.

Rechte, an denen es beim Einrichten scheiterte:

- `config` und `melde.sh` müssen für den **Domain-Benutzer** lesbar sein —
  `sync.sh` läuft unter ihm, nicht als root.
- `sync-root.sh` läuft als root und gibt die Rechte selbst ab.

Beide Zeitpläne sind serverweite Plesk-Aufgaben als `root` — **nicht** auf
Abonnement-Ebene. Der Grund: Plesk führt Abonnement-Aufgaben in einer
chroot-Umgebung aus, in deren `passwd` der Domain-Benutzer nicht steht, weil
seine Shell auf `/bin/false` gesetzt ist. Das zu ändern hieße, SSH-Zugang zu
öffnen — ein zu hoher Preis für einen Zeitplan.

Der Systembenutzer selbst steht in der `config` (`SYNC_USER`) und nicht im
Skript. Plesk vergibt ihn beim Anlegen des Abonnements; nach einer Migration
heißt er anders. Stünde er fest im Code, liefe der Zeitplan als root weiter,
`runuser` fiele auf die Nase, und weil `melde.sh` erst in `sync.sh` eingebunden
würde, käme darüber nie eine Meldung — der Sync stünde still, ohne dass es
jemand erfährt. `sync-root.sh` prüft deshalb selbst und meldet mit dem Befehl,
der den aktuellen Namen liefert.

## Tests

Die Tests laufen im Vitest des Hauptrepos mit:

    npm run test:quick
