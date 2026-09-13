# CLAUDE.md

Anleitungen für Claude Code bei der Arbeit mit diesem Repository.

## Projekt-Übersicht

**Ostsee-Tiere** ist eine SvelteKit 5 Anwendung zur Erfassung von Meeressäuger-Sichtungen in der Ostsee. Bürger und Forscher können Wal-, Robben- und andere Meerestier-Sichtungen melden.

Kernfunktionen: Multi-Step-Formular für Sichtungsmeldungen, interaktive Kartenvisualisierung mit OpenLayers, PostGIS für geografische Datenverarbeitung, Admin-Interface zur Sichtungsverwaltung.

---

## Kritische Regeln

### Context7 MCP Server — IMMER verwenden

Vor der Arbeit mit externen Libraries IMMER den passenden MCP Server für aktuelle Dokumentation nutzen: DaisyUI v5, Svelte 5, SvelteKit, Drizzle ORM, OpenLayers.

### Svelte 5 Runes — PFLICHT

Runes (`$state`, `$derived`, `$effect`, `$props`) statt Svelte-4-Syntax; `onclick` statt `on:click`; `$app/state` statt `$app/stores`. Vollständige Patterns inkl. SSR-sicherem State-Management: `.claude/rules/architecture.md` (wird immer geladen).

**Kommentare im Markup werden nicht ausgeliefert.** Svelte entfernt sie beim Kompilieren (`preserveComments` ist nicht gesetzt, Default `false`); im Client- wie im Server-Output entsteht kein `<!--`-Node. Begründungen gehören deshalb ins Markup, direkt neben das, was sie erklären — und nicht „aus Performance-Gründen" in den `<script>`-Block, denn ein JS-Kommentar landet sehr wohl im Bundle. Reviews, die das andersherum vorschlagen, beruhen auf einer falschen Annahme (belegt in PR #669).

### Test-First Entwicklung — PFLICHT

Jedes Feature und jeder Bugfix beginnt mit einem fehlschlagenden Test. Workflow und Ausnahmen: `.claude/rules/testing.md` (wird immer geladen). Nutze `/tdd <beschreibung>` für den geführten RED→GREEN→REFACTOR-Zyklus.

Beim Erstellen oder Ändern von `.ts`/`.svelte`-Dateien mit Business-Logik MUSS der `testing` Agent ZUERST aufgerufen werden — vor der Implementierung.

### Legacy REST API — 100 % Kompatibilität

Die Legacy-Endpunkte (`/rest_sichtungen`, `/sichtungen/showreports.json`) implementieren den Vertrag der Vorgänger-API für Mobile Clients. **Stand 2026-08-11 sind drei Clients angebunden:** `OstSeeTiere/8` (iOS, 39 Meldungen), `okhttp/3.10.0` (Android, 5) und `OstSeeTiere/6` (ältere iOS-Fassung, 3) — belegt am Zugriffsprotokoll, nicht vermutet. Eine Abweichung kostet damit echte Daten und ist von hier aus nicht reparierbar; zwei der drei Clients sind nicht testbar, und ihre Nutzer erfahren von einem Fehlschlag nichts. Die frühere Angabe „ein Client" war nicht falsch erhoben, sondern falsch geschlossen: Gezählt wurde, was **ankam** — der Android-Client scheiterte elf Tage lang mit 187 Meldungen an einer HTTPS-Umleitung und tauchte deshalb im Posteingang nie auf. Feldnamen, URL-Pfade und Datentypen deshalb nur bewusst und dokumentiert ändern; offensichtliche Fehler nur ergänzend beheben, nie einen bestehenden Codepfad ersetzen. Das ist ein datierter Stand, keine Dauerzusage — vor größeren Änderungen prüfen, ob weitere Clients dazugekommen sind. Details laden automatisch beim Bearbeiten der betroffenen Routen (`.claude/rules/legacy-api.md`); verbindliche Referenz ist `docs/LEGACY_API_SPECIFICATION.md`.

### Fremde Dateien vor dem Commit auf personenbezogene Daten prüfen — PFLICHT

