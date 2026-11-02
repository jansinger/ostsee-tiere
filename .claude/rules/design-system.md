---
paths:
  - 'src/app.css'
  - 'src/lib/components/**'
  - 'src/lib/report/components/**'
  - 'src/routes/**/*.svelte'
---

# Design System

Verbindliche Regeln für UI-Änderungen: Feld-Pipeline, Button-Hierarchie, Barrierefreiheit.

**Theme, Farbtokens und DaisyUI-Overrides stehen in `daisyui.md`** (lädt bei denselben Dateien) — dort gilt: einzige Farbquelle ist `src/app.css`, keine Hex-Werte oder Tailwind-Graustufen, kein Dark-Theme. Diese Regel ergänzt das um die Punkte, an denen das Projekt in der Praxis gescheitert ist.

Begründung und verifizierter Ist-Zustand: `docs/DESIGN_GUIDE.md`.

---

## Die `*-content`-Regel (WCAG-relevant)

`text-primary-content`, `text-warning-content`, `text-info-content` usw. sind **ausschließlich** für Text auf der jeweiligen **Vollton**-Fläche gedacht.

Im Theme sind fast alle `*-content`-Farben reines Weiß (`oklch(1 0 0)`). Auf einem hellen Tint ergibt das rechnerisch rund **1,3:1** — weit unter den geforderten 4,5:1.

```svelte
<!-- ❌ FALSCH: weißer Text auf hellgelbem Tint -->
<div class="bg-warning/10">
	<h4 class="text-warning-content">Zusätzliche Informationen für Totfund</h4>
</div>

<!-- ✅ RICHTIG: Tint trägt normalen Body-Text, Akzent nur am Icon -->
<div class="bg-warning/10 border-warning/20 border">
	<h4 class="text-base-content">
		<Icon icon="lucide:triangle-alert" class="text-warning" aria-hidden="true" />
		Zusätzliche Informationen für Totfund
	</h4>
</div>
```

**Gegenprobe:** `*-content` ist nur dann korrekt, wenn die Elternfläche die volle Farbe ohne Opacity-Suffix trägt — `bg-primary text-primary-content`, `bg-success text-success-content`. Sobald ein `/10`, `/20`, `/5` an der Hintergrundklasse steht, gehört dort `text-base-content` (bzw. `text-base-content/80` für Sekundärtext) hin; die Statusfarbe darf nur Icon, Border oder eine kurze Auszeichnung tragen. Referenz-Implementierung: `src/lib/report/components/sections/DeadAnimal.svelte`.

---

## Statusfarben haben zwei Rollen

Die `*-content`-Regel oben deckt Text **auf** einer Farbe ab. Sie deckt nicht ab, dass die Farbe **selbst** als Vordergrund verwendet wird — und das ist der häufigere Fehler.

Gemessen auf `base-100` (Rechnung wie in `daisyui.md`, im Browser nach sRGB):

| Utility          | Kontrast   | WCAG 1.4.3 |
| ---------------- | ---------- | ---------- |
| `text-primary`   | 9,22:1     | ✅         |
| `text-error`     | 6,04:1     | ✅         |
| `text-info`      | **3,92:1** | ❌         |
| `text-success`   | **3,81:1** | ❌         |
| `text-warning`   | **2,74:1** | ❌         |
| `text-secondary` | **2,68:1** | ❌         |
| `text-accent`    | **1,55:1** | ❌         |

`text-warning` verfehlt mit 2,74:1 sogar die 3:1 aus WCAG 1.4.11 für grafische Objekte — es ist damit auch als **Icon-Farbe** nicht zulässig.

**Regel:** Die Basis-Statusfarbe ist ausschließlich Flächenfarbe. Für Text, Icons und Zahlen gibt es `text-*-strong` (definiert in `src/css/tokens.css`, als Utility nutzbar über den `@theme`-Block in `app.css`).

```svelte
<!-- ❌ FALSCH -->
<h4 class="text-warning">Totfund</h4>
<Icon icon="lucide:triangle-alert" class="text-warning" />
<div class="stat-value text-secondary">1.244</div>

<!-- ✅ RICHTIG -->
<h4 class="text-warning-strong">Totfund</h4>
<Icon icon="lucide:triangle-alert" class="text-warning-strong" />
<div class="stat-value text-secondary-strong">1.244</div>
```

**Gegenprobe:** Steht die Farbe hinter `text-`, `fill-` oder `stroke-`, muss `-strong` dranhängen. Steht sie hinter `bg-`, `btn-`, `badge-` oder `alert-`, darf sie es nicht.

**Die zweite Hälfte dieser Gegenprobe hat einen Vorbehalt** (seit 2026-08-14). Sie nimmt an, dass `btn-`/`badge-` eine Vollton-Fläche erzeugen. Ein Umriss-Modifikator kehrt das um — DaisyUI 5.7.16 setzt an `.btn-outline`, `.btn-dash`, `.btn-ghost`, `.btn-link`, `.badge-outline` und `.badge-dash` den Grund auf `#0000` und die Bauteil-Farbe auf `color`. Aus `badge badge-secondary badge-outline` wird damit dieselbe Textfarbe wie aus `text-secondary`: **2,68:1**, bei `accent` **1,55:1**. Der Klassen-Scan konnte das strukturell nicht sehen, weil beide Klassen einzeln zulässig sind und er je Klasse entscheidet; gefunden hat es der axe-Scan auf `/about`.

```svelte
<!-- ❌ FALSCH: Statusfarbe wird Text- und Rahmenfarbe auf durchsichtigem Grund -->
<span class="badge badge-secondary badge-outline">Ostsee</span>
<a class="btn btn-accent btn-outline">Tiere bestimmen</a>

<!-- ✅ RICHTIG: entweder Vollton — oder Umriss ohne Farbklasse -->
<span class="badge badge-secondary">Ostsee</span>
<a class="btn btn-outline">Tiere bestimmen</a>
```

`primary` und `error` bleiben zulässig; `btn btn-outline btn-error btn-sm` ist weiterhin die vorgeschriebene destruktive Variante. Gewacht wird das seither von `OUTLINE_STATUS_COLOR` (`e2e/helpers/bannedClasses.ts`) — der ersten Regel, die die **ganze** Klassenliste eines Elements auswertet (`appliesTo`) statt einzelner Klassen.

**Zwei der sechs Modifikatoren fallen nicht darunter, und beide Male entscheidet das nicht der Name.** `badge-ghost` setzt Fläche und Vordergrund fest auf `base-200`/`base-content` und ignoriert die Badge-Farbe (`BooleanStatus.svelte` schaltet genau zwischen `badge-ghost` und `badge-success`). Und `soft` heißt an Button und Badge nicht dasselbe — gemessen auf `base-100` am 2026-08-14:

| Farbe     | `btn-soft` | `badge-soft` |
| --------- | ---------- | ------------ |
| secondary | **2,50**   | 14,08        |
| accent    | **1,50**   | 15,31        |
| warning   | **2,54**   | 14,06        |
| info      | **3,56**   | 13,33        |
| success   | **3,49**   | 13,38        |

`btn-soft` ist damit **schlechter als der Umriss** — der Tint derselben Farbe holt den Hintergrund an den Vordergrund heran — und steht in der Regel. `badge-soft` besteht nur wegen des Overrides in `app.css` (Textfarbe `base-content`, Tint 18 %, seit 2026-08-10, dieselbe Korrektur wie bei den Alerts); DaisyUIs eigenes `.badge-soft` läge bei den `btn-soft`-Werten. Weil diese Ausnahme an einem Override hängt, ist sie in `design-tokens.spec.ts` mit einer eigenen Messung verankert: Ohne den Override misst `badge-soft badge-secondary` 2,28:1, und der Test wird rot, statt dass die Ausnahme still zur falschen Aussage wird.

