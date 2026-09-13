# Preprod: hawking

Betriebs-Notizen für den Preprod-Host `hawking` (`ssh hawking`, `/opt/ostsee-tiere`).
Anders als [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) und
[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) beschreiben — diese gehen von
einem eigenständigen Server mit containerisierter DB aus. hawking ist ein
gemeinsam genutzter Plesk-Host (Mail, mehrere Domains, mehrere Docker-Stacks
nebeneinander), auf dem PostgreSQL **nativ** läuft.

> **Stand:** 2026-09-13, nach dem Vorfall vom 2026-09-07 (siehe unten).

---

## Architektur-Unterschiede zu Production

| Aspekt            | hawking (Preprod)                                                      | dmm (Production)                     |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| PostgreSQL        | **native** auf dem Host, kein `db`-Container                           | Container, eigenes Compose           |
| Compose-Datei     | `/opt/ostsee-tiere/docker-compose.yml` — nur `app`, kein `db`-Service  | eigenes Compose, nicht das Repo-File |
| Netzwerk          | Bridge mit fest gepinntem Subnet `172.28.0.0/24`                       | internes Netz, kein Port nach außen  |
| DB-Erreichbarkeit | `DATABASE_POSTGRES_URL` zeigt auf `172.28.0.1` (Docker-Bridge-Gateway) | über den DB-Container                |
| Source-Checkout   | keins — nur `.env` und Docker (wie auf dmm)                            | keins — nur `.env` und Docker        |

Weder auf hawking noch auf dmm liegt ein Source-Checkout; Compose-Dateien auf
den Servern sind **nicht** mit den Repo-Dateien (`docker-compose.yml`,
`docker-compose.production.yml`) synchron und werden von Änderungen daran
**nicht** erreicht. Server-seitige Anpassungen (Compose, systemd-Units) sind
reine Host-Konfiguration und brauchen keinen PR.

---

## Vorfall 2026-09-07: DB nicht erreichbar → Postfix-Reload-Sturm

### Symptome

- Der `ostsee-tiere-app`-Container erreichte die Datenbank nicht mehr und
  restartete ab 04:03:28 Uhr durchgehend (Docker-Backoff-Deckel: alle ~61 s,
  587 Zyklen an dem Tag).
- Jeder Restart erzeugt/entfernt das veth/Bridge-Netzwerk-Interface des
  Containers. Postfix (systemweiter Mailserver für alle Domains auf hawking,
  nicht nur ostsee-tiere) reagiert auf **jedes** Netzwerk-Interface-Event mit
  einem Reload — Debians Postfix-Paket installiert dafür
  `/etc/network/if-up.d/postfix`, und `networkd-dispatcher` (läuft auf
  hawking) reicht `systemd-networkd`-Linkstate-Events an genau diese
  klassischen ifupdown-Hooks weiter. Ergebnis: ~14.600 Reload-Log-Zeilen an
  dem Tag statt 0 an einem normalen Tag.
- **Wichtig:** Der Reload-Sturm hat den serverweiten Mailversand nicht
  beeinträchtigt (Zustellstatistik des Vorfalltags war sogar besser als an
  einem Vergleichstag). Ein `reload` killt laufende Verbindungen nicht wie ein
  echter Neustart. Dass die App selbst keine Mails versendet hat, lag schlicht
  daran, dass sie nicht lief.

### Root Cause: Postgres band nicht an `172.28.0.1`

```
$ sudo ss -tlnp | grep 5432
LISTEN  127.0.0.1:5432   (postgres)
LISTEN  [::1]:5432       (postgres)
```

`172.28.0.1` fehlte — obwohl `listen_addresses = localhost,172.28.0.1` in der
Postgres-Konfiguration korrekt gesetzt war. Grund, aus dem rotierten
Postgres-Log vom letzten Neustart (2026-08-19 21:52:59, regulärer Restart,
kein Crash):

```
LOG:  could not bind IPv4 address "172.28.0.1": Cannot assign requested address
WARNING:  could not create listen socket for "172.28.0.1"
```

Die Docker-Bridge mit dieser IP existierte in dem Moment noch nicht auf dem
Host. `listen_addresses` wird nur beim Start gebunden (kein `SIGHUP`-fähiger
Parameter) und ein fehlgeschlagener Bind ist nur eine `WARNING`, kein
`FATAL` — Postgres lief 19 Tage lang unauffällig weiter, nur eben ohne
Erreichbarkeit über `172.28.0.1`. Die App merkte das erst, als ihr
Connection-Pool am 07.09. neu aufgebaut werden musste (Trigger für den
allerersten Container-Restart an dem Tag ließ sich nicht mehr rekonstruieren —
der Container wurde vor der Untersuchung entfernt, die Logs damit auch).

### Fix 1: Restart-Policy begrenzt (`/opt/ostsee-tiere/docker-compose.yml`)

```diff
-    restart: unless-stopped
+    restart: on-failure:5
```

Begrenzt einen künftigen Crash-Loop auf 5 Versuche, statt endlos im
Docker-Backoff weiterzulaufen und dabei Postfix mitzureißen. **Nebeneffekt:**
`on-failure` startet den Container nach einem Host-Reboot nicht automatisch
— anders als `unless-stopped`. Das schließt Fix 2.

### Fix 2: systemd-Abhängigkeit — Postgres startet nach dem Docker-Netzwerk

Zwei neue Dateien auf hawking (kein Repo-Bezug):

**`/etc/systemd/system/ostsee-tiere.service`** — bringt den Compose-Stack
(und damit die Bridge `172.28.0.1`) hoch, auch beim Boot:

