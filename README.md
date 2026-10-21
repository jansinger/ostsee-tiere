![Ostsee-Tiere](https://ostsee-tiere.de/ostsee-tiere-192.png)

# Ostsee-Tiere

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/jansinger/ostsee-tiere/ci.yml?style=flat-square&logo=github&label=CI)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat-square&logo=vercel)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/jansinger/ostsee-tiere?style=flat-square&logo=github)
![GitHub last commit](https://img.shields.io/github/last-commit/jansinger/ostsee-tiere?style=flat-square&logo=github)
![GitHub issues](https://img.shields.io/github/issues/jansinger/ostsee-tiere?style=flat-square&logo=github)
![GitHub pull requests](https://img.shields.io/github/issues-pr/jansinger/ostsee-tiere?style=flat-square&logo=github)
![GitHub](https://img.shields.io/github/license/jansinger/ostsee-tiere?style=flat-square)
![GitHub package.json version](https://img.shields.io/github/package-json/v/jansinger/ostsee-tiere?style=flat-square&logo=npm)

**Ostsee-Tiere** ist eine moderne SvelteKit-WebApp zur Erfassung und Verwaltung von Meerestier-Sichtungen in der Ostsee. Die Anwendung ermöglicht es Bürgern, Forschern und Naturbeobachtern, ihre Sichtungen von Walen, Robben und anderen Meerestieren zu melden und der Wissenschaft zur Verfügung zu stellen.

## 🐋 Projektübersicht

Ostsee-Tiere bietet eine benutzerfreundliche Plattform zur wissenschaftlichen Erfassung von Meerestier-Sichtungen mit:

- Ein intuitives, mehrstufiges Formular zur einfachen Dateneingabe
- Interaktive Kartenvisualisierung mit OpenLayers
- Filterung und Suche nach verschiedenen Kriterien
- Verwaltung und Überprüfung von Sichtungsmeldungen

## 🛠️ Technologie-Stack

![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=flat-square&logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-59A14F?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![OpenLayers](https://img.shields.io/badge/OpenLayers-1F6B75?style=flat-square&logo=openlayers&logoColor=white)

- **Frontend**: SvelteKit (Svelte 5 mit Runes) mit TypeScript
- **Styling**: TailwindCSS mit DaisyUI-Komponenten
- **Formularvalidierung**: eigene `createForm`-Implementierung (`src/lib/form/createForm.ts`) mit Yup
- **Datenbank**: PostgreSQL mit PostGIS-Erweiterung
- **ORM**: Drizzle
- **Karten**: OpenLayers
- **Build Tool**: Vite
- **Deployment**: Vercel (Cloud) oder Docker (Self-Hosted)

## 🚀 Quick Start

### Option 1: Docker (Empfohlen für Production)

```bash
# Repository klonen
git clone https://github.com/jansinger/ostsee-tiere.git
cd ostsee-tiere

# Konfigurieren
cp .env.docker .env
nano .env  # Passwörter und Auth0-Credentials anpassen

# Starten
docker compose -f docker-compose.production.yml up -d
```

**Zugriff:**

- Anwendung: http://localhost:3000
- Logs: `docker compose -f docker-compose.production.yml logs -f app`

📖 **Vollständige Dokumentation**: [Docker Deployment Guide](docs/DOCKER_DEPLOYMENT.md)

### Option 2: Lokale Entwicklung

## Installation und Entwicklung

### Voraussetzungen

- Node.js 20.19+, 22.12+ oder 24+ (LTS-Versionen empfohlen, Docker verwendet Node.js 24)
- Docker und Docker Compose (für die Datenbank)

### Setup

```bash
# Repository klonen
git clone https://github.com/jansinger/ostsee-tiere.git
cd ostsee-tiere

# Abhängigkeiten installieren
npm install

# Datenbank starten
npm run db:start

# Entwicklungsserver starten
npm run dev
```

Die Anwendung ist dann unter https://localhost:4000 verfügbar.

**HTTPS Development Server:**

- Automatische SSL-Zertifikatsgenerierung
- Sichere iframe-Einbettung möglich
- Unterstützt moderne Web-APIs

Damit Chrome den Dev-Server ohne Sicherheitswarnung akzeptiert, wird
[mkcert](https://github.com/FiloSottile/mkcert) benötigt — es legt eine lokale CA im
System-Trust-Store an. Einmalig installieren nach der
[offiziellen Anleitung](https://github.com/FiloSottile/mkcert#installation), unter macOS
zum Beispiel:

```bash
brew install mkcert nss
```

`npm run dev` erzeugt die Zertifikate danach automatisch in `certs/` (gitignored) und
erneuert sie 30 Tage vor Ablauf; manuell über `npm run certs:setup`. Ohne mkcert startet
der Server weiterhin, nutzt dann aber ein selbstsigniertes Zertifikat — Chrome zeigt in
dem Fall die gewohnte Zertifikatswarnung.

### Datenbankbefehle

```bash
# Datenbank starten (Docker, Port 5433)
npm run db:start

# Datenbank stoppen
npm run db:stop

# Schema-Änderungen auf lokale Dev-DB pushen (nur Entwicklung)
npm run db:push

# Migration aus Schema-Änderung generieren (committen — Pflicht für Deployments)
npm run db:generate

# Migrationen anwenden (Node ≥ 22.18; läuft im Container automatisch beim Start)
npm run db:migrate

# Drizzle Studio öffnen (UI zur Datenverwaltung)
npm run db:studio
```

### Tests und Code-Qualität

```bash
# Unit-Tests ausführen
npm run test:unit

# Unit-Tests im Watch-Modus
npm run test:unit:watch

# E2E-Tests ausführen (Playwright)
npm run test:e2e

# Gate vor dem Commit (Shard-Abgleich + Lint + Typen + svelte-check
# + Unit-Tests Server + Komponenten-Tests Browser, ~70 s — ohne E2E)
npm run test:quick

# Code-Qualität
npm run lint
npm run type-check
npm run format
npm run check
```

### Styleguide

Bei laufendem Dev-Server erreichbar unter **[https://localhost:4000/styleguide](https://localhost:4000/styleguide)** — dort steht jedes Design-Token einmal als echtes DOM (Farben, Typografie, Abstände, Elevation, Z-Index, Motion, Buttons, Alerts, Formularfelder, Badges), inklusive Umschalter auf den Feldmodus. Erste Anlaufstelle vor jeder UI-Änderung.

Die Route ist bewusst **nur in `dev`** erreichbar (`+page.server.ts` wirft sonst 404); sie ist Entwickler-Werkzeug, keine öffentliche Seite. Die Token-Werte in Prosa stehen in [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md), die Regeln in `.claude/rules/design-system.md`.

## Projektstruktur

```
ostsee-tiere/
├── src/
│   ├── lib/
│   │   ├── components/     # UI-Komponenten (Form, Map, Media, Admin, Weather)
│   │   ├── constants/      # Konstanten und Enumerationen
│   │   ├── form/           # Formular-Logik und Validierung
│   │   ├── legacy-api/     # Legacy REST API Kompatibilität
│   │   ├── logger/         # Pino Logging (Client + Server)
│   │   ├── map/            # OpenLayers Karten-Funktionalitäten
│   │   ├── report/         # Sichtungsmeldung-Komponenten und -Logik
│   │   ├── server/         # Server-seitige Logik
│   │   │   ├── audit/      # Audit-Logging
│   │   │   ├── auth/       # Auth0 + JWT Authentifizierung
│   │   │   ├── config/     # Access Control Konfiguration
│   │   │   ├── datetime/   # Server-Datums-Utilities (UTC / Berliner Ortszeit)
│   │   │   ├── db/         # Datenbankzugriff und Schema
│   │   │   ├── export/     # Datenexport (CSV, JSON, KML, XML)
│   │   │   ├── geo/        # PostGIS / Baltic Sea Validation
│   │   │   ├── media/      # EXIF-Metadaten-Extraktion
│   │   │   ├── middleware/  # DB-Check, Maintenance, Rate Limit, Security Headers
│   │   │   ├── services/   # Email, Config Init, Weather
│   │   │   ├── spam/       # Spam-Erkennung
│   │   │   ├── storage/    # Datei-Speicher (Local, Vercel Blob)
│   │   │   ├── templates/  # E-Mail HTML-Templates
│   │   │   ├── utils/      # Server-Utilities (z. B. getClientIp)
│   │   │   ├── validation/ # Magic Bytes, Request Validation
│   │   │   └── weather/    # Wetter-Stundenindex
│   │   ├── services/       # Client/Server Services (Config, Weather)
│   │   ├── storage/        # Browser Storage (GDPR-aware)
│   │   ├── stores/         # Svelte Stores
│   │   ├── types/          # TypeScript Typen
│   │   └── utils/          # Hilfsfunktionen
│   ├── css/                # Design-Tokens (tokens.css) und Weather-Icon-Styles
│   ├── font/               # Weather-Icon-Webfonts
│   ├── tests/              # Contract-Tests
│   ├── tools/              # Build-/Wartungsskripte (siehe src/tools/README.md)
│   └── routes/             # SvelteKit-Routen
│       ├── about/          # Über-Seite
│       ├── admin/          # Admin-Interface
│       ├── api/            # API-Endpunkte
│       ├── docs/           # API-Dokumentation (Scalar)
│       ├── health/         # Health-Check-Endpunkt
│       ├── maintenance/    # Wartungsmodus-Seite
│       ├── map/            # Karten-Visualisierung
│       ├── rest_sichtungen/ # Legacy REST API (POST, antworten, inBaltic)
│       ├── sichtungen/     # Legacy Sichtungs-API (showreports)
│       ├── styleguide/     # Design-Token-Referenz (nur in dev erreichbar)
│       └── uploads/        # Ausgelieferte Uploads (Local Storage)
├── static/                 # Statische Assets
├── docs/                   # Dokumentation
└── e2e/                    # End-to-End Tests (Playwright)
```

## Hauptfunktionen

### Multi-Step-Formular mit progressiver Offenlegung

Das Herzstück der Anwendung ist ein mehrstufiges Formular mit intelligenter Navigation:

- Dynamische Schritte basierend auf Benutzereingaben
- Conditional Logic und progressive Offenlegung
- Yup-basierte Validierung über die projekteigene `createForm`-Implementierung
- Automatische GPS-Koordinaten-Erfassung

### Interaktive Kartenvisualisierung

Moderne OpenLayers-Integration mit erweiterten Features:

- Präzise Koordinaten-Erfassung durch Klick
- Filterbare Sichtungsanzeige
- PostGIS-basierte geografische Validierung (Ostsee-Grenzen)
- Zeit-Slider für historische Daten
- Export-Funktionen (CSV, JSON, KML, XML)

### Legacy REST API Kompatibilität

Die Endpunkte `/rest_sichtungen` und `/sichtungen/showreports.json` implementieren den Vertrag
der Vorgänger-API, damit Mobile Clients ohne Anpassung angebunden werden können:

- Exakte Feld-Mappings der Original-API
- Backward-kompatible Antwortformate
- Unterstützung aller ursprünglichen Endpunkte

**Stand 2026-07-30 ist kein Client angebunden** — die Endpunkte sind implementiert und getestet,
aber nicht in Betrieb. Feldnamen, Pfade und Datentypen dürfen trotzdem nur bewusst geändert
werden, sonst ist der Vertrag entwertet, sobald ein Client dazukommt. Verbindliche Referenz:
[LEGACY_API_SPECIFICATION.md](docs/LEGACY_API_SPECIFICATION.md)

### Erweiterte Medienverwaltung

- EXIF-Metadaten-Extraktion für automatische GPS-Daten
- Cloud- und lokale Speicher-Unterstützung
- Responsive Bildergalerien
- Automatische Thumbnail-Generierung

### Umfassendes Datenmodell

Detaillierte Erfassung von Meerestier-Sichtungen:

- PostGIS Point-Geometrie für präzise Lokalisierung
- Umweltbedingungen (Seegang, Wind, Sichtweite)
- Tierverhalten und -zustand
- Totfund-spezifische Datenfelder
- Administrative Freigabe- und Verifizierungsprozesse

## 🐳 Docker Deployment

Docker ist die **primäre Deployment-Methode** für Self-Hosted-Installationen.

### Verfügbare Deployment-Optionen

1. **Docker (Self-Hosted)**: Vollständige Kontrolle über Infrastruktur und Daten (empfohlen)
2. **Vercel (Cloud-Native)**: Deployment über Vercels eigene Git-Integration (kein
   GitHub-Actions-Workflow im Repository); der Adapter wird in `sveltekit.options.ts` anhand des
   Build-Ziels gewählt

### Docker-Features

- ✅ **Multi-Stage Build**: der Builder pruned die devDependencies, ins finale Layer kommen nur
  `build/`, die Production-Dependencies, das SBOM und die Migrations-Skripte
- ✅ **Multi-Architektur** (AMD64 + ARM64: Raspberry Pi 4/5, AWS Graviton, Apple Silicon)
- ✅ **Automatische Schema-Migrationen** beim Container-Start
- ✅ **Multi-Storage Support** (Local, Vercel Blob)
- ✅ **Production-Ready** mit Health Checks und Auto-Restart
- ✅ **Security-Hardened** (Non-root user, read-only filesystem möglich)

### Docker Commands

```bash
# Lokalen Build testen
npm run docker:build

# Container lokal ausführen (mit gemounteten Uploads)
npm run docker:run

# Mit Docker Compose starten (inkl. Datenbank)
npm run docker:compose

# Compose-Stack stoppen
npm run docker:stop
```

**Hinweis zu `docker:run`:**

- Das npm-Skript erstellt automatisch `./uploads` und mountet es nach `/app/uploads`
- Hochgeladene Dateien bleiben nach Container-Neustarts erhalten
- **Linux**: Bei Permission-Problemen: `sudo chown -R 1001:1001 ./uploads`
- **macOS/Windows**: Docker Desktop handhabt Berechtigungen automatisch

### Images auf GitHub Container Registry

**`latest` ist nicht der neueste Build.** Der Tag bewegt sich erst bei der
Production-Freigabe — das frischeste Release liegt auf `staging`:

| Tag                    | Bedeutung                                                               |
| ---------------------- | ----------------------------------------------------------------------- |
| `staging`              | Neuestes Release, **ungeprüft**                                         |
| `production`, `latest` | Freigegebener Stand (`production` ist der Default in der Compose-Datei) |
| `vX.Y.Z`, `X.Y`, `X`   | `vX.Y.Z` ist unveränderlich, `X.Y`/`X` folgen dem Production-Stand      |

```bash
# Freigegebenen Production-Stand ziehen
docker pull ghcr.io/jansinger/ostsee-tiere:production

# Neuestes, noch ungeprüftes Release (Staging)
docker pull ghcr.io/jansinger/ostsee-tiere:staging

# Feste Version (Tag-Liste unter GitHub Releases)
docker pull ghcr.io/jansinger/ostsee-tiere:vX.Y.Z

# Ausführen
docker run -p 3000:3000 --env-file .env ghcr.io/jansinger/ostsee-tiere:production
```

Vollständige Tag-Semantik und der Promotion-Ablauf: [Release-Pipeline](docs/RELEASE_PIPELINE.md)

Bricht `docker pull` mit `denied` ab, ist das Package nicht öffentlich: vorher
`docker login ghcr.io` mit einem Token mit `read:packages`-Scope.

### Dokumentation

- 📘 [Docker Deployment Guide](docs/DOCKER_DEPLOYMENT.md) - Vollständige Deployment-Anleitung
- 📗 [Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT.md) - Schnellanleitung für Production
- 🚦 [Release-Pipeline](docs/RELEASE_PIPELINE.md) - Release → Staging → Production, Image-Tags, Rollback
- 📙 [Environment Variables Reference](docs/ENVIRONMENT.md) - Alle Umgebungsvariablen
- 📕 [Database Migration Guide](docs/DATABASE_MIGRATION.md) - Migration von bestehenden Installationen
- 📒 [Design Guide](docs/DESIGN_GUIDE.md) - UI/UX Best Practices und Begründungen
- 📓 [Design System](docs/DESIGN_SYSTEM.md) - Token-Referenz (Farben, Typografie, Abstände, Motion)
- 📔 [Legacy API Specification](docs/LEGACY_API_SPECIFICATION.md) - Verbindlicher Vertrag der Vorgänger-API
- 📰 [Configuration Usage](docs/CONFIGURATION_USAGE.md) - ConfigService (Laufzeit-Konfiguration)
- 🌊 [Ostsee-Flags](docs/OSTSEE_FLAGS.md) - `ostsee` vs. `ostsee_geo` (Namen sind irreführend)
- 🌳 [Worktrees](docs/WORKTREES.md) - Worktree-Setup, geteilte Ressourcen, Ports

## Beitragen

Beiträge zum Projekt sind willkommen! Bitte erstellen Sie einen Fork des Repositories und reichen Sie Pull Requests ein.

Vor dem ersten PR: [CONTRIBUTING.md](CONTRIBUTING.md) (Branch-Schutz, Conventional Commits,
Quality Checks) und [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Für die Arbeit an mehreren Branches
parallel siehe [WORKTREES.md](docs/WORKTREES.md) — ein neuer Worktree wird mit
`npm run worktree:setup` einsatzbereit gemacht.

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE) Datei für Details.
