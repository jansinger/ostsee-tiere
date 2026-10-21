---
paths:
  - '**/*.svelte'
  - 'src/app.css'
  - 'src/css/**'
---

# DaisyUI v5 & Theme `meeresmuseum`

Styling-Basis: **DaisyUI v5** auf **Tailwind CSS v4**. Das Theme wird in
`src/app.css` **deklariert**, seine Werte stehen seit 2026-07-29 eine Ebene
tiefer in `src/css/tokens.css` — `app.css` mappt sie nur noch per `var()` in
den `@plugin 'daisyui/theme'`-Block. Ein Farbwert existiert damit genau einmal.

---

## Tailwind 4 — CSS-first, keine JS-Config

DaisyUI wird über CSS eingebunden, **nicht** über ein Plugin-Array in
`tailwind.config.js`:

```css
@import 'tailwindcss';

@plugin 'daisyui';
@plugin 'daisyui/theme' {
	name: 'meeresmuseum';
	/* … */
}
```

Anleitungen, die `plugins: [require('daisyui')]` oder eine `daisyui: { themes: [...] }`
-Sektion in `tailwind.config.js` zeigen, beziehen sich auf DaisyUI v4.
**`src/app.css` ist die alleinige Source of Truth** für die DaisyUI-Einbindung
(Plugin, Theme-Deklaration, Overrides, `@theme`-Utilities); die **Farb- und
Maß-Werte** kommen aus `src/css/tokens.css`. Beide zusammen — und keine
JS-Config — definieren das Theme.

> **Es gibt bewusst keine `tailwind.config.js` mehr.**
> Die Datei war ein Rest aus der DaisyUI-v4-Zeit und wurde entfernt, nachdem
> nachgewiesen war, dass sie wirkungslos ist: Unter Tailwind 4 wird eine JS-Config
> nur noch über eine `@config`-Direktive geladen — die gibt es hier nicht, und
> auch `vite.config*.ts`, `svelte.config.js` (bis SvelteKit 2) und `.prettierrc` referenzierten sie
> nicht. Der Produktions-Build liefert vor und nach dem Löschen **byte-identisches
> CSS** (alle 17 Assets, gleiche Content-Hashes).
>
> Keine neue `tailwind.config.js` anlegen. Theme, Plugins und Utilities gehören
> nach `src/app.css`.

### Content-Detection läuft automatisch — kein `@source` nötig

Tailwind 4 scannt das Projekt selbstständig und überspringt dabei nur
`node_modules`, Binärdateien, CSS und alles, was in `.gitignore` steht. Da unter
`src/` nichts ignoriert wird, greift die Erkennung für **alle** Svelte- und
TS-Dateien inklusive `src/lib/` zuverlässig.

Explizite `@source`-Direktiven werden deshalb **nicht** gebraucht — und sollten
auch nicht „vorsorglich" ergänzt werden. Relevant wären sie nur, um eine
Tailwind-nutzende Abhängigkeit aus `node_modules` nachzuziehen oder um Klassen zu
safelisten, die nirgends als vollständiger String im Code stehen.

Praktische Konsequenz: Klassennamen müssen **vollständig im Quelltext** stehen.
`class={`btn-${variant}`}` wird nicht erkannt — stattdessen die kompletten Namen
in ein Mapping schreiben.

---

## Semantische Farbtokens — Pflicht

Immer die DaisyUI-Tokens verwenden, **nie** Farben aus der Tailwind-Palette:

```svelte
<!-- RICHTIG -->
<button class="btn btn-primary">Melden</button>
<div class="bg-base-200 text-base-content">…</div>

<!-- FALSCH — umgeht das Theme -->
<button class="rounded bg-blue-700 text-white">Melden</button>
```

Verfügbar: `primary`, `secondary`, `accent`, `neutral`, `base-100/200/300`,
`info`, `success`, `warning`, `error` — jeweils mit passendem `*-content` für Text
**auf** dieser Farbe.

**`bg-white`, `text-white` und `bg-black` gehören ausdrücklich zur verbotenen
Palette** — auch mit Deckkraft-Suffix. Sie sehen harmloser aus als `bg-blue-700`,
umgehen das Theme aber genauso vollständig, und der DOM-Scan konnte sie bis zum
2026-07-30 strukturell nicht melden (Begründung in `design-system.md`). Die drei
Ersatzfälle:

