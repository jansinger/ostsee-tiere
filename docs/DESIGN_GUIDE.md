# Design Guide — Ostsee-Tiere

Dieses Dokument beschreibt die **Design- und UX-Leitlinien** des Projekts und den **tatsächlichen Ist-Zustand** der Umsetzung. Beides ist bewusst getrennt: Leitlinien sagen, was gelten soll; der Ist-Zustand ist am Code überprüfbar und enthält keine Wunschvorstellungen.

**Verbindliche Kurzform:** `.claude/rules/design-system.md` — die dort formulierten Regeln sind bei jeder UI-Änderung einzuhalten. Dieses Dokument liefert die Begründung und den Kontext.

**Die Tokens selbst:** `docs/DESIGN_SYSTEM.md` (Namen, Werte, Zweck) und — wichtiger, weil nicht veraltbar — die Route **`/styleguide`** im Dev-Server (`npm run dev`, dann [https://localhost:4000/styleguide](https://localhost:4000/styleguide)). Dort steht jede Kombination genau einmal als echtes DOM, durch dieselbe CSS-Pipeline wie die App. Wer eine neue Komponente baut, sieht dort zuerst nach, ob es das Muster schon gibt; wer einen Token ändert, prüft dort die Wirkung. Die Seite ist zugleich die Prüffläche von `e2e/design-tokens.spec.ts` und die einzige Aufrufstelle der eigenen Utilities aus `app.css` — ohne sie fehlen sieben davon im ausgelieferten CSS.

**Verwandte Dokumente:** `.claude/rules/forms.md` (Form-State-Pattern), `.claude/rules/architecture.md` (Svelte-5-Runes, A11y-Grundsätze), `docs/archive/UX_DESIGN_REVIEW_SICHTUNGSFORMULAR_2026-07-24.md` (Review-Befunde mit Status).

---

## Inhalt

- [Leitprinzipien](#leitprinzipien)
- [Ist-Zustand (am Code verifiziert)](#ist-zustand-am-code-verifiziert)
- [Bekannte Einschränkungen / offene Punkte](#bekannte-einschränkungen--offene-punkte)
- [Checkliste vor einem UI-PR](#checkliste-vor-einem-ui-pr)

---

## Leitprinzipien

### 1. Ein Thema pro Schritt

Das Sichtungsformular ist lang. Statt einer Endlosseite wird es in thematisch geschlossene Schritte zerlegt (GOV.UK-Muster „One Thing Per Page"). Der Nutzen ist konkret und nicht statistisch begründet: Ein Schritt lässt sich für sich validieren, Fehler bleiben lokal, und ein Abbruch verliert weniger Kontext.

**Konsequenz für neuen Code:** Ein neues Feld gehört in genau einen Schritt und muss dort in `formStepsConfig` (`src/lib/report/formConfig.ts`) eingetragen werden — sonst wird es weder von der Schritt-Validierung noch von der Fehler-Navigation gefunden.

### 2. Fehler erst nach einem Versuch

Ein Formularschritt darf beim Betreten **nie** rot sein. Fehler erscheinen erst, wenn der Nutzer aktiv „Weiter"/„Absenden" gedrückt hat und die Validierung fehlschlägt. Begründung: Ein Feld, das der Nutzer noch nicht gesehen hat, kann er nicht falsch ausgefüllt haben; eine Vorab-Fehlermeldung ist reines Rauschen.

### 3. Optionale Felder sind sichtbar optional

Pflichtfelder werden markiert, optionale nicht (Markieren beider Sorten verdoppelt nur das visuelle Rauschen). Ein ganzer Schritt darf optional sein und muss dann überspringbar sein.

### 4. Progressive Disclosure statt Dauer-Sichtbarkeit

Felder, die nur in einem bestimmten Kontext sinnvoll sind (Bootsantrieb nur bei Boots-Sichtung, Totfund-Details nur bei Totfund), werden erst eingeblendet, wenn der Kontext eintritt. Wird der Kontext zurückgenommen, muss der Formular-State mit aufgeräumt werden — sonst würden unsichtbare Werte mit abgeschickt.

### 5. Ein Theme, eine Quelle für Farben

Alle Farben, Radien und Border-Stärken kommen aus dem DaisyUI-Theme. Die Werte selbst stehen seit 2026-07-29 in `src/css/tokens.css`; `src/app.css` mappt sie per `var()` in die Theme-Deklaration. Hardcodierte Hex-Werte oder Tailwind-Graustufen in Komponenten hebeln das Theme aus und werden bei Theme-Änderungen nicht mitgezogen. Die drei begründeten Ausnahmen stehen in `.claude/rules/design-system.md` („Randbereiche").

### 6. Barrierefreiheit ist Teil der Definition of Done

Zielniveau ist **WCAG 2.1 AA**. Das ist kein Nachrüst-Thema: Label-Zuordnung, Kontrast, Fokus-Sichtbarkeit und Fehler-Ansage entstehen an derselben Stelle wie das Feld selbst — in der zentralen Feld-Pipeline, nicht in jedem Aufrufer einzeln.

### 7. Keine Utility-Klasse ohne Deckung im Setup

Tailwind-Utilities, die im Projekt-Setup nicht existieren, sehen im Code aus wie Design und sind wirkungslos. Vor der Nutzung einer unbekannten Klasse prüfen, ob das zugehörige Plugin installiert ist (`package.json`).

---

## Ist-Zustand (am Code verifiziert)

Stand: Juli 2026. Jede Aussage ist mit Datei belegt. Code wird bewusst **nicht** dupliziert — die Datei ist die Wahrheit.

### Theme und globale Styles

**`src/app.css`** enthält alles Globale:

| Bereich           | Inhalt                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme             | DaisyUI-v5-Theme `meeresmuseum` via `@plugin 'daisyui/theme'`, `color-scheme: light`, `default: true`, `prefersdark: false`                                                                                                                                            |
| Farben            | `--color-primary`/`-secondary`/`-accent`/`-neutral`, `--color-base-100/200/300`, `--color-base-content`, Status: `info`/`success`/`warning`/`error`                                                                                                                    |
| Layout-Tokens     | `--radius-selector`, `--radius-field`, `--radius-box`, `--size-selector`, `--size-field`, `--border`, `--depth`, `--noise`                                                                                                                                             |
| Alert-Override    | `.alert-info/-success/-warning/-error` werden auf ein Soft-Muster gesetzt (Text in **`base-content`**, Hintergrund als 12-%-Mix in `base-100`, kein Schatten). Die Statusfarbe als Text ergäbe dort nur 2,45–3,84:1 — die Bedeutung trägt das Icon, siehe `daisyui.md` |
| Fokus             | `.input:focus`/`.select:focus`/`.textarea:focus` → 3px `--color-primary`-Outline plus Ring; global `:focus-visible` → 2px Outline                                                                                                                                      |
| Motion            | `@media (prefers-reduced-motion: reduce)` reduziert Animationen und Transitions global                                                                                                                                                                                 |
| iframe-Modus      | `.iframe-mode` blendet Navbar/Footer aus und verdichtet die Abstände (die `font-size: 1rem` für Formularfelder gilt seit 2026-07-29 global, nicht mehr nur eingebettet)                                                                                                |
| Weitere Utilities | `.scroll-styled` (Scrollbar), `.panel-transition`/`.panel-shadow`, `.no-print`                                                                                                                                                                                         |

Die meisten `*-content`-Farben des Themes (`--color-primary-content`, `--color-info-content`, …) sind auf reines Weiß (`oklch(1 0 0)`) gesetzt. Drei Ausnahmen tragen dunklen Text, weil Weiß dort WCAG 1.4.3 verfehlte: `--color-accent-content` sowie seit 2026-07-29 `--color-warning-content` (weiß: 3,26:1 → jetzt 6,05:1) und `--color-secondary-content` (weiß: 3,19:1 → jetzt 6,18:1). Daraus folgt die `*-content`-Regel in `.claude/rules/design-system.md`.

### Formular-Architektur

| Ebene           | Datei                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Container       | `src/routes/+page.svelte`                                                  |
| Formular-Root   | `src/lib/report/components/ModernReportForm.svelte`                        |
| Schritt-Anzeige | `src/lib/report/components/form/FormSteps.svelte`                          |
| Schritt-Navi    | `src/lib/report/components/form/StepNavigation.svelte`                     |
| Schritte        | `src/lib/report/components/steps/Step1…Step4*.svelte`                      |
| Sections        | `src/lib/report/components/sections/` (`SectionCard.svelte` als Rahmen)    |
| Schritt-Konfig  | `src/lib/report/formConfig.ts` (`formStepsConfig`, `initialFormState`)     |
| Schema          | `src/lib/form/validation/sightingSchema.ts`                                |
| Form-State      | `src/lib/form/createForm.ts` (eigene Implementierung, keine Fremd-Library) |

Vier Schritte, `currentStep` ist **0-basiert**: Position & Zeit, Sichtungsdetails, Beobachtungen (`isOptional: true`), Kontaktdaten. Schritt 3 hat einen expliziten Überspringen-Button in `Step3Observations.svelte`.

### Feld-Pipeline

Jedes Formularfeld läuft über `FormField` → `FieldRenderer` (beide in `src/lib/report/components/form/fields/`):

- `FormField` holt den Form-Context (`getFormContext()`), zieht die Feld-Beschreibung aus `sightingSchemaFields` (das ist `sightingSchema.describe().fields`) und reicht Wert, Fehler und `touched` weiter.
- `FieldRenderer` erzeugt Label, Pflicht-Markierung, Hilfetext, Beschreibung, Statusicon, Fehlerblock und wählt die passende `Base*`-Komponente (Input/Select/Textarea/Radio/Checkbox/Toggle).
- Label, Hilfetext, Icon, Platzhalter, Optionen und Feldtyp kommen aus dem Yup-Schema (`.label()` und `.meta({...})`) — **nicht** aus dem Aufrufer. Ein neues Feld wird daher im Schema konfiguriert, nicht im Template.

Barrierefreiheits-Details, die dort zentral entstehen:

- `required` ist **eine** Variable und speist sowohl das Sternchen als auch `aria-required` (`requiredOverride ?? fieldConfig.optional === false`).
- Der `required`-Prop von `FormField` ist der Override für konditionale `when()`-Regeln, die aus `describe()` nicht ableitbar sind.
- IDs nach festem Muster: `field-<name>`, `-help`, `-error`, `-desc`; `aria-describedby` wird nur aus tatsächlich gerenderten Elementen zusammengesetzt.
- Fehlerblock mit `role="alert"` und `aria-live="polite"`.
- Radiogruppen werden als `fieldset`/`legend` gerendert (ein `label[for]` würde ins Leere zeigen), Checkbox/Toggle rendern ihr eigenes Label.
- Jedes Feld erhält `data-testid="field-<name>"`; der Wrapper trägt `data-field="<name>"`.
- Dekoratives (Statusicon, Feld-Icons, Dropdown-Chevron) ist `aria-hidden`.

Testabdeckung dieser Pipeline: `src/lib/report/components/form/fields/FieldRenderer.svelte.test.ts`.

### Validierungs-Zeitpunkt

- `StepNavigation.svelte` hält `attemptedStep`. Der Inline-Alert und die Fehlermarkierung erscheinen erst nach einem gescheiterten „Weiter"-Versuch; ein Schrittwechsel setzt den Marker zurück (Logik ausgelagert in `form/stepNavigationState.ts`).
- Schritt-Validierung: `isStepValid`/`validateStep` in `src/lib/form/validation/stepValidation.ts` validieren per `sightingSchema.pick(...)` nur die Felder des aktuellen Schritts.
- Vor dem endgültigen Absenden validiert `ModernReportForm.handleFinalSubmit` das **vollständige** Schema, schreibt alle Fehler in den Store und springt via `findStepForErrors` zum frühesten betroffenen Schritt. Ein Submit scheitert damit nie unsichtbar.
- `createForm` löscht den Fehler eines Feldes, sobald es geändert wird, und markiert es als `touched`. Das grüne Häkchen im Label erscheint nur für berührte, gültige Felder.

### Persistenz

`ModernReportForm` speichert über `#lib/storage/localStorage` (`saveToStorage`/`loadFromStorage`). Formulardaten und aktueller Schritt liegen in `sessionStorage`; Kontaktdaten landen nur bei erteilter Einwilligung (`persistentDataConsent`) in `localStorage`, sonst ebenfalls in `sessionStorage`. Wiederhergestellte Eingaben werden per Toast angekündigt. Details: `.claude/rules/browser-storage.md`.

### Progressive Disclosure im Bestand

- Totfund-Felder: `sections/AnimalInfo.svelte` blendet `DeadAnimal.svelte` bei `$form.isDead` ein.
- Bootsantrieb: `sections/SightingDetails.svelte` zeigt `boatDrive`/`boatDriveText` nur bei Segelschiff/Motorboot und setzt die Werte beim Wechsel zurück — die Reset-Bedingung ist in `sections/boatDriveReset.ts` isoliert und getestet, damit ein initialer Mount (Admin-Edit) keinen gespeicherten Wert löscht.
- Ein-/Ausblenden nutzt `transition:slide` aus `svelte/transition`, nicht CSS-Utility-Klassen.

### Icons

- UI-Icons: `src/lib/components/Icon.svelte` als zentraler Wrapper über unplugin-icons (lucide). Aufruf über den String-Namen, z.B. `<Icon icon="lucide:map-pin" width="20" />`.
- Wetter-Icons: CSS-basiert (`src/css/weather-icons.css`, `weather-icons-wind.css`, in `app.css` importiert), Nutzung als `<i class="wi wi-…">`.

---

## Bekannte Einschränkungen / offene Punkte

Ehrliche Liste. Wer hier etwas behebt, streicht den Punkt.

| Punkt                                                            | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nur Light-Theme**                                              | `meeresmuseum` ist mit `color-scheme: light` und `prefersdark: false` definiert. Es gibt kein Dark-Theme; `dark:`-Varianten in Komponenten sind wirkungslos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Kein Service Worker**                                          | Es existiert keine Service-Worker-Datei und keine PWA-Konfiguration. Offline-Fähigkeit beschränkt sich auf Session-/LocalStorage-Persistenz des Formulars.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`boatDrive` ohne „k. A."**                                     | Die DB-Spalte `bootsantrieb` ist `integer default(0) notNull` und `0` bedeutet „Sonstiger Bootsantrieb". Seit 2026-07-29 gibt es `5` = „Kein Boot" (`BoatDriveEnum.NONE`), das serverseitig immer dann gesetzt wird, wenn kein Antrieb angegeben wurde. `0` entsteht dadurch nur noch durch aktive Auswahl. Unschärfe: Bei Fähre oder „Sonstiges" (Kajak, SUP) ohne Antriebsangabe ist „kein Boot" zu stark — ein eigener Wert „Antrieb unbekannt" wurde bewusst nicht eingeführt, um eine dritte Vertragsänderung an derselben Spalte zu vermeiden.                                                                                                                                                                                       |
| **`vonwo = 0` doppeldeutig im Bestand**                          | Die DB-Spalte `vonwo` ist `integer default(0) notNull` und `0` bedeutet „Sonstiges". Seit 2026-07-29 schreibt `mapFormToSighting` bei fehlender Angabe `5` = „Keine Angabe" (`SightingFromEnum.UNKNOWN`) — **neue** Zeilen sind damit eindeutig. Der Bestand wurde bewusst nicht umgeschrieben: 713 der 1.833 Null-Zeilen sind über `vonwo_text` belegbar echte „Sonstiges"-Antworten (Kajak, SUP, Mehrzweckschiff), für die restlichen 709 gibt es keine ableitbare Wahrheit. Auswertungen über Altdaten müssen damit rechnen, dass `0` beides heißen kann.                                                                                                                                                                               |
| **`verteilung` / `verhalten` doppeldeutig im Bestand**           | Beide sind `integer default(0) notNull` mit `0` = „Sonstige …". Seit 2026-07-29 schreibt `mapFormToSighting` bei fehlender Angabe `4` = „Keine Angabe" — **neue** Zeilen sind eindeutig. Der Bestand blieb unangetastet: `verteilung = 0` trifft auf 15.129 von 19.880 Zeilen (76,1 %), `verhalten = 0` auf 9.192 (46,2 %); nur 4,2 % bzw. 9,7 % davon haben einen Freitext und sind damit belegbar echte Antworten. **Konsequenz: Beide Felder dürfen nicht über den Gesamtbestand ausgewertet werden** — „Sonstige Verteilung" wäre sonst mit 76 % die häufigste Kategorie.                                                                                                                                                              |
| **`tierart` ohne „unbekannt"**                                   | Die Spalte `tierart` ist `smallint default(0) notNull` und `0` bedeutet **„Schweinswal"**. Das Formular hat seit dem UX-Review 2026-07-24 keinen Default mehr; seit 2026-07-29 wirft auch `mapFormToSighting` bei fehlender Art, statt still einen Schweinswal zu speichern. Für Altdaten gilt: Ob unter den 16.037 Nullen Artefakte stecken, ist nicht feststellbar — der Wert ist fachlich plausibel (einziger heimischer Wal der Ostsee).                                                                                                                                                                                                                                                                                               |
| **Kein Animations-Plugin**                                       | Weder `tailwindcss-animate` noch `tw-animate-css` sind installiert. Klassen wie `animate-in` oder `slide-in-from-top-*` haben keine Wirkung.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Admin-UI nicht theme-rein**                                    | Der Admin-Bereich nutzt an vier Stellen noch Tailwind-Graustufen statt Theme-Tokens: `AdminSightingEditForm.svelte:85`, `BooleanStatus.svelte:44`, `routes/admin/[id]/+page.svelte:102`, `routes/admin/[id]/edit/+page.svelte:68`. Die Step- und Section-Komponenten des Sichtungsformulars sind bereits theme-rein, ebenso `src/lib/form/fields/dropzone.ts` — der dort früher genannte Klassen-Typo `bg-bray-800` existiert nicht mehr.                                                                                                                                                                                                                                                                                                  |
| **Kontrast automatisiert — für Tokens, nicht für Aufrufstellen** | Seit `/styleguide` prüft `e2e/design-tokens.spec.ts` → „Design-Tokens — Kontrast" jede Token-Kombination im Browser (22 Tests, alle ≥ 4,5:1 bzw. ≥ 3:1 für Icons). Was das **nicht** abdeckt: ob eine Aufrufstelle die richtige Kombination wählt — dafür ist der DOM-Scan derselben Datei zuständig („verbotene Kombinationen im DOM"), seit PR #620 ein aktiver Guard über `/`, `/map`, `/about` und vier Admin-Routen. Die früher hier geführten Punkte „Statusfarben als Vordergrundfarbe" (60+ Aufrufstellen) und „Fokus nach Schrittwechsel" sind abgearbeitet: Ersteres mit PR #614–#620, Letzteres über `scrollToStepHeader` (`src/lib/utils/fieldNavigation.ts`), das gezielt den Kopf des neuen Schritts anfährt und fokussiert. |
| **Sonstige Review-Befunde**                                      | Offene UX-Punkte werden in `docs/archive/UX_DESIGN_REVIEW_SICHTUNGSFORMULAR_2026-07-24.md` mit Status geführt, nicht hier dupliziert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## Checkliste vor einem UI-PR

0. `/styleguide` im Dev-Server aufgeschlagen: Gibt es das Muster schon? Wenn ja, dieses verwenden. Wenn nein, das neue dort eintragen — mit allen Zuständen (Ruhe, Fokus, Fehler, Laden, deaktiviert).
1. Farben, Radien, Borders ausschließlich über Theme-Tokens / DaisyUI-Utilities.
2. Kein `*-content` auf Tint-Flächen (`bg-…/10` o.ä.) — siehe Regel.
3. Neues Feld: im Schema mit `.label()`/`.meta()` konfiguriert **und** in `formStepsConfig` eingetragen.
4. Konditionale Pflicht? Dann `required`-Override an `FormField` setzen.
5. Kein neuer Fehlerzustand, der schon beim Betreten eines Schritts sichtbar ist.
6. Verwendete Utility-Klassen existieren im Setup (kein Animations-Plugin!).
7. Tastaturbedienung und sichtbarer Fokus geprüft; dekorative Icons `aria-hidden`.
8. `npm run test:quick` ist grün.