```ini
[Unit]
Description=Ostsee-Tiere App Stack (Docker Compose) - stellt das Docker-Netzwerk (172.28.0.1) bereit, an das postgresql@18-main bindet
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ostsee-tiere
ExecStart=/usr/bin/docker compose -f /opt/ostsee-tiere/docker-compose.yml --project-directory /opt/ostsee-tiere up -d
ExecStop=/usr/bin/docker compose -f /opt/ostsee-tiere/docker-compose.yml --project-directory /opt/ostsee-tiere down
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/postgresql@18-main.service.d/ostsee-docker-network.conf`**
— Drop-in, macht die Abhängigkeit explizit:

```ini
[Unit]
After=ostsee-tiere.service
Wants=ostsee-tiere.service
```

`Wants` statt `Requires`, bewusst nicht-blockierend: Postgres bedient auf
diesem Host auch andere Zwecke als nur ostsee-tiere (siehe `pg_hba.conf`,
`pgadmin`-User, Replication-Zeilen) und soll starten, selbst wenn der
App-Stack aus irgendeinem Grund nicht hochkommt — nur eben ohne
`172.28.0.1`-Bind, wie bisher.

```bash
sudo systemctl daemon-reload
sudo systemctl enable ostsee-tiere.service
```

### Verifiziert (nicht nur eingerichtet)

Getestet durch bewusstes Nachstellen der Fehlerbedingung vom 19.08. — Postgres
**und** Docker-Netzwerk gleichzeitig unten, dann nur `postgresql@18-main`
gestartet:

```bash
sudo systemctl stop postgresql@18-main
sudo systemctl stop ostsee-tiere.service   # NICHT `docker compose down`, siehe Warnung unten
sudo systemctl start postgresql@18-main
```

Ergebnis: systemd hat wegen `Wants=`/`After=` automatisch zuerst
`ostsee-tiere.service` gestartet (beide Units laut Log zur selben Sekunde
aktiv), die Bridge stand, bevor Postgres seinen Bind-Versuch machte —
`listening on IPv4 address "172.28.0.1", port 5432` beim ersten Versuch, keine
`Cannot assign requested address`-Warnung mehr. Der App-Container kam über
`ostsee-tiere.service` automatisch mit hoch, `/health` meldete
`"database":"connected"`.

> **Falle beim Nachstellen: `docker compose down` statt `systemctl stop
ostsee-tiere.service` verwenden.** `ostsee-tiere.service` ist
> `Type=oneshot` mit `RemainAfterExit=yes` — systemd merkt sich nur „ExecStart
> lief erfolgreich durch", nicht den tatsächlichen Zustand von Netzwerk/
> Container. Ein direkter `docker compose down` am Unit vorbei entfernt Netz
> und Container, die Unit bleibt aber `active (exited)`. Live nachgestellt:
> Danach sieht `Wants=ostsee-tiere.service` die Abhängigkeit als bereits
> erfüllt an, ein nachfolgender `systemctl start postgresql@18-main` löst
> **kein** erneutes `ExecStart` aus — die Bridge fehlt weiterhin, und Postgres
> würde exakt wieder mit „Cannot assign requested address" scheitern. Den
> App-Stack deshalb immer über `systemctl {start,stop,restart}
ostsee-tiere.service` verwalten, nie mit rohen `docker compose`-Befehlen —
> sonst hebelt man die gerade eingerichtete Absicherung unbemerkt aus.

---

## Betrieb

```bash
# Status beider Units
systemctl status ostsee-tiere.service
systemctl status postgresql@18-main.service

# Dependency-Graph von Postgres prüfen (ostsee-tiere.service muss auftauchen)
systemctl list-dependencies postgresql@18-main.service

# App-Container-Status / Health
sudo docker ps --filter name=ostsee-tiere-app
curl -sf http://127.0.0.1:3000/health
```

Backup des alten Compose-Stands vor der Restart-Policy-Änderung liegt neben
der Datei: `/opt/ostsee-tiere/docker-compose.yml.bak-<timestamp>`.

### Postfix auf hawking — unabhängig vom Vorfall zu wissen

`/sbin/resolvconf` existiert auf hawking nicht, daher reloadet Postfix bei
**jedem** Netzwerk-Interface-Event (nicht nur bei echten IP-Änderungen). Das
ist seit Jahren so und für sich harmlos (0 Reloads an einem normalen Tag,
weil dann nichts an den Interfaces ändert) — es wird nur dann laut, wenn
irgendein Docker-Container auf diesem Host in einen Crash-Loop gerät. Fix 1
oben verhindert, dass das je wieder tagelang durchläuft; eine Behebung der
Postfix-Seite selbst (z. B. `resolvconf` installieren) wurde bewusst nicht
vorgenommen, um nicht in die Plesk-Mail-Konfiguration des gemeinsam genutzten
Hosts einzugreifen.

---

## Weiterführende Dokumentation

- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — generische
  Anleitung inkl. Systemd-Service-Vorlage (dort für den Fall mit
  containerisierter DB)
- [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) — Docker-Referenz
- [RELEASE_PIPELINE.md](./RELEASE_PIPELINE.md) — `IMAGE_TAG=staging` auf
  hawking folgt jedem neuen Release, aber ungeprüft _und ohne Auto-Pull_
  (Abschnitt „Staging (hawking)" dort beschreibt den tatsächlichen Pfad
  `/opt/ostsee-tiere` und den Stand ohne Pull-Timer)
