---
paths:
  - 'src/routes/api/**'
  - 'src/routes/rest_sichtungen/**'
  - 'src/routes/sichtungen/**'
  - 'src/routes/health/**'
  - 'docs/LEGACY_API_SPECIFICATION.md'
  - 'static/openapi.yml'
---

# REST API & Legacy Kompatibilität

Regeln für API-Entwicklung, insbesondere Legacy API.

---

## API Struktur

```
src/routes/
├── rest_sichtungen/     # Legacy REST API (KRITISCH) — /rest_sichtungen
├── sichtungen/          # Legacy Sichtungs-API — /sichtungen
└── api/
    ├── sightings/       # Moderne API
    ├── files/           # Datei-Upload
    └── admin/           # Admin API
```

---

## Prüfstatus einer Sichtung — verbindlich

**Eine Sichtung kennt genau zwei Zustände: ungeprüft und geprüft. Geprüft heißt
veröffentlicht.** Einen dritten Zustand „geprüft, aber nicht freigegeben" gibt es
fachlich nicht und er darf nicht eingeführt werden.

Die Datenbank führt aus historischen Gründen zwei Spalten. Sie sind **kein**
Ausdruck zweier Arbeitsschritte, sondern zwei Felder desselben Vorgangs:

| Spalte           | Drizzle      | Rolle                                        |
| ---------------- | ------------ | -------------------------------------------- |
| `geprueft`       | `verified`   | Kennzeichen 0/1                              |
| `freigegeben_am` | `approvedAt` | Zeitpunkt der Prüfung, `null` wenn ungeprüft |

### Daraus folgende Regeln

- **Ein Endpunkt** schreibt diese Spalten: `PATCH /api/sightings/[id]/verify`.
  Er setzt beide immer gemeinsam in **einem** `db.update(...).set(...)`.
  Es gibt bewusst keinen zweiten Endpunkt dafür — ein früherer
  `/api/sightings/[id]/approve` wurde 2026-07 ersatzlos entfernt.
- **Alle Bedienelemente rufen denselben Verify-Endpunkt.** Es sind drei:
  das Status-Control in der Tabelle (`/admin/sichtungen`), dasselbe Control in
  der Detailansicht (`/admin/[id]`) und die Verdict-Aktionen der Eingangsseite
  (Freigeben/Ablehnen/Rückgängig). Der frühere Satz „Die Detailansicht zeigt
  den Status nur an und ändert ihn nicht" gilt seit 2026-08 nicht mehr. Die
  **Bearbeitungsmaske** (`/admin/[id]/edit`) zeigt den abgeleiteten Status
  seit Task 8 ebenfalls an, bleibt aber weiterhin reines Anzeigefeld — kein
  vierter Ort mit eigenem Bedienelement.
- **Öffentliche Grundmenge ist `approvedAt IS NOT NULL`** — sowohl in der
  Legacy-API (`/sichtungen/showreports.json`) als auch auf der modernen Karte
  (`/api/map/sightings`). Nicht auf `verified` filtern: die Legacy-API ist an
  `freigegeben_am` vertraglich gebunden, und zwei verschiedene Spalten als Filter
  für zwei öffentliche Flächen laufen zwangsläufig auseinander.

### Der Statusfilter der Karte ist die eine Ausnahme — und keine am Grundsatz

Seit 2026-08 nehmen `GET /api/map/sightings` und `GET /api/map/sightings/years`
einen optionalen Parameter `status` (`open`, `approved`, `rejected`,
kommasepariert). **Ohne den Parameter ist die Antwort unverändert die
öffentliche Grundmenge** — gleiche Bedingungen, gleiche Header, gleiche Form.

Der Satz oben gilt also weiter für alles, was ohne Anmeldung erreichbar ist. Was
hinzukommt, ist eine **angemeldete** Sicht: Jeder gesendete Wert verlangt eine
Admin-Session, sonst `403` — und zwar auch `status=approved`. Geprüft wird, _ob_
gefiltert werden darf, nicht _was_ angefragt wurde; die Unterscheidung nach Wert
erzeugte einen zweiten, stillen Codepfad durch die Autorisierung.

Drei Punkte, die beim Anfassen leicht verloren gehen:

- **Beide Routen teilen `mapSightingConditions(statuses)`** (`publicMapConditions.ts`).
  Zählen Feature- und Jahres-Endpunkt verschiedene Mengen, zeigt das
  Jahres-Dropdown Zahlen, die auf der Karte fehlen.
