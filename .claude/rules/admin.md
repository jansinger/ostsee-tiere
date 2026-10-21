---
paths:
  - 'src/routes/admin/**'
  - 'src/lib/components/admin/**'
---

# Admin Panel

Regeln für das Admin-Interface.

---

## Auth Pattern

Auth wird im Layout enforced -- alle Child-Routes sind automatisch geschützt:

```typescript
// src/routes/admin/+layout.server.ts
requireUserRole(url, locals.user, ['admin']);
```

**Wichtig:** Keine zusätzliche Auth-Prüfung in einzelnen Routen nötig.

---

## Routen-Struktur

```
src/routes/admin/
├── +layout.server.ts      # Auth Guard (requireUserRole)
├── +page.server.ts        # Eingang (Task-Liste offener Sichtungen, Sortierung nur per `order`-Param)
├── sichtungen/              # Tabelle (alle Sichtungen, Filter inkl. `verified=rejected`)
├── [id]/
│   ├── +page.svelte       # Sichtung anzeigen
│   └── edit/+page.svelte  # Sichtung bearbeiten
├── ref/[refId]/            # Referenz-ID Lookup
├── settings/               # Konfiguration (DB-basiert)
├── statistics/             # Statistiken
└── docs/                   # Dokumentation
```

`/admin` ist die Eingangsseite: eine Task-Liste der offenen (weder freigegebenen
noch abgelehnten) Sichtungen. Alte Tabellen-URLs mit `page`/`sort`/`verified`/…
werden per 301 auf `/admin/sichtungen` umgeleitet. **Die Eingangsseite ist eine
Task-Liste — keine Filter/Spalten dorthin bauen, dafür gibt es
`/admin/sichtungen`.**

### Der Rückweg aus der Detailansicht kennt zwei Ziele

`/admin/[id]` wird aus der Tabelle **und** aus dem Eingang geöffnet. Woher,
steht in der URL: Die Tabelle verrät sich über ihre Filter-Parameter, der
Eingang über `?from=inbox` (`#lib/components/admin/adminReturn.ts`).
`returnTarget()` in `[id]/tableReturnUrl.ts` wertet beides aus und liefert Ziel
**und** Beschriftung; der Rückweg in den Eingang trägt zusätzlich den Anker
`#sichtung-<id>` auf die Karte, von der man kam.

Zwei Dinge dabei nicht zurückdrehen:

- **Kein `history.back()`.** Die Detailansicht lädt per `invalidateAll()` neu,
  löscht ggf. den Datensatz und führt über „Bearbeiten" weiter — der Eintrag
  hinter uns ist danach nicht verlässlich derselbe. Ein URL-Parameter überlebt
  Reload, Bookmark und Direktaufruf.
- **Jede weiterführende Route reicht die Parameter durch** (`carryReturnParams`).
  `edit/` sprang bis 2026-08 auf `/admin/${id}` ohne Query-String; damit verlor
  schon der Weg Tabelle → Detail → Bearbeiten → zurück die Filter. Wer eine
  weitere Unterroute anlegt, muss dasselbe tun — sonst endet der Rückweg dort.

**Bekannte Ausnahme:** `/admin/ref/[refId]` leitet auf `/admin/${id}` ohne
Query-String um und verwirft damit den Kontext. Das war vor dem Rückweg-Umbau
schon so; der Einstieg dorthin kommt aus der Tabelle, deren Filter der Umweg
ohnehin nicht kennt. Wer den Lookup anfasst, kann es mitziehen.

Der Eingang führt außerdem **einen eigenen** Parameter: `order`. Er steht
bewusst nicht in `istTabellenUrl` (`admin/tableRedirect.ts`) und darf beim
Rückweg nach `/admin` als einziger mitgegeben werden — die übrigen
TABELLEN_PARAMETER lösten dort sofort die 301 auf die Tabelle aus.

### Der Arbeitsmodus: Warteschlange in der Detailansicht

Aus dem Eingang geöffnet (`?from=inbox`) blättert die Detailansicht durch **alle**
offenen Sichtungen und springt nach einer Entscheidung direkt zur nächsten. Aus der
Tabelle heraus gibt es das bewusst nicht — dort sind Filter, Sortierung und
Paginierung im Spiel, und die Queue wäre ein anderes Feature.

Drei Dinge dabei nicht zurückdrehen:

- **Die Ordnung ist `(created, id)` und steht in `#lib/server/db/openQueueOrder.ts`.**
  `created` ist nicht eindeutig; ohne den Tiebreaker liefern Eingangsliste und
  Nachbar-Query bei gleichem Zeitstempel unterschiedliche Reihenfolgen, und beim
  Abarbeiten fällt still eine Meldung durch. `openQueueOrderScan.test.ts` meldet
  jede selbstgebaute Sortierung auf `created`.
- **Nachbarn per Keyset, nie per Offset.** Der Vergleich hängt an den Werten der
  aktuellen Zeile, nicht an ihrer Mitgliedschaft in der offenen Menge — deshalb
  bleibt „wer kommt danach" beantwortbar, nachdem die Sichtung entschieden wurde.
  Ein mitgeführter Offset wäre nach jeder Entscheidung um eins falsch.
- **`next: null` und ein fehlgeschlagener Queue-Aufruf sind nicht dasselbe.**
  Ersteres heißt „Stapel zu Ende", letzteres „unbekannt". Dafür gibt es
  `queueFailed`; bei einem Fehlschlag unterbleibt der Auto-Advance, statt in den
  Eingang zu springen und den Stapel für abgearbeitet zu halten. Gleiche
  Konstruktion und gleiche Begründung wie beim Status-Log.

**Der Undo-Href gehört ausschließlich dem Arbeitsmodus.** `planAdvance()`
(`queueAdvance.ts`) liefert `undoHref` nur, wenn tatsächlich ein Advance
stattgefunden hat — die Bedingung dafür ist `target.kind !== 'stay'` und nicht
etwa die Mitgliedschaft im Warteschlangen-Modus. `stay` deckt drei Fälle ab:
aus der Tabelle geöffnet (`queue === null && !queueFailed`), fehlgeschlagene
Queue-Abfrage (`queueFailed`) und `verdict === 'reset'`. In allen dreien bleibt
der Href `null`, und der „Rückgängig"-Knopf setzt dann nur den Status zurück,
ohne zu navigieren. Bei den letzten beiden wäre er zwar korrekt, aber nutzlos:
Man steht bereits auf der entschiedenen Sichtung, ein `goto` darauf lädt nur neu
und wirft die Scroll-Position weg. Beim ersten dagegen wäre er schädlich, und
das ist der eigentliche Grund für die Regel: `queueHref()`
stempelt über `inboxDetailHref` bedingungslos `?from=inbox` auf die Ziel-URL —
ein unbedingt vergebener Undo-Href hätte damit auf eine aus der Tabelle
geöffnete Sichtung die Herkunft des Eingangs geschrieben, und ein Klick darauf
hätte die Tabellenfilter verworfen und im Eingang statt in der gefilterten
Tabelle geendet.

Die Tastenzuordnung liegt für beide Flächen in `adminTriageShortcuts.ts`. Im Eingang
schiebt `focusNext` den Fokus, in der Detailansicht navigiert es — die Absicht ist
dieselbe, deshalb steht sie einmal.

## Admin-Komponenten

| Komponente                       | Zweck                                                |
| -------------------------------- | ---------------------------------------------------- |
| `AdminSightingEditForm.svelte`   | Sichtung bearbeiten                                  |
| `AdminSightingView.svelte`       | Sichtung anzeigen (read-only)                        |
| `SightingInboxCard.svelte`       | Karte der Eingangsseite (`/admin`)                   |
| `inboxVerdict.ts`                | Verdict-Logik der Eingangsseite                      |
| `adminTriageShortcuts.ts`        | Tastatur-Triage (Eingang + Detailansicht)            |
| `InboxShortcutHelp.svelte`       | Overlay mit der Kürzel-Übersicht                     |
| `adminReturn.ts`                 | Herkunft `?from=inbox` + Karten-Anker                |
| `SightingQueueNav.svelte`        | Navigationsleiste des Arbeitsmodus                   |
| `sightingQueue.ts`               | Queue-Typen, Ziel-Href, Advance-Ziel                 |
| `queueAdvance.ts`                | Sprung + Undo-Toast nach einer Entscheidung          |
| `queueOrder.ts`                  | Client-sichere Auswertung von `?order`               |
| `undoMemory.svelte.ts`           | Zustand hinter „Rückgängig" (Detailansicht)          |
| `DataTableRow.svelte`            | Tabellen-Zeile                                       |
| `BooleanStatus.svelte`           | Boolean-Status Anzeige                               |
| `ExportModal.svelte`             | Export-Dialog                                        |
| `deadFinding.ts`                 | Totfund-Auszeichnung                                 |
| `sightingStatus.ts`              | Statusableitung + Wort/Farbe/Icon/Verdict            |
| `spamScorePresentation.ts`       | Spam-Risikostufe + Wort/Farbe/Icon                   |
| `SpamFinding.svelte`             | Ein Spam-Befund (Modal + Detailkarte)                |
| `sightingStatusFilter.ts`        | Statuswert ↔ Filter-Query (`?verified=`)             |
| `SightingStatusControl.svelte`   | Segmented Control für den Statuswechsel              |
| `reporterHistoryPresentation.ts` | Stufe der Melder-Historie + Wort/Farbe/Icon          |
| `ReporterHistoryBadge.svelte`    | Das Badge (Eingang + Detailansicht)                  |
| `SightingActionsMenu.svelte`     | Overflow-Menü der Zeilen-Aktionen (Tabelle + Karten) |

