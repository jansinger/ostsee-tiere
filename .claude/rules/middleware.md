---
paths:
  - 'src/lib/server/middleware/**'
  - 'src/hooks.server.ts'
---

# Server Middleware

Regeln für die Middleware-Chain in `hooks.server.ts`.

---

## Execution Order (KRITISCH)

```typescript
// src/hooks.server.ts
export const handle = sequence(
	databaseCheck, // 1. DB-Verfügbarkeit
	maintenanceMode, // 2. Wartungsmodus
	authentication, // 3. Session-Lookup (sessionRepository)
	setAdditionalHeaders, // 4. Security Headers
	noindexEnglishPages, // 5. Vorübergehender Riegel, Etappe 0 der Mehrsprachigkeit
	handleStartseitenSprache, // 6. Einmalige Sprachweiterleitung auf "/"
	handleParaglide // 7. Locale auflösen, %lang%-Platzhalter ersetzen
);
```

**Reihenfolge ist wichtig** -- databaseCheck muss vor Auth kommen (Auth braucht DB).
Seit dem Session-Store (#635) gilt das buchstäblich: `resolveSessionUser` schlägt das
Cookie in der Tabelle `sessions` nach, Authentifizierung ohne DB gibt es nicht mehr.

`noindexEnglishPages` und `handleStartseitenSprache`/`handleParaglide` sind Teil der
Mehrsprachigkeits-Umstellung (siehe `docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md`). Beide
letzten Glieder lesen bzw. schreiben ausschließlich über `event.url`/`event.request` und
`resolve(event)` — sie verschieben nicht, an welcher Stelle `event.url.pathname` für Auth
und Security-Header gilt. `noindexEnglishPages` ist vorübergehend: Der Kommentar in
`src/lib/server/middleware/noindexEnglishPages.ts` nennt die Entfernungsbedingung
(Übersetzung abgeschlossen **und** `hreflang` ergänzt).

---

## databaseCheck.ts

Verhindert 503-Fehler bei DB-Ausfall. 30-Sekunden-Cache für DB-Status.

- **Skip:** `SKIP_DB_CHECK=true` Env-Variable
- **Optional:** `/health`, `/_app`, `/favicon`
- **Required:** `/admin`, `/api/sightings`, `/api/upload`

---

## maintenanceMode.ts

Leitet auf `/maintenance` um wenn in DB aktiviert. **Bypass:** Admin-Routes + API-Routes funktionieren immer.

---

## rateLimit.ts

In-Memory Rate Limiting mit automatischem Cleanup (10min).

| Limit        | Anonym | Authentifiziert |
| ------------ | ------ | --------------- |
| File Upload  | 20/h   | 50/h            |
| Media Access | 30/min | 100/min         |

**Identifier:** `user:{sub}` oder `ip:{clientIp}`
**Headers:** `X-RateLimit-{Limit,Remaining,Reset,Window}`

**Deployment-Kontext:** Der Zähler liegt im Prozess-Speicher. Das ist für das
**Single-Container-Docker-Deployment** (Prod) korrekt und wirksam. Voraussetzung: Der
adapter-node muss hinter dem Reverse Proxy die echte Client-IP kennen — dafür sind
`ADDRESS_HEADER`/`XFF_DEPTH` gesetzt (siehe docs/ENVIRONMENT.md). Bei horizontaler Skalierung
(mehrere Replicas) wäre ein gemeinsamer Store (Redis/Postgres) nötig — aktuell nicht der Fall.

---

## securityHeaders.ts

```typescript
createSecurityHeadersHandler(nodeEnv: string): Handle
```

Setzt: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `CORP`, `HSTS`.
Dev-CORS nur wenn `nodeEnv === 'development'`.

**Hinweis:** CSP wird in `sveltekit.options.ts` konfiguriert, nicht hier.

---

## Best Practices

- Neue Middleware immer in `sequence()` an korrekter Position einfügen
- Auth-Fehler loggen + Cookie clearen (nicht werfen)
- Rate Limit Identifier können bei gleicher IP kollidieren
- HSTS nur für HTTPS-Requests gesetzt