- **Die Prädikate kommen aus `approvalFilter.ts`** (`approvedOnly`, `openOnly`,
  `rejectedOnly`) — es entsteht kein neues Freigabe-Prädikat, und der Scan in
  `approvalPredicateScan.test.ts` bleibt scharf.
- **Antworten mit nicht freigegebenen Daten tragen `Cache-Control: private, no-store`**,
  beide Endpunkte zusätzlich `Vary: Cookie` — dieselbe Vorsorge wie in
  `showreports.json`, wo der Kommentar das Membership-Orakel benennt.

Es entsteht dabei **kein dritter Veröffentlichungszustand**: Die drei Werte sind
die abgeleiteten Bearbeitungszustände aus
`src/lib/components/admin/sightingStatus.ts`, gespeichert wird nichts Neues.

### Hintergrund

Bis 2025-11 pflegte das Altsystem (schweinswalsichtung.de, gleiche Datenbank)
beide Spalten mit einem einzigen Bedienelement. In 19.262 Freigaben über 13 Jahre
gibt es **keinen einzigen** Datensatz, der geprüft, aber nicht freigegeben ist.
Beim Neubau entstand kurzzeitig je ein Endpunkt pro Spalte — eine mechanische
Abbildung der Tabelle, die den Fachprozess falsch modellierte und dazu führte,
dass die Admin-UI nur noch `geprueft` schrieb und damit nichts mehr veröffentlichte.

### Triage „abgelehnt" (seit 2026-08)

Zusätzlich zur Prüfung gibt es die Triage-Entscheidung **abgelehnt** =
gesichtet und bewusst nicht veröffentlicht (Spam, Testeintrag, unplausibel).
Sie ist **kein dritter Freigabe-Zustand**: `abgelehnt_am`/`abgelehnt_von`
(Drizzle `rejectedAt`/`rejectedBy`) sind nie gleichzeitig mit `freigegeben_am`
gesetzt, und die öffentliche Grundmenge bleibt unverändert
`freigegeben_am IS NOT NULL`.

- Geschrieben werden auch diese Spalten **nur** von
  `PATCH /api/sightings/[id]/verify` (Body
  `{ verdict: 'approve' | 'reject' | 'reset' }`; der alte Body
  `{ verified: 0|1 }` bleibt Alias für approve/reset). Alle Status-Spalten in
  **einem** Update.
- Grundmenge der Eingangsseite (`/admin`): `openOnly()` = weder freigegeben
  noch abgelehnt. `pendingOnly()` bedeutet weiterhin „nicht freigegeben"
  (inkl. abgelehnter) und bleibt die Gegenmenge der Statistik.

### Status-Historie (seit 2026-08)

`sichtung_status_log` hält jede über den Verify-Endpunkt getroffene Entscheidung
fest (`sichtung_id`, `verdict`, `bearbeiter`, `zeitpunkt`). Sie **ergänzt** die
Statusspalten und ersetzt sie nicht — das Altsystem liegt auf derselben
Datenbank und liest sie weiterhin.

- **Geschrieben wird sie ausschließlich von demselben Endpunkt**, in derselben
  Transaktion wie die Statusspalten. Eine Historie mit Lücke sieht vollständig
  aus und ist es nicht. Mechanisch abgesichert durch
  `src/lib/server/db/statusLogWriteScan.test.ts` — Lesen ist überall erlaubt.
- **Gelesen wird sie über `GET /api/sightings/[id]/verify`** (Feld `history`,
  aufsteigend). Sie enthält Bearbeiter-Kennungen und bleibt deshalb hinter der
  Admin-Prüfung; sie gehört nicht in `/api/sightings/[id]`.
- **Eine leere Historie ist der Normalfall des Altbestands**, kein Fehler.
  Entscheidungen vor der Einführung existieren nur als aktueller Status.

Datenschutz und Aufbewahrung sind am Tabellen-Docblock in
`src/lib/server/db/schema.ts` begründet, die Entscheidung selbst in
`docs/archive/ADMIN_IMPROVEMENTS_SPEC_2026-08-08.md` (B3).

---

## Legacy API - KRITISCH

### 100% Kompatibilität erforderlich

Die Legacy API MUSS exakt mit der Original-Spezifikation übereinstimmen.
Stand 2026-08-11 sind **drei** Clients angebunden: `OstSeeTiere/8` (iOS),
`okhttp/3.10.0` (Android) und `OstSeeTiere/6` (ältere iOS-Fassung). Alle drei
senden über `POST /rest_sichtungen`. Eine Abweichung bricht damit etwas
Laufendes und kostet echte Daten — zwei der drei sind nicht testbar. Zahlen,
Herleitung und Umgang mit offensichtlichen Fehlern: `.claude/rules/legacy-api.md`.

