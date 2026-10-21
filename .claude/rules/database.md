---
paths:
  - 'src/lib/server/db/**'
  - 'drizzle.config.ts'
  - 'src/lib/server/geo/**'
  # API-Routen bleiben bewusst drin: 14 Endpunkte importieren den `db`-Client
  # direkt und 23 das Schema, schreiben dort also echte Drizzle-Queries.
  - 'src/routes/api/**'
---

# Datenbank & Drizzle ORM

Regeln für PostgreSQL, PostGIS und Drizzle ORM.

---

## Befehle

```bash
npm run db:start    # PostgreSQL starten (Docker, Port 5433)
npm run db:stop     # Datenbank stoppen
npm run db:push     # Schema direkt auf lokale Dev-DB pushen (nur Entwicklung!)
npm run db:generate # Migration aus Schema-Änderung generieren (drizzle-kit generate)
npm run db:migrate  # Migrationen anwenden (scripts/docker-migrate.ts, wie im Container; liest .env, gesetzte Umgebung hat Vorrang)
npm run db:studio   # Drizzle Studio öffnen
```

> **Migrations-Strategie (seit 2026-07-28):** Deployte Umgebungen werden
> ausschließlich über **generierte Migrationen** aktualisiert: Nach jeder
> Schema-Änderung `npm run db:generate` ausführen und die neue SQL-Datei in
> `drizzle/` **mit committen** (wird im PR reviewt). Der Container wendet die
> Migrationen beim Start automatisch an (`scripts/docker-migrate.ts`: Advisory
> Lock, Baseline-Erkennung für alte push-DBs, Verweigerung destruktiver
> Statements ohne `ALLOW_DESTRUCTIVE_MIGRATIONS=true`).
> `db:push` bleibt nur für schnelle Iteration auf der lokalen Dev-DB —
> **eine Schema-Änderung ohne zugehörige Migrationsdatei darf nicht gemergt
> werden.** Das erzwingt die CI (`migration-check` in `.github/workflows/ci.yml`):
> Der Job schlägt fehl, wenn ein PR `schema.ts` oder `drizzle.config.ts` ändert,
> ohne eine Migration unter `drizzle/` zu committen, und verifiziert zusätzlich
> per `drizzle-kit generate`, dass die committeten Migrationen das Schema
> vollständig abdecken.

> **ACHTUNG — `db:push` erkennt keine Änderungen an Ausdrucksindizes.** Verifiziert
> am 2026-07-28: Nach einer Änderung des Datumsausdrucks in `idx_position_date_weather`
> und `idx_year_sichtungen` enthielt der Push-Plan keine der beiden Anweisungen.
> Der alte Index bleibt bestehen — die Abfrage wird dadurch nicht falsch, verliert
> aber still ihre Index-Unterstützung für das geänderte Prädikat.
>
> Für **deployte Umgebungen** ist das seit der Migrations-Umstellung gelöst:
> `npm run db:generate` erfasst Ausdrucksindizes vollständig (verifiziert in
> `drizzle/0000_initial.sql`) — bei Index-Änderungen also immer eine Migration
> generieren. Nur für **lokale Dev-DBs**, die per `db:push` gepflegt werden,
> müssen geänderte Ausdrucksindizes manuell nachgezogen werden (z. B. per
> DDL-Skript unter `scripts/migrations/`).
>
> Prüfen lässt sich der Ist-Zustand mit:
>
> ```sql
> SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sichtungen';
> ```
>
> **Warum diese Ausdrücke überhaupt existieren:** Die Zeitstempelspalten sind
> UTC, aber Kalenderfragen (Tag/Monat/Jahr) sind fachlich immer Berlin-Ortszeit
> gemeint — der Ausdruck rechnet das bei jeder Abfrage um, statt eine zweite
> Spalte zu pflegen. Der SQL-Text muss dabei **zeichengleich** mit
> `berlinCalendarDate`/`berlinDatePart` aus `src/lib/server/db/sqlTimeZone.ts`
> sein, sonst greift der Index nicht. Zentrale Referenz für die
> Zeitzonen-Konvention: `docs/ENVIRONMENT.md`, Abschnitt `TZ`.

