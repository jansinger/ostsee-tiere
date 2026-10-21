---
paths:
  - 'src/lib/server/storage/**'
  - 'src/lib/server/media/**'
  - 'src/lib/server/uploads.ts'
  - 'src/routes/api/files/**'
---

# File Upload & Storage

Regeln für Datei-Upload, EXIF-Extraktion und Storage-Backends.

---

## Storage Factory (Singleton)

```typescript
// src/lib/server/storage/factory.ts
getStorageProvider(): StorageProvider
```

**Provider-Auswahl:**

1. `STORAGE_PROVIDER` Env-Variable (explizit)
2. `VERCEL` Env erkannt → `vercel-blob`
3. Development → `local`
4. Fallback → `local`

---

## StorageProvider Interface

```typescript
upload(file, buffer, options): Promise<UploadedFileInfo>
delete(filePath): Promise<void>
getUrl(filePath): string
exists(filePath): Promise<boolean>
list(prefix?): Promise<UploadedFileInfo[]>
```

**Local:** Basisverzeichnis aus `UPLOAD_PATH` (Standard `uploads`, relativ zum Arbeitsverzeichnis).
Einzige Auswertungsstelle: `src/lib/server/storage/uploadPath.ts` — Schreibpfad (`LocalStorageProvider`)
und Lesepfad (`getUploadPath()` in `#lib/server/uploads`) beziehen ihr Verzeichnis beide von dort.
Path-Traversal-Schutz via `normalize()` + `relative()`
**Vercel Blob:** Token aus `BLOB_READ_WRITE_TOKEN`, öffentliche URLs

---

## Upload API (`POST /api/files/upload`)

**FormData-Felder:** `file`, `referenceId` (CUID), `uid` (CUID)

**Validierungs-Pipeline** (Reihenfolge wie im Code, `+server.ts`):

1. Rate Limit für die Anzahl der Uploads: 20/h anonym, 50/h authentifiziert
   (`RATE_LIMITS.FILE_UPLOAD_*`). Überschreitung: 429
2. Größenlimit je MIME-Typ: `maxUploadSizeFor()` (`#lib/constants/uploadLimits`)
   gegen `security.maxFileSize` bzw. `security.maxVideoFileSize` — dieselbe
   Funktion speist `/api/config/upload` und damit die Dropzone. Überschreitung: 413
3. Gesamtgröße je Meldung gegen `security.maxTotalUploadSize`. Geprüft **vor**
   dem Byte-Budget (Schritt 4): gibt den konkreteren Fehler und belastet die
   stündliche Missbrauchsbremse nicht für eine Meldung, die nur groß ist, nicht
   missbräuchlich. `referenceId` kommt vom Client und wird nur gegen `isCuid()`
   geprüft — dieses Limit schützt eine ehrliche Meldung vor unbemerktem
   Anwachsen, ist aber selbst keine Missbrauchsbremse. Überschreitung: 413
4. Byte-Budget je Kennung (`user:{sub}` oder `ip:{clientIp}`) und Stunde: 300 MB
   anonym, 2 GB authentifiziert (`RATE_LIMITS.UPLOAD_BYTES_*`,
   `consumeByteBudget()`). Wirkt über alle Meldungen einer Kennung hinweg —
   das eigentliche Missbrauchslimit, seit die anonym/authentifiziert-Grenze aus
   Schritt 2 entfallen ist. Überschreitung: 429
5. MIME-Type-Whitelist aus `security.allowedFileTypes` (`validateFile()`).
   Überschreitung: 400
6. Magic Bytes (`validateMagicBytes()`, verhindert Type-Spoofing); ISO-BMFF-Typen
   (MP4, QuickTime, M4V) prüfen nur die `ftyp`-Box bei Offset 4, nicht die
   Brand danach — iPhones schreiben je nach Aufnahmemodus abweichende Brands in
   `.mov`- und `.mp4`-Dateien. Überschreitung: 400
7. Gefährliche Dateitypen (`isDangerousFileType()`). Überschreitung: 400
8. EXIF-Extraktion (`exifr`, `readImageExifData()`) — nur für Bilder, läuft
   parallel zum Storage-Upload