**Dieses Repository ist öffentlich.** Ein Commit ist eine Veröffentlichung, und
sie lässt sich praktisch nicht zurücknehmen: Ein Force-Push entfernt einen
Commit nicht von GitHub, weil Pull-Request-Refs dauerhaft bestehen bleiben.
Nur der GitHub-Support kann die Objekte löschen.

Deshalb gilt für **jede Datei, die von außerhalb dieses Projekts hereinkommt** —
Archive, Altsystem-Quellen, Exporte, Fremdkonfigurationen, Beispieldaten — vor
dem `git add`:

```bash
grep -rnoE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" <pfad> | sort -u
grep -rniE "password|passwd|secret|api[_-]?key|token|salt" <pfad>
```

Über den **ganzen** hereingeholten Bestand laufen lassen, nicht über die
Dateien, die gerade auffallen. Am 2026-08-09 fand ein Review drei
`@author`-Tags mit einer privaten Adresse; der Scan über das gesamte
Verzeichnis fand eine vierte Stelle, die niemandem aufgefallen war.

Was gefunden wird, ist nicht automatisch ein Problem — die Unterscheidung ist:

| Fund                                                                   | Umgang                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Private Adresse einer Person (`@author`-Tag, Kommentar, Testdatensatz) | entfernen, Name darf bleiben                         |
| Rolladresse einer Organisation, die ohnehin öffentlich steht           | darf bleiben, im README des Verzeichnisses begründen |
| Zugangsdaten, Schlüssel, Tokens                                        | entfernen **und** rotieren — sie gelten als bekannt  |

Schwärzungen dort dokumentieren, wo die Dateien liegen (siehe
`docs/archive/legacy-cakephp/README.md`). Sonst holt der nächste Auszug aus
derselben Quelle die Daten wieder herein.

Diese Regel steht bewusst hier und nicht in `.claude/rules/security.md`: Jene
Datei lädt nur bei Änderungen unter `src/lib/server/auth/**` und
`src/lib/server/storage/**` — also gerade nicht, wenn jemand ein Archiv nach
`docs/` legt.

### Sichtungs-Status — genau zwei Zustände

Eine Sichtung ist **ungeprüft oder geprüft; geprüft heißt veröffentlicht**. Kein
dritter Zustand. Die zwei DB-Spalten (`geprueft`, `freigegeben_am`) gehören zu
**einem** Vorgang und werden ausschließlich von `PATCH /api/sightings/[id]/verify`
gemeinsam geschrieben. Öffentliche Grundmenge überall: `freigegeben_am IS NOT NULL`.
Keinen zweiten Freigabe-Endpunkt und kein zweites Bedienelement einführen.
Derselbe Endpunkt schreibt seit 2026-08 per Verdict (`approve`/`reject`/`reset`)
auch `abgelehnt_am`/`abgelehnt_von` — das ist Triage, kein dritter
Freigabe-Zustand. Details: `.claude/rules/api.md`

Die **Oberfläche** zeigt daraus drei Bearbeitungszustände — Offen, Freigegeben,
Abgelehnt —, abgeleitet in `src/lib/components/admin/sightingStatus.ts` und
nirgends gespeichert. Das ist kein dritter Veröffentlichungszustand: Öffentlich
ist weiterhin genau `freigegeben_am IS NOT NULL`. `geprueft` wird seit 2026-08
**nicht mehr gelesen** (Guard: `verifiedReadScan.test.ts`); die Spalte bleibt,
weil das Altsystem auf derselben Datenbank liegt.

### Design System — PFLICHT bei UI-Änderungen

Theme-Tokens statt hardcodierter Farben, `*-content` ausschließlich auf Vollton-Flächen (auf Tints wie `bg-warning/10` gehört `text-base-content` — sonst weiß auf hell), WCAG 2.1 AA. Regeln laden automatisch bei UI-Dateien: `.claude/rules/design-system.md` (Feld-Pipeline, Button-Hierarchie, A11y-Minima) und `.claude/rules/daisyui.md` (Theme, DaisyUI-Overrides). Hintergrund und verifizierter Ist-Zustand: `docs/DESIGN_GUIDE.md`