### Spam-Score: vier Anzeigestellen, eine Schwelle

Wort, Farbe, Icon und Schwelle kommen aus `spamScorePresentation.ts` — für
Eingangskarte, Spam-Spalte der Tabelle, Spam-Check-Modal und die Inline-Karte
der Detailansicht gemeinsam. Vorher lagen dort drei Schwellensätze, und Score 1
war grau in der Liste, grün im Modal und gelb in der Detailansicht. Drei Dinge
dabei nicht zurückdrehen:

- **`null` ist nicht `0` und bekommt kein Badge.** `spam_score IS NULL` heißt
  „nie bewertet" (Altbestand, Legacy-Eingang), `0` heißt „bewertet,
  unauffällig" (`docs/SPAM_DETECTION.md`). Die Eingangskarte zeigte für NULL ein
  graues „Spam: –" und behauptete damit ein Prüfergebnis.
- **`isHighRisk` schlägt die Client-Schwelle, wo es vorliegt.** Für eine
  geglückte Prüfung sagen beide dasselbe; der Fail-Safe-Zweig des Detektors
  liefert aber Score 0 **mit** `isHighRisk: true`. Wörtlich genommen wäre das
  „Hochrisiko ohne einen Indikator" — `getSpamRiskFromResult` liest ein
  `failed`-Ergebnis deshalb als „nicht bewertet", genauso wie NULL.
- **Jede bewertete Stufe hat ein eigenes Icon** (WCAG 1.4.1). An allen vier
  Stellen hing die Bedeutung vorher allein an der Farbe.

Die Flächen- und Icon-Farbe der Detail-Karte steht als `SpamRisk`-Record an
ihrer Aufrufstelle — ein Leser, gleiche Begründung wie bei `deadFinding.ts`.
Über die Stufe und nicht über den Score aufgeschlüsselt, damit die Schwellen
nicht doch wieder auseinanderlaufen.

### Melder-Historie: zwei Anzeigestellen, eine Quelle

Eingangskarte und Kontakt-Karte der Detailansicht zeigen dasselbe Badge aus
`ReporterHistoryBadge.svelte`; Stufen und Schwellen stehen in
`reporterHistoryPresentation.ts`. Drei Dinge dabei nicht zurückdrehen:

- **Sie ist kein Teil des Spam-Scores und darf keiner werden.** Begründung mit
  Messwerten in `docs/SPAM_DETECTION.md` („Melder-Historie — daneben, nicht
  darin"). Persistiert wird nichts.
- **`null` heißt „nicht ermittelt" und bekommt kein Badge** — nicht „keine
  Vorgeschichte". Die Detailansicht führt einen **Transportfehler** (Endpunkt
  nicht erreichbar, Antwort ohne `history`) zusätzlich als eigenen Text,
  gleiche Konstruktion wie beim Status-Log. Scheitert dagegen die Abfrage
  selbst — `findReporterHistory` ist fail-open —, kommt sie ebenfalls als
  `history: null` zurück, und das ist von „keine Adresse hinterlegt" nicht zu
  unterscheiden: kein Badge, kein Fehlertext. Das ist der Preis des Fail-open
  und bewusst so, nicht nachzurüsten ohne die Fail-open-Eigenschaft selbst
  aufzugeben.
- **Keine Filter und keine Sortierung im Eingang.** Er bleibt eine Task-Liste;
  dafür gibt es `/admin/sichtungen`.