Die über 60 Verstöße des Altbestands sind mit PR 4/4 (#620) abgearbeitet; seither ist die Gruppe „verbotene Kombinationen im DOM" in `e2e/design-tokens.spec.ts` ein **aktiver Guard** und kein `fixme` mehr. Sie fährt `/`, `/map`, `/about` sowie vier Admin-Routen (Session über `e2e/helpers/adminSession.ts`, ohne Auth0 — Begründung dort) — seit dem 2026-07-30 **alle sieben auch in CI**, gegen einen Postgres-Service mit Seed. Eine neue Fundstelle gehört an der Aufrufstelle behoben — nicht durch Aufweichen der Regel.

**Die Regeln stehen in `e2e/helpers/bannedClasses.ts`,** nicht als Regex-Literale im Spec, und sind über `bannedClasses.test.ts` an konstruierten Beispielen abgesichert (läuft in `npm run test:quick`). Der Grund: Ein Scan über einen konformen Bestand belegt nichts über die Regel — genau daran ist die Deckkraft-Lücke unentdeckt geblieben.

**Deckkraft-Suffixe werden mitgefangen** (seit 2026-07-30). `text-success/80` ist ein Verstoß wie `text-success`, und `bg-red-500/50` einer wie `bg-red-500`. Die Deckkraft-Regel vergleicht gegen die Schwelle /60 statt gegen die Literale 40 und 50 — ein `/30` auf Text ist damit ebenfalls ein Verstoß.

**`white` und `black` ebenfalls** (seit 2026-07-30). `bg-white`, `text-white`, `bg-black` und deren Deckkraft-Varianten umgehen das Theme genauso vollständig wie `bg-gray-100`, wurden von der Paletten-Regel aber strukturell nie erfasst: Sie tragen keine Farbstufe, und das Muster verlangte hinter dem Farbnamen eine Ziffernfolge. Es ist dieselbe Fehlerklasse wie beim Deckkraft-Suffix — die Lücke saß in der Grammatik des Musters, nicht in der Aufzählung der Farben. Der Ersatz ist je nach Fall `bg-base-100`, `bg-neutral`/`text-neutral-content` oder `bg-scrim/<n>`/`text-on-scrim` (siehe „Schleier über fremdem Inhalt" unten).

**`fill-` und `stroke-` ebenfalls** (seit 2026-07-30). Die Gegenprobe oben verlangt das `-strong` hinter allen drei Präfixen; im Muster stand nur `text-`. Notiert war das als bekannte Lücke, begründet mit „im Bestand gibt es derzeit keine solche Fundstelle" — dasselbe Argument, das `bannedClasses.ts` bei der Paletten-Regel ausdrücklich verwirft, wo zehn Farbtöne ohne Fundstelle ergänzt wurden. Erreichbar ist der Fall auch: `Icon.svelte` rendert `<svg class="…">`, und der Scan liest `class` per `getAttribute`. Ein SVG, das seine Fläche über `fill-` bezieht, trägt dabei genau das Kontrastproblem, um das es hier geht — `fill-warning` misst dieselben 2,74:1 und verfehlt damit auch die 3:1 aus WCAG 1.4.11. `stroke-current` und `fill-none` schlagen nicht an: sie enthalten keinen Farbnamen aus der Liste.

**Handgeschriebenes CSS deckt der Klassen-Scan nicht ab — dafür gibt es `e2e/helpers/bannedCss.ts`** (seit 2026-08-09). Ein `<style>`-Block in einer Svelte-Komponente hat keine Klassennamen, sondern Deklarationen; der DOM-Scan konnte ihn deshalb strukturell nie sehen, egal wie vollständig seine Farbliste war. Dieselbe Fehlerklasse wie bei `white`/`black` und den Deckkraft-Suffixen, nur eine Ebene höher: Die Lücke saß diesmal weder in den Daten noch in der Grammatik, sondern in der **Eingabe**. Gefunden hat sie ein `background-color: rgba(0, 0, 0, 0.9) !important` in `MediaThumbnail.svelte` — im selben File, dessen Kommentar die Abschaffung genau dieses Musters erklärt.

Die Regel prüft den **Quelltext** aller `<style>`-Blöcke und CSS-Dateien auf Hex sowie `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()` und `color()`. Ausgenommen ist dabei nur, was _innerhalb_ eines `var()`- oder `color-mix()`-Aufrufs steht (der Fallback in `var(--x, #fff)`) — nicht die ganze Zeile. Ein Literal daneben wird gemeldet, auch in `linear-gradient(#fff, var(--token))`. Sie läuft in Node (`npm run test:quick`), nicht im Browser. Ausgenommen sind namentlich vier Dateien (`tokens.css` als Quelle, die beiden Wetter-Icon-Stylesheets, `mapStyles.css`) — die Liste steht in `bannedCss.ts` und ist bewusst keine Verzeichnisregel.

**Konsequenz für Komponenten-CSS:** Auch ein Farbwert im scoped `<style>` kommt aus einem Token. Braucht ein Schleier dort mehr Deckkraft als die Utility hergibt, ist das `color-mix(in oklab, var(--scrim-surface) <n>%, transparent)` — nicht ein `rgba()` mit demselben Ergebnis.

**Varianten-Präfixe fängt der Scan seit 2026-08-14 mit.** `hover:text-warning` ist ein Verstoß wie `text-warning` — `stripVariants` in `bannedClasses.ts` schält `hover:`, `md:`, `group-hover:` usw. vor der Prüfung ab (und schneidet dabei nur an einem `:` außerhalb eckiger Klammern, damit `[&:hover]:z-50` heil bleibt). Hier stand vorher „Was der Scan nicht sieht: `hover:`-Zustände"; das galt für die **gemessene Farbe** und war für die **Klassenliste** falsch, die vollständig im `class`-Attribut steht.

**Was der Scan weiterhin nicht sieht:** den gemessenen Kontrast eines Hover-Zustands — `getComputedStyle` liefert ohne Zeiger den Ruhewert. Dafür gilt die Regel „`text-error` nicht auf `base-300`" unten.

**Erhöhter Kontrast heißt `prefers-contrast: more`, nie `high`** (seit 2026-08-09). `high` war der Entwurfsname des Merkmals; Media Queries Level 5 kennt `no-preference | more | less | custom`, und Tailwinds Variante `contrast-more:` erzeugt entsprechend `more`. Gemessen mit Playwright 1.62 bei aktiver Kontrasterhöhung (Kontext-Option `contrast: 'more'`):

| Query                      | Chromium 151 | WebKit 26.5 |
| -------------------------- | ------------ | ----------- |
| `(prefers-contrast: more)` | ✅ trifft zu | ✅          |
| `(prefers-contrast: high)` | ❌ nie       | ❌          |

Gegengeprüft nicht nur über `matchMedia`, sondern über eine echte Regel: eine Deklaration unter `high` setzt auch bei aktiver Kontrasterhöhung nichts. Die drei Blöcke im Bestand (`MediaThumbnail`, `MediaModal`, `SpeciesIdentificationHelp`) waren damit seit ihrer Einführung tot — kein Linter und kein Browser meldet das, weil die Regel syntaktisch in Ordnung ist. Gewacht wird jetzt über `e2e/helpers/bannedMediaFeatures.ts` (Quelltext-Scan, läuft in `npm run test:quick`).

**Konsequenz für neue Regeln:** Setzt die Regel nur Utilities (Rahmenbreite, Outline, Deckkraft), gehört sie als `contrast-more:`-Variante ins Markup und nicht als `@media`-Block ins Komponenten-CSS — dort steht der Merkmalsname dann gar nicht mehr von Hand.

**Beim Beheben nicht mechanisch ersetzen:** Erst prüfen, ob die Farbe an der Stelle Bedeutung trägt. Dekorative Icons und Zierelemente gehören auf `base-content/70` — nicht auf eine Statusfarbe mit `-strong`. Trägt ein Zeichen gar keine Bedeutung (Trennpunkt, Zierglyphe), gehört zusätzlich `aria-hidden="true"` daran; Beispiel: die Danksagungs-Trennpunkte in `src/routes/about/+page.svelte`.

Beim Prüfen per `grep` gilt außerdem: **`grep -o` schneidet das `-strong`-Suffix aus der Ausgabezeile**, ein nachgeschaltetes `grep -v -- -strong` filtert dann ins Leere und meldet jede korrekte Verwendung als Verstoß — so entstand die inzwischen korrigierte „32 Fundstellen"-Liste in `docs/DESIGN_SYSTEM.md`. Die Regeln im Scan umgehen das, indem sie die Klassenliste splitten und jede Klasse gegen ein verankertes Muster prüfen.

---

## Bekannte Grenze: `text-error` auf `base-300`

`--color-error` (`oklch(0.48 0.18 25)`, seit #599) ist als Textfarbe **nicht auf jeder
Fläche AA-tauglich**. Gemessen gegen die drei Basisflächen:

| Fläche     | Kontrast   | WCAG 1.4.3 (4,5:1) |
| ---------- | ---------- | ------------------ |
| `base-100` | 6,05:1     | ✅                 |
| `base-200` | 5,01:1     | ✅                 |
| `base-300` | **4,13:1** | ❌                 |

**Es gibt derzeit keine solche Aufrufstelle** — `base-300` dient im Projekt durchgängig
als Rahmen (`border-base-300`) oder Zeilen-Hover (`hover:bg-base-300`), `text-error`
sitzt immer auf `base-100`. Der Fall ist hier dokumentiert, weil er sich versehentlich
leicht herstellen lässt:

```svelte
<!-- ❌ Fehlerfall: im Hover-Zustand nur 4,13:1 -->
<tr class="hover:bg-base-300">
	<td><button class="btn btn-outline btn-error btn-sm min-h-11">Löschen</button></td>
</tr>
```

**Regel:** `text-error` (und die destruktive Button-Variante) nur auf `base-100` oder
`base-200` platzieren. Braucht eine Zeile mit destruktiver Aktion einen Hover, dann
`hover:bg-base-200` verwenden — nicht `base-300`.

Warum das **kein** E2E-Test absichert: Eine Schwellwert-Assertion (`≥ 4,5:1`) wäre heute
rot, und sie grün zu bekommen hieße `--color-error` zu ändern — ein Eingriff ins
Farb-Theme, den dieser hypothetische Fall nicht rechtfertigt. Ein DOM-Scan nach der
Kombination wiederum würde genau den riskanten Fall verfehlen, weil `hover:`-Zustände in
`getComputedStyle` im Ruhezustand nicht auftauchen. Der wirksame Ort für diesen Guard ist
deshalb die Regel hier, nicht `e2e/form-a11y.spec.ts`. Sobald eine echte Aufrufstelle
entsteht, gehört sie mit `measureContrast` (`e2e/helpers/contrast.ts`) gemessen.

**Dieselbe Grenze gilt für alle `-strong`-Varianten** aus dem Abschnitt oben: auf
`base-300` liegen sie bei ~3,77:1. `text-*-strong` gehört deshalb genauso auf
`base-100` oder `base-200` wie `text-error`. `e2e/design-tokens.spec.ts` prüft aus
demselben Grund nur diese beiden Flächen — `base-300` ist hier ein Verbot, kein
Testfall.

---

## Harte Grenze: `--color-info` und `--color-success` dürfen nie heller werden

Beide Flächen liegen konstruktionsbedingt dicht über der Schwelle. Weißer Text darauf ist bereits die **beste** verfügbare Wahl — `base-content` ist dort messbar schlechter:

| Fläche            | weißer Text | `base-content` |
| ----------------- | ----------- | -------------- |
| `--color-info`    | **4,65:1**  | 4,22:1 ❌      |
| `--color-success` | **4,56:1**  | 4,31:1 ❌      |

(Im Production-Build gemessen, sRGB nach Gamut-Mapping.)

Anders als bei `warning` und `secondary` — wo der Wechsel von Weiß auf `base-content` den Kontrast von 3,26 auf 6,05 bzw. von 3,19 auf 6,18 hob — gibt es hier **keine bessere Vordergrundfarbe ohne Farbtonänderung**. Der Puffer über 4,5:1 beträgt 0,15 bzw. 0,06.

**Regel:** Die Lightness von `--status-info-surface` und `--status-success-surface` (`tokens.css`) darf **nicht erhöht** werden. Ein „etwas freundlicheres Grün" oder „helleres Blau" schiebt `*-content` unter AA — und zwar in **jedem** `btn-info`, `badge-info`, `btn-success` und `badge-success` gleichzeitig.

**Wenn der Kontrast-Test in PR 2 unter 4,5:1 misst, ist die Konsequenz, die Lightness um 0,01–0,02 zu senken und neu zu messen — nicht die Schwelle im Test zu senken.** Die Schwelle ist die Anforderung, nicht die Stellschraube. Dasselbe gilt, falls ein Browser-Update das Gamut-Mapping minimal verschiebt.

---

## Deckkraft-Untergrenze für Text ist /60

`base-content` mit Deckkraft, im Browser gemessen (nicht aus den oklch-Werten
gerechnet — die Differenz beträgt hier bis zu 0,08):

| Stufe | base-100    | base-200    | base-300    |
| ----- | ----------- | ----------- | ----------- |
| /80   | 9,82 ✅     | 8,62 ✅     | 7,46 ✅     |
| /70   | 7,04 ✅     | 6,41 ✅     | 5,74 ✅     |
| /60   | 4,94 ✅     | 4,62 ✅     | **4,26 ❌** |
| /50   | **3,54 ❌** | **3,39 ❌** | **3,23 ❌** |
| /40   | **2,64 ❌** | **2,56 ❌** | **2,46 ❌** |

**Regel:** `/60` ist die Untergrenze für Text, und nur auf `base-100` und `base-200`. **Jeder Wert darunter** — `/50`, `/40`, `/30`, … bzw. das entsprechende `opacity-*` — ist ausschließlich für dekorative Flächen und für Zeichen ohne Bedeutung; nie für etwas, das gelesen werden muss. Der Scan prüft das als Schwelle und nicht als Aufzählung (`e2e/helpers/bannedClasses.ts`), damit `/30` nicht durchrutscht wie früher.

Sekundärtext gehört auf `/70`, nicht auf `/60`: Hilfetexte werden im Feld gelesen, bei Sonnenlicht an Deck, und dort ist der reale Kontrast deutlich niedriger als der gemessene.

---

## Typografie hat sechs Rollen

Größen werden nicht mehr pro Komponente gewählt. Die Rolle bestimmt die Größe:

| Rolle     | Größe | Verwendung                   |
| --------- | ----- | ---------------------------- |
| `display` | 32px  | Seitentitel (eine pro Seite) |
| `title`   | 24px  | Schritt-Titel, Panel-Titel   |
| `section` | 18px  | Abschnittstitel in Karten    |
| `body`    | 16px  | Fließtext, Formularfelder    |
| `label`   | 14px  | Feld-Label, Buttons          |
| `support` | 13px  | Hilfetext, Metadaten, Badges |

`text-support` ist bewusst 13px und nicht 12px (`text-xs`): unter Sonnenlicht an Deck ist 12px bei `/60` nicht mehr lesbar.

Dieselbe semantische Ebene darf nicht in zwei Größen erscheinen — heute ist der Abschnittstitel je nach Komponente `text-base`, `text-lg` oder `sm:text-lg`.

### Die eine eingetragene Ausnahme: die Admin-Arbeitsflächen

Die Admin-Seitentitel standen in drei Größen (`text-3xl`, `text-2xl`, `text-xl`),
je nach Entstehungszeit. Sie sind mit Befund 9 auf `text-display` vereinheitlicht —
**bis auf `admin/[id]/+page.svelte` (Detailansicht) und `admin/[id]/edit/+page.svelte`,
die bei `text-xl` bleiben** (Entscheidung Jan, 2026-08-09).

Die beiden Seiten sind Arbeitsflächen, keine Titelblätter: Der Kopf steht dort
direkt über der Aktionsleiste, mit der entschieden wird, und im
Warteschlangen-Modus schöbe ein 32px-Titel genau die Knöpfe nach unten, die man
Meldung für Meldung braucht.

Die Ausnahme ist **eine Zusage und kein Rest**: `adminPageHeadings.test.ts`
verlangt für die fünf Übersichtsseiten `text-display` und für diese beiden
`text-xl`. Wer sie mitzieht, macht den Test rot — und muss die Entscheidung
bewusst umdrehen, statt sie beiläufig aufzuräumen.

---

## Elevation, Z-Index, Motion nur aus Tokens

- **Schatten:** `shadow-raised` (Karten) oder `shadow-floating` (Panels, Modals, Toasts). Kein `shadow-sm`/`-md`/`-lg`/`-xl`/`-2xl`, keine handgeschriebenen `box-shadow` in Komponenten.

**Zwei Zugriffswege, ein Name.** Jeder Token dieser Ebene ist als Utility (`class="text-warning-strong"`) **und** als Variable (`style="box-shadow: var(--shadow-raised)"`) benutzbar. Die beiden Wege entstehen unterschiedlich, und das hat eine Konsequenz:

| Weg        | Woher                                        | Gilt für                                                                                                                  |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Utility    | `@theme`- oder `@utility`-Block in `app.css` | wird von Tailwind **on demand** erzeugt — nur wenn der Klassenname als vollständiger String im gescannten Quelltext steht |
| `var(--…)` | `:root` in `src/css/tokens.css`              | steht immer im ausgelieferten CSS                                                                                         |

Ein Token, das **nur** im `@theme`-Block steht, ist über `var()` nicht erreichbar: Tailwind backt Schatten- und Größenwerte direkt in die Utility und referenziert die Theme-Variable nie, sie landet also nicht im `:root`. Deshalb deklariert `tokens.css` jeden Wert selbst — inklusive der Aliase `--shadow-raised`/`--shadow-floating` auf `--elevation-*`. **Neuer Token heißt: Eintrag in `tokens.css` (für `var()`) UND ein Utility-Name in `app.css`** — sonst ist einer der beiden Wege still tot.

**Welcher der beiden `app.css`-Blöcke, entscheidet Tailwind, nicht der Geschmack.** `@theme` erzeugt nur für die Namespaces eine Utility, die Tailwind kennt (`--color-*`, `--shadow-*`, `--text-*`, …). Für **Z-Index und Übergangsdauer gibt es keinen solchen Namespace** — `--layer-panel` im `@theme`-Block bliebe eine Variable ohne Klasse. Diese neun stehen deshalb als `@utility z-panel { z-index: var(--layer-panel) }` bzw. `@utility duration-quick { … }` in `app.css` und verweisen von dort auf `tokens.css`. Beide Blöcke zusammen sind gemeint, wenn unten „Keine toten Utility-Klassen" von einem Eintrag in `app.css` spricht.

- **Z-Index:** `z-raised` (10), `z-panel` (20), `z-nav` (30), `z-overlay` (40), `z-skip` (50) — bzw. `--layer-*` über `var()`. Keine freien `z-*`-Utilities und keine `z-[…]`. Vorher lagen Navbar und Panel-Toggle beide auf `z-50` — welches Element oben lag, entschied damit die DOM-Position. Die Stufe nach **Zuständigkeit** wählen, nicht nach der Zahl, die vorher dort stand: Was muss dieses Element tatsächlich überlagern?

  **Die Karte ist der Fall, an dem das schiefging** (#812). Dort standen die schwebenden Bedienelemente auf `z-30` und wanderten mechanisch auf `z-nav` — dieselbe Zahl, also scheinbar folgenlos. Im selben Schritt fiel das Bottom-Sheet von `z-40` auf `z-panel` (20), und damit lagen Bedienelemente und Leerzustands-Meldungen plötzlich **über** dem Sheet. Auf Mobil war der Vergrößern-Knopf des Sheets nicht mehr klickbar, und die Meldung „Alle Sichtungen durch Filter ausgeblendet" verdeckte das Filter-Panel, mit dem man sie auflöst. Die verbindliche Ordnung auf `/map`:

  | Stufe            | Was dort liegt                                                                                                                  |
  | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `z-base` (0)     | Karten-Canvas (`ol-map-container`)                                                                                              |
  | `z-raised` (10)  | Kartenfläche: Titel-Badge, Arten-Leiste, Tooltip, Zoom-Gruppe, Standort-FAB, Logo-Platte, Listenansicht, Leerzustands-Meldungen |
  | `z-panel` (20)   | Karte/Liste-Umschalter, Panels und Bottom-Sheets                                                                                |
  | `z-nav` (30)     | Panel-Toggle                                                                                                                    |
  | `z-overlay` (40) | Fehler-Toast, Tastatur-Hilfe                                                                                                    |

  Umschalter und Sheet liegen bewusst auf derselben Stufe: Der Umschalter muss über der Listenansicht bleiben, das Sheet über dem Umschalter — mit fünf Stufen geht das nur über die DOM-Reihenfolge, und die Panels stehen dafür hinter dem Umschalter im Markup.

- **Dauer:**

  | Utility             | Token               | Wert  | Wofür                        | Kurve           |
  | ------------------- | ------------------- | ----- | ---------------------------- | --------------- |
  | `duration-instant`  | `--motion-instant`  | 120ms | Hover, Fokus                 | `--motion-ease` |
  | `duration-quick`    | `--motion-quick`    | 200ms | Aufklappen, Toast            | `--motion-ease` |
  | `duration-panel`    | `--motion-panel`    | 300ms | Panel, Bottom-Sheet, Overlay | `--motion-ease` |
  | `duration-emphasis` | `--motion-emphasis` | 400ms | Überschwung, Federung        | **`linear`**    |

  **Die `transition` gehört in die Basisregel, nie in die `:hover`-Regel.** Sie gilt sonst nur, solange der Hover aktiv ist, und weil sie eine Kurzschreibweise ist, ersetzt sie außerdem die Eigenschaftsliste, die DaisyUI mitbringt. In `app.css` erzeugte dieselbe Schreibweise dadurch zwei **verschiedene** Fehler — wer nur einen davon sieht, korrigiert am anderen vorbei:

  | Element | Was DaisyUI mitbringt                                                  | Fehler durch die `:hover`-Angabe                                                                                                                                                          |
  | ------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `.card` | nur `outline .2s`                                                      | Der Schatten hatte außerhalb des Hovers gar keinen Übergang → **sprang beim Verlassen zurück**                                                                                            |
  | `.btn`  | `color, background-color, border-color, box-shadow, transform` (0,2 s) | Das Anheben lief längst symmetrisch; die Angabe warf alles außer `transform` aus der Liste → **Farb- und Schattenwechsel sprangen beim BETRETEN hinein** und blendeten beim Verlassen aus |

  Daraus folgt für jede neue Regel dieser Art: erst nachsehen, was DaisyUI für das Element bereits deklariert, und dessen Eigenschaften in der eigenen Liste **mitführen** statt sie zu verdrängen (`app.css` tut das jetzt für beide).

  Abgesichert durch `e2e/hover-transitions.spec.ts`. Der Test misst die **Wirkung** — ob der Browser für die Eigenschaft einen Übergang startet (`transitionstart`) —, nicht den Regeltext; eine Quell-Assertion wäre eine zweite Quelle neben `app.css`. Er fragt aus demselben Grund auch **nicht** `transition-duration` im Ruhezustand ab: Der Wert ist dank DaisyUI an beiden Elementen auch ohne Korrektur ungleich `0s`, die Abfrage wäre also grün, ohne etwas zu belegen. Entscheidend ist die Eigenschaftsliste. Jeder Fall fährt zusätzlich die Gegenrichtung als Eigenprobe, damit ein Rot nicht von einem kaputten Test zu unterscheiden ist.

  **Nebenwirkung, die dabei gewollt ist:** Der ungelayerte Block in `app.css` schlägt `transition-*`-Utilities an einzelnen Aufrufstellen (je drei Karten und Buttons auf `/about`, `transition-all duration-instant`). Was sich dort ändert, ist an Karte und Button **nicht dasselbe**: Bei den Karten wird der Übergang 200 ms statt 120 ms (`--motion-quick` gegen `duration-instant`); bei den Buttons bleibt es bei 120 ms (`--motion-instant`), dort wechselt nur die Eigenschaftsliste von `all` auf die explizite Aufzählung. Beide gewinnen dabei die Richtung, die `transition-all` an dieser Stelle nicht abdeckte. Nicht betroffen sind Elemente, die kein `.card`/`.btn` sind: die Vorschaubilder (`MediaThumbnail`), die Logo-Platte der Karte und die Icons der About-Karten bringen ihren `hover:scale-*`-Übergang selbst mit.

  Die ersten drei beschreiben **Übergänge** und werden mit `--motion-ease` gefahren. `--motion-emphasis` ist keine Übergangsstufe: betonte Bewegungen bringen ihre Kurve über die Keyframe-Stops mit (`bounceIn`: `.3 → 1.05 → .9 → 1`). Eine zusätzliche Easing-Funktion biegt dort **jedes Segment einzeln** und lässt den Überschwung hektisch wirken — deshalb `linear`. Wer eine neue betonte Keyframe anlegt, nimmt diese Stufe und lässt die Kurve in den Stops.

### Vor dem Push: die vier Specs fahren, die das abdecken

```bash
npm run test:e2e -- e2e/map-panels.spec.ts e2e/map-accessibility.spec.ts \
  e2e/design-tokens.spec.ts e2e/hover-transitions.spec.ts
```

**Die DOM-Scan-Guards in `design-tokens.spec.ts` belegen die Schichtung nicht.** Sie prüfen, ob überhaupt Tokens verwendet werden („keine freien Z-Index-Utilities", „keine rohen Schatten-Utilities", „keine freien Übergangsdauern") — ob die **richtige Stufe** gewählt ist, sehen sie nicht. Bei #812 waren genau diese Guards grün, während der Vergrößern-Knopf des Sheets unter den Bedienelementen lag: Der Shard `smoke` lief zweimal hintereinander durch, rot war nur `map`.

Dass die Schichtung kippt, zeigt sich deshalb nicht als Schatten- oder Z-Index-Assertion, sondern als **`locator.click: Timeout 15000ms exceeded`** — Playwright wartet darauf, dass das Element klickbar wird, und ein anderes liegt darüber. Betroffen waren „Vergrößern-Button schaltet das Sheet auf expanded" (`e2e/map-panels.spec.ts`) und „Umschalter Karte/Liste zeigt Tabellenansicht" (`e2e/map-accessibility.spec.ts`). In keinem der beiden Specs kommt das Wort `z-index` vor — wer nach dem Begriff sucht, findet die Abdeckung nicht.

Die vier Specs verteilen sich auf alle drei CI-Shards (`map`, `smoke`, `form`), ein einzelner Shard-Lauf genügt also nicht.

---

## Breakpoint-Vertrag

Zwei Grenzen, mit Zuständigkeit:

- **`md` (768px)** ist die Grenze zwischen kompakt und weit. Alles Inhaltliche schaltet hier: Formular-Layout, Grid-Spalten, Panels (Bottom-Sheet ↔ Seitenpanel), Innenabstände.
- **`lg` (1024px)** schaltet ausschließlich die Navigation (Burger ↔ horizontales Menü).

`sm` ist **keine** Layout-Grenze mehr. Vorher schaltete das Formular bei `sm`, die Panels bei `md` und die Navbar bei `lg` — auf einem 800px-Tablet war das Formular damit „Desktop", die Navigation aber „Mobil".

---

## Alerts

Die Soft-Darstellung der Alerts kommt aus `app.css` (Details in `daisyui.md`). Für diese Regel zählt nur: `<div class="alert alert-warning">` genügt — den Override **nicht** per `bg-warning`/`text-warning-content`/`shadow-*` an der Aufrufstelle aushebeln, sonst entsteht genau der `*-content`-Fehler von oben.

Der Alert-Text steht in `base-content`, nicht in der Statusfarbe (WCAG 1.4.3, Messwerte in `daisyui.md`). Die Bedeutung trägt deshalb das **Icon** — jedes `alert-*` braucht eines, sonst sehen Warnung und Fehler praktisch gleich aus:

```svelte
<div class="alert alert-warning" role="alert">
	<Icon icon="lucide:triangle-alert" class="shrink-0" aria-hidden="true" />
	<span>Die Koordinaten liegen außerhalb der Ostsee.</span>
</div>
```

---

## Button-Hierarchie

- **Genau eine Primäraktion pro Bereich** (`btn btn-primary`). Im Formular ist das „Weiter"/„Absenden".
- Sekundäre Navigation („Zurück") und Nebenaktionen: `btn btn-outline`. Keine Vollton-Sekundärbuttons neben der Primäraktion — sie konkurrieren optisch mit ihr und wirken je nach Fläche wie deaktiviert.
- Zurückhaltende Aktionen (Toggles in Panels, Aufklapper): `btn btn-ghost`.
- Destruktive Aktionen (Löschen, Zurücksetzen) einheitlich in **einer** Variante über das ganze Formular — im Sichtungsformular `btn btn-outline btn-error btn-sm`. Nicht an einer Stelle `btn-warning`, an anderer `btn-ghost text-error`. Destruktives immer mit Bestätigung. (Das früher nötige `min-h-11` entfällt: die 44px kommen seit der Touch-Target-Regel aus `app.css`, siehe „Feldmodus und Touch-Targets".)
- Gleiche Aktion = gleiche Variante = gleiches Icon, egal in welcher Komponente sie auftaucht.
- Ein Button, der nichts bewirkt, gehört entfernt — nicht dekorativ stehen gelassen.

---

## Gesperrte Schaltflächen tragen `aria-disabled`, nicht `disabled`

Eine Schaltfläche, die gerade nicht ausgeführt werden darf, wird über
`aria-disabled="true"` gesperrt und bleibt fokussierbar. `disabled` nimmt sie aus
der Tab-Reihenfolge, und der Browser verwirft dabei den Fokus — wer per Tastatur
arbeitet, verliert seine Position, und zwar ausgerechnet während einer laufenden
Aktion. Die eigentliche Sperre übernimmt ein Wächter in der Handler-Funktion.

Begründet und angewendet in `PositionPanel.svelte` („Mein aktueller Standort"
während der Ortung), `FormSteps.svelte` und `StepProgressCompact.svelte` (noch
nicht erreichbare Schritte). Nebeneffekt, der das Muster zusätzlich trägt: der
`title` mit der Begründung („Bitte füllen Sie zuerst die vorherigen Schritte
aus") ist an einem `disabled`-Element per Tastatur nicht erreichbar.

### Der Vorbehalt: an einem `.btn` sperrt `aria-disabled` härter als gedacht

Die Regel gilt weiter — ihre Begründung trägt an einem DaisyUI-**Button** aber
nur zur Hälfte. `daisyui/components/button.css` (5.7.4, nachgemessen am
2026-08-06) legt an `.btn:is(:disabled, [disabled], .btn-disabled,
[aria-disabled=true])` ein `pointer-events: none`. Daraus folgt:

- **Der Wächter in der Handler-Funktion ist per Maus unerreichbar.** Der Klick
  kommt nie am Element an — er kann also auch nichts melden.
- **Der `title` mit der Begründung erscheint beim Hovern nie**, aus demselben
  Grund. Das Argument oben gilt nur für den Tastaturweg.
- Per Tastatur läuft Enter dagegen durch, landet im Wächter — und dort endete
  es bis zum UX-Review still.

Wo die Sperre eine **fehlende Eingabe** meint, ist eine Fehlermeldung die
richtige Form — sie hat dann etwas zu sagen, und eine unerreichbare
Schaltfläche sagt es nicht.

**Der beste Fall ist allerdings, dass es nichts zu sperren gibt.**
`ReportKindChoice.svelte` (Einstiegsseite) war die Aufrufstelle, an der dieser
Befund entstand: erst ein `aria-disabled`-Knopf, dann ein freier Knopf mit
Fehlermeldung an der Radiogruppe. Seit dem UX-Review 2026-08-07 hat sie
**gar keine Schaltfläche mehr** — die Frage ist eine Weiche mit zwei Zielen,
also zwei Links, und der Zustand „bestätigt, ohne etwas gewählt zu haben" ist
strukturell nicht mehr herstellbar. Wer vor einem gesperrten Knopf steht,
sollte deshalb zuerst prüfen, ob die Auswahl davor überhaupt eine Auswahl ist
oder in Wahrheit eine Navigation (Begründung im Markup dort).

`aria-disabled` bleibt richtig, wo die Sperre einen **laufenden oder noch nicht
erreichten Zustand** meint, den der Nutzer nicht durch Eingabe auflösen kann
(Ortung läuft, Schritt noch nicht erreicht) — dort gibt es keine Meldung, die
weiterhülfe. Bei den drei genannten Aufrufstellen ist das der Fall;
`FormSteps.svelte` und `StepProgressCompact.svelte` sind zudem keine `.btn`
und vom `pointer-events`-Befund gar nicht betroffen.

**Der dritte Fall: Die Begründung steht schon da.** `StepNavigation.svelte`
sperrt „Absenden" bei fehlender Verbindung — auflösen kann der Nutzer das nicht
durch Eingabe, eine neue Meldung wäre also fehl am Platz. `SubmitStatus` trägt
den Grund samt Datenzusage bereits dauerhaft **über** der Navigation. Trotzdem
ist `aria-disabled` hier falsch, und zwar aus einem Grund, der leicht übersehen
wird: Unterhalb `md` ist die Navigation ein ortsfester Balken am unteren Rand
(`.form-step-nav`) — die Begründung kann weggescrollt sein, während der Knopf
sichtbar bleibt. Wer dann drückt, bekam gar nichts.

Das Muster dort ist deshalb:

- **kein** `aria-disabled`/`btn-disabled`/`title` am Knopf — jede dieser
  Auszeichnungen zieht das `pointer-events: none` nach sich,
- `aria-describedby` auf die Begründungsfläche, damit der Grund am Knopf
  anliegt, ohne dass er angeklickt werden muss (das ersetzt den `title`, der
  ohnehin nur am Zeigegerät hing),
- der Wächter im Handler **springt zur Begründung und fokussiert sie**, statt
  still auszusteigen.

Die `id` der Fläche wird dafür aus `SubmitStatus.svelte` exportiert und nicht
auf beiden Seiten als Literal gepflegt — ein `aria-describedby` ins Leere meldet
niemand.

Hart über `disabled` gesperrt bleibt dort einzig der **laufende** Submit: sehr
kurz, nichts zu erklären, und ein Doppelklick hätte echte Folgen.

**Konsequenz für Tests — leicht zu übersehen:** Playwright wertet
`aria-disabled="true"` selbst als „nicht bedienbar" und klickt gar nicht erst.
Ein Test, der die Sperre prüfen will, läuft ohne `force: true` in einen Timeout
und bestätigt am Ende nur Playwrights eigene Actionability-Prüfung — die Sperre
der Anwendung wird dabei nie erreicht.

```ts
await expect(letzter).toHaveAttribute('aria-disabled', 'true');
await letzter.click({ force: true }); // ohne force: Timeout, App-Sperre ungeprüft
await expect(ersterSchritt).toHaveAttribute('aria-current', 'step');
```

Beispiel: `e2e/form-field-mode.spec.ts` → „Vorwärts bleibt gesperrt, solange der
Schritt unvollständig ist".

---

## Formularfeld-Muster

Alle Felder laufen über `FormField` → `FieldRenderer` (`src/lib/report/components/form/fields/`). Kein Feld baut Label, Fehleranzeige oder ARIA selbst.

**Genau eine Ausnahme: die Koordinaten.** `latitude`/`longitude` sind in `LocationInput.svelte` handgebaute Inputs — je nach GPS-Eingabeformat zwei bis sechs Stück, für die es kein einzelnes Schema-Feld gäbe. Die Pipeline kann diesen Fall nicht abdecken, die Regeln unten gelten dort aber trotzdem: Das `required`-Prop der Komponente ist die eine Quelle für Sternchen **und** `aria-required`, in allen drei Formaten. Wer dort ein Feld ergänzt, muss beides mitbringen.

**Was der Marker dort jeweils leistet, unterscheidet sich zwischen den zwei Aufrufstellen** — nicht aus Versehen, sondern weil `hasPosition` an beiden Orten etwas anderes ist:

| Aufrufstelle                                    | `hasPosition`                                             | Wirkung des Sternchens                                                       |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Admin-Maske (`sections/Location.svelte`)        | echtes Bedienelement (`<FormField name="hasPosition" />`) | steht am noch leeren Feld und kündigt die Pflicht an                         |
| Meldeformular (`position/PositionPanel.svelte`) | aus den Koordinaten abgeleitet (`syncHasPosition`)        | erscheint erst, wenn beide Koordinaten gefüllt sind, und bestätigt sie damit |

Im Meldeformular geht der Marker einem Validierungsfehler also nie voraus. Das ist die richtige Aussage und keine Lücke: Ohne Position ist die Ortsbeschreibung die gleichwertige Alternative — ein Sternchen am leeren Koordinatenfeld behauptete eine Pflicht, die dort nicht besteht. Die Pflicht liegt dann sichtbar auf `waterway` (`LocationDescription.svelte`). Wer hier „repariert", dass der Marker zu spät kommt, macht aus zwei Wegen einen.

- Label, Hilfetext, Platzhalter, Icon, Optionen und Feldtyp kommen aus dem Yup-Schema (`.label()` / `.meta({...})` in `src/lib/form/validation/sightingSchema.ts`), nicht aus dem Template.
- Pflicht-Markierung (`*`) und `aria-required` stammen aus **derselben** Variable in `FieldRenderer`. Nie eines von beidem separat setzen — sonst driften optische und semantische Pflicht auseinander.
- **Konditionale Pflichten** (Yup `when()`) sind aus `describe()` nicht ableitbar. Dafür den `required`-Override an `FormField` setzen — Beispiel `waterway` in `src/lib/report/components/form/position/LocationDescription.svelte`: `<FormField name="waterway" required={waterwayRequired} />`. Für die Koordinaten übernimmt das `required`-Prop von `LocationInput` dieselbe Rolle; gesetzt wird es an beiden Aufrufstellen aus `hasPosition` — der Bedingung, an der auch `latitude.when(...)` hängt.
- Neues Feld: im Schema definieren **und** in `formStepsConfig` (`src/lib/report/formConfig.ts`) dem richtigen Schritt zuordnen — sonst greift weder Schritt-Validierung noch Fehler-Navigation.
- `data-testid="field-<name>"` entsteht automatisch; keine eigenen Test-IDs an Feldern vergeben.
- Fehler **nie** beim Betreten eines Schritts anzeigen — erst nach einem gescheiterten „Weiter"-Versuch (`StepNavigation.svelte` / `stepNavigationState.ts`).

---

## Feldmodus und Touch-Targets

Das Formular wird an Deck und am Strand ausgefüllt — nass, in der Sonne, mit einer Hand, teils mit Handschuhen. 44px ist die WCAG-Größe für ruhige Hände.

- Touch-Targets kommen aus `--target-min` (44px, im Feldmodus 56px). Der `Touch-Targets`-Block in `app.css` setzt sie global durch — `min-h-11` an der Aufrufstelle ist damit nicht mehr nötig, und `btn-xs` unterschreitet die Grenze nicht mehr still.
- **Das Ziel ist 44px, nicht das Bedienelement.** WCAG 2.5.5 verlangt eine Trefferfläche dieser Größe — kein Control dieser Größe. Daraus folgen drei getrennte Mechanismen:

  | Element                                                                                                | Mechanismus                     | Größe                             |
  | ------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------- |
  | `.btn`, `summary.btn`                                                                                  | `min-height: var(--target-min)` | 44px (Feldmodus 56px)             |
  | `.btn-circle`                                                                                          | zusätzlich `min-width`          | 44×44                             |
  | `label:has(> .checkbox\|.radio\|.toggle)`                                                              | `min-height: var(--target-min)` | 44px — **hier liegt das Ziel**    |
  | `.checkbox`, `.radio`, `.toggle`                                                                       | `--size: var(--control-size)`   | 28px, sichtbare Größe             |
  | `.menu`-Einträge: `li > *` (ohne `ul`/`details`/Titel/`.target-exempt`) sowie `li > details > summary` | `min-height: var(--target-min)` | 44px — DaisyUI-Default wäre ~32px |

  `.checkbox`/`.radio`/`.toggle` **nie über `min-height`** vergrößern: DaisyUI setzt bei ihnen `width` **und** `height` fest, `min-height` überschreibt nur die Höhe und verzerrt sie (gemessen: Checkbox 24×44, Radio 24×44 als Ellipse, Toggle 40×44 mit versetztem Knopf). Und `--size` **nicht** auf `--target-min` setzen — dann greifen Control-Größe und Trefferfläche gleichzeitig, der Toggle würde 75×44 breit (im Feldmodus 96×56).

  Das `align-items: flex-start` an der Label-Regel ist nicht kosmetisch: ohne es streckt der Flex-Default `stretch` das Control wieder auf die volle Label-Höhe, sobald die `min-height` die Zeile aufzieht oder das Label mehrzeilig wird.

- Ausnahmen tragen `.target-exempt` und **begründen das im Code-Kommentar**. Zulässig nur für Ziele, die nachweislich nicht mit dem Finger bedient werden.
- Der Mindestabstand zwischen zwei Zielen ist `--target-gap`.
- Der Feldmodus wird über `<html data-density="field">` geschaltet und hebt `--target-min` auf 56px sowie `--text-support` auf 14px. Keine Komponente kennt den Modus — sie liest nur die Tokens.
- **Die eine Ausnahme nach Zeigerart: die schwebenden Bedienelemente der Karte** (seit 2026-11). Zoom, Zoom-All, Standort, Panel-Reiter, Karte/Liste und der Fenster-Link im iframe lesen `--map-control-min` statt `--target-min`. Das Token folgt `--target-min`, außer wenn das Gerät **gar keinen** groben Zeiger hat (`@media not (any-pointer: coarse)`) — dann 32px. Der Feldmodus gewinnt immer. Anlass war die Einbettung auf meeresmuseum.de (545×409): Die Touch-Größen verdeckten dort ein Drittel der Karte, obwohl der Besucher am Rechner sitzt.
  - **`any-pointer`, nicht `pointer`.** Ein Notebook mit Touchscreen meldet die Maus als primären Zeiger und wird trotzdem mit dem Finger bedient.
  - **Nicht auf `--target-min` selbst übertragen.** Das Formular wird an Deck ausgefüllt; die Zeigerart beim Laden sagt dort nichts über die Hand, die bedient.
  - DaisyUI-Buttons in diesem Bereich bekommen die Klasse `map-control-scope` (setzt `--target-min` lokal auf das Token) und `btn-sm` — sonst bleibt der Button über DaisyUIs eigene `height` bei 40px.
  - Abgesichert in `e2e/map-embed.spec.ts` (Maus: ≤ 32px, `hasTouch`: ≥ 44px) und `FilterPanel.svelte.test.ts` (Feldmodus: ≥ 56px).
- Die Primäraktion muss ohne Scrollen erreichbar sein: unterhalb `md` trägt die Schritt-Navigation `.form-step-nav` und wird zum ortsfesten Balken am unteren Rand (inkl. `env(safe-area-inset-bottom)`).

---

## A11y-Mindestanforderungen (WCAG 2.1 AA)

- Kontrast: **≥ 4,5:1** für Text (WCAG 1.4.3), **≥ 3:1** für grafische Objekte und UI-Begrenzungen (1.4.11).
- Touch-Targets: Projekt-Mindestmaß **44×44 px** für alles, was im Feld mobil bedient wird (WCAG 2.5.5 ist formal AAA — hier gilt es trotzdem, weil das Formular an Deck ausgefüllt wird). Durchgesetzt zentral in `app.css`, siehe „Feldmodus und Touch-Targets"; nicht per `.target-exempt` ohne Begründung aushebeln.
- Fokus muss sichtbar bleiben: `:focus-visible` und die Input-Fokus-Regel in `app.css` nicht durch `outline-none` überschreiben.
- Labels statt Platzhaltertexte. Ein `placeholder` ist Beispiel, nie Ersatz für das Label.
- Dekorative Icons bekommen `aria-hidden="true"`; informationstragende Icons brauchen ein `aria-label` am fokussierbaren Element.
- Radiogruppen als `fieldset`/`legend`, nicht als `label[for]` auf mehrere Inputs.
- **`aria-invalid` und `aria-required` einer Radiogruppe gehören an die Gruppe, nicht an die
  einzelnen Radios.** ARIA 1.2 hat beide aus den globalen Zuständen entfernt; `role="radio"`
  unterstützt sie seither nicht — `svelte-check` meldet sie am `<input type="radio">` als
  a11y-Warnung. Getragen werden sie vom `fieldset`, das dafür seine implizite Rolle `group`
  (die sie ebenfalls nicht unterstützt) mit `role="radiogroup"` überschreibt und sich per
  `aria-labelledby` an seiner Legend benennt. So umgesetzt in `FieldRenderer.svelte`.

  Das ist die Ausnahme von der Regel „Pflicht-Sternchen und `aria-required` aus derselben
  Variable": Dieselbe Variable, aber zwei Elemente — Sternchen in der Caption, `aria-required`
  am fieldset. Den Fehler-**Zustand** bekommen die Radios trotzdem, nur als Optik über
  `hasError` → `radio-error` (`BaseRadio.svelte`). Die native `required`-Angabe bleibt am
  Input: sie ist dort gültig und trägt die Constraint-Validierung.

  Wie `radio-error`/`radio-success` gebaut werden, steht im Abschnitt „Zustands-Optik der
  Auswahl-Controls" unten — die Regel gilt für Checkbox und Toggle genauso.

- Fehlermeldungen mit `role="alert"` und `aria-live="polite"`, referenziert über `aria-describedby` — und nur dann referenziert, wenn das Element tatsächlich gerendert ist.
- **`aria-label` braucht eine Rolle, die Naming unterstützt.** An einem nackten `<span>` gilt es nicht — ARIA erlaubt die Namensangabe nur an Elementen mit passender Rolle. Ein bedeutungstragendes Zeichen (das Pflichtfeld-Sternchen) bekommt deshalb `role="img"` dazu; ein bedeutungsloses bekommt `aria-hidden="true"` statt eines Labels. axe meldet den Fall als `aria-prohibited-attr`, aber unter `incomplete` — siehe den Absatz unten.

**Der axe-Scan wertet seit 2026-08-14 auch `incomplete` aus** (`e2e/axe-scan.spec.ts`). Vorher prüfte er nur `violations` und verwarf damit ein Drittel seines Ergebnisses: Auf `/about` standen zwei CTA-Knöpfe mit `btn-secondary btn-outline` (2,68:1), und der Scan war grün — axe konnte hinter dem durchsichtigen Grund den Verlauf nicht auflösen und legte sie unter `incomplete` ab. Geprüft wird jetzt gegen eine Liste aus Regel-ID, Obergrenze und **Begründung** je Route; eine neue Regel oder eine steigende Zahl macht den Test rot.

Die Arbeitsteilung dabei ist ausdrücklich benannt, weil sie sonst unterstellt würde: Der Deckel bemerkt **neue** unentscheidbare Stellen, nicht eine Farbänderung **innerhalb** einer bereits gelisteten (`/about` steht mit und ohne die fehlerhaften Klassen bei 25 Knoten). Farbe und Klassenkombination entscheiden die eigenen Messungen in `design-tokens.spec.ts` — nicht axe.

### Ein `incomplete`-Eintrag ist eine offene Frage, keine Ausnahme

Die Begründungen in `UNENTSCHIEDEN` sind beim Anlegen aus dem Selektor geraten worden, und zwei von ihnen waren falsch — nachgesehen am 2026-08-14 anhand von axes eigenem `data.messageKey`:

| Behauptet                                                  | Tatsächlich                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Artbadges liegen über den Artfotos" (`/bestimmungshilfe`) | `bgImage` = DaisyUIs `--depth`-Rausch-SVG an **jedem** `.btn`/`.badge`. Das Artfoto ist ein Geschwister im Flex-Kopf, kein Untergrund. Einer der zehn Knoten ist gar kein Badge, sondern der Rückweg-Knopf. |
| „Kartenkacheln und Attribution" (`/map`, 9 Knoten)         | Nur 7 lagen über Kacheln; 2 waren `btn`-Flächen mit demselben Rausch-SVG.                                                                                                                                   |

**Der praktische Unterschied zwischen `bgImage` und `imgNode`/`bgGradient` ist der ganze Befund.** Bei `bgImage` an einem `.btn`/`.badge` liegt darunter eine **deckende** Theme-Farbe — der Fall ist ausrechenbar und braucht nur eine Messung. `imgNode` und `bgGradient` heißen dagegen, dass wirklich etwas Fremdes durchscheint; nur dort ist eine Entscheidung nötig.

Beim Nachmessen ist die **Platte** zu messen, nicht der Text: `measureContrast` komponiert die _eigene_ Fläche eines Elements über den `backdrop`, und ein Text auf einer Platte ist selbst durchsichtig. Erst die Platte über der dunkelsten denkbaren Kachel messen, dann deren Ergebnis als `backdrop` des Textes verwenden (so gebaut in `design-tokens.spec.ts` → „Kontrast über fremdem Bildmaterial").

**Und: deckend ist nicht dasselbe wie fast deckend.** `bg-base-100/95` bestand den Kontrast mühelos (14,77:1), blieb für axe aber unentscheidbar — es sieht den Canvas dahinter. Erst die volle Deckung nahm die Knoten aus `incomplete` und ließ den `/map`-Deckel von 9 auf 2 sinken. Wo eine Platte Text trägt, ist das `/`-Suffix deshalb kein Geschmacksdetail.

---

## Zustands-Optik der Auswahl-Controls

Checkbox, Radio und Toggle zeigen den Validierungszustand über eine DaisyUI-Zustandsklasse.
`FieldRenderer` reicht dafür `hasError`/`isValid` durch; die Komponente baut daraus **genau
eine** Klasse, aufgebaut wie das `stateClass` in `BaseRadio`:

```js
const stateClass = hasError ? 'checkbox-error' : isValid ? 'checkbox-success' : 'checkbox-primary';
```

**Die Zustandsklasse ersetzt `*-primary`, sie ergänzt es nicht.** Alle drei setzen dieselbe
DaisyUI-Variable (`--input-color`) auf derselben Ebene (`daisyui.l1.l2`) und mit derselben
Spezifität. Stünden zwei am Element, entschiede die Reihenfolge im DaisyUI-Stylesheet statt
der im `class`-Attribut.

Der Neutralfall unterscheidet sich dabei bewusst von den Textfeldern: `BaseInput`/`BaseSelect`
setzen dort `''`, die Auswahl-Controls `*-primary`. Das ist keine Inkonsistenz zum
Aufräumen — ein Feld ohne Zustandsklasse sieht bei DaisyUI richtig aus, eine Checkbox ohne
`checkbox-primary` verlöre dagegen ihre Markenfarbe.

**Ein Prop, das die Komponente nicht annimmt, fällt still weg.** Genau so entstand der Fall:
`hasError`/`isValid` standen seit jeher in `commonFieldProps` und gingen über
`checkboxProps`/`toggleProps` hinaus — `BaseCheckbox` und `BaseToggle` deklarierten sie nur
nie, ihre Klasse stand hart auf `checkbox checkbox-primary` bzw. `toggle toggle-primary`. Ein
Feld mit Validierungsfehler sah dadurch aus wie ein fehlerfreies, ohne dass irgendwo etwas
brach. Ein Test an der Komponente allein bemerkt das nicht — er merkt nicht, wenn der Renderer
aufhört, die Props zu setzen. Die Strecke gehört deshalb in `FieldRenderer.svelte.test.ts`
mitgetestet.

### Der Toggle braucht zusätzlich einen `app.css`-Override

`checkbox-*` und `radio-*` setzen `--input-color` unbedingt; ihr Rahmen ist damit in **beiden**
Zuständen gefärbt. `toggle-error` und `toggle-success` tun das nicht — verifiziert in
`node_modules/daisyui/daisyui.css` (5.7.4) und im Browser nachgemessen:

```css
.toggle-error {
	@layer daisyui.l1.l2 {
		&:checked,
		&[aria-checked='true'] {
			--input-color: var(--color-error);
		}
	}
}
```

Die Farbe greift also nur im **eingeschalteten** Zustand. Der wahrscheinlichste Fehlerfall
eines Pflicht-Toggles ist aber der ausgeschaltete („muss zugestimmt werden") — dort rendert
ein `toggle-error` byte-identisch zu einem nackten `toggle`. Das Radio-Muster blind zu
übernehmen wäre für genau den Fall, um den es geht, optisch wirkungslos.

Den ausgeschalteten Zustand färbt deshalb ein Override in `src/app.css` (ungelayert, schlägt
damit DaisyUIs `@layer` — dieselbe Mechanik wie beim Fokus-Override):

```css
.toggle-error:not(:checked) {
	--input-color: var(--color-error);
}
```

Drei Punkte dazu:

- **Theme-Token, kein Hex und keine Palettenfarbe.** `e2e/design-tokens.spec.ts` scannt aktiv
  dagegen; der Override gehört nach `app.css` (einzige Source of Truth für DaisyUI-Overrides),
  nicht in die Komponente.
- **Ein roter AUS-Toggle liest sich nicht als „an".** Die Unterscheidung trägt die
  Knopfposition (`grid-template-columns` 0fr 1fr 1fr ↔ 1fr 1fr 0fr) und der Track-Hintergrund
  (transparent ↔ base-100), nicht die Farbe. Beides bleibt unangetastet.
- **Kontrast:** auf `base-100` misst `--color-error` 6,05:1 und `--color-success` 3,81:1.
  Rahmen und Knopf sind grafische Objekte — WCAG 1.4.11 verlangt dort 3:1, nicht die 4,5:1 für
  Text. Für **Text** reicht `--color-success` weiterhin nicht.

Abgesichert durch `e2e/form-a11y.spec.ts` → „Fehler-Optik am ausgeschalteten Toggle". Der Test
misst die **Wirkung** (welche Farbe kommt heraus) statt die Existenz einer CSS-Regel — eine
Regel-Assertion wäre eine zweite Quelle neben `app.css` und würde mit ihr altern. Er enthält
eine Gegenprobe, die DaisyUIs Default zurückholt und verlangt, dass Fehler- und Normalzustand
dann ununterscheidbar werden; ohne sie belegte das Grün nur, dass zwei Farben verschieden sind
— nicht, dass der Override das bewirkt.

---

## Icons

- UI-Icons ausschließlich über `src/lib/components/Icon.svelte` (unplugin-icons / lucide): `<Icon icon="lucide:map-pin" width="20" />`. Neue Icons dort einmalig importieren, nicht in Einzelkomponenten.
- Wetter-Icons sind CSS-basiert (`src/css/weather-icons*.css`): `<i class="wi wi-day-sunny"></i>`.

### Projekteigene Icons: `custom:` — eine begründete Ausnahme

Es gibt genau ein Icon außerhalb von Lucide: `custom:porpoise`
(`src/lib/components/icons/Porpoise.svelte`), registriert in `Icon.svelte` wie jedes
andere. Die Aufrufstelle merkt keinen Unterschied — `<Icon icon="custom:porpoise" />`.

**Warum die Ausnahme nötig war:** Das Tierart-Feld trug `lucide:fish`. Das Meeresmuseum
hat das beanstandet — gemeldet werden Wale, Schweinswale und Robben, keine Fische. Ein
Robben- oder Wal-Icon führt aber **kein** gängiger Satz: geprüft wurden Lucide, Tabler,
Phosphor, Iconoir, MDI und Icon-Park; die dortigen `seal`-Treffer sind durchweg
Wachssiegel. Ein zweiter Icon-Satz hätte das Motiv also nicht gelöst, aber den Stil
gebrochen.

**Es hält sich an die Lucide-Konventionen** — 24er-Raster, `fill="none"`,
`stroke="currentColor"`, `stroke-width: 2`, runde Enden — und steht deshalb neben den
übrigen Feld-Icons, ohne aufzufallen. Das Auge ist wie bei Lucide ein Pfad der Länge null
(`h.01`), der über `stroke-linecap: round` als Punkt rendert; es trägt bei 16–20 px
spürbar zur Erkennbarkeit bei. Eine gefüllte Silhouette wäre lesbarer gewesen, hätte aber
als einziges Vollton-Icon zwischen lauter Outline-Icons gestanden.

**Für neue Fälle gilt weiterhin Lucide.** Ein `custom:`-Icon ist erst dann richtig, wenn
belegt ist, dass kein Satz das Motiv führt — nicht, wenn das vorhandene nur nicht gefällt.
`iconRegistry.test.ts` prüft `lucide:` und `custom:` gleichermaßen, ein Tippfehler im
Namen fällt also weiterhin im Test auf und nicht erst beim Nutzer.

---

## Keine toten Utility-Klassen

Vor der Nutzung einer Utility prüfen, ob sie im Setup überhaupt existiert.

- Es ist **kein** Animations-Plugin installiert (weder `tailwindcss-animate` noch `tw-animate-css`). Klassen wie `animate-in`, `fade-in`, `slide-in-from-top-1` sind wirkungslos — sie sehen im Code nach Design aus und tun nichts.
- Für Ein-/Ausblendungen `transition:slide` / `transition:fade` aus `svelte/transition` verwenden (so gelöst in `sections/SightingDetails.svelte`).
- Gleiches gilt für `dark:`-Varianten (kein Dark-Theme, siehe `daisyui.md`).
- Umgekehrt gilt: **eine Keyframe ist nicht tot, nur weil keine Klasse sie nennt.** `fadeIn`, `bounceIn` und `spin` in `app.css` hängen an inline-`style="animation: …"` (`map/LoadingOverlay.svelte`, `MaintenanceBanner.svelte`). Vor dem Löschen einer Keyframe deshalb nach dem **Namen** greppen, nicht nach einer Klasse.
- **Aber der Name allein genügt auch nicht.** `loadingPattern` stand bis 2026-08-09 in dieser Liste und war trotzdem tot: Seine einzige Aufrufstelle in `media/MediaThumbnail.svelte` wurde von einer Gegenregel im selben `<style>`-Block dauerhaft abgeschaltet (`.media-thumbnail img[src] { background: none !important }`, und `src` steht im Markup als Literal). Ein Grep nach dem Namen fand die Regel, die Animation lief nie. Zu prüfen ist deshalb, ob die Regel den Zustand auch **erreicht** — nicht nur, ob sie existiert.
- Neue eigene Utility (`text-*-strong`, `shadow-raised`, `text-support`, …) heißt: Eintrag im `@theme`-Block von `app.css` — oder, wo Tailwind keinen passenden Namespace hat (`z-panel`, `duration-quick`), im `@utility`-Block darunter. Ein Token, das nur in `src/css/tokens.css` steht, ist eine CSS-Variable — **keine** Utility-Klasse. Fehlt der Eintrag in `app.css`, ist `class="text-warning-strong"` genau so tot wie `animate-in`.
- **Und ein Feld auf `/styleguide`.** Tailwind erzeugt eine Utility nur, wenn ihr Name als vollständiger String im gescannten Quelltext steht — sieben der dreizehn eigenen Utilities haben ihre einzige Aufrufstelle auf dieser Seite. Ein dort gelöschtes Farbfeld nimmt die Klasse still aus dem Build. Abgesichert durch `e2e/design-tokens.spec.ts` → „Utilities haben einen Vertreter auf /styleguide": Der Test liest die Tokens aus `tokens.css` und verlangt für jeden ein Element mit der zugehörigen Klasse.

  **`bg-scrim` und `text-on-scrim` stehen bewusst außerhalb dieser Gruppe.** Der Wächter zielt auf Utilities, deren einzige Aufrufstelle `/styleguide` ist — dort nimmt ein gelöschtes Farbfeld die Klasse still aus dem Build. Die Schleier-Utilities haben zehn Aufrufstellen in Komponenten; sie können nicht versehentlich verschwinden. Ein `UTILITY_GROUPS`-Eintrag würde außerdem ein Element mit dem unverdünnten `bg-scrim` auf der Seite erzwingen — eine Klasse, die es sonst nirgends gibt, nur damit ein Test grün wird. Wer den Schleier später auf `/styleguide` zeigen will (die Deckkraft-Tabelle oben wäre der Ort), kann die Gruppe nachziehen.

---

## Randbereiche: wo Hex-Werte erlaubt sind

Drei Bereiche dürfen Hex-Werte enthalten — aber jeweils nur an **einer** Stelle:

| Bereich           | Warum Hex nötig ist                                | Wo die Werte stehen dürfen                |
| ----------------- | -------------------------------------------------- | ----------------------------------------- |
| OpenLayers-Canvas | Canvas kann keine CSS-Variablen lesen              | `src/lib/map/mapTokens.ts`                |
| Marker-Palette    | Datenkodierung, farbfehlsichtigkeits-sicher (Wong) | `src/lib/map/styleUtils.ts` (unverändert) |
| E-Mail-Templates  | Clients kennen `oklch()`/`color-mix()` nicht       | `src/lib/server/templates/emailTokens.ts` |

Überall sonst gilt weiterhin: keine Hex-Werte, keine Tailwind-Paletten-Farben (`daisyui.md`). Abgesichert durch den DOM-Scan in `e2e/design-tokens.spec.ts`.

**Der Overlay-Schleier ist bewusst _kein_ vierter Eintrag.** Er sah lange nach einem aus: `bg-black/50` hinter einem Medien-Modal ließ sich mit „das Theme kennt keine Abdunklung" begründen, und das stimmte sogar. Nur ist eine Abdunklung kein Fall, den ein Canvas oder ein E-Mail-Client erzwingt — sie war schlicht nie modelliert. Seit dem 2026-07-30 gibt es dafür ein Token (`--scrim-surface` → `bg-scrim/<n>`, `text-on-scrim`, siehe unten). Damit ist der Bereich kein Randbereich mehr, sondern normale Token-Nutzung, und die Paletten-Regel im Scan bleibt ausnahmslos.

---

## Schleier über fremdem Inhalt: `bg-scrim/<n>`

Ein Schleier verdunkelt etwas, das die App nicht kennt — ein hochgeladenes Foto, ein Videobild, eine Kartenkachel, die Seite hinter einem Modal. Er ist damit **keine Fläche des Themes**, sondern eine Abschwächung dessen, was darunter liegt.

```svelte
<!-- ❌ FALSCH — umgeht das Theme, seit 2026-07-30 vom Scan gemeldet -->
<div class="bg-black/40"><Icon icon="lucide:eye" class="text-white" /></div>

<!-- ✅ RICHTIG -->
<div class="bg-scrim/40"><Icon icon="lucide:eye" class="text-on-scrim" /></div>
```

Drei Punkte, die dabei regelmäßig verwechselt werden:

- **Der Farbton gehört ins Token, die Deckkraft an die Aufrufstelle.** `--scrim-surface` ist neutrales Schwarz und **kein** Markenton: jede Farbe mit Chroma verschiebt den Farbton des Fotos darunter. Wie viel durchscheinen soll, hängt dagegen vom Bild ab und bleibt Komponentensache.
- **`text-on-scrim`, nicht `*-content`.** Ein Schleier ist per Definition durchscheinend; `*-content` gilt laut der Regel ganz oben ausschließlich auf Vollton-Flächen. Der eigene Name hält beide Konventionen sauber getrennt.
- **Ein Schleier ist nicht dasselbe wie eine Fläche, die zufällig hell oder dunkel sein muss.** Braucht ein Element eine helle Fläche (Logo-Platte, Codeblock), ist das `bg-base-100`; braucht es eine dunkle (weißes Logo darauf), ist das `bg-neutral` mit `text-neutral-content`. Nur wenn fremder Inhalt _durchscheinen_ soll, ist es ein Schleier.

**Ein Schleier über einer bekannten Theme-Fläche ist ein Verdachtsfall, kein Schleier.** Genau daran hing der auffälligste Fehler des Bestands: In `MediaThumbnail.svelte` lag ein `bg-black/20` nicht über einem Foto, sondern über `bg-base-200` — das weiße Icon darauf erreichte 2,27:1 und verfehlte WCAG 1.4.11 (3:1). Ist der Untergrund bekannt, ist der Kontrast ausrechenbar und gehört ausgerechnet (dort jetzt `/60` = 7,34:1).

### Trägt der Schleier einen Vordergrund, ist `/60` die Untergrenze

Über fremdem Inhalt ist der Kontrast nicht bestimmt — aber sein **schlechtester Fall** ist es sehr wohl: ein Foto, das an der Stelle des Icons reinweiß ist. Weiß auf einem schwarzen Schleier über Weiß, gerechnet:

| Schleier | Kontrast (weißer Vordergrund über weißem Bild) | WCAG 1.4.11 (3:1) |
| -------- | ---------------------------------------------- | ----------------- |
| `/20`    | 1,61:1                                         | ❌                |
| `/30`    | 2,11:1                                         | ❌                |
| `/40`    | 2,85:1                                         | ❌                |
| `/50`    | 3,98:1                                         | ✅                |
| `/60`    | **5,74:1**                                     | ✅                |

**Regel:** Sobald auf dem Schleier selbst etwas Sichtbares liegt — Icon, Spinner, Text — gilt `bg-scrim/60` als Untergrenze. `/60` und nicht das gerade noch ausreichende `/50`, aus demselben Grund wie bei der Deckkraft-Untergrenze für Text: Der Wert soll nicht auf der Schwelle balancieren.

Ausgenommen sind Schleier **ohne** eigenen Vordergrund. Ein reiner Modal-Backdrop (`MediaModal`, `DeleteDialog`, das Hilfe-Overlay in `SightingsMapView`) und ein inhaltsloser Hover-Hinweis (`MediaThumbnail`, Video-Zweig, `/20`) dürfen leichter sein — was dort gelesen werden muss, steht auf einer eigenen `bg-base-100`-Fläche darüber, nicht auf dem Schleier.

---

## Zahlen in Nutzertexten nur mit Quelle

Hilfetexte und Tooltips (`meta.helpText` / `meta.valueText` im Yup-Schema) werden Bürgern als Aussage eines Forschungsmuseums präsentiert. Statistische Behauptungen ohne belegte Quelle gehören dort nicht hinein — im Zweifel die Aussage qualitativ formulieren („Bei ruhiger See sind Tiere leichter zu entdecken") statt eine Zahl zu erfinden.

**Durchgesetzt durch `src/lib/form/validation/sightingSchemaClaims.test.ts`.** Der Test schlägt fehl, sobald ein `valueText` eine Zahl enthält, die nicht in `REVIEWED_NUMERIC_TEXTS` mit Quelle hinterlegt ist. Eine neue Zahl einzubauen erzwingt also, die Herkunft zu dokumentieren.

### Was konkret nicht geht

| Muster              | Beispiel (entfernt)                                 | Problem                                         |
| ------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Erfundene Statistik | „73% der Sichtungen erfolgen morgens"               | Eigene DB sagt 10,6 % — widerlegt               |
| Erfundene Stückzahl | „47 neue Verhaltensweisen dokumentiert"             | Nicht belegbar                                  |
| Fremde Institution  | „für den IPCC-Meeresspiegel-Report verwendet"       | Frei erfunden, beschädigt fremden Ruf mit       |
| Verwertungszusage   | „Ihre Fotos werden in Publikationen verwendet"      | Kann die Plattform nicht garantieren → „können" |
| Superlativ          | „die präziseste Methode für Populationsschätzungen" | Nicht belegbar                                  |

### Wenn eine Zahl belegt ist

Quelle im Text erkennbar machen, nicht als nackte Prozentzahl:

```ts
// gut — Herkunft steht im Satz, Eintrag in REVIEWED_NUMERIC_TEXTS begründet ihn
valueText: 'einzelne Schiffe melden laut unserer Sichtungsdatenbank seit über 20 Jahren immer wieder Sichtungen';
```

### Grenze der eigenen Datenbasis

Die Tabelle `sichtungen` enthält **nur positive Meldungen, keinen Beobachtungsaufwand und keine Nullbeobachtungen**. Aussagen der Form „bei Bedingung X werden N-mal mehr Tiere entdeckt" lassen sich daraus grundsätzlich nicht ableiten — dafür wäre bekannter Suchaufwand nötig. Auch die zeitliche Verteilung der Meldungen bildet primär den Rhythmus der Beobachtenden ab (Mittagsgipfel 11–14 Uhr), nicht den der Tiere.
