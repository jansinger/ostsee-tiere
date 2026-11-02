# Production Deployment Guide

Schnellanleitung für das Deployment von Ostsee-Tiere in einer Produktionsumgebung.

> **Hinweis:** Diese Anleitung ist für erfahrene Administratoren gedacht, die Docker und Linux-Server verwalten. Für detaillierte Hintergrundinformationen siehe [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md).

> **Stand:** Version 2.5.5. Basis: Node.js 24 (Alpine), PostgreSQL 18 mit
> PostGIS 3.6, Vite 8 mit Rolldown-Engine. Welcher Image-Tag wohin gehört, steht
> in [RELEASE_PIPELINE.md](./RELEASE_PIPELINE.md).

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Server vorbereiten](#2-server-vorbereiten)
3. [Konfiguration erstellen](#3-konfiguration-erstellen)
4. [Anwendung starten](#4-anwendung-starten)
5. [Reverse Proxy einrichten](#5-reverse-proxy-einrichten)
6. [Datenbank initialisieren](#6-datenbank-initialisieren)
7. [Verifizierung](#7-verifizierung)
8. [Backup einrichten](#8-backup-einrichten)
9. [Logs](#9-logs)
10. [Audit Logging](#10-audit-logging)
11. [Updates durchführen](#11-updates-durchführen)

Danach: [Systemd Service](#systemd-service-optional) · [Troubleshooting](#troubleshooting)

---

## 1. Voraussetzungen

### Server-Anforderungen

| Komponente | Minimum          | Empfohlen        |
| ---------- | ---------------- | ---------------- |
| CPU        | 2 Cores          | 4+ Cores         |
| RAM        | 4 GB             | 8+ GB            |
| Storage    | 20 GB SSD        | 50+ GB SSD       |
| OS         | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

### Software

- Docker 24.0+ mit Compose V2
- Reverse Proxy (Caddy empfohlen, oder Nginx)
- Domain mit DNS-Eintrag auf den Server

### Externe Dienste

- **Auth0 Account** mit konfigurierter Application
- **PostgreSQL Datenbank** (empfohlen: externer Managed Service)

---

## 2. Server vorbereiten

### Docker installieren

```bash
# Docker installieren (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Neu einloggen, dann testen
docker --version
docker compose version
```

### Projektverzeichnis erstellen

```bash
sudo mkdir -p /opt/ostsee-tiere
sudo chown $USER:$USER /opt/ostsee-tiere
cd /opt/ostsee-tiere
```

> Kein `mkdir uploads` nötig: Der Compose-Stack legt Uploads in das **benannte
> Volume** `uploads` (nicht in ein Host-Verzeichnis). Ein von Hand erstelltes
> `./uploads` bliebe leer — was beim Backup gefährlich ist, siehe Abschnitt 8.

### Docker Compose herunterladen

```bash
# Nur die benötigten Dateien herunterladen
curl -fsSL https://raw.githubusercontent.com/jansinger/ostsee-tiere/main/docker-compose.production.yml \
  -o docker-compose.yml

curl -fsSL https://raw.githubusercontent.com/jansinger/ostsee-tiere/main/.env.docker \
  -o .env.example
```

> **Warum in `docker-compose.yml` umbenennen:** So findet `docker compose` die
> Datei ohne `-f`. Alle Befehle in dieser Anleitung setzen das voraus. Behältst
> du den Namen `docker-compose.production.yml`, muss jeder Aufruf `-f
docker-compose.production.yml` mitführen — auch der Backup-Cron und die
> systemd-Unit.

---

## 3. Konfiguration erstellen

### Environment-Datei anlegen

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

### Pflicht-Konfiguration

Ersetze die Platzhalter mit deinen Werten:

```bash
# Datenbank (Option A: Inkludierte PostgreSQL-Instanz)
DATABASE_POSTGRES_URL="postgresql://postgres:DEIN_SICHERES_PASSWORT@db:5432/ostsee"
PGPASSWORD="DEIN_SICHERES_PASSWORT"

# Datenbank (Option B: Externe PostgreSQL - EMPFOHLEN)
# DATABASE_POSTGRES_URL="postgresql://user:pass@db.example.com:5432/ostsee"

# Security Keys (WICHTIG: Generiere diese mit den Befehlen unten!)
ENCRYPTION_KEY="HIER_GENERIERTEN_WERT_EINFÜGEN"

# Token für den Aufräum-Cron (verwaiste Uploads). Ohne Wert bleibt der
# Endpunkt nur über eine Admin-Session erreichbar — siehe Abschnitt unten.
CLEANUP_TOKEN="HIER_GENERIERTEN_WERT_EINFÜGEN"

# Schlüssel für den Melder-Hash (openssl rand -base64 48). NIE rotieren und
# getrennt von der Datenbank sichern — siehe docs/ENVIRONMENT.md.
REPORTER_HASH_KEY="HIER_GENERIERTEN_WERT_EINFÜGEN"

# Auth0 Konfiguration
AUTH0_CLIENT_ID="deine-client-id"
AUTH0_CLIENT_SECRET="dein-client-secret"
AUTH0_DOMAIN="dein-tenant.eu.auth0.com"
JWKS_URL="https://dein-tenant.eu.auth0.com/.well-known/jwks.json"
API_AUDIENCE="deine-api-audience"

# Anwendung
PUBLIC_SITE_URL="https://deine-domain.de"

# Welchem Image-Zeiger folgt der Stack? Siehe RELEASE_PIPELINE.md
# "production" = freigegebener Stand — das ist der richtige Wert für Production.
# Der Zeiger wird ausschließlich vom Workflow "Promote to Production" bewegt,
# der Host bekommt also nie einen ungeprüften Build.
# NICHT "staging" (jedes Release, ungeprüft) und nicht "latest".
IMAGE_TAG="production"

# App nur über Reverse Proxy erreichbar machen
APP_HOST="127.0.0.1"

# Reverse-Proxy-Header — PFLICHT hinter Nginx/Caddy.
# Ohne diese liefert getClientAddress() die Proxy-IP, und das IP-basierte
# Rate-Limiting greift für alle Clients gemeinsam statt pro Client.
# XFF_DEPTH = Anzahl vertrauenswürdiger Proxies (bei genau einem: 1).
ADDRESS_HEADER="x-forwarded-for"
XFF_DEPTH="1"
PROTOCOL_HEADER="x-forwarded-proto"
HOST_HEADER="x-forwarded-host"

# Zeitzone — bewusst UTC. Vor einer Änderung ENVIRONMENT.md → TZ lesen.
TZ="UTC"

# Log-Level (trace|debug|info|warn|error|fatal)
LOG_LEVEL="info"
```

> **`ORIGIN` nicht setzen.** Der Compose-Stack reicht die Variable nicht an den
> Container weiter — der Eintrag wäre wirkungslos. Die App bestimmt ihren Origin
> aus `PROTOCOL_HEADER`/`HOST_HEADER` und fällt sonst auf den `Host`-Header
> zurück. Achtung beim Weg über `docker run --env-file`: Ein **leeres**
> `ORIGIN=` reicht dort einen Leerstring an den adapter-node durch, der daran
> beim Start abbricht (`Invalid ORIGIN: ''`). Entweder eine vollständige URL
> eintragen oder die Zeile ganz weglassen.

> **Vollständige Variablenreferenz:** Alle optionalen Einstellungen (E-Mail, Storage, Rate-Limiting etc.) siehe [ENVIRONMENT.md](./ENVIRONMENT.md).

### Security Keys generieren

```bash
# ENCRYPTION_KEY (64 Hex-Zeichen)
openssl rand -hex 32

# CLEANUP_TOKEN (mindestens 32 Zeichen)
openssl rand -hex 32

# REPORTER_HASH_KEY (mindestens 32 Zeichen) — nie rotieren, getrennt sichern
openssl rand -base64 48
```

Nach dem ersten Setzen von `REPORTER_HASH_KEY` den Bestand einmal hashen,
solange die E-Mail-Adressen noch vorhanden sind. Wiederholen, bis die Antwort
`"done": true` enthält:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" \
  "https://deine-domain.de/api/admin/reporter-hash"
```

### Aufräum-Cron einrichten — Pflicht

Uploads werden übertragen, sobald ein Foto in der Dropzone landet; verknüpft
werden sie erst beim Absenden. Abgebrochene Formularläufe hinterlassen deshalb
Dateien samt EXIF-GPS. **Das Formular sagt Meldern zu, dass diese nach 24
Stunden gelöscht werden** — eingehalten wird das nur, wenn ein Job den Endpunkt
regelmäßig aufruft.

```bash
curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" \
  "https://deine-domain.de/api/admin/cleanup-orphans?mode=execute"
```

Einmal täglich genügt. `-f` sorgt dafür, dass ein Fehlerstatus beim Cron-Dienst
als Fehlschlag ankommt. Ohne `mode=execute` läuft der Aufruf als reine Vorschau
und löscht nichts — ein Cron ohne dieses Flag sieht monatelang gesund aus und
räumt trotzdem nichts weg.

Vorschau zum Prüfen des Bestands:

```bash
curl -sk -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" \
  "https://deine-domain.de/api/admin/cleanup-orphans"
```

#### Eingerichtet auf `dmm` als User-Crontab (2026-08-10)

Auf dem Produktionsserver läuft der Job als **User-Crontab von `jansinger`**, nicht
als Container oder Compose-Service. Das ist dort der einfachste Weg, weil ein
HTTPS-Aufruf gegen den öffentlichen Traefik-Host weder `sudo` noch die
`docker`-Gruppe braucht — beides hat der SSH-User nur eingeschränkt.

Der Haken ist das Token: Es steht in `/opt/ostsee-tiere/.env`, und die ist für den
SSH-User **nicht lesbar**. Einmalig mit `sudo` herausholen und in eine eigene,
nur für den Benutzer lesbare Datei legen — nicht ins Crontab, das ist
world-readable für root-nahe Prozesse und landet in Backups:

```bash
sudo grep "^CLEANUP_TOKEN=" /opt/ostsee-tiere/.env   # gesetzt? sonst erzeugen, s.o.
install -m 600 /dev/null ~/.ostsee-cleanup.env
# CLEANUP_TOKEN=… und HOST=… eintragen
```

```
15 3 * * * . $HOME/.ostsee-cleanup.env && curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" "https://$HOST/api/admin/cleanup-orphans?mode=execute" >> $HOME/cleanup.log 2>&1
```

Cron führt die Zeile mit `/bin/sh` aus; `.` und die Expansion von `$HOST` nach dem
Sourcen funktionieren dort. Vor dem Eintragen genau so testen, wie Cron sie
ausführt — eine Zeile, die nur in der interaktiven Bash läuft, fällt sonst erst
in der ersten Nacht auf. Der Test lässt `?mode=execute` **bewusst** weg: Geprüft
wird die Shell-Zeile (Sourcen, Quoting, Variablenexpansion), und die verhält sich
mit und ohne das Flag gleich. Ein Probelauf, der dabei echte Produktionsdaten
löscht, ist kein Test:

```bash
/bin/sh -c '. $HOME/.ostsee-cleanup.env && curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" "https://$HOST/api/admin/cleanup-orphans"'
```

Ein `%` im Crontab ist ein Zeilenumbruch-Sonderzeichen und muss als `\%` escaped
werden — betrifft jeden, der ein `date`-Format in den Log-Namen baut.

---

## 4. Anwendung starten

### Container starten

```bash
cd /opt/ostsee-tiere

# Image herunterladen und starten
docker compose pull
docker compose up -d

# Logs prüfen
docker compose logs -f
```

### Health Check

```bash
# Warten bis Container healthy ist
docker compose ps

# Manueller Health Check
curl -f http://localhost:3000/health
```

---

## 5. Reverse Proxy einrichten

### Option A: Caddy (Empfohlen - Automatisches HTTPS)

```bash
# Caddy installieren
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

**Caddyfile erstellen:**

```bash
sudo nano /etc/caddy/Caddyfile
```

```
deine-domain.de {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

### Option B: Nginx mit Let's Encrypt

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

**Nginx-Konfiguration:**

```bash
sudo nano /etc/nginx/sites-available/ostsee-tiere
```

```nginx
server {
    listen 80;
    server_name deine-domain.de;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    client_max_body_size 120M;
}
```

> `X-Forwarded-For` und `X-Forwarded-Proto` sind Pflicht — sie speisen
> `ADDRESS_HEADER` und `PROTOCOL_HEADER` aus Abschnitt 3 und damit die echte
> Client-IP fürs Rate-Limiting. `X-Forwarded-Host` passt zu `HOST_HEADER`; fehlt
> der Header, nutzt die App den `Host`-Header. Caddy setzt alle drei von selbst.

```bash
sudo ln -s /etc/nginx/sites-available/ostsee-tiere /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL-Zertifikat einrichten
sudo certbot --nginx -d deine-domain.de
```

---

## 6. Datenbank initialisieren

### PostGIS aktivieren (bei externer DB — VOR dem ersten Start)

Falls du eine externe PostgreSQL-Datenbank verwendest, muss PostGIS **vor dem
ersten Container-Start** aktiviert sein (die inkludierte `postgis/postgis`-DB
bringt das bereits mit):

```sql
-- Verbinde dich mit der Datenbank
psql -h db.example.com -U dein_user -d ostsee

-- PostGIS aktivieren
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

### Schema-Migrationen (automatisch)

Das Datenbank-Schema wird **automatisch beim Container-Start** angelegt und
aktualisiert. Der Entrypoint führt die im Image enthaltenen, versionierten
SQL-Migrationen aus (`drizzle/`-Verzeichnis, Journal in
`drizzle.__drizzle_migrations`). Ein manueller Schritt ist nicht nötig.

```bash
# Migrations-Ausgabe des Starts prüfen
docker compose logs app | grep '\[migrate\]'
```

Eigenschaften des Migrationslaufs:

- **Idempotent:** Bereits angewendete Migrationen werden übersprungen; ein
  Neustart ohne Schema-Änderung ist ein No-op.
- **Transaktional:** Schlägt eine Migration fehl, wird zurückgerollt und der
  Container startet nicht (Fehler in den Logs).
- **Advisory Lock:** Mehrere gleichzeitig startende Container migrieren nie
  parallel.
- **Schutz vor Datenverlust:** Enthält eine ausstehende Migration destruktive
  Statements (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`), verweigert der
  Container den Start. Erst Backup erstellen (siehe Abschnitt 8), dann einmalig
  mit `ALLOW_DESTRUCTIVE_MIGRATIONS=true` starten.
- **Bestehende Datenbanken:** Eine früher per `db:push` aufgebaute DB wird beim
  ersten Start automatisch als Baseline übernommen (Migrationen werden markiert,
  nicht erneut ausgeführt) — vorausgesetzt, das DB-Schema entspricht dem
  Release des Images.
- Abschaltbar mit `RUN_MIGRATIONS=false` (dann muss das Schema extern gepflegt
  werden).

> **Migration von schweinswalsichtung.de** oder komplexe DB-Operationen (Permissions, Reference-IDs, Upload-Migration): Siehe [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md).

### Manuelle Betriebsaufgaben (einmalig, nicht automatisiert)

Zwei Punkte laufen bewusst **nicht** über die automatischen Schema-Migrationen
oben — beide müssen von Hand nachgezogen werden, sonst bleiben sie unbemerkt
liegen:

- **`BODY_SIZE_LIMIT` über der Video-Upload-Grenze setzen.** Der Node-Adapter
  bricht Uploads über diesem Wert auf Plattformebene ab, bevor die Anwendung
  ihre eigene, verständliche Fehlermeldung zeigen kann — der Melder sieht dann
  nur einen allgemeinen Übertragungsfehler. Muss mindestens
  `security.maxVideoFileSize` + 1 MB Multipart-Rahmen betragen und zusammen mit
  der Grenze des Reverse Proxy (`client_max_body_size` bei Nginx, siehe Option B
  oben) gepflegt werden. Details und Formel: [ENVIRONMENT.md → `BODY_SIZE_LIMIT`](./ENVIRONMENT.md#body_size_limit).
  Ein Serverstart warnt bei Unterschreitung in den Logs
  (`grep body_size_limit_too_low`); `PUT /api/config` lehnt seit dem
  Abschlussreview des Video-Uploads eine `security.maxVideoFileSize`/
  `security.maxFileSize`-Änderung ab, die diesen Wert unterschreiten würde.

- **`scripts/migrations/2026-07-31-upload-allowed-types-gif.sql` ausführen** —
  einmalig, für jede Installation, die `security.allowedFileTypes` bereits vor
  dem 2026-07-31 angelegt hat (also praktisch jede bestehende Production-DB).
  Ohne diesen Lauf nimmt die Dropzone weiterhin GIFs an, die der Server mit 400
  ablehnt: Die Code-Vorbelegung wurde um `image/gif` ergänzt, greift aber nur
  bei **Neuanlage** des Schlüssels (`insertManyIfAbsent`), nicht bei einer
  bereits vorhandenen Zeile. Das Skript liegt bewusst **nicht** unter
  `drizzle/` — es korrigiert den Inhalt einer bestehenden Konfigurationszeile
  (Daten), nicht das Tabellenschema, und der automatische Migrationslauf des
  Containers fasst `drizzle/` nur für Schema-Änderungen an. Idempotent, kann
  gefahrlos mehrfach laufen:

  ```bash
  docker compose exec -T db psql -U postgres -d ostsee \
    -f - < scripts/migrations/2026-07-31-upload-allowed-types-gif.sql
  ```

---

## 7. Verifizierung

### Checkliste

- [ ] `docker compose ps` zeigt alle Container als "healthy"
- [ ] `https://deine-domain.de` ist erreichbar
- [ ] `https://deine-domain.de/health` gibt `OK` zurück
- [ ] Login über Auth0 funktioniert
- [ ] Karte wird geladen
- [ ] Datei-Upload funktioniert
- [ ] Audit-Log-Eintrag nach erstem Admin-Login vorhanden: `SELECT * FROM audit_logs WHERE action = 'auth.login_success' LIMIT 1`

### Logs prüfen

```bash
# Alle Logs
docker compose logs

# Nur App-Logs (follow)
docker compose logs -f app

# Nur Fehler
docker compose logs app 2>&1 | grep -i error

# Security-Events (Rate Limit, Auth-Fehler)
docker compose logs app 2>&1 | grep '"event":"security.'
```

> Wo diese Logs liegen und wie lange sie überleben: Abschnitt 9.

---

## 8. Backup einrichten

### Automatisches Datenbank-Backup

```bash
sudo nano /opt/ostsee-tiere/backup.sh
```

```bash
#!/bin/bash
# Bricht bei jedem Fehler ab — auch mitten in einer Pipe. Ohne pipefail würde
# ein fehlgeschlagener pg_dump ein gültig aussehendes, leeres .gz hinterlassen.
set -euo pipefail

BACKUP_DIR="/opt/ostsee-tiere/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Im Verzeichnis mit der Compose-Datei arbeiten
cd /opt/ostsee-tiere

# Datenbank-Backup. Erst unter .tmp schreiben und nur bei Erfolg umbenennen,
# damit ein Abbruch keine halbe Datei als fertiges Backup zurücklässt.
docker compose exec -T db pg_dump -U postgres ostsee \
  | gzip >"$BACKUP_DIR/db-$DATE.sql.gz.tmp"
mv "$BACKUP_DIR/db-$DATE.sql.gz.tmp" "$BACKUP_DIR/db-$DATE.sql.gz"

# Uploads-Volume am laufenden Container ablesen statt den Namen zu raten: Er
# trägt das Compose-Projekt als Präfix (Verzeichnisname bzw.
# COMPOSE_PROJECT_NAME) und ist auf einem anders benannten Host ein anderer.
UPLOADS_VOLUME=$(docker inspect "$(docker compose ps -q app)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}')

if [ -z "$UPLOADS_VOLUME" ]; then
  echo "FEHLER: Uploads-Volume nicht gefunden — läuft der app-Container?" >&2
  exit 1
fi

docker run --rm \
  -v "$UPLOADS_VOLUME":/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/uploads-$DATE.tar.gz.tmp" -C /data .
mv "$BACKUP_DIR/uploads-$DATE.tar.gz.tmp" "$BACKUP_DIR/uploads-$DATE.tar.gz"

# Alte Backups löschen (älter als 30 Tage)
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +30 -delete

# Reste abgebrochener Läufe. Die .tmp-Endung schützt sie davor, oben als
# fertiges Backup mitgezählt zu werden — aufräumen muss man sie trotzdem.
find "$BACKUP_DIR" -name "*.tmp" -mtime +1 -delete

echo "Backup erstellt: db-$DATE.sql.gz, uploads-$DATE.tar.gz"
```

> Der Volume-Name wird bewusst zur Laufzeit ermittelt. Ein fest eingetragener
> Name wie `ostsee-tiere_uploads` stimmt nur, solange das Compose-Projekt genau
> so heißt — auf einem Host mit anderem Verzeichnisnamen oder gesetztem
> `COMPOSE_PROJECT_NAME` (z. B. dem Staging-Stack) würde still das falsche oder
> gar kein Volume gesichert. Zum Nachsehen: `docker volume ls | grep uploads`.

**Backup einmal prüfen, nicht nur einrichten:**

```bash
/opt/ostsee-tiere/backup.sh
gunzip -t /opt/ostsee-tiere/backups/db-*.sql.gz   # Archiv-Integrität
tar tzf /opt/ostsee-tiere/backups/uploads-*.tar.gz | head
```

```bash
chmod +x /opt/ostsee-tiere/backup.sh
```

### Cronjob einrichten (täglich 2 Uhr)

```bash
sudo crontab -e
```

```
0 2 * * * /opt/ostsee-tiere/backup.sh >> /var/log/ostsee-backup.log 2>&1
```

### Uploads wiederherstellen

Volume-Namen wie beim Backup am Container ablesen — der App-Container muss dafür
noch laufen, deshalb erst ermitteln, dann stoppen:

```bash
cd /opt/ostsee-tiere

UPLOADS_VOLUME=$(docker inspect "$(docker compose ps -q app)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}')
echo "$UPLOADS_VOLUME"   # prüfen, nicht blind weitermachen

docker compose stop app

docker run --rm \
  -v "$UPLOADS_VOLUME":/data \
  -v /opt/ostsee-tiere/backups:/backup:ro \
  alpine tar xzf /backup/uploads-20260730_020000.tar.gz -C /data

docker compose start app
```

> Das Archiv wird **über** den vorhandenen Bestand entpackt, gelöschte Dateien
> also nicht entfernt. Für einen exakten Stand vorher `docker volume rm` und das
> Volume neu anlegen lassen.

---

## 9. Logs

### Wohin die Logs gehen

Die Anwendung schreibt **ausschließlich auf stdout** (Pino, strukturiertes
JSON). Es gibt keine Logdatei innerhalb des Containers. Docker nimmt stdout mit
dem `json-file`-Treiber auf; die Rotation ist in
`docker-compose.production.yml` festgelegt:

| Dienst | max-size | max-file | Maximum auf Platte |
| ------ | -------- | -------- | ------------------ |
| `app`  | 10 MB    | 5        | ~50 MB             |
| `db`   | 10 MB    | 3        | ~30 MB             |

Auf dem Host liegen die Dateien unter
`/var/lib/docker/containers/<container-id>/<container-id>-json.log*`. Der
vorgesehene Zugriff ist aber `docker compose logs`:

```bash
docker compose logs -f app          # folgen
docker compose logs --tail 200 app  # letzte 200 Zeilen
docker compose logs --since 1h app  # letzte Stunde
```

> **Rotation heißt Verlust.** Nach ~50 MB sind ältere App-Logs weg. Wer
> Security-Events länger vorhalten will, hängt einen anderen Log-Treiber ein
> (z. B. `journald` oder `syslog`) oder schickt sie an einen externen Collector.
> Die revisionsrelevanten Admin-Aktionen liegen davon unabhängig in der
> Tabelle `audit_logs` (Abschnitt 10) und überleben jede Log-Rotation.

> **Es gibt keine Logdatei.** Weder Image noch Compose-Stack legen ein
> Log-Verzeichnis an — stdout plus json-file-Treiber ist die ganze Kette. Ältere
> Stacks mounteten ein Volume `logs` auf `/app/logs`; dort wurde nie etwas
> geschrieben, es ist entfernt. Beim Update von so einem Stack bleibt das leere
> Volume zurück und kann weg:
>
> ```bash
> docker volume ls | grep _logs          # exakten Namen ablesen
> docker volume rm <projekt>_logs
> ```

### Überwachung ohne Monitoring-Stack

Der Stack enthält bewusst **kein** Prometheus/Grafana. Für „läuft die App?"
genügen:

```bash
docker compose ps                     # Health-Status beider Container
curl -f https://deine-domain.de/health

# Health-Historie des Containers (letzte Prüfungen inkl. Fehlermeldung)
docker inspect ostsee-tiere-app --format='{{json .State.Health}}' | jq
```

Der Container bringt einen eigenen Health Check mit (alle 30 s, 40 s
Start-Karenz), auf den auch `restart: unless-stopped` und ein Neustart-Alarm des
Hosters aufsetzen können. Für Host-Metriken (CPU, RAM, Platte) ist das
Monitoring des Hosters der einfachere Weg — insbesondere die **Plattenfüllung**,
denn Uploads und DB-Volume wachsen unbegrenzt.

---

## 10. Audit Logging

Das System protokolliert kritische Admin-Aktionen in der `audit_logs` Tabelle und Security-Events als strukturierte JSON-Logs in stdout.

### Audit-Tabelle abfragen

**Drizzle Studio:**

```bash
npm run db:studio
# → Tabelle "audit_logs" öffnen
```

**Direkte SQL-Abfragen:**

```sql
-- Letzte 50 Admin-Aktionen
SELECT timestamp, user_email, action, resource_type, resource_id, details, status
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 50;

-- Alle Aktionen eines bestimmten Admins
SELECT * FROM audit_logs WHERE user_email = 'admin@example.com' ORDER BY timestamp DESC;

-- Fehlgeschlagene Logins
SELECT * FROM audit_logs WHERE action = 'auth.login_failure' ORDER BY timestamp DESC;

-- Gelöschte Sichtungen
SELECT * FROM audit_logs WHERE action = 'sighting.delete' ORDER BY timestamp DESC;

-- Manuelles Aufräumen (kein automatisches Löschen konfiguriert)
DELETE FROM audit_logs WHERE timestamp < now() - interval '2 years';
```

### Security-Events aus Docker-Logs lesen

```bash
# Alle Security-Events
docker compose logs app 2>&1 | grep '"event":"security.'

# Nur Rate Limit Überschreitungen
docker compose logs app 2>&1 | grep '"event":"security.rate_limit_hit"'

# Auth-Fehler (ungültige Cookies)
docker compose logs app 2>&1 | grep '"event":"security.auth_error"'
```

### Aufbewahrung

Unbegrenzt — kein automatisches Löschen. Manuelles Löschen via SQL wenn nötig (s.o.).

---

## 11. Updates durchführen

> Ein neues Release landet **nicht** automatisch hier. Es geht zuerst auf
> Staging (Tag `staging`); erst nach der Freigabe über den Workflow
> _Promote to Production_ wandert der Zeiger `production` mit. Der komplette
> Ablauf inkl. Rollback steht in [RELEASE_PIPELINE.md](./RELEASE_PIPELINE.md).

### Standard-Update

```bash
cd /opt/ostsee-tiere

# Backup erstellen — die Schema-Migrationen des neuen Release laufen beim
# Container-Start automatisch und sind nicht rückrollbar
./backup.sh

# Neues Image herunterladen
docker compose pull

# Container neu starten (Zero-Downtime mit Health Checks)
docker compose up -d

# Logs prüfen (inkl. Migrations-Ausgabe)
docker compose logs -f app
```

### Auf eine bestimmte Version festnageln (Ausnahmefall)

Normalbetrieb ist `IMAGE_TAG="production"` — der Zeiger folgt der Freigabe, ein
Update ist dann nur `pull` + `up -d`. Eine feste Version einzutragen ist nur für
einen Rollback von Hand oder eine gezielte Diagnose sinnvoll; danach zurück auf
`production` stellen, sonst bekommt der Host künftige Freigaben nicht mehr.

```bash
# In .env:
# IMAGE_TAG="v2.5.5"

docker compose pull
docker compose up -d
```

> Ein Rollback läuft normalerweise über den Workflow _Promote to Production_ mit
> der älteren Version — dann bleibt `production` der einzige Zeiger, dem der Host
> folgt. Siehe [RELEASE_PIPELINE.md](./RELEASE_PIPELINE.md#rollback).

### Aufräumen nach Update

```bash
# Alte Images entfernen
docker image prune -f
```

---

## Systemd Service (Optional)

Für automatischen Start beim Serverboot:

```bash
sudo nano /etc/systemd/system/ostsee-tiere.service
```

```ini
[Unit]
Description=Ostsee-Tiere Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ostsee-tiere
# Note: Adjust path if docker compose is installed differently.
# Setzt voraus, dass die Compose-Datei wie in Abschnitt 2 als
# docker-compose.yml im WorkingDirectory liegt.
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ostsee-tiere
sudo systemctl start ostsee-tiere
```

---

## Troubleshooting

### Container startet nicht

```bash
# Detaillierte Logs anzeigen
docker compose logs app

# Container-Status prüfen
docker compose ps -a

# Häufige Ursachen:
# - DATABASE_POSTGRES_URL falsch
# - Auth0-Credentials fehlen
# - Port 3000 bereits belegt
```

### Datenbank-Verbindung fehlgeschlagen

```bash
# Datenbank-Container prüfen
docker compose exec db pg_isready

# Verbindung manuell testen
docker compose exec db psql -U postgres -d ostsee -c "SELECT 1"
```

### SSL-Zertifikat Probleme

```bash
# Caddy Logs
sudo journalctl -u caddy -f

# Nginx + Certbot
sudo certbot renew --dry-run
```

---

## Weiterführende Dokumentation

- [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) - Vollständige Docker-Dokumentation
- [RELEASE_PIPELINE.md](./RELEASE_PIPELINE.md) - Release → Staging → Production, Promotion, Rollback
- [ENVIRONMENT.md](./ENVIRONMENT.md) - Alle Umgebungsvariablen
- [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md) - Datenbank-Migration

---

_Letzte Aktualisierung: Juli 2026 (Version 2.5.5)_