---

## Verbindung

**Entwicklung:** Nutze lokale DB aus `.env`

| Option            | Port | Verbindung                                                          |
| ----------------- | ---- | ------------------------------------------------------------------- |
| Native PostgreSQL | 5432 | `postgresql://ostsee_app:ostsee_dev_password@localhost:5432/ostsee` |
| Docker PostgreSQL | 5433 | `postgresql://root:mysecretpassword@localhost:5433/local`           |

---

## Lazy Initialization

Die DB-Verbindung nutzt Lazy Initialization via Proxy (`src/lib/server/db/index.ts`):

```typescript
// Verbindung wird erst bei erstem Zugriff hergestellt
import { db } from '#lib/server/db/index.ts';

// Vorteile:
// - E2E Tests laufen ohne DB
// - Race Condition Schutz
// - Deferred Connection
```

---

## Schema

### Haupt-Tabelle: sichtungen

```typescript
export const sightings = pgTable('sichtungen', {
	id: bigint({ mode: 'number' }).primaryKey().notNull(),

	// Geografische Daten (PostGIS)
	latitude: numeric('gps_breite', { precision: 8, scale: 6 }),
	longitude: numeric('gps_laenge', { precision: 8, scale: 6 }),
	location: geometry('location', { type: 'point', srid: 4326 }),

	// Metadaten
	sightingDate: timestamp('sichtungsdatum', { mode: 'date' }).notNull(),
	species: smallint('tierart').default(0).notNull(),
	totalCount: integer('anzahl_gesamt').default(0).notNull(),
	juvenileCount: integer('anzahl_jung').default(0).notNull(),

	// Status
	approvedAt: timestamp('freigegeben_am', { mode: 'date' }),
	verified: integer('geprueft').default(0).notNull(),
	created: timestamp('created', { mode: 'date' }).notNull(),

	// Wetterdaten (JSONB)
	weatherData: jsonb('weather_data')
	// ... 50+ weitere Felder (siehe schema.ts)
});
```

**Hinweis:** DB-Spalten nutzen deutsche Legacy-Namen (`gps_breite`, `sichtungsdatum`, `anzahl_gesamt`). Drizzle mappt diese auf englische TypeScript-Properties.

### Datei-Tabelle mit JSONB

```typescript
export const sightingFiles = pgTable('sichtungen_dateien', {
	id: serial().primaryKey().notNull(),
	uid: varchar('uid', { length: 64 }).notNull(),
	sightingId: bigint('sichtung_id', { mode: 'number' }).references(() => sightings.id, {
		onDelete: 'cascade'
	}),
	referenceId: varchar('referenz_id', { length: 64 }).notNull(),
	originalName: varchar('original_name', { length: 255 }).notNull(),
	fileName: varchar('datei_name', { length: 255 }).notNull(),
	filePath: varchar('datei_pfad', { length: 500 }).notNull(),
	mimeType: varchar('mime_typ', { length: 100 }).notNull(),
	size: bigint({ mode: 'number' }).notNull(),
	url: varchar('url', { length: 1000 }),
	exifData: jsonb('exif_daten') // EXIF-Metadaten als JSONB
	// ...
});
```

---

## Repository Pattern

Alle DB-Operationen via Repository (`src/lib/server/db/sightingRepository.ts`):

```typescript
// Sichtung speichern (Hauptfunktion)
export const saveSighting = async (
	formData: SightingFormValues,
	weatherData?: StoredWeatherData
): Promise<{ id: number | undefined }> => {
	const sightingData: NewSighting = mapFormToSighting(formData);
	// ... transaktionale Speicherung mit Mediendateien
};
```

**Hinweis:** `mapFormToSighting()` in `mapFormToSighting.ts` konvertiert Formulardaten → DB-Schema (PostGIS Point, Datum-Kombination, Ostsee-Validierung).

---

## `ostsee` und `ostsee_geo` — die Namen sind vertauscht

