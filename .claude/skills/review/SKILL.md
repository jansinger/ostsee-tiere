---
description: Code-Review der geänderten Dateien mit projektspezifischen Anti-Pattern-Checks (Svelte-4-Syntax, any-Typen, unsanitisiertes HTML, globaler $state in .ts, nicht-parametrisierte SQL) plus /simplify. Nutze dies wenn der User ein Review, eine Qualitätsprüfung oder Anti-Pattern-Analyse der Änderungen möchte.
argument-hint: "[optionaler Scope, z.B. 'nur staged' oder ein Dateipfad]"
allowed-tools: Bash, Read, Grep, Glob
context: fork
---

# Code Review

Führt eine Code-Qualitätsprüfung auf geänderten Dateien durch.

## Argumente

`$ARGUMENTS` - Optionaler Scope (z.B. "nur staged", "alle Änderungen", spezifische Datei)

## Workflow

### Schritt 1: Geänderte Dateien ermitteln

```bash
# Staged + Unstaged Änderungen
git diff --name-only HEAD
# Falls keine Änderungen: Diff zum main Branch
git diff --name-only main...HEAD
```

### Schritt 2: Anti-Pattern Checks

Prüfe jede geänderte `.svelte` und `.ts` Datei auf diese projektspezifischen Anti-Patterns:

#### Svelte 4 Event Syntax (KRITISCH)

```bash
# In .svelte Dateien: on:click, on:submit, on:blur etc. sind Svelte 4
grep -n 'on:click\|on:submit\|on:blur\|on:change\|on:input\|on:keydown' <file>
```

**Fix:** `on:click` → `onclick`, `on:submit` → `onsubmit` etc.

#### TypeScript `any` Typen

```bash
grep -n ': any\b\|as any\b' <file>
```

**Fix:** Expliziten Typ verwenden.

#### Unsanitisiertes HTML (SICHERHEIT)

```bash
# {@html ...} ohne sanitizeHtml() ist ein XSS-Risiko
grep -n '{@html' <file>
```

**Fix:** Immer `sanitizeHtml()` aus `#lib/utils/sanitize` verwenden.

#### Globaler $state in .ts Dateien (SSR-Leak)

```bash
# $state in .ts (nicht .svelte.ts) Dateien leakt zwischen Usern
grep -n '\$state(' <file>
```

**Erlaubt in:** `.svelte` und `.svelte.ts` Dateien. **Verboten in:** regulären `.ts` Dateien.

#### Nicht-parametrisierte SQL