**Referenz:** docs/LEGACY_API_SPECIFICATION.md

### Kritische Anforderungen

| Aspekt        | Anforderung                |
| ------------- | -------------------------- |
| URL-Pfade     | Exakt wie spezifiziert     |
| Feldnamen     | Exakt wie spezifiziert     |
| Datentypen    | Strings, nicht Numbers     |
| Booleans      | 0/1, nicht true/false      |
| Datumsformate | DD.MM.YY, YYYY-MM-DD HH:MI |

### Beispiel: showreports.json

```typescript
// Korrekte Feldnamen (abgekürzt)
const response = {
	ts: timestamp,
	id: sighting.id,
	dt: formatDate(sighting.date, 'DD.MM.YY'),
	ti: sighting.time,
	lat: String(sighting.lat), // String!
	lon: String(sighting.lng), // String!
	ct: String(sighting.count),
	yo: sighting.young ? '1' : '0', // 0/1!
	sh: sighting.ship ? '1' : '0',
	na: sighting.name || '',
	ar: sighting.area || ''
};
```

### Windrichtungen

```typescript
// Alle müssen unterstützt werden
const WIND_DIRECTIONS = ['N', 'NW', 'W', 'SW', 'S', 'SO', 'O', 'NO'];
```

---

## Moderne API Patterns

### SvelteKit API Route

```typescript
// src/routes/api/sightings/+server.ts
import { json, error } from '@sveltejs/kit';
import { sightingRepository } from '#lib/server/db/sightingRepository.ts';

export async function GET({ url }) {
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '20');

	const sightings = await sightingRepository.findAll({ page, limit });

	return json({
		data: sightings,
		meta: { page, limit, total: sightings.length }
	});
}

export async function POST({ request }) {
	const data = await request.json();

	// Validation
	const validated = await sichtungSchema.validate(data);

	const sighting = await sightingRepository.create(validated);

	return json({ data: sighting }, { status: 201 });
}
```

### Error Handling

```typescript
import { error } from '@sveltejs/kit';

export async function GET({ params }) {
	const sighting = await sightingRepository.findById(params.id);

	if (!sighting) {
		throw error(404, { message: 'Sichtung nicht gefunden' });
	}

	return json({ data: sighting });
}
```

---

## Response Formate

### Erfolg

```json
{
    "data": { ... },
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 150
    }
}
```

### Fehler

```json
{
	"error": {
		"code": "VALIDATION_ERROR",
		"message": "Ungültige Koordinaten",
		"details": {
			"lat": "Muss zwischen -90 und 90 sein"
		}
	}
}
```

---

## OpenAPI Dokumentation — PFLICHT

**Bei jeder Änderung an einer API-Route MUSS `static/openapi.yml` aktualisiert werden.**

Checkliste (vor jedem Commit mit API-Änderungen):

- Neuer Endpoint → Eintrag in `paths` hinzufügen (inkl. Tags, Parameter, Request Body, Responses)
- Neues Schema → Eintrag in `components/schemas` hinzufügen
- Parameter geändert → Spec-Parameter aktualisieren
- Response-Struktur geändert → Schema aktualisieren
- Endpoint entfernt → Aus Spec löschen

YAML-Syntax nach Änderungen immer validieren:

```bash
node --input-type=commonjs -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('static/openapi.yml', 'utf8')); console.log('OK')"
```

Ergebnis in der Scalar UI prüfen: `https://localhost:4000/docs/api/scalar`

---

## CORS

CORS wird in `securityHeaders.ts` nur für Development aktiviert (`Access-Control-Allow-Origin: *`).
Legacy API Routes (`/rest_sichtungen`, `/sichtungen`) haben **kein** separates CORS-Handling.

**Hinweis:** Es gibt keine `/api/legacy` Route -- Legacy Endpoints liegen direkt unter `/rest_sichtungen/` und `/sichtungen/`.

---

## Best Practices

### Do's

- Legacy API NIEMALS ändern ohne Spec-Prüfung
- **OpenAPI Spec bei jeder API-Änderung aktualisieren** (siehe Abschnitt oben)
- Konsistente Response-Formate
- Pagination für Listen

### Don'ts

- Keine Breaking Changes in Legacy API
- Keine neuen Felder in Legacy Responses
- Keine Änderung der Datentypen