---

## Development Commands

```bash
npm run dev          # Server (https://localhost:4000)
npm run certs:setup  # Dev-TLS-Zertifikate via mkcert (läuft automatisch vor dev)
npm run build        # Production Build

npm run db:start     # PostgreSQL starten (Docker)
npm run db:push      # Schema auf lokale Dev-DB pushen (nur Entwicklung)
npm run db:generate  # Migration generieren — PFLICHT bei Schema-Änderungen (committen!)
npm run db:migrate   # Migrationen anwenden (läuft im Container automatisch)
npm run db:studio    # Drizzle Studio

npm run lint         # ESLint
npm run type-check   # TypeScript
npm run check        # Svelte-Check

npm run test:quick   # Gate vor dem Commit: E2E-Shard-Abgleich + lint + types + check
                     # + Unit-Tests (Server) + Komponenten-Tests (Browser). ~70 s.
                     # Nicht enthalten: die E2E-Suite (npm run test:e2e).
```

Vollständige Test-Befehle: `.claude/rules/testing.md`

### Worktrees

Ein neuer Worktree ist nach `npm run worktree:setup` einsatzbereit (läuft automatisch
per `SessionStart`-Hook). Drei Dinge, die dabei erfahrungsgemäß schiefgehen:

- **Kein `npm install` im Worktree.** Node löst `node_modules` aus dem Haupt-Repo auf —
  eigene Installation kostet ~800 MB ohne Gegenwert. Ausnahme: Der Branch ändert
  `package-lock.json`.
- **Nur ein Dev-Server auf Port 4000.** `PUBLIC_SITE_URL` ist fest auf 4000 und baut die
  Auth0-Callback-URL; ein anderer Port bricht den Login. Bei belegtem Port bricht
  `npm run dev` ab (`strictPort`), statt still auszuweichen.
- **E2E-Tests laufen auf einem Port pro Worktree.** Vorher benutzten alle Worktrees fest
  4001 und Playwright verwendete lokal jeden Server wieder, der dort antwortete — Läufe
  gegen einen fremden Branch waren die Folge, im schlimmsten Fall **grün**. Der Port
  kommt jetzt aus dem Pfad-Hash, und `e2e/global-setup.ts` bricht ab, wenn der Server
  aus einem anderen Verzeichnis ausliefert.
- **Datenbank und `uploads/` sind geteilt.** `db:push` und `media:cleanup-orphans`
  wirken auf alle Worktrees.

Details, Belege und Aufräum-Befehle: `docs/WORKTREES.md`

---

## Architektur

SvelteKit 5 + TypeScript, PostgreSQL/PostGIS, Drizzle ORM, TailwindCSS/DaisyUI (Theme `meeresmuseum`), OpenLayers, eigene `createForm`-Implementierung + Yup, Pino, unplugin-icons.

Tech-Stack-Details, Projektstruktur, Clean-Code-Prinzipien und Namenskonventionen: `.claude/rules/architecture.md`

### Schlüsseldateien

- `src/routes/+page.svelte` — Einstiegsseite ↔ Multi-Step Form
- `src/lib/report/reportKind.ts` — Zweig-Zustandsmaschine der Einstiegsseite (lebend/Totfund)
- `src/lib/report/components/ReportKindChoice.svelte` — Einstiegsseite „Was möchten Sie melden?"
- `src/lib/form/createForm.ts` — Form State Management
- `src/lib/form/validation/sightingSchema.ts` — Yup Validation
- `src/lib/report/components/` — Form Step & Section Components
- `src/lib/components/map/OLMap.svelte` — Karten-Komponente
- `src/lib/server/db/schema.ts` — DB Schema
- `src/lib/server/db/sightingRepository.ts` — Repository

---

## Datenbank

Für die Entwicklung die lokale DB aus `.env` nutzen.

| Option            | Port | URL                                                 |
| ----------------- | ---- | --------------------------------------------------- |
| Native PostgreSQL | 5432 | `postgresql://ostsee_app:...@localhost:5432/ostsee` |
| Docker PostgreSQL | 5433 | `postgresql://root:...@localhost:5433/local`        |