- **`badge-success` ab 10 Freigaben — mit zwei bekannten Einwänden.**
  Ursprünglich trugen alle Stufen außer der Warnung `badge-ghost`; damit waren
  `new`, `known` und `established` ununterscheidbar, und die Schwellen 3 und 10
  änderten nur das Adjektiv im Tooltip. Ein Zwischenschritt mit Tönungen
  (`bg-primary/10` und `/20`) war im Betrieb **nachweislich nicht zu erkennen**
  und wurde wieder entfernt. Seit dem 2026-08-10 trägt `established`
  `badge-success` (Entscheidung Jan). Die zwei Einwände dagegen sind bewusst
  überstimmt und gehören trotzdem gekannt: Grün trifft rund die Hälfte der
  offenen Karten (300 von 659, weil es im Bestand nur 5 Ablehnungen gibt), und
  dieselbe Farbe ist zugleich der Sichtungsstatus „Freigegeben" — in Tabelle
  und Detailansicht stehen damit zwei Grüns nebeneinander, die Verschiedenes
  meinen. Alle sechs Zustände nebeneinander: `/styleguide`, Abschnitt
  „Melder-Historie (Admin)".

### Modal und Detailkarte zeigen zwei Befunde, nicht einen

`GET /api/sightings/[id]/spam-check` liefert seit 2026-08 `{ stored, recomputed }`:
den persistierten Erstbefund **und** eine Neuberechnung über den aktuellen
Datensatz. Sie weichen systematisch ab — vier Indikatoren wiegen je 2 Punkte und
existieren nur beim Absenden (Formular-Token, Absendedauer, beide
Duplikat-Signale), ihre Eingangsdaten stehen nirgends in der Zeile. Vorher
lieferte der Endpunkt nur die Neuberechnung, und die Oberfläche zeigte „Spam 2"
in der Spalte und „0" im Check daneben. Drei Dinge dabei nicht zurückdrehen:

- **`stored` führt, überall.** Es ist die Zahl aus Tabelle und Eingang und hat
  mehr Information als der Nachlauf. Nur wo es keinen Erstbefund gibt
  (`stored === null`), führt die Neuberechnung. Denselben Vorrang hat der
  E-Mail-Versand seit jeher (`persistedSpam ?? detectSpamIndicators(...)`) — die
  zwei Admin-Flächen waren die Ausreißer, nicht die Regel.
- **Beide Befunde kommen aus `SpamFinding.svelte`.** Modal und Detailkarte
  hatten kurzzeitig je eine eigene Fassung, mit abweichendem Wortlaut („Beim
  Eingang: 2" gegen „Heuristik-Score: 2") und ohne Risiko-Icon am Erstbefund.
  Das ist dieselbe Fehlerklasse, gegen die `spamScorePresentation.ts` angelegt
  wurde — eine Ebene höher.
- **`score: null` und ein fehlgeschlagener Lauf sind nicht dasselbe**, obwohl
  beide auf `risk === 'unrated'` landen. „Nie bewertet" bekommt gar kein Badge,
  „geprüft, aber gescheitert" das Badge „Prüfung fehlgeschlagen" ohne Zahl.
  `SpamFinding` unterscheidet sie daran, ob überhaupt eine Zahl vorliegt.

Die Einordnung der Differenz macht `getSpamDrift`; der erklärende Satz steht in
`SPAM_DRIFT_PRESENTATION` und bleibt aus, wo eine der beiden Seiten fehlt.
Abgesichert durch `e2e/admin-spam-check.spec.ts` (Shard `form`) — der Bestand
enthält keine Zeile mit Meldezeitpunkt-Indikator, der Fall muss geseedet werden.
Vollständige Herleitung: `docs/SPAM_DETECTION.md`.

### Totfund vs. Lebendsichtung

Wort und Icon der Totfund-Kennzeichnung kommen aus `deadFinding.ts` — für
Tabelle, Mobilkarte und Detailansicht gemeinsam, nach dem Vorbild von
`BALTIC_SEA_STATUS_PRESENTATION`. Die Farbklassen stehen bewusst an den
Aufrufstellen (Begründung im Docblock des Moduls). Zwei Dinge dabei nicht
zurückdrehen:

- **Der Marker in der Tabelle steht in einer festen Spalte ganz links** und
  gehört nicht in `availableColumns`. Als abschaltbare Spalte „Totfund
  (Ja/Nein)" am rechten Rand war er genau dann unsichtbar, wenn viele Spalten
  aktiv waren.
- **Die Lebendsichtung bleibt neutral.** Kein Gegen-Badge — sie ist der
  Normalfall, und ein zweites Badge in jeder Zeile ebnete den Kontrast wieder
  ein, um den es geht.

---

## Best Practices

- Auth NUR serverseitig (`+layout.server.ts`), keine Client-Rollen
- `locals.user.roles` nie an Frontend senden
- Admin-Aktionen immer über API-Routes mit eigener Auth-Prüfung