**Es gibt keine getrennten Größengrenzen für anonym und angemeldet mehr.** Die
Laufzeit-Konfiguration (`security.maxFileSize`, `security.maxVideoFileSize`,
`security.maxTotalUploadSize`) ist die einzige Autorität für Größen; `ServerConfigService.getUploadConfig()`
liefert alle drei. Die technische Obergrenze darüber ist `BODY_SIZE_LIMIT` — sie
muss über `security.maxVideoFileSize` liegen, sonst bricht der Upload auf
Plattformebene ab, bevor diese Pipeline überhaupt läuft (`docs/ENVIRONMENT.md`).

**Auslieferung:** `/api/media/[...path]` streamt (kein Voll-Buffering mehr) mit
`Accept-Ranges: bytes` und beantwortet einen `Range`-Header mit 206 Partial
Content bzw. 416 Range Not Satisfiable. Range-Anfragen zählen gegen ein eigenes,
höheres Rate Limit (`MEDIA_RANGE_*`: 300/min anonym, 600/min authentifiziert)
statt gegen `MEDIA_ACCESS_*` (30/min bzw. 100/min) — sonst würde Springen im
Video das Limit sprengen, das eigentlich einzelne Zugriffe drosseln soll.

**Volumen-Bremse bei der Auslieferung (seit Befund C1 im Abschlussreview):** Die
Anfragenzahl-Limits oben deckeln nicht das Volumen — `Range: bytes=0-` ist ein
erfüllbarer Bereich über die ganze Datei und bekam dabei sogar das zehnfach
höhere Range-Limit. Zusätzlich gilt deshalb ein Byte-Budget je Kennung und
Stunde: 1 GB anonym, 5 GB authentifiziert (`RATE_LIMITS.MEDIA_BYTES_*`,
`consumeByteBudget()` aus `#lib/server/middleware/byteBudget.ts` — dasselbe
Modul wie beim Upload-Byte-Budget oben, seit diesem Befund ohne `upload`-Präfix
im Namen). Gebucht wird die tatsächlich ausgelieferte Menge: bei einer
Teilanfrage die Bereichslänge, bei einer vollen Anfrage die Dateigröße — ein
`Range`-Header über die ganze Datei bucht also genauso viel wie eine Anfrage
ohne `Range`. Überschreitung: 429.

Details: `docs/archive/VIDEO_UPLOAD_KONZEPT_2026-07-31.md`.

---

## Löschen: erst die DB-Zeile, dann die Datei

Wer eine `sichtungen_dateien`-Zeile entfernt, muss auch die Datei im Storage
entfernen — der Fremdschlüssel-Cascade tut das **nicht**. Reihenfolge ist
vorgeschrieben:

```typescript
import { deleteStoredFiles } from '#lib/server/storage/deleteStoredFiles.ts';

// Zeilen explizit löschen und die Pfade in derselben Anweisung mitnehmen
const removed = await db
	.delete(sightingFiles)
	.where(eq(sightingFiles.sightingId, id))
	.returning({ filePath: sightingFiles.filePath });

// erst danach:
await deleteStoredFiles(removed.map((file) => file.filePath));
```

**Nicht auf die Cascade verlassen.** `onDelete: 'cascade'` räumt beim Löschen
einer Sichtung zwar die Zeilen ab, aber lautlos — die Pfade sind dann weg. Ein
vorgelagertes `select` wäre ebenfalls unzureichend: zwischen Lesen und Löschen
kann eine Zeile dazukommen, die die Cascade unbemerkt mitnimmt. `delete … returning`
in einer Transaktion mit dem Löschen der Sichtung schließt beides aus.

Bricht Schritt 3 ab, bleibt eine verwaiste Datei liegen — folgenlos, weil nichts
mehr auf sie zeigt. In der umgekehrten Reihenfolge entstünde eine DB-Zeile, die
auf eine fehlende Datei verweist, und die sieht der Nutzer als kaputtes Bild.
`deleteStoredFiles()` wirft deshalb nie: der DB-Vorgang ist bereits committet.

**Ausnahme (Altlast):** `POST /api/files/delete` löscht noch in umgekehrter
Reihenfolge und meldet auch dann Erfolg, wenn die DB-Zeile stehen bleibt.

---

## EXIF-Extraktion

```typescript
// src/lib/server/media/exifUtils.ts
readImageExifData(buffer): Promise<ExifData | null>
```

