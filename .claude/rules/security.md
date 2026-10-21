---
paths:
  - 'src/lib/server/auth/**'
  - 'src/lib/server/storage/**'
  - 'src/hooks.server.ts'
  - 'src/routes/api/auth/**'
  - 'src/routes/api/files/**'
---

# Sicherheit & GDPR

Regeln für Authentifizierung, Datenschutz und Sicherheit.

---

## Authentifizierung (Auth0 + JWT)

### Architektur

Auth0 als Identity Provider via PKCE Flow, JWT-Verifizierung mit `jose`, Cookie-basierte Sessions.

```typescript
// src/hooks.server.ts - Middleware-Chain
import { sequence } from '@sveltejs/kit/hooks';

export const handle = sequence(
	databaseCheck, // 1. DB-Verfügbarkeit
	maintenanceMode, // 2. Wartungsmodus
	authentication, // 3. JWT-Verifizierung + Cookie-Session
	setAdditionalHeaders, // 4. Security Headers
	noindexEnglishPages, // 5. Vorübergehender Riegel, Etappe 0 der Mehrsprachigkeit
	handleStartseitenSprache, // 6. Einmalige Sprachweiterleitung auf "/"
	handleParaglide // 7. Locale auflösen, %lang%-Platzhalter ersetzen
);
```

Die drei letzten Glieder gehören zur Mehrsprachigkeits-Umstellung (siehe
`docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md`) und stehen bewusst nach `authentication`:
Die Auth-Prüfung hängt an `event.url.pathname`, das keines der drei verschiebt.

**Schlüsseldateien:**

- `src/lib/server/auth/auth.ts` - JWT-Verifizierung, PKCE, Cookie-Management
- `src/lib/server/auth/crypto.ts` - Verschlüsselung für Sessions
- `src/hooks.server.ts` - Middleware-Chain mit `sequence()`

### Protected Routes

```typescript
// src/routes/admin/sichtungen/+page.server.ts
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	if (!locals.user.roles?.includes('admin')) {
		throw redirect(302, '/unauthorized');
	}

	return { user: locals.user };
};
```

---

## Input Validation (OWASP)

### Server-seitige Validation

```typescript
import * as yup from 'yup';

const sichtungInputSchema = yup.object({
	// Sanitize strings
	notes: yup
		.string()
		.max(2000)
		.transform((val) => val?.trim())
		.nullable(),

	// Validate numbers
	lat: yup.number().min(-90).max(90).required(),

	// Validate email
	email: yup.string().email().lowercase().nullable()
});

export async function POST({ request }) {
	const data = await request.json();

	// Validation wirft bei Fehler
	const validated = await sichtungInputSchema.validate(data, {
		stripUnknown: true // Entferne unbekannte Felder
	});

	return await saveSighting(validated);
}
```

### SQL Injection Prevention

```typescript
// IMMER parametrisierte Queries
// Korrekt:
await db.select().from(sichtungen).where(eq(sichtungen.id, id));

// NIEMALS:
await db.execute(`SELECT * FROM sichtungen WHERE id = ${id}`);
```

### XSS Prevention

```svelte
<!-- Svelte escaped automatisch -->
<p>{userInput}</p>

<!-- NIEMALS @html mit User-Input ohne Sanitization -->
{@html userInput}
<!-- GEFÄHRLICH -->

<!-- Korrekt: sanitizeHtml verwenden -->
{@html sanitizeHtml(userInput)}
<!-- Erlaubt nur sichere Tags -->
```

### HTML-Sanitization mit sanitize-html

`sanitize-html` wird für HTML-Sanitization verwendet (Wrapper in `src/lib/utils/sanitize.ts`):

```typescript
import { sanitizeHtml, sanitizeText } from '#lib/utils/sanitize.ts';

// sanitizeHtml: erlaubt sichere Tags (a, em, strong, br, span, p, i, b)
// und Attribute (href, class, target, rel)
const safe = sanitizeHtml('<a href="https://example.com">link</a><script>xss</script>');
// → '<a href="https://example.com">link</a>'

// sanitizeText: entfernt ALLE HTML-Tags
const plain = sanitizeText('<b>bold</b> text');
// → 'bold text'
```

**Regel:** Jede `{@html}`-Verwendung MUSS `sanitizeHtml()` nutzen, auch bei scheinbar harmlosen Daten (Defense-in-Depth).

---

## File Upload Sicherheit

### Validierung

```typescript
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

async function validateFile(file: File): Promise<void> {
	if (!ALLOWED_TYPES.includes(file.type)) {
		throw new Error('Ungültiger Dateityp');
	}

	if (file.size > MAX_SIZE) {
		throw new Error('Datei zu groß (max 10 MB)');
	}

	// Prüfe Magic Bytes
	const header = await readFileHeader(file);
	if (!isValidImageHeader(header)) {
		throw new Error('Ungültige Bilddatei');
	}
}
```

### EXIF Metadata

