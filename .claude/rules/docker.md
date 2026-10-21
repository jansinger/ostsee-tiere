---
paths:
  - 'Dockerfile'
  - 'docker-compose*.yml'
  - '.env.docker'
  - 'run-release.sh'
  - 'docs/DOCKER_DEPLOYMENT.md'
  - 'docs/PRODUCTION_DEPLOYMENT.md'
  - '.github/workflows/docker-publish.yml'
---

# Docker Deployment

Regeln für Docker-Builds und Container-Deployment.

**Dokumentation:**

- **Production:** docs/PRODUCTION_DEPLOYMENT.md (Schnellanleitung)
- **Vollständig:** docs/DOCKER_DEPLOYMENT.md (Referenz)

---

## Befehle

```bash
npm run docker:build    # Production Image bauen
npm run docker:run      # Container mit ./uploads Mount starten
npm run docker:compose  # Docker Compose starten
npm run docker:stop     # Docker Compose stoppen
```

---

## Multi-Stage Build

Das Projekt nutzt **Multi-Stage Builds** für optimierte Images:

```dockerfile
# Stage 1: Dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Build
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production (minimal)
FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
CMD ["node", "build"]
```

**Vorteile:**

- Image-Größe: ~50MB statt >1GB
- Kein Source Code im finalen Image
- Keine Build-Tools im Production Container

---

## Adapter-Konfiguration (Dual: Vercel / Node)

`sveltekit.options.ts` wählt den Adapter **dynamisch**: Default ist `@sveltejs/adapter-vercel`; nur wenn `USE_NODE_ADAPTER=true` gesetzt ist, wird `@sveltejs/adapter-node` verwendet.

Für Docker-Builds wird deshalb das Script `npm run build:docker` genutzt:

```bash
# package.json
"build:docker": "USE_NODE_ADAPTER=true svelte-kit sync && vite build"
```

Der Node-Adapter erzeugt `build/index.js` (Server startet via `node build`, siehe Dockerfile-`runtime`-Stage). Ohne `USE_NODE_ADAPTER=true` würde stattdessen für Vercel gebaut — im Docker-Kontext also immer `build:docker` verwenden.

---

## Environment Variables

### Runtime (Dynamic)

```typescript
// Zur Laufzeit verfügbar, nicht im Build eingebacken
import { env } from '#lib/server/env.ts';
const dbUrl = env.DATABASE_POSTGRES_URL;
```

**Jede Variable muss in `src/env.ts` deklariert sein** (SvelteKit 3, `defineEnvVars`).
Eine dort fehlende Variable ist in der App `undefined` — auch wenn sie im Container
gesetzt ist. Der Build läuft trotzdem durch; beim Umstieg auf SvelteKit 3 kam so
`DATABASE_POSTGRES_URL` leer an und jede Seite meldete „Database is not configured".
`#lib/server/env.ts` macht aus den Einzel-Exporten von `$app/env/private` wieder das
`env`-Objekt, das der Code seit jeher liest (Begründung dort).

### Build-time (Static)

Statische Variablen (`static: true` in `src/env.ts`) werden beim Build eingebacken —
für dieses Projekt nicht verwenden: Ein Image läuft auf Staging und Produktion mit
unterschiedlicher Umgebung.

### Docker Run mit Env Vars

```bash
docker run -p 3000:3000 \
  -e ORIGIN=https://example.com \
  -e DATABASE_POSTGRES_URL="..." \
  -e NODE_ENV=production \
  ostsee-tiere:latest
```

---

## ORIGIN für Form Actions

**WICHTIG:** SvelteKit Form Actions benötigen ORIGIN:

```bash
# Ohne ORIGIN schlagen Form Submissions fehl!
docker run -p 3000:3000 -e ORIGIN=http://localhost:3000 my-app
```

---

## Volume Mounts

### Uploads Verzeichnis

```bash
# Bind Mount (Entwicklung)
docker run -v ./uploads:/app/uploads ostsee-tiere

# Named Volume (Production)
docker run -v ostsee-uploads:/app/uploads ostsee-tiere
```

### Permissions (Linux)

```bash
# Container läuft als User 1001 (nodejs)
sudo chown -R 1001:1001 ./uploads
```

---

## Docker Compose Production

Image-Zeiger: `staging` = jedes neue Release (ungeprüft), `production` = nach
Freigabe, `vX.Y.Z` = unveränderlich. `latest` bewegt sich erst bei der
Production-Promotion, nicht beim Build. Details: `docs/RELEASE_PIPELINE.md`

```yaml
services:
  app:
    image: ghcr.io/jansinger/ostsee-tiere:${IMAGE_TAG:-production}
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - ORIGIN=https://ostsee-tiere.example.com
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

---

## Alpine Base Image

Das Projekt nutzt `node:24-alpine`:

```dockerfile
FROM node:24-alpine AS base

# Für native Dependencies (falls nötig)
RUN apk add --no-cache libc6-compat
```

**Vorteile:**

- Minimale Größe (~50MB Base)
- Sicherheit: Weniger Angriffsfläche
- Schnellere Pulls und Deployments

---

## Layer Caching

```dockerfile
# 1. Package Files zuerst (ändert sich selten)
COPY package*.json ./
RUN npm ci

# 2. Source Code danach (ändert sich oft)
COPY . .
RUN npm run build
```

**Warum:** Docker cached Layers. Package-Installation wird nur bei package.json-Änderung wiederholt.

---

## Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /usr/local/bin/docker-healthcheck.sh
```

**Hinweis:** Nutzt ein Custom-Script (`docker-healthcheck.sh`), nicht `wget`.

---

## Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name ostsee-tiere.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Best Practices

### Do's

- Multi-Stage Builds verwenden
- Runtime-Config über `#lib/server/env.ts`, jede Variable in `src/env.ts` deklariert
- Origin über `PROTOCOL_HEADER`/`HOST_HEADER` (`ORIGIN` kennt adapter-node seit Version 6 nicht mehr)
- Health Checks implementieren
- Logging-Limits konfigurieren

### Don'ts

- Keine Secrets in Dockerfile
- Keine Build-Args für Secrets
- Kein `staging` Tag in Production (Prod folgt `production` oder `vX.Y.Z`)
- Keine Root-User im Container