Zwei Spalten in `sichtungen` bedeuten scheinbar dasselbe. Sie tun es nicht, und ihre
Namen legen die Bedeutungen **verkehrt herum** nahe:

| Spalte       | Drizzle          | Prüfung                                      |
| ------------ | ---------------- | -------------------------------------------- |
| `ostsee`     | `inBalticSea`    | exaktes Ostsee-Polygon — **streng**          |
| `ostsee_geo` | `inBalticSeaGeo` | Bounding Box `BALTIC_SEA_BBOX` — **schwach** |

Das „geo" sitzt an der _groben_ Prüfung. Deren Rechteck umfasst Jütland, Schonen,
Nordostdeutschland, Polen und das Baltikum. Die Kanten stehen in
`BALTIC_SEA_BBOX` (`#lib/utils/geo/checkBalticSea`) und werden seit dem
2026-07-30 aus der Geometrie abgeleitet — hier bewusst keine Zahlen, sie würden
veralten.
Fachliche Aussagen („liegt in der Ostsee") gehören deshalb ausschließlich auf
`ostsee`.

`ostsee_geo` ist `integer` und hat **drei** Werte: `0` = keine Position im
Kartenbereich, `1` = drin, `2` = drin (nur Altsystem, 15.208 Zeilen, endet
2025-11-09). Der Unterschied zwischen 1 und 2 ist aus den Daten nicht
rekonstruierbar. **Immer `> 0` prüfen, nie `= 1`** — sonst fallen 79 % des
Bestands lautlos heraus, genau so ist die entfernte `geographicStats`-Abfrage
entstanden.

Diese Erläuterung steht hier und **nicht als Kommentar an den Spalten**: Der
CI-Job `migration-check` verlangt bei jeder Änderung an `schema.ts` eine
Migration unter `drizzle/` — rein pfadbasiert, auch bei reinen Kommentaren, für
die `db:generate` erwartungsgemäß „No schema changes" meldet. Diese Regeldatei
lädt über `paths` bei jeder Datei unter `src/lib/server/db/**` und ist damit beim
Bearbeiten des Schemas ohnehin im Kontext.

Vollständige Referenz mit Messwerten und verworfenen Hypothesen zur `2`:
`docs/OSTSEE_FLAGS.md`. Die Geometrie-Bereinigung vom 2026-07-30 samt Migration:
`docs/archive/OSTSEE_GEOMETRIE_SPEC_2026-07-30.md`

---

## Prüfstatus in Auswertungen — immer explizit

Der Prüfstatus selbst ist in `.claude/rules/api.md` geregelt: **genau zwei Zustände**
(ungeprüft / geprüft), geprüft heißt veröffentlicht, `approvedAt IS NOT NULL` ist die
öffentliche Grundmenge. Hier steht nur, was daraus für **Auswertungen** folgt.

Die Statistiken filterten lange nach **gar keinem** Status, die öffentliche Karte dagegen
schon — Karte und Zahlentext widersprachen sich sichtbar (19.262 vs. 19.877).

Vorgabe des Meeresmuseums: Im öffentlichen Bereich zählen nur geprüfte Sichtungen. In der
Admin-Statistik dürfen ungeprüfte vorkommen, aber **niemals mit geprüften zu einer Zahl
vermischt** — getrennt ausweisen („19.262 geprüft / 615 offen").

`approvedOnly()` und `pendingOnly()` bilden genau diese zwei Zustände ab; ein dritter
Scope wäre ein Widerspruch zur Regel in `api.md` und darf nicht entstehen.

```typescript
import { approvedOnly, pendingOnly, approvalFilter } from '#lib/server/db/approvalFilter.ts';

// Öffentlich: nur freigegebene
.where(approvedOnly())

// Admin: getrennte Läufe statt CASE-Aggregaten — so kann keine Summe entstehen
const [approved, pending] = await Promise.all([load('approved'), load('pending')]);
```

Wer eine neue Statistikabfrage ergänzt, muss den Status explizit setzen. `sichtungen_dateien`
kennt die Spalte nicht — dort ist ein Join auf `sichtungen` nötig. Der Epoch-Ausschluss
(`EARLIEST_PLAUSIBLE_SIGHTING_DATE`) gilt zusätzlich, nicht statt dessen.
Abgesichert durch `src/lib/server/db/statisticsApprovalScope.test.ts`.

Wird der Status nicht in SQL, sondern über einer **bereits geladenen Zeile** ausgewertet,
gilt `isSightingApproved(sighting)` aus demselben Modul — nicht ein neues `!!row.approvedAt`.
Die beiden Medien-Endpunkte (`/uploads/[...path]`, `/api/media/[...path]`) entscheiden damit,
ob eine Datei ohne Anmeldung ausgeliefert wird, `PATCH /api/sightings/[id]/verify` hält damit
den Vorzustand im Audit-Log fest. `approvalFilter.test.ts` prüft beides: dass beide
Schreibweisen dieselbe Grundmenge meinen, und dass die drei Routen keine der bekannten
Inline-Schreibweisen zurückbekommen.

Dass beide Formen **nur** dort stehen, prüft `src/lib/server/db/approvalPredicateScan.test.ts`
mechanisch über den gesamten Quelltext unter `src/`: das SQL-Prädikat
(`freigegeben_am`/`approvedAt` mit `IS [NOT] NULL`, `IS [NOT] DISTINCT FROM NULL` oder
`isNull(`/`isNotNull(`) und die drei eindeutigen JavaScript-Schreibweisen (`!!`, `Boolean(`,
`!== null`). `IS DISTINCT FROM NULL` steht im Muster, obwohl es im Bestand nicht vorkommt —
es ist die SQL-Standard-Schreibweise desselben Tests, und „gibt es hier nicht" hat schon
mehrfach eine Lücke offengehalten. Er ergänzt damit den
Routen-Guard in `approvalFilter.test.ts`, dessen Liste die drei heute bekannten Endpunkte
nennt — eine **vierte** Route fiele nur dem Scan auf. Nötig wurde er, weil die vorige
Kontrolle — „ein fehlender Import fällt beim Review auf" — bei
`/sichtungen/showreports.json` monatelang versagt hat (PR #701).

---

## PostGIS Patterns

### Point erstellen

```typescript
sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
```

### Distanz berechnen

```typescript
sql`ST_Distance(
    location::geography,
    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
)`;
```

### GeoJSON exportieren

```typescript
sql`ST_AsGeoJSON(location)`;
```

### Ostsee-Bounding-Box prüfen

```typescript
// Vor dem Speichern Baltic Sea Grenzen validieren
import { checkBalticSeaFile } from '#lib/server/geo/checkBalticSeaFile.ts';

if (!checkBalticSeaFile(lng, lat).inBaltic) {
	throw new Error('Position außerhalb der Ostsee');
}
```

---

## JSONB Best Practices

```typescript
// Typisiertes JSONB (Beispiel: weatherData in sightings)
weatherData: jsonb('weather_data')
	// Query in JSONB
	.where(sql`weather_data->>'provider' = 'open-meteo'`)

	// JSONB Merge-Update
	.set({
		weatherData: sql`weather_data || ${JSON.stringify({ refreshed: true })}`
	});
```

**Vorhandene JSONB-Felder:** `sightings.weatherData`, `sightingFiles.exifData`, `appConfig.value`

---

## Transaktionen

```typescript
await db.transaction(async (tx) => {
	const [sighting] = await tx.insert(sightings).values(sightingData).returning();

	await tx.insert(sightingFiles).values(files.map((f) => ({ sightingId: sighting.id, ...f })));
});
```

---

## Best Practices

### Do's

- Repository Pattern für alle DB-Operationen
- Transaktionen für Multi-Table Operations
- Indexes für häufig abgefragte Felder
- Schema-Änderungen versioniert halten

### Don'ts

- Keine Raw SQL ohne Parametrisierung
- Keine DB-Operationen in Komponenten
- Keine Secrets in Code committen