```bash
# Template Literals mit Variablen direkt in SQL
grep -n '`SELECT.*\${' <file>
```

**Fix:** Drizzle `sql` Tagged Template oder Repository Pattern verwenden.

#### Accessibility & Design-System (WCAG 2.1 AA)

Verbindliche Regeln: `.claude/rules/design-system.md`. Hier nur die praktikablen Checks für geänderte `.svelte`-Dateien.

**1. Kontrast bei `*-content` auf Tint-Hintergrund**

```bash
# *-content Text auf bg-*/10, /20 ... ist im Theme "meeresmuseum" (src/app.css)
# fast immer reines Weiß -> auf hellem Tint unlesbar (Praxisfall: gemessen 1,3:1)
grep -n 'text-[a-z]*-content' <file>
```

Bei Treffer: zugehörige `bg-*/NN`-Klasse suchen und Kontrast messen. Richtwerte: Text ≥ 4.5:1, große Schrift (≥ 24px bzw. 19px bold) ≥ 3:1, Icons/grafische Objekte ≥ 3:1.

**Messmethode im laufenden Dev-Server:** Theme-Farben sind in `oklch()` notiert, `getComputedStyle` gibt diese Notation unverändert zurück. In der Browser-Konsole:

```js
getComputedStyle(el).color; // "oklch(...)"
getComputedStyle(el.closest('[class*="bg-"]')).backgroundColor;
```

Zur Umrechnung `oklch → sRGB` einen Canvas-2D-Context nutzen (`ctx.fillStyle = wert`, dann `ctx.getImageData` auslesen) statt manueller Formel, danach WCAG-Kontrastformel auf die RGB-Werte anwenden.

**2. Formularfelder**

- Pflicht-Sternchen und `aria-required` müssen aus derselben Quelle stammen (z.B. `required`-Prop), nicht getrennt gepflegt werden.
- Fehlermeldung: `role="alert"` + Verknüpfung per `aria-describedby` mit der Feld-ID.
- Sichtbares `<label>` vorhanden — `placeholder` allein ersetzt kein Label.

```bash
grep -n 'placeholder=' <file>
```

**3. Interaktive Elemente**

```bash
# Klickbare div/li/span statt button/a
grep -n 'onclick' <file>
```

- Echte `<button>`/`<a>` statt klickbarer `<div>`/`<li>`/`<span>` verwenden.
- ARIA-Rollen nur vollständig: `role="tab"` ohne zugehöriges `role="tabpanel"` (+ `aria-controls`/`aria-selected`) ist ein Fail.
- Tastaturbedienbarkeit und sichtbarer Fokus (`:focus-visible`) prüfen; Touch-Targets ≥ 44×44px.

**4. Dekorative Icons**

```bash
grep -n "~icons/" <file>
```

Icon ohne eigene Bedeutung (rein dekorativ, Text daneben vorhanden) → `aria-hidden="true"`.

**5. Tote Utility-Klassen**

```bash
# Kein Animations-Plugin installiert - diese Klassen greifen nicht
grep -n 'animate-in\|slide-in-from-top\|slide-in-from-bottom\|fade-in\|zoom-in' <file>
```

Bei Treffer: prüfen ob die Utility im Setup (`tailwind.config`, installierte Plugins) überhaupt existiert, sonst entfernen oder durch eine funktionierende Animation ersetzen.

### Schritt 3: /simplify ausführen

Führe `/simplify` auf den geänderten Dateien aus für allgemeine Code-Qualität:

- Wiederverwendung bestehender Utilities
- Effizienz und Lesbarkeit
- Unnötige Komplexität

### Schritt 4: Ergebnis zusammenfassen

Zeige einen strukturierten Report:

```
Code Review Ergebnis
====================

Geprüfte Dateien: N
Anti-Pattern gefunden: N

KRITISCH:
- [datei:zeile] Svelte 4 Event Syntax: on:click → onclick

WARNUNG:
- [datei:zeile] TypeScript any Typ gefunden

HINWEIS:
- [datei:zeile] Globaler $state in .ts Datei

A11Y:
- [datei:zeile] Kontrast text-warning-content auf bg-warning/10 (gemessen 1,3:1, Ziel ≥ 4.5:1)

/simplify Ergebnis:
- [Zusammenfassung der Findings]
```

## Checkliste

- [ ] Keine Svelte 4 Event Syntax
- [ ] Keine `any` Typen
- [ ] Kein `{@html}` ohne Sanitisierung
- [ ] Kein globaler `$state` in `.ts` Dateien
- [ ] Keine nicht-parametrisierte SQL
- [ ] Kontrast `*-content` auf Tint-Hintergrund ≥ 4.5:1 (groß/Icons ≥ 3:1)
- [ ] Formularfelder: Pflicht-Markierung = `aria-required`, Fehler mit `role="alert"` + `aria-describedby`, sichtbares Label
- [ ] Echte `<button>`/`<a>` statt klickbarer `<div>`/`<li>`, ARIA-Rollen vollständig, Fokus sichtbar, Touch-Target ≥ 44px
- [ ] Dekorative Icons mit `aria-hidden="true"`
- [ ] Keine toten Utility-Klassen (z.B. `animate-in` ohne Plugin)
- [ ] Code-Qualität durch /simplify geprüft
