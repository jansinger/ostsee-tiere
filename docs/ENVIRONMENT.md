# Environment Variables Reference

Complete reference for all environment variables used in the Ostsee-Tiere platform.

## Table of Contents

- [Required Variables](#required-variables)
- [Database Configuration](#database-configuration)
- [Storage Configuration](#storage-configuration)
- [Application Settings](#application-settings)
- [Security Configuration](#security-configuration)
- [Auth0 Configuration](#auth0-configuration)
- [Email Configuration](#email-configuration)
- [Logging & Debugging](#logging--debugging)
- [Feature Flags](#feature-flags)
- [Docker-Specific Variables](#docker-specific-variables)
- [Build & Development Variables](#build--development-variables)
- [Quick Reference](#quick-reference)

---

## Declaring variables in `src/env.ts` (SvelteKit 3)

Since SvelteKit 3 the app only sees environment variables that are declared in
`src/env.ts` (`defineEnvVars`). Everything else is `undefined` in the app — even if it
is set in the container or in `.env`. The build does not fail. When this project
switched to SvelteKit 3, `DATABASE_POSTGRES_URL` arrived empty this way and every page
reported "Database is not configured".

- **Adding a variable:** declare it in `src/env.ts` (with `schema: asIs`, which keeps a
  missing variable `undefined` exactly like `$env/dynamic/private` did) **and** document
  it here.
- **Reading a variable:** `import { env } from '#lib/server/env.ts'` (public ones:
  `publicEnv` from the same module). The module turns the per-variable exports of
  `$app/env/private` / `$app/env/public` back into the `env` object the code has always
  used.
- **Exception:** standalone scripts (`src/tools/`, `scripts/`) run outside SvelteKit and
  keep reading `process.env` directly.

---

## Required Variables

These variables **MUST** be set for the application to function:

### `DATABASE_POSTGRES_URL`

**Type**: `string` (Connection String)
**Required**: Yes
**Default**: None
**Description**: PostgreSQL connection string with PostGIS support.

**Format**:

```
postgresql://[user]:[password]@[host]:[port]/[database]
```

**Examples**:

```bash
# Docker Compose (internal network)
DATABASE_POSTGRES_URL=postgresql://postgres:mysecretpassword@db:5432/ostsee

# External database
DATABASE_POSTGRES_URL=postgresql://ostsee_user:secure-pass@db.example.com:5432/ostsee

# AWS RDS
DATABASE_POSTGRES_URL=postgresql://admin:password@ostsee-db.xxxxx.eu-central-1.rds.amazonaws.com:5432/ostsee

# Connection pooling with pgbouncer
DATABASE_POSTGRES_URL=postgresql://user:pass@pgbouncer:6432/ostsee
```

---

### `CLEANUP_TOKEN`

Bearer-Token für `POST /api/admin/cleanup-orphans`, mit dem ein externer
Web-Cron verwaiste Uploads abräumt.

- **Pflicht:** nein. Ohne Wert ist der externe Zugang abgeschaltet — der
  Endpunkt bleibt dann nur über eine angemeldete Admin-Session erreichbar.
- **Mindestlänge:** 32 Zeichen. Ein kürzerer Wert wird wie „nicht gesetzt"
  behandelt und beim Zugriffsversuch als Warnung geloggt.
- **Rotation:** Wert tauschen und neu deployen.

```bash
CLEANUP_TOKEN=$(openssl rand -hex 32)
```

Aufruf im Cron:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" \
  "https://<host>/api/admin/cleanup-orphans?mode=execute"
```

### `SESSION_SECRET` — entfallen

Diese Variable wird **nicht mehr verwendet** und kann aus jeder `.env` entfernt werden.

Bis zum Session-Store stellte die App nach dem Auth0-Callback ihr eigenes, mit
`SESSION_SECRET` signiertes JWT aus. Wer das Secret lesen konnte, stellte sich damit eine
Admin-Session aus — ohne Auth0, ohne Passwort. Seit dem Umbau trägt das Cookie nur noch ein
opakes Zufalls-Token, der Session-Zustand liegt in der Tabelle `sessions`. Ein Secret, das
Sessions ausstellen könnte, gibt es nicht mehr.

**Was an seine Stelle tritt:** Der Notausschalter „alle Sitzungen beenden" ist jetzt eine
`UPDATE`-Anweisung (`revokeAllForSub` in `src/lib/server/auth/sessionRepository.ts`) statt
eines Secret-Wechsels mit Kollateralschaden. Logout wirkt serverseitig.

Hintergrund und Begründung: `docs/archive/SESSION_STORE_SPEC_2026-07-31.md`.

---

### `ENCRYPTION_KEY`

**Type**: `string` (Hexadecimal)
**Required**: Yes
**Default**: None
**Length**: 64 characters (32 bytes hex-encoded)
**Description**: Encryption key for sensitive data.

**Generate**:

```bash
openssl rand -hex 32
```

**Example**:

```bash
ENCRYPTION_KEY=<Ausgabe von openssl rand -hex 32>
```

---

### `AUTH0_CLIENT_ID`

**Type**: `string`
**Required**: Yes
**Default**: None
**Description**: Auth0 application client ID.

**Example**:

```bash
AUTH0_CLIENT_ID=AbCdEfGhIjKlMnOpQrStUvWx
```

**Where to Find**: Auth0 Dashboard → Applications → Your App → Settings → Client ID

---

### `AUTH0_CLIENT_SECRET`

**Type**: `string`
**Required**: Yes
**Default**: None
**Description**: Auth0 application client secret.

**Example**:

```bash
AUTH0_CLIENT_SECRET=1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnop
```

**Where to Find**: Auth0 Dashboard → Applications → Your App → Settings → Client Secret

---

### `AUTH0_DOMAIN`

**Type**: `string`
**Required**: Yes
**Default**: None
**Description**: Auth0 tenant domain.

**Format**:

```
[your-tenant].auth0.com
OR
[your-tenant].[region].auth0.com
```

**Examples**:

```bash
AUTH0_DOMAIN=ostsee-tiere.eu.auth0.com
AUTH0_DOMAIN=my-company.auth0.com
```

---

### `PUBLIC_SITE_URL`

**Type**: `string` (URL)
**Required**: Yes
**Default**: None
**Description**: Public URL where the application is accessible.

**Examples**:

```bash
# Development
PUBLIC_SITE_URL=http://localhost:3000

# Production
PUBLIC_SITE_URL=https://ostsee-tiere.example.com

# With subdomain
PUBLIC_SITE_URL=https://sightings.meeresmuseum.de
```

**Important**: Must match Auth0 callback URLs!

---

## Database Configuration

### `DATABASE_URL`

**Type**: `string` (Connection String)
**Required**: No
**Default**: none
**Description**: Fallback connection string, only read when `DATABASE_POSTGRES_URL` is
unset. The application itself never reads it — `src/lib/server/db/index.ts`,
`drizzle.config.ts`, `scripts/docker-migrate.ts` and `scripts/docker-entrypoint.sh` all
require `DATABASE_POSTGRES_URL`. The fallback exists for part of the maintenance tooling
in `src/tools/`, so those scripts also run in environments that already provide the
conventional `DATABASE_URL`.

**Which tools accept it**:

| Tool                           | Behaviour when neither variable is set                             |
| ------------------------------ | ------------------------------------------------------------------ |
| `cleanup-orphaned-uploads.ts`  | aborts — it deletes files and must never guess a target            |
| `migrate-timestamps-to-utc.js` | aborts                                                             |
| `fix-media-upload-flags.js`    | falls back to a hard-coded local dev connection (`localhost:5433`) |

The remaining tools (`generate-reference-ids.ts`, `migrate-old-uploads.ts`) read
`DATABASE_POSTGRES_URL` only and do **not** honour `DATABASE_URL`.

Note the third row: `fix-media-upload-flags.js` is the one script that connects
somewhere by default instead of failing. Set the variable explicitly before running it
against anything other than the local dev database.

**Precedence**:

```bash
# DATABASE_POSTGRES_URL wins whenever both are set
DATABASE_POSTGRES_URL=postgresql://user:pass@db:5432/ostsee
DATABASE_URL=postgresql://user:pass@other:5432/ostsee   # ignored here
```

---

### `PGUSER`

**Type**: `string`
**Required**: No
**Default**: `postgres`
**Description**: PostgreSQL username (alternative to connection string).

---

### `PGPASSWORD`

**Type**: `string`
**Required**: No
**Default**: None
**Description**: PostgreSQL password (alternative to connection string).

---

### `PGDATABASE`

**Type**: `string`
**Required**: No
**Default**: `ostsee`
**Description**: PostgreSQL database name (alternative to connection string).

---

### `PGHOST`

**Type**: `string`
**Required**: No
**Default**: `localhost`
**Description**: PostgreSQL host (alternative to connection string).

---

### `PGPORT`

**Type**: `number`
**Required**: No
**Default**: `5432`
**Description**: PostgreSQL port (alternative to connection string).

---

### `POSTGRES_SHARED_BUFFERS`

**Type**: `string`
**Required**: No
**Default**: `256MB`
**Description**: PostgreSQL shared_buffers setting (Docker Compose only).

**Recommended Values**:

- Small server (4GB RAM): `256MB`
- Medium server (8GB RAM): `512MB`
- Large server (16GB+ RAM): `1GB` - `4GB`

---

### `POSTGRES_EFFECTIVE_CACHE_SIZE`

**Type**: `string`
**Required**: No
**Default**: `1GB`
**Description**: PostgreSQL effective_cache_size setting.

**Rule of Thumb**: 50-75% of total RAM

---

## Storage Configuration

### `STORAGE_PROVIDER`

**Type**: `enum`
**Required**: No
**Default**: `local`
**Options**: `local` | `vercel-blob`
**Description**: Storage backend for uploaded media files. Currently, only `local` and `vercel-blob` are supported for production use. The values `s3` and `gcs` may appear in code and types as reserved providers, but they are not implemented yet and must not be used in configuration.

---

### `VERCEL`

**Type**: `string`
**Required**: No (set automatically by the Vercel platform)
**Default**: unset
**Description**: Platform marker, not meant to be set by hand. When `STORAGE_PROVIDER`
is empty and `VERCEL` holds any non-empty value, the storage factory
(`src/lib/server/storage/factory.ts`) selects `vercel-blob`. Outside Vercel the factory
falls back to `local`.

**Resolution order** (first match wins):

1. `STORAGE_PROVIDER` — explicit configuration
2. `VERCEL` non-empty → `vercel-blob`
3. SvelteKit `dev` flag → `local`
4. fallback → `local`

Setting `STORAGE_PROVIDER` explicitly overrides the `VERCEL` detection, which is the
supported way to run a Vercel deployment against local storage or vice versa.

---

### Local Storage

#### `UPLOAD_PATH`

**Type**: `string` (Path)
**Required**: When `STORAGE_PROVIDER=local`
**Default**: `/app/uploads` (Docker, set in the image), `uploads` (non-Docker)
**Description**: Directory path for uploaded files. Determines both where the application
writes uploads and where it reads them back from.

Relative values are resolved against the process working directory (`/app` inside the
container, so the default `uploads` maps to `/app/uploads`). Absolute values are used as
given. The Docker entrypoint validates this exact path for existence and write permission
before the application starts, so entrypoint check and application behaviour cannot drift
apart.

**Example**:

```bash
UPLOAD_PATH=/app/uploads
```

**Note**: When running outside Docker with a working directory other than the project root,
set an absolute path — otherwise uploads land next to wherever the process was started.

---

### Vercel Blob Storage

#### `BLOB_READ_WRITE_TOKEN`

**Type**: `string`
**Required**: When `STORAGE_PROVIDER=vercel-blob`
**Default**: None
**Description**: Vercel Blob storage API token.

**Example**:

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Where to Find**: Vercel Dashboard → Project → Settings → Storage

---

## Application Settings

### `FORM_TOKEN_SECRET`

**Type**: `string`
**Required**: No
**Default**: random per process
**Description**: HMAC secret for the anti-spam form timing token
(`src/lib/server/spam/formToken.ts`). The report page issues a signed
timestamp on load; the submit endpoint reads how long the form was open and
scores suspiciously fast submissions. Without this variable a random secret is
generated at process start — tokens issued before a restart then verify as
`invalid`, which only adds spam-score points and never blocks a submission.
Set it in production if you want tokens to survive restarts.

---

### `NODE_ENV`

**Type**: `enum`
**Required**: No
**Default**: `production`
**Options**: `development` | `production` | `test`
**Description**: Node.js environment mode.

**Effects**:

- `development`: Debug logging, hot reload, detailed errors
- `production`: Optimized builds, error suppression, caching
- `test`: Test configurations, mock data

---

### `TZ`

**Type**: `string` (IANA timezone)
**Required**: No
**Default**: `UTC` (set explicitly in `Dockerfile` and `docker-compose.production.yml`)
**Description**: Process timezone. Deliberately pinned — do not remove.

#### Why this is pinned

Without `TZ`, Node falls back to UTC, which _happened_ to be correct but was never
a decision: the timezone was whatever the environment supplied. Date logic silently
depended on it. One instance reached production — the statistics filter excluded
epoch placeholder records via `setHours`, which evaluates in the **local** timezone.
In Europe/Berlin it matched the 280 records, in the UTC container it did not, and
`yearsOfService` jumped from 24 to ~56 years (fixed in
[#571](https://github.com/jansinger/ostsee-tiere/pull/571)).

#### Why UTC and not Europe/Berlin

`UTC` is what production already runs, so pinning it changes nothing — no silent
shift in stored timestamps, exports, or API responses. Log timestamps also stay
unambiguous across the DST changeover, where Europe/Berlin repeats an hour.

#### Storage convention

All timestamp columns hold **true UTC instants**. Drizzle pins both directions
explicitly (`toISOString()` on write, `+0000` on read), so storage does not
depend on `TZ` either.

The read half of that sentence needed help to be true. Drizzle only appends
`+0000` when the driver hands it a **string**, and `postgres.js` parses
`timestamp without time zone` itself — as local time of the process. Measured
with a standalone client under `TZ=Europe/Berlin`: a column holding
`2026-08-02 12:30:00` comes back as a `Date` at `10:30Z`. Since 2026-08-02 the
driver is told to pass OID 1114 through as text
(`src/lib/server/db/postgresTypes.ts`, covered by `timestampParsing.test.ts`),
so the mapping no longer depends on the process timezone. The running
application was never affected — its process runs in UTC — but the guarantee now
rests on code rather than on this variable.

This was not always true. The columns are `timestamp without time zone`, and the
data inherited from the PHP predecessor held German wall-clock time — that system
ran on a server in Europe/Berlin. A one-off migration converted it before launch:

```bash
npm run db:migrate-timestamps-utc:dry-run -- --cutover=<go-live ISO>
```

The tool refuses to run twice (marker in `app_config`) and aborts if records that
were already written by this application fall inside its scope. Run the dry run
first and take a backup — the conversion is not trivially reversible.

#### Display

German local time is **not** left to `TZ`. Every place that renders time for users
names `Europe/Berlin` explicitly:

| Concern                                                            | Implementation                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Display & CSV/KML/XML/JSON export                                  | `src/lib/utils/format/dateTime.ts` — `Intl` with `timeZone: 'Europe/Berlin'`   |
| Weather lookup (Open-Meteo, requested as `timezone=Europe/Berlin`) | `src/lib/server/weather/hourIndex.ts` — index parsed from the `"HH:MM"` string |
| Legacy REST API output (`dt`, `ti`)                                | `src/lib/legacy-api/date-utils.ts` — `Intl` with `Europe/Berlin`               |
| Legacy `year` filter                                               | `getYearRange()` — German local year bounds, matching the output               |
| Statistics plausibility bound                                      | `EARLIEST_PLAUSIBLE_SIGHTING_DATE` — fixed UTC instant                         |

#### Before changing this value

Changing `TZ` is safe only as long as the code stays timezone-independent.
`src/lib/server/datetime/correctCestOffsetUTC.test.ts` proves the sighting pipeline
(`combineToDate` → `correctCestOffsetUTC`) yields the same UTC instant under UTC and
Europe/Berlin, for all 24 hours in both summer and winter, including the two DST
transition days themselves. Note that `correctCestOffsetUTC` only _does_ anything when
the process runs in UTC — it returns early otherwise.

The date it receives carries German **wall-clock** time, not a true UTC instant, so the
DST boundaries inside it are wall-clock too (02:00 for the start of CEST, 03:00 for its
end) — not the 01:00Z instant at which the changeover actually happens. Comparing the two
against each other is what caused the one-hour shift fixed in this file's history. Run the
full server suite after any change:

```bash
npm run test:unit
```

---

### `PORT`

**Type**: `number`
**Required**: No
**Default**: `3000`
**Description**: Port number for the application server.

**Example**:

```bash
PORT=3000
```

---

### `HOST`

**Type**: `string`
**Required**: No
**Default**: `0.0.0.0`
**Description**: Host address to bind the server.

**Options**:

- `0.0.0.0`: Listen on all interfaces (Docker default)
- `localhost`: Listen only on localhost
- Specific IP: Bind to specific network interface

---

### `BODY_SIZE_LIMIT`

**Type**: `number` (bytes)
**Required**: No
**Default**: `125829120` (120 MB)
**Description**: Maximum size for request bodies (file uploads).

**This value must stay above the configured upload limit.** It is enforced by
the Node adapter _before_ the route runs, so a request over this size fails
without the application's own error message — the reporter only sees a generic
transfer failure and never learns their file was too large. The application logs
a warning at startup if the two are out of order.

Related runtime configuration (database, `app_config`):
`security.maxFileSize` (default 10 MB) and `security.maxVideoFileSize`
(default 100 MB). With the 100 MB video default, `BODY_SIZE_LIMIT` needs at
least 101 MB; 120 MB leaves room for the multipart envelope and a raised limit.

**The reverse proxy needs the same headroom** — `client_max_body_size 120M;`
for nginx. Whichever limit is lower is the binding one.

**Examples**:

```bash
# 120 MB (default, matches a 100 MB video limit)
BODY_SIZE_LIMIT=125829120

# 50 MB — only with security.maxVideoFileSize lowered to 45 or below
BODY_SIZE_LIMIT=52428800
```

---

### `COOKIE_NAME`

**Type**: `string`
**Required**: No
**Default**: `auth-cookie`
**Description**: Name of the authentication cookie.

---

## Security Configuration

### `JWKS_URL`

**Type**: `string` (URL)
**Required**: Yes (for Auth0)
**Default**: None
**Description**: JSON Web Key Set URL for Auth0 token verification.

**Format**:

```
https://[AUTH0_DOMAIN]/.well-known/jwks.json
```

**Example**:

```bash
JWKS_URL=https://ostsee-tiere.eu.auth0.com/.well-known/jwks.json
```

---

### `API_AUDIENCE`

**Type**: `string`
**Required**: Yes (for Auth0 API)
**Default**: None
**Description**: Auth0 API identifier/audience.

**Example**:

```bash
API_AUDIENCE=https://api.ostsee-tiere.example.com
```

**Where to Find**: Auth0 Dashboard → APIs → Your API → Settings → Identifier

---

## Email Configuration

### `SMTP_HOST`

**Type**: `string`
**Required**: No (if email features disabled)
**Default**: None
**Description**: SMTP server hostname.

**Examples**:

```bash
# Gmail
SMTP_HOST=smtp.gmail.com

# SendGrid
SMTP_HOST=smtp.sendgrid.net

# Mailgun
SMTP_HOST=smtp.mailgun.org

# Custom
SMTP_HOST=mail.example.com
```

---

### `SMTP_PORT`

**Type**: `number`
**Required**: No
**Default**: `587`
**Description**: SMTP server port.

**Common Ports**:

- `587`: TLS (recommended)
- `465`: SSL
- `25`: Unencrypted (not recommended)

---

### `SMTP_USER`

**Type**: `string`
**Required**: No
**Default**: None
**Description**: SMTP authentication username.

---

### `SMTP_PASSWORD`

**Type**: `string`
**Required**: No
**Default**: None
**Description**: SMTP authentication password.

---

## Logging & Debugging

### `LOG_LEVEL`

**Type**: `enum`
**Required**: No
**Default**: `info`
**Options**: `trace` | `debug` | `info` | `warn` | `error` | `fatal`
**Description**: Minimum log level to output.

**Levels Explained**:

- `trace`: Most verbose, all details
- `debug`: Development debugging information
- `info`: General informational messages (default)
- `warn`: Warning messages
- `error`: Error messages only
- `fatal`: Only fatal errors

**Example**:

```bash
# Production
LOG_LEVEL=info

# Development
LOG_LEVEL=debug

# Troubleshooting
LOG_LEVEL=trace
```

---

### `ENABLE_DEBUG_LOGGING`

**Type**: `boolean`
**Required**: No
**Default**: `false`
**Description**: Enable detailed debug logging.

**Values**: `true` | `false`

---

## Feature Flags

### `ENABLE_ANALYTICS`

**Type**: `boolean`
**Required**: No
**Default**: `false`
**Description**: Enable analytics tracking.

---

### `RUN_MIGRATIONS`

**Type**: `boolean`
**Required**: No
**Default**: `true`
**Description**: Run database migrations on container startup (entrypoint →
`scripts/docker-migrate.ts`). Applies the versioned SQL migrations bundled in
the image (`drizzle/` directory), idempotent and advisory-locked. Set to
`false` only if the schema is managed externally.

**Example**:

```bash
RUN_MIGRATIONS=false
```

---

### `ALLOW_DESTRUCTIVE_MIGRATIONS`

**Type**: `boolean`
**Required**: No
**Default**: `false`
**Description**: By default the startup migration refuses to apply pending
migrations that contain destructive statements (`DROP TABLE`, `DROP COLUMN`,
`TRUNCATE`) and the container does not start. Set to `true` **for a single
start** to apply such a reviewed migration — always create a database backup
first, then remove the variable again.

**Example**:

```bash
ALLOW_DESTRUCTIVE_MIGRATIONS=true
```

---

## Docker-Specific Variables

### `APP_PORT`

**Type**: `number`
**Required**: No (Docker Compose)
**Default**: `3000`
**Description**: External port mapping for application (Docker Compose).

---

### `DB_PORT`

**Type**: `number`
**Required**: No (Docker Compose)
**Default**: `5432`
**Description**: External port mapping for database (Docker Compose).

---

## Build & Development Variables

These are read by the build and dev tooling rather than by the running application.

### `USE_NODE_ADAPTER`

**Type**: `boolean` (string comparison against `"true"`)
**Required**: No
**Default**: unset → Vercel adapter
**Description**: Selects the SvelteKit adapter in `sveltekit.options.ts`. Only the exact
string `true` switches to `@sveltejs/adapter-node`; any other value keeps the Vercel
adapter. The Docker image sets it (`Dockerfile`), so container builds always produce the
Node build. Set it at **build** time — changing it for an already-built image has no
effect.

```bash
# Node build (what the Dockerfile does)
USE_NODE_ADAPTER=true npm run build
```

---

### `VITE_DEV_PORT`

**Type**: `number`
**Required**: No
**Default**: `4000`
**Description**: Port for the Vite dev server (`vite.config.ts`). Changing it is only
half the story: `PUBLIC_SITE_URL` builds the Auth0 callback URL and is pinned to port
4000, so a dev server on another port still gets redirected back to 4000 after login
unless the alternative URL is registered in Auth0. See
[docs/WORKTREES.md](WORKTREES.md) for the full picture.

```bash
VITE_DEV_PORT=4005 npm run dev
```

---

## Quick Reference

### Minimal Production Configuration

```bash
# Database (REQUIRED)
DATABASE_POSTGRES_URL=postgresql://user:pass@host:5432/dbname

# Security (REQUIRED)
ENCRYPTION_KEY=<64 char hex string>

# Auth0 (REQUIRED)
AUTH0_CLIENT_ID=<your-client-id>
AUTH0_CLIENT_SECRET=<your-client-secret>
AUTH0_DOMAIN=<your-tenant>.auth0.com
JWKS_URL=https://<your-tenant>.auth0.com/.well-known/jwks.json
API_AUDIENCE=<your-api-identifier>

# Application (REQUIRED)
PUBLIC_SITE_URL=https://your-domain.com
NODE_ENV=production

# Storage (REQUIRED)
STORAGE_PROVIDER=local
UPLOAD_PATH=/app/uploads
```

### Complete Production Configuration

See [.env.example](../.env.example) for a complete annotated example.

---

### Validation Checklist

Before deploying, verify:

- [ ] `DATABASE_POSTGRES_URL` is set and valid
- [ ] `ENCRYPTION_KEY` is exactly 64 hex characters
- [ ] All Auth0 variables are configured
- [ ] `PUBLIC_SITE_URL` matches your domain
- [ ] Storage provider is configured correctly
- [ ] Email settings are configured (if using email)
- [ ] Sensitive values are not committed to git
- [ ] `.env` file has restricted permissions (600)

---

## Security Recommendations

1. **Never commit `.env` files to version control**
2. **Use strong, randomly generated secrets**
3. **Rotate secrets regularly** (every 90 days)
4. **Restrict `.env` file permissions**: `chmod 600 .env`
5. **Use environment-specific secrets** (dev ≠ staging ≠ production)
6. **Use secret management services** in production (AWS Secrets Manager, Azure Key Vault, etc.)
7. **Enable audit logging** for secret access
8. **Document who has access** to production secrets

---

## Reverse Proxy & Client IP (Production / Docker)

Die Produktion läuft als **adapter-node im Docker-Container hinter einem Reverse Proxy**
(Nginx/Caddy). Damit `getClientAddress()` die echte Client-IP liefert (statt der internen
Proxy-IP) — Voraussetzung dafür, dass das **IP-basierte Rate-Limiting pro Client** greift —
müssen die Forwarded-Header ausgewertet werden. Diese Variablen sind in
`docker-compose.production.yml` / `.env.docker` bereits gesetzt:

| Variable          | Empfohlen           | Beschreibung                                                    |
| ----------------- | ------------------- | --------------------------------------------------------------- |
| `ADDRESS_HEADER`  | `x-forwarded-for`   | Header, aus dem der adapter-node die Client-IP liest            |
| `XFF_DEPTH`       | `1`                 | Anzahl vertrauenswürdiger Proxies vor der App (bei 1 Proxy = 1) |
| `PROTOCOL_HEADER` | `x-forwarded-proto` | Header für das Original-Protokoll (http/https)                  |
| `HOST_HEADER`     | `x-forwarded-host`  | Header für den Original-Host                                    |

> **Sicherheitshinweis:** `ADDRESS_HEADER` darf nur gesetzt sein, wenn tatsächlich ein
> vertrauenswürdiger Reverse Proxy davorsteht, der `X-Forwarded-For` **überschreibt** (nicht
> nur anhängt). Der Nginx-/Caddy-Beispiel-Config in DOCKER_DEPLOYMENT.md setzt
> `X-Forwarded-For $proxy_add_x_forwarded_for`. Ohne echten Proxy davor wäre der Header
> client-spoofbar (Rate-Limit-Bypass). `XFF_DEPTH` muss exakt zur Proxy-Anzahl passen.

### Rate-Limiting-Hinweis

Das Rate-Limiting (`src/lib/server/middleware/rateLimit.ts`) hält seinen Zähler **im
Prozess-Speicher**. Das ist für das dokumentierte **Single-Container-Deployment korrekt und
wirksam**. Bei einer künftigen **horizontalen Skalierung** (mehrere App-Container/Replicas
hinter einem Load Balancer) würde jeder Container getrennt zählen — dann ist ein **gemeinsamer
Store** (Redis/Postgres) erforderlich.

---

## `SKIP_DB_CHECK`

- **Type**: Boolean (`"true"` / unset)
- **Required**: No
- **Default**: unset (DB-Check aktiv)

Überspringt die DB-Verfügbarkeitsprüfung der `databaseCheck`-Middleware
(`src/lib/server/middleware/databaseCheck.ts`). **Nur für CI/Tests** gedacht — in Produktion
niemals setzen, sonst laufen Requests bei DB-Ausfall in Fehler statt in einen sauberen 503.

---

## Support

For questions about environment configuration:

- **Documentation**: [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
- **Issues**: https://github.com/jansinger/ostsee-tiere/issues
- **Example File**: [.env.example](../.env.example)

---

_Last Updated: April 2026_