| Bedarf                                     | Token                                 |
| ------------------------------------------ | ------------------------------------- |
| Helle Fläche (Karte, Codeblock, Platte)    | `bg-base-100`                         |
| Dunkle Vollton-Fläche (helles Logo darauf) | `bg-neutral` + `text-neutral-content` |
| Schleier über fremdem Inhalt               | `bg-scrim/<n>` + `text-on-scrim`      |

`--scrim-surface`/`--scrim-foreground` stehen wie alle Farbwerte in
`src/css/tokens.css`; `app.css` mappt sie im `@theme`-Block zu den Utilities.

---

## Kontraste sind handgeprüft — nicht beiläufig ändern

Die Farbwerte stehen in `oklch()` und wurden gezielt auf **WCAG 2.1 AA** eingestellt;
die betroffenen Zeilen in `src/css/tokens.css` tragen den gemessenen Wert als
Kommentar (z. B. `--status-warning-strong` mit „5,52 / 4,58" für base-100/200),
die Theme-Zuweisungen in `app.css` die Begründung der Wahl.

**Zwei Rollen pro Statusfarbe:** `--status-*-surface` ist Flächenfarbe (Button,
Badge, Alert-Tint), `--status-*-strong` Vordergrundfarbe (Text, Icon). Weißer
Text auf `warning` erreichte nur 3,26:1 und auf `secondary` 3,19:1 — beide
`*-content` stehen deshalb auf `--brand-slate-950` (6,05:1 bzw. 6,18:1, im
Browser gemessen). Welche Variante wohin gehört, steht in `design-system.md`
(„Statusfarben haben zwei Rollen").

Wer einen Farbwert ändert, muss den Kontrast neu prüfen. Ein „etwas helleres Blau"
kann die Barrierefreiheit brechen.

`--color-error` ist dabei der empfindlichste Wert: er ist nicht nur Flächenfarbe,
sondern über `btn btn-outline btn-error btn-sm` (die kanonische destruktive
Variante, siehe `design-system.md`) auch **Textfarbe**. Mit dem ursprünglichen
`oklch(0.55 0.18 25)` erreichte diese Beschriftung nur 4,46:1 auf `base-100` und
3,69:1 auf `base-200`; seit `oklch(0.48 0.18 25)` sind es 6,05:1 bzw. 5,01:1.
Auf `base-300` bleiben es allerdings 4,13:1 — diese Kombination ist weiterhin unter
AA und deshalb in `design-system.md` („Bekannte Grenze: `text-error` auf `base-300`")
als Verbot festgehalten. Es gibt aktuell keine solche Aufrufstelle.
Abgesichert ist das durch `e2e/form-a11y.spec.ts` → „Accessibility — text-error
auf Buttons". Die Messmechanik liegt in `e2e/helpers/contrast.ts` und wird auch
vom Alert-Test benutzt — sie muss im Browser laufen, weil `oklch()` und
`color-mix(in oklab, …)` erst nach dem Gamut-Mapping nach sRGB als Kontrastwert
lesbar sind.

---

## Nur ein helles Theme

Das Theme ist mit `color-scheme: light`, `default: true` und `prefersdark: false`
konfiguriert — es gibt **kein** Dark Theme.

`dark:`-Varianten oder `data-theme`-Umschaltung deshalb nicht einbauen; sie sind
tote Klassen.

---

## Vorhandene Overrides respektieren

`app.css` korrigiert einige DaisyUI-Defaults bewusst. Diese Stellen nicht in
Komponenten gegen-patchen:

| Override                                               | Warum                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Alerts auf Soft-Style (`color-mix` 12 %, base-content) | DaisyUI-v5-Default-Alerts sind auf diesem Theme zu dunkel         |
| `.input/.select/.textarea:focus`                       | 3px-Outline in `primary` als deutlicher Focus-Indikator (WCAG)    |
| Formularfelder ≥ `1rem`                                | WCAG AA und verhindert Auto-Zoom auf iOS                          |
| `prefers-reduced-motion`                               | global entschärft — eigene Animationen brauchen keine Extra-Guard |

Ein `alert-soft` zusätzlich zu setzen ist überflüssig; die Klassen `alert-info`,
`alert-success`, `alert-warning`, `alert-error` liefern den Soft-Look bereits.

> **Zum Fokus-Override:** DaisyUI setzt für dieselben Felder ein eigenes
> `outline: 2px solid var(--input-color)` (= `--color-base-content`) innerhalb von
> `@layer utilities`. Der projekteigene Block in `app.css` steht ungelayert und
> gewinnt deshalb die Kaskade — unabhängig davon, dass die globale
> `:focus-visible`-Regel weiter unten in der Datei steht (die ist mit `(0,1,0)`
> weniger spezifisch als `.input:focus` mit `(0,2,0)`). Abgesichert ist das durch
> `e2e/form-a11y.spec.ts` → „Accessibility — Fokus-Indikator“; ein reiner Test über
> die CSS-Quelle würde eine Regression hier nicht bemerken.
>
> **Fallstrick beim Nachmessen:** `:focus` greift nur, wenn das Browserfenster den
> Fokus hat. Ein `getComputedStyle`-Sample aus einem unfokussierten Fenster (z. B.
> Browser-Automation ohne echten Klick) liefert stattdessen DaisyUIs 2px und
> `currentColor` (= `--color-base-content`) und sieht fälschlich nach einem Bug aus.
> Vor dem Messen `document.hasFocus() === true` prüfen.

> **Zum Alert-Override:** DaisyUI 5 kennt `alert-soft` nur als Modifier-Klasse pro
> Element. Einen offiziellen Weg, den Soft-Look global zum Default zu machen — etwa
> eine Theme-Variable oder Plugin-Option — gibt es bis einschließlich **5.7.4**
> nicht. Der `color-mix`-Override in `app.css` bleibt daher die richtige Lösung und
> ist kein Workaround, den man bei einem Update „endlich aufräumen" könnte. Erst
> wenn DaisyUI eine solche Option nachliefert, lohnt ein erneuter Blick.
>
> **Was der Override konkret tut:** Er setzt für `.alert-info/-success/-warning/-error`
> drei Dinge — Hintergrund auf `color-mix(… 12 %, base-100)`, Rahmenfarbe auf
> `color-mix(… 20 %, base-100)` und **Textfarbe auf `var(--color-base-content)`**.
>
> **Warum die Textfarbe nicht die Statusfarbe ist:** DaisyUIs `alert-soft` nimmt
> dafür `var(--alert-color)`, also die Statusfarbe auf einem 12-%-Tint ihrer selbst.
> Auf diesem Theme ergibt das im Browser gemessen 2,45:1 (warning), 3,33:1 (success),
> 3,40:1 (info) und 3,84:1 (error) — WCAG 1.4.3 verlangt 4,5:1. Es ist derselbe
> Fehler wie `text-*-content` auf einem Tint (`design-system.md`), nur eine Ebene
> tiefer. Mit `base-content` messen dieselben vier Flächen 14,2:1 bis 14,8:1.
> Abgesichert ist das durch `e2e/form-a11y.spec.ts` → „Accessibility — Alert-Kontrast";
> der Test muss im Browser laufen, weil sich `oklch()` + `color-mix(in oklab, …)`
> erst nach dem Gamut-Mapping nach sRGB als Kontrastwert lesen lassen.
>
> **Konsequenz für Aufrufstellen:** Die Statusbedeutung trägt jetzt das Icon (jede
> Variante hat eine eigene Form) plus der Hintergrund-Farbton. **Nicht** der Rahmen:
> die 20-%-Mischung erreicht nur ~1,1:1 gegen die Alert-Fläche und ist reine
> Dekoration. Ein Alert ohne Icon sieht deshalb in allen vier Varianten fast gleich
> aus — jedes `alert-*` braucht ein Icon.

---

## Geschlossene `.modal`-Dialoge sind kein Überlauf-Verdacht

Wer horizontalen Überlauf sucht und die Breiten im DOM misst, stolpert
zuverlässig über die Dialoge: DaisyUI blendet `.modal` **nicht** per
`display: none` aus, sondern über `visibility: hidden` — ein geschlossener
Dialog steht also weiter im DOM, hat eine Box und ist regelmäßig breiter als
sein Elternelement. Gemessen auf `/` bei 360 px (2026-08-04): der
`upload-notice-dialog` 360 px bei 250 px Elternbreite, das Bild-Modal aus
`SpeciesIdentificationHelp` 294 px bei 230 px.

**Das ist folgenlos.** `.modal` ist `position: fixed; inset: 0` — der Dialog ist
aus dem Fluss genommen, sein umschließender Block ist der Viewport, und er
zählt damit nicht in `documentElement.scrollWidth`. Belegt statt vermutet: der
Dialog per `style.width = '3000px'` aufgeblasen und zusätzlich um 2000 px nach
rechts geschoben — `scrollWidth` blieb in beiden Fällen bei 360. Ein
Kontroll-`div` derselben Breite **im** Fluss hob ihn sofort auf 3000. Dasselbe
gilt für den geöffneten Dialog (Top-Layer, weiterhin `fixed`).

Die Breite an den Elternkontext zu binden wäre also eine wirkungslose Änderung.
Beim Überlauf-Suchen gehören Dialoge übersprungen.

**Die eine Bedingung, die das umdreht:** Bekommt ein _Vorfahr_ eine Eigenschaft,
die einen umschließenden Block für `position: fixed` aufspannt — `transform`,
`filter`, `backdrop-filter`, `perspective`, `will-change`, `contain`,
`container-type` —, wird der Dialog flussrelativ und zählt mit. Derselbe
3000-px-Dialog trieb `scrollWidth` mit einem `transform: translateZ(0)` am
Elternelement auf 3055. `backdrop-filter` kommt in `SpeciesIdentificationHelp`
nur am `.modal-backdrop` vor, also an einem Nachfahren, und ist damit
unkritisch.

**Abgesichert ist das durch `e2e/modal-overflow.spec.ts`** — auf `/`,
`/bestimmungshilfe` und `/admin`, also an fünf der sechs
`class="modal"`-Fundstellen (`MediaModal` hängt hinter `{#if selectedMedia}` an
der Sichtungs-Detailansicht und steht auf keiner Route im Ruhezustand im DOM).
Ebenfalls nicht abgedeckt sind `hover:`-Zustände — der Test misst den
Ruhezustand. Der Vorbehalt gilt hier weiterhin; beim **Klassen**-Scan in
`design-system.md` ist er seit 2026-08-14 aufgehoben (dort steht die Klasse im
Attribut, hier hinge die Wirkung am Zeiger).
Der Test fragt **nicht** die
sieben Eigenschaften ab — eine solche Liste wäre eine zweite Quelle neben der
Spezifikation und altert mit ihr. Er misst die Wirkung: Dialog auf 3000 px
aufblasen, `scrollWidth` vorher/nachher vergleichen. Jede Route fährt zusätzlich
eine Gegenprobe, die dem Elternelement ein `transform` verpasst und verlangt,
dass der Überlauf dann **auftritt** — sonst wäre das Grün eines konformen
Bestands ohne Aussage. Davor klappt er jede Disclosure auf und wartet auf deren
Endzustand (Begründung im Abschnitt darunter); bleibt eine Dialogposition
dauerhaft abgeschnitten, bricht er ab, statt sie trivial zu bestehen.
Vorgeführt am 2026-08-04 mit einem `main { transform: translateZ(0) }` in
`app.css`: alle drei Routen rot, alle sechs Dialoge benannt.

### Ein `.collapse` schluckt den Überlauf, solange die Animation läuft

Wer im Teilbaum einer DaisyUI-Disclosure misst, misst unter Umständen gar
nichts. `.collapse-content` trägt **für die gesamte Dauer** der
Aufklapp-Animation `overflow-x: clip` und schaltet erst im Endzustand auf
`visible`. Gemessen auf `/` bei 360 px (2026-08-04, Foto-Disclosure aus
`PositionPanel.svelte`):

| Zustand                         | `grid-template-rows` (2. Spur) | `overflow-x` | `de.scrollWidth` |
| ------------------------------- | ------------------------------ | ------------ | ---------------- |
| zugeklappt                      | `0px`                          | `clip`       | 360              |
| direkt nach `details.open=true` | `7.3px`                        | `clip`       | 360              |
| nach Animationsende (~800 ms)   | `304px`                        | `visible`    | **3053**         |

In diesem Fenster kann **kein** Element darin `documentElement.scrollWidth`
bewegen — auch kein gewöhnliches `div` mit `width: 3000px` im Fluss. Wer direkt
nach `open = true` misst, landet immer darin und hält das Ergebnis
fälschlich für eine Aussage über das gemessene Element. Genau so verlor
`modal-overflow.spec.ts` seine Gegenprobe, als der `upload-notice-dialog` mit
PR #746 in diese Disclosure zog.

**Konsequenz für jede Überlauf-Suche, auch für `e2e/helpers/overflow.ts`:** Der
Bisect-Abstieg endet an der `.collapse` und misst darunter ins Leere — ein
Verursacher im Inneren bleibt unsichtbar, solange die Animation läuft oder die
Disclosure zu ist. Vor dem Messen deshalb aufklappen **und auf den Endzustand
warten**. Belastbar ist dabei nur die _Wirkung_: per `expect.poll` ein
3000-px-`div` im Fluss an die fragliche Stelle hängen und warten, bis es
`scrollWidth` bewegt. Die Höhe von `.collapse-content` taugt als Bedingung
nicht — sie wächst früher, als das `clip` verschwindet. Ein globales
`transition: none !important` per `addStyleTag` hat den Endzustand ebenfalls
nicht hergestellt.

**Was stattdessen funktioniert:** Teilbäume nacheinander auf `display: none`
setzen, nach jedem Schritt `document.documentElement.scrollWidth` messen und in
den Teilbaum absteigen, dessen Ausblenden den Überlauf beseitigt. Das liefert
den kleinsten Verursacher statt einer Liste mitgezogener Elternelemente.
Messen muss man dafür in einem echten 360-px-Viewport; Chrome selbst lässt sich
nicht so schmal ziehen.

**Das Verfahren steht als `findHorizontalOverflow` in `e2e/helpers/overflow.ts`**
— kein Wegwerf-Skript mehr nötig. `expectNoHorizontalOverflow(page, kontext)`
misst und benennt bei einem Befund den Verursacher samt Pfad. Ein Detail, das
beim Nachbauen von Hand regelmäßig fehlt: Ein einzelnes Kind auszublenden
genügt nicht, sobald zwei Bereiche unabhängig voneinander zu breit sind — dann
endet der Abstieg am gemeinsamen Elternelement. Der Helfer blendet deshalb im
zweiten Durchgang alle Geschwister aus und steigt in jeden Zweig ab, der für
sich allein noch überläuft. Angewendet in `e2e/horizontal-overflow.spec.ts`
(Meldeformular, alle vier Schritte, ab 320 px).

---

## Layout-Variablen

Radien und Größen kommen aus dem Theme, nicht aus Utility-Klassen:
`--radius-selector` (Checkbox/Radio/Toggle), `--radius-field` (Input/Select/Textarea),
`--radius-box` (Card/Alert/Modal), dazu `--border` und `--depth`.

Für konsistentes Aussehen die DaisyUI-Komponentenklassen (`card`, `input`, `alert`,
`fieldset`) nutzen — sie greifen automatisch darauf zu.

---

## iframe-Einbettung

Die App wird auf **meeresmuseum.de** in einem iframe eingebettet. Die Klasse
`.iframe-mode` blendet Navbar und Footer aus und verdichtet die Abstände.

Neue Seiten-Level-Elemente (Header, Navigation, Footer) müssen prüfen, ob sie im
iframe-Modus ausgeblendet oder angepasst gehören — sonst erscheinen sie doppelt
im eingebetteten Kontext.

---

## Dokumentation nachschlagen

Für DaisyUI-Komponenten **Context7** verwenden (`/saadeghi/daisyui`, versioniert
bis v5.x). Der GitMCP-Server zum DaisyUI-Repo liefert keine Komponenten-Doku — die
offizielle Doku liegt auf daisyui.com, nicht im Repository.