```typescript
// Projekt nutzt `exifr` (nicht `exifreader`) via readImageExifData()
import { readImageExifData } from '#lib/server/media/exifUtils.ts';

const exifData: ExifData | null = await readImageExifData(buffer);
// Extrahiert: GPS, Kamera, Datum, Belichtung, ISO, Focal Length
// Korrigiert CEST-Zeitzone via correctCestOffsetUTC()
```

### Sichere Speicherung

```typescript
// Generiere zufälligen Dateinamen
import { randomUUID } from 'crypto';

function generateSecureFilename(originalName: string): string {
	const ext = path.extname(originalName).toLowerCase();
	return `${randomUUID()}${ext}`;
}
```

---

## GDPR / DSGVO

> **Fremde Dateien vor dem Commit scannen.** Dieses Repository ist öffentlich;
> ein Commit ist eine Veröffentlichung und praktisch nicht zurücknehmbar. Die
> verbindliche Regel dazu steht in `CLAUDE.md` („Fremde Dateien vor dem Commit
> auf personenbezogene Daten prüfen") — dort und nicht hier, weil diese Datei
> nur bei Änderungen unter `src/lib/server/auth/**` und
> `src/lib/server/storage/**` geladen wird und damit genau dann nicht, wenn
> jemand ein Archiv nach `docs/` legt.

### Datenminimierung

```typescript
// Nur notwendige Daten speichern
const publicSightingData = {
	id: sighting.id,
	lat: sighting.lat,
	lng: sighting.lng,
	species: sighting.species,
	date: sighting.date
	// KEINE Kontaktdaten in öffentlichen Responses
};
```

### Löschrecht

```typescript
export async function deleteUserData(userId: string) {
	await db.transaction(async (tx) => {
		// Lösche Dateien
		await tx.delete(sichtungenDateien).where(eq(sichtungenDateien.userId, userId));

		// Anonymisiere Sichtungen
		await tx
			.update(sichtungen)
			.set({
				name: null,
				email: null,
				phone: null,
				notes: null
			})
			.where(eq(sichtungen.userId, userId));
	});
}
```

### Consent

```svelte
<label class="flex items-start gap-2">
	<input type="checkbox" name="consent" required class="checkbox" />
	<span class="text-sm">
		Ich stimme der <a href="/datenschutz" class="link">Datenschutzerklärung</a> zu und willige in die
		Verarbeitung meiner Daten ein.
	</span>
</label>
```

---

## Security Headers

Security Headers werden in `src/lib/server/middleware/securityHeaders.ts` zentral verwaltet:

| Header                              | Wert                                      | Zweck                                                |
| ----------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `X-Content-Type-Options`            | `nosniff`                                 | MIME-Sniffing verhindern                             |
| `Referrer-Policy`                   | `strict-origin-when-cross-origin`         | Referrer einschränken                                |
| `Permissions-Policy`                | `camera=(), microphone=(), geolocation=*` | Browser-Features einschränken                        |
| `X-Permitted-Cross-Domain-Policies` | `none`                                    | Cross-Domain-Zugriff verhindern                      |
| `Cross-Origin-Opener-Policy`        | `same-origin-allow-popups`                | Window-Isolation (Popups erlaubt für iframe-Kontext) |
| `Cross-Origin-Resource-Policy`      | `cross-origin`                            | Ressourcen-Zugriff für meeresmuseum.de iframe        |
| `Strict-Transport-Security`         | `max-age=31536000; includeSubDomains`     | HSTS (nur HTTPS)                                     |

**Nicht gesetzt:** `Cross-Origin-Embedder-Policy` — würde OSM Tiles, Vercel Blob und Gravatar blockieren.

CSP wird separat in `sveltekit.options.ts` konfiguriert (seit SvelteKit 3; Schlüsselwörter ohne eigene Anführungszeichen, also `self` statt `'self'`).

---

## SAST Scanning

Kein dediziertes CodeQL-Workflow. Container-Image-Scan mit SARIF-Upload läuft in `.github/workflows/docker-publish.yml` (Ergebnisse unter GitHub Security → Code scanning alerts).

---

## Rate Limiting

Implementierung: `src/lib/server/middleware/rateLimit.ts` (In-Memory, mit automatischem Cleanup).

```typescript
import {
	RATE_LIMITS,
	checkRateLimit,
	createRateLimitIdentifier,
	enforceRateLimit,
	buildRateLimitHeaders
} from '#lib/server/middleware/rateLimit.ts';

export async function POST({ locals, getClientAddress }) {
	// Identifier: `user:{sub}` (authentifiziert) oder `ip:{clientIp}`
	const identifier = createRateLimitIdentifier(locals.user?.sub, getClientAddress(), !!locals.user);

	// wirft SvelteKit error(429) bei Überschreitung
	const result = enforceRateLimit(identifier, RATE_LIMITS.SIGHTING_SUBMISSION, 'sightings');

	// Response-Headers: X-RateLimit-{Limit,Remaining,Reset,Window}
	const headers = buildRateLimitHeaders(RATE_LIMITS.SIGHTING_SUBMISSION, result);
	// ...
}
```

Vordefinierte Limits in `RATE_LIMITS`: File Upload 20/h (anonym) bzw. 50/h (auth), Media Access 30/min bzw. 100/min, Sighting Submission 20/h.

---

## Environment Variables

```bash
# .env - NIEMALS committen
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx
DATABASE_POSTGRES_URL=xxx
BLOB_READ_WRITE_TOKEN=xxx
```

### Zugriff

```typescript
import { env } from '#lib/server/env.ts';

// Server-only
const secret = env.AUTH0_CLIENT_SECRET;
```

Neue Variablen in `src/env.ts` eintragen — sonst sind sie `undefined` (siehe `docker.md`).

---

## Best Practices Checkliste

### Do's

- [ ] Alle Inputs serverseitig validieren
- [ ] Parametrisierte Queries verwenden
- [ ] HTTPS für alle Verbindungen
- [ ] Secrets in Environment Variables
- [ ] Rate Limiting für APIs
- [ ] GDPR-Consent einholen
- [ ] `sanitizeHtml()` bei jeder `{@html}`-Verwendung
- [ ] Security Headers in Middleware zentral verwalten

### Don'ts

- [ ] Keine Secrets in Code/Logs
- [ ] Keine User-Inputs in SQL/HTML ohne Sanitization
- [ ] Keine sensiblen Daten in Fehlermeldungen
- [ ] Keine unverschlüsselten Passwörter
- [ ] Kein `{@html}` ohne `sanitizeHtml()`

---

## Audit Logging

Kritische Admin-Aktionen werden in der `audit_logs` PostgreSQL-Tabelle gespeichert. Security-Events (Rate Limit, Auth-Fehler) gehen nur als strukturierte Pino-Logs nach stdout.

**Service:** `src/lib/server/audit/auditService.ts`

**Invariante:** `logAuditEvent()` wirft niemals — DB-Fehler werden geloggt und blockieren die Hauptoperation nicht.

**Events in der DB:**

| Action                 | Wann                                                    | Details                       |
| ---------------------- | ------------------------------------------------------- | ----------------------------- |
| `sighting.approve`     | Admin genehmigt Sichtung                                | `{ previousStatus }`          |
| `sighting.reject`      | Admin lehnt Sichtung ab                                 | `{ previousStatus }`          |
| `sighting.edit`        | Admin bearbeitet Sichtung                               | `{ changedFields: string[] }` |
| `sighting.delete`      | Admin löscht Sichtung                                   | —                             |
| `file.delete`          | Admin löscht Datei                                      | —                             |
| `config.update`        | Einstellung geändert                                    | `{ key, category }`           |
| `auth.login_success`   | Erfolgreicher Admin-Login                               | —                             |
| `auth.login_failure`   | Fehlgeschlagener Login                                  | status: 'failure'             |
| `auth.logout`          | Benutzer meldet sich ab (Session wird widerrufen)       | —                             |
| `auth.session_revoked` | Sessions eines Benutzers gezielt widerrufen             | `{ sub }`                     |
| `export.download`      | Admin startet Daten-Export über `/api/sightings/export` | `{ format }`                  |

**Pino stdout (nicht in DB):**

- `security.rate_limit_hit` — Rate Limit überschritten (`rateLimit.ts`)
- `security.auth_error` — Authentifizierungs-/Autorisierungsfehler, z. B. ungültiges Auth-Cookie (`hooks.server.ts`), fehlende Berechtigung (`requireUserRole`) oder Auth0-Callback-Fehler
- `unhandled_error` — 5xx aus `handleError`, `level: 50`, mit `stack` und `causes`
- `client_error` — 4xx aus `handleError`, `level: 40`, ohne Stack

Die Trennung der beiden letzten ist der Punkt: SvelteKit ruft `handleError` auch für jede
nicht gematchte Route auf (`respond.js`, Zweig `state.depth === 0`). Vorher ging damit
jeder Bot-Scan als `level: 50` samt Stacktrace ins Log und war von einem echten Ausfall
nicht zu unterscheiden. Beide Einträge tragen jetzt `method`, `clientIp`, `userAgent` und
`referer` — ohne die war am 2026-08-03 nicht zu klären, wer wiederholt `/api/login`
anfragte (ein Pfad, den kein Codepfad dieser Anwendung erzeugt). Diese Werte sind
Client-Eingaben und laufen deshalb durch `redactSecrets` und eine Längenbegrenzung. Der
Referer wird zusätzlich auf Herkunft und Pfad reduziert: `redactSecrets` redigiert nur
Schlüssel, die nach einem Geheimnis aussehen — ein Same-Origin-Referer aus einer
gefilterten Admin-Liste hätte den Suchbegriff (ggf. einen Personennamen) mitgeloggt.

**Auswertung:** Drizzle Studio oder `docker compose logs app | grep '"event":"security.'`