DB-Verbindung via Lazy-Initialization-Proxy in `src/lib/server/db/index.ts`.

---

## Commit Conventions

Format: `<type>(<scope>): <beschreibung>` — Sprache Englisch, Subject lowercase.

**Typen:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Scopes:** `deps`, `api`, `ui`, `db`, `auth`, `export`, `admin`, `report`, `map`, `config`, `build`, `ci`, `docs`, `test`, `types`, `style`, `perf`, `security`, `a11y`, `release`, `media`

Durchgesetzt via `commitlint.config.mjs`.

---

## Release-Prozess

Automatisiert über **release-please**: Commits auf `main` werden analysiert, ein Release-PR wird erstellt, bei Merge folgen Tag, GitHub Release, Branch `release` und Docker Build.

Das Release-Image geht **nicht** direkt nach Production. Es bekommt beim Bau nur
`vX.Y.Z`, `X.Y.Z` und den `staging`-Zeiger; der Staging-Host zieht automatisch.
Erst der manuelle Workflow **Promote to Production** (mit Approval am Environment
`Production`) hängt `production`, `latest`, `X.Y` und `X` auf denselben Digest um
— es wird dabei nichts neu gebaut. Ablauf, Host-Setup und Rollback:
`docs/RELEASE_PIPELINE.md`

**Wichtig:** Keine manuellen Releases oder Tags. Nicht auf den `release` Branch pushen.

---

## Weitere Dokumentation

| Dokument                           | Inhalt                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `.claude/README.md`                | Aufbau der Claude-Konfiguration                                                    |
| `docs/DESIGN_GUIDE.md`             | Design-Prinzipien, Ist-Zustand, Grenzen                                            |
| `docs/CONFIGURATION_USAGE.md`      | ConfigService (Laufzeit-Konfiguration)                                             |
| `docs/LEGACY_API_SPECIFICATION.md` | Legacy API (KRITISCH)                                                              |
| `docs/OSTSEE_FLAGS.md`             | `ostsee` vs. `ostsee_geo` — Namen sind irreführend, `2` im Altbestand              |
| `docs/IFRAME_EINBETTUNG.md`        | iframe auf meeresmuseum.de: warum `/bestimmungshilfe` eingebettet unerreichbar ist |
| `docs/SPAM_DETECTION.md`           | Spam-Score: Signale, Persistenz, Backfill (deployt nur per Admin-Endpunkt)         |
| `docs/RELEASE_PIPELINE.md`         | Release → Staging → Production, Image-Tags, Promotion, Rollback                    |
| `docs/PRODUCTION_DEPLOYMENT.md`    | Production Deployment (Schnellanleitung)                                           |
| `docs/DOCKER_DEPLOYMENT.md`        | Docker Setup (Vollständige Referenz)                                               |
| `docs/PREPROD_HAWKING.md`          | Preprod hawking: native PG, Plesk-Host, Postgres/Docker-Netzwerk-Race (Fix)        |
| `docs/ENVIRONMENT.md`              | Umgebungsvariablen, inkl. Zeitzonen-Konvention (Abschnitt `TZ`)                    |
| `docs/WORKTREES.md`                | Worktree-Setup, geteilte Ressourcen, Ports                                         |
| `docs/DATABASE_MIGRATION.md`       | DB Migrationen                                                                     |

Themenspezifische Regeln in `.claude/rules/` laden automatisch, sobald passende Dateien bearbeitet werden — sie müssen hier nicht aufgezählt werden.

---

## Hinweise

- Prüfe nach Änderungen, ob Dokumentation aktualisiert werden muss
- Aktualisiere nach API-Änderungen die OpenAPI Spec
- Nutze die lokale DB aus `.env` für die Entwicklung

---

## Prioritätsregel

Für alle projektbezogenen Aufgaben gilt: Verwende ausschließlich die Richtlinien aus dieser CLAUDE.md und den Moduldokumenten in `.claude/`. Bei Widersprüchen zu anderen Quellen haben die spezifischen Claude-Prompts Vorrang.