Extrahiert: GPS-Koordinaten, Kamera, Datum, Belichtung, ISO.
CEST-Zeitzonenkorrektur via `correctCestOffsetUTC()`.

---

## Aufbewahrung unverknüpfter Uploads

Ein Upload legt sofort eine Zeile mit `sichtung_id = NULL` an; verknüpft wird erst
beim Absenden. Abgebrochene Formularläufe hinterlassen deshalb Zeilen und Dateien,
die niemand mehr erreicht — samt EXIF-GPS.

**Frist: 24 Stunden.** Formulardaten liegen in `sessionStorage` und überstehen das
Schließen des Tabs nicht; was länger unverknüpft ist, kann nicht mehr abgesendet
werden.

Durchgesetzt wird die Frist über `POST /api/admin/cleanup-orphans` — aus der
Admin-UI oder per externem Web-Cron mit `CLEANUP_TOKEN`. Für Läufe ohne laufende
Anwendung bleibt `npm run media:cleanup-orphans:dry-run` (Details:
`src/tools/README.md`). Beide teilen sich denselben Kern
(`#lib/server/media/orphanCleanup`).

Dateien ohne Zeile (Klasse B) sind seit PR #584 die Ausnahme: Die Normalwege
löschen die Storage-Datei über `deleteStoredFiles()` mit. Übrig bleiben
fehlgeschlagene Storage-Löschungen — `deleteStoredFiles()` wirft bewusst nie und
versucht es nicht erneut — sowie der Altbestand von vor #584.

**Offen:** Der Cron-Aufruf ist ein Deployment-Schritt und muss beim Betreiber
eingerichtet sein; ohne ihn wächst der Bestand nach. Außerdem löscht
`POST /api/files/delete` weiterhin in umgekehrter Reihenfolge und meldet auch
dann Erfolg, wenn die DB-Zeile stehen bleibt.

**Mit Videos wiegt die Frist schwerer.** Ein abgebrochener Formularlauf
hinterlässt jetzt bis zu `security.maxTotalUploadSize` (250 MB) statt bis zu
100 MB, und der Cron-Aufruf ist eine Betreiberaufgabe, die ausbleiben kann.
Beim Freischalten von Videos gehört deshalb geprüft, dass
`POST /api/admin/cleanup-orphans` tatsächlich läuft — vorher wächst der Bestand
um Größenordnungen schneller nach als zuvor.

**Lokale Entwicklung: kein Cron — nach Browser-Verifikation manuell aufräumen.**
Der Cron oben ist ein Deployment-Schritt und läuft lokal nie. Die Foto-/
Video-Dropzone lässt sich nicht sinnvoll ohne echten Browser prüfen — die
vorgeschriebene visuelle Verifikation von UI-Änderungen lädt dabei reale
Dateien in die geteilte lokale DB und nach `uploads/` hoch
(`docs/WORKTREES.md` § Geteilte Ressourcen), jede Zeile mit `sichtung_id
IS NULL`, bis jemand aufräumt. Befund vom 2026-07-31: sieben Waisenzeilen aus
genau solchen Sessions, teils mit echten Fotos außerhalb der E2E-Fixtures
(`IMG_7293.jpeg`). Die automatisierten E2E-Specs sind nicht die Ursache — sie
mocken `/api/files/upload` (`e2e/fixtures/mockApi.ts`) oder lösen die
Größenprüfung vor jedem Storage-Schreibzugriff aus.

Nach jeder manuellen Verifikationssession, die Dateien hochgeladen hat:

```bash
npm run media:cleanup-orphans -- --older-than=1h
```

`1h` statt der Standardfrist (24h, s.o.): Ein manueller Testupload muss nicht
die Absende-Frist eines echten Formularlaufs abwarten. `--older-than` erlaubt
nur ganze Stunden/Tage — für Uploads der letzten Minuten vorher `--dry-run`
gegenprüfen oder eine Stunde warten, sonst räumt der Lauf noch nichts weg.

---

## Best Practices

- Dateinamen basieren auf CUID, Original separat gespeichert
- Lokaler Storage: absolute Pfade via `resolve()` gegen Path-Escape
- Vercel Blob URLs sind permanent (kein Recovery nach Delete)
- EXIF-GPS muss separat mit Baltic-Sea-Geometrie validiert werden
