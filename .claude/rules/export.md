---
paths:
  - 'src/lib/server/export/**'
  - 'src/routes/api/sightings/export/**'
  - 'src/lib/components/admin/ExportModal.svelte'
---

# Daten-Export

Regeln für CSV, JSON, KML und XML Export.

---

## Export-Funktionen

| Datei           | Funktion                      | Format-Details                                       |
| --------------- | ----------------------------- | ---------------------------------------------------- |
| `csvExport.ts`  | `generateCsvData(sightings)`  | Semikolon-getrennt, deutsche Labels                  |
| `jsonExport.ts` | `generateJsonData(sightings)` | Pretty-Print mit Metadaten                           |
| `kmlExport.ts`  | `generateKmlData(sightings)`  | Farbcodierte Marker nach Tieranzahl, DMS-Koordinaten |
| `xmlExport.ts`  | `generateXmlData(sightings)`  | Legacy-Format mit Mercator-Projektion                |

---

## API-Endpoints (`GET /api/sightings/export/{format}`)

**Auth:** Alle Endpoints erfordern `requireUserRole(url, locals.user, ['admin'])`

**Query-Parameter:** `fromDate`, `toDate`, `verified`, `entryChannel`, `mediaUpload`, `balticSea`, `deadFinding`, `q`

`balticSea` nimmt einen der vier Werte aus `BalticSeaStatus` (`baltic`, `edge`,
`outside`, `noPosition`) und übersetzt ihn über `#lib/server/db/balticSeaFilter`
— dieselbe Fallunterscheidung, die die Admin-Liste anzeigt. Die Flag-Logik nicht
hier nachbauen, sondern von dort importieren.

`q` ist die Freitext-Suche der Admin-Tabelle und läuft über
`#lib/server/db/sightingSearchFilter` — parametrisiertes `ILIKE '%…%'` über
Referenz-ID, E-Mail, Vor-/Nachname und Fahrwasser. Der Export **muss** sie
mitfiltern: Sonst enthielte die Datei mehr Zeilen, als der Nutzer gesehen hat.
Die Index-Entscheidung (kein `pg_trgm`, mit Messwerten und Schwelle) steht im
Docblock des Moduls.

`deadFinding` (`1`=Totfund, `0`=Lebendsichtung) läuft über
`#lib/server/db/deadFindingFilter` — Totfund heißt dort `totfund <> 0`, dieselbe
Boolean-Semantik wie das Badge (`isDeadFinding()`).

---

## Wichtige Details

- **Privacy:** Namen/Schiffsnamen nur exportiert wenn Consent-Flags gesetzt
- **KML:** Filtert Sichtungen ohne Koordinaten (`isNotNull`)
- **XML:** Enthält Mercator-Projektion (X/Y statt Lat/Lng) -- Legacy-Kompatibilität
- **CSV:** Header sind deutsche Labels, nicht DB-Feldnamen
- **JSON gibt `entryClient` mit aus, die anderen drei Formate nicht.** `jsonExport.ts`
  reicht die geladene Zeile roh durch, CSV/XML/KML bilden dagegen jedes Feld explizit
  ab. Bewusst so belassen (Entscheidung des Nutzers, 2026-08-17): Der Endpunkt ist
  admin-geschützt, und das Feld ist dort für Auswertungen ohne Datenbankzugang
  nützlich. Ein neues Feld in `mapFormToSighting`/`schema.ts` landet also automatisch
  im JSON-Export, ohne dass jemand das entscheiden muss — bei den anderen drei
  Formaten nicht.
- Fehler werden als Text/XML zurückgegeben (nicht JSON)
