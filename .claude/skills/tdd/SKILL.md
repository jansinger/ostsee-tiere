---
description: Führt Test-Driven Development durch — RED → GREEN → REFACTOR. Nutze dies bei neuen Features und Bugfixes, um den Test vor der Implementierung zu schreiben (im Projekt verpflichtend).
argument-hint: '<Beschreibung des Features oder Bugs>'
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
---

# Test-Driven Development

Führt Test-First Development für ein neues Feature oder einen Bugfix durch.

## Argumente

`$ARGUMENTS` - Beschreibung des Features oder Bugs (z.B. "validateEmail Utility", "fix: distance parameter ignored in showreports")

## Workflow

### Schritt 1: Verstehen

Analysiere was implementiert oder gefixt werden soll:

1. **Lese relevante Dateien** — bestehenden Code, Typen, Interfaces
2. **Identifiziere die Test-Datei** — co-located neben der Source-Datei:
   - Source: `src/lib/utils/email.ts` → Test: `src/lib/utils/email.test.ts`
   - Source: `src/lib/components/MyComp.svelte` → Test: `src/lib/components/MyComp.svelte.test.ts`
   - Source: `src/routes/api/*/+server.ts` → Test: daneben als `+server.test.ts`
3. **Prüfe ob Test-Datei bereits existiert** — falls ja, bestehende Tests lesen und verstehen

### Schritt 2: RED — Test schreiben (fehlschlagend)

Schreibe den Test **bevor** du die Implementierung anfasst.

**Regeln:**

- Test muss **fehlschlagen** weil die Implementierung fehlt/falsch ist
- Teste das **Verhalten**, nicht die Implementierung
- Ein Test = ein Verhalten
- Namen auf Deutsch, beschreibend

```typescript
// Unit Test für Utility
import { describe, it, expect } from 'vitest';
import { functionName } from '#lib/utils/module';

describe('functionName', () => {
	it('gibt korrektes Ergebnis für Normalfall', () => {
		expect(functionName('input')).toBe('expected');
	});

	it('behandelt Edge Case korrekt', () => {
		expect(functionName(null)).toBeNull();
	});
});
```

```typescript
// Browser Test für Svelte-Komponente
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import MyComponent from './MyComponent.svelte';

describe('MyComponent', () => {
	it('zeigt erwarteten Inhalt an', async () => {
		render(MyComponent, { label: 'Test' });
		await expect.element(page.getByText('Test')).toBeVisible();
	});
});
```

**Test ausführen und Fehler bestätigen:**

```bash
npm run test:unit -- <test-datei-pfad>
```

Der Test **muss rot** sein. Falls er grün ist: Test überprüfen — er testet möglicherweise nicht das Richtige.

### Schritt 3: GREEN — Minimale Implementierung

Implementiere **nur so viel Code**, dass der Test grün wird.

- Kein Gold-Plating
- Keine Features "auf Vorrat"
- Einfachste mögliche Lösung

```bash
# Nach Implementierung testen
npm run test:unit -- <test-datei-pfad>
```

Alle Tests müssen grün sein.

### Schritt 4: REFACTOR — Code verbessern

Verbessere Code **ohne** neue Funktionalität hinzuzufügen:

- Lesbarkeit verbessern
- Duplikation entfernen
- Typen präzisieren
- Naming verbessern

```bash
# Nach Refactoring nochmals testen — nichts darf kaputt gehen
npm run test:unit -- <test-datei-pfad>
```

### Schritt 5: Wiederholen für nächsten Test

Weitere Anforderungen / Edge Cases:

1. Neuen Test schreiben (RED)
2. Implementierung erweitern (GREEN)
3. Refactorn (REFACTOR)

### Schritt 6: Alle Tests prüfen

```bash
npm run test:quick
```

Sicherstellen dass keine Regressionen entstanden sind.

## Entscheidungshilfe: Was testen?

| Typ          | Was testen                                    |
| ------------ | --------------------------------------------- |
| Utility      | Return values, Edge cases, Error throwing     |
| Svelte Comp. | Rendering, User interactions, Props/Events    |
| API Route    | Response status, Body format, Error handling  |
| Repository   | DB-Aufrufe mit gemockter DB                   |
| Bugfix       | Den exakten Bug-Trigger als Test (Regression) |

## Was NICHT testen

- Implementierungsdetails (wie etwas funktioniert, nicht was es tut)
- Externe Libraries (fetch, Drizzle) — nur eigenen Code der sie aufruft
- Private Hilfsfunktionen direkt — über öffentliche API testen

## Beispiel: Bugfix per TDD

```
Bug: "distance Parameter wird in showreports.json ignoriert"

1. RED: Test schreiben der zeigt: Request mit distance=1000 liefert
         nur Ergebnisse innerhalb 1km → Test schlägt fehl (alle werden zurückgegeben)

2. GREEN: distance Parameter im Handler auslesen und als Radius verwenden
          → Test wird grün

3. REFACTOR: Variable umbenennen, Kommentar hinzufügen wo es nicht offensichtlich ist
```

## Ausgabe

Nach abgeschlossenem TDD-Zyklus:

```
TDD Zyklus abgeschlossen

Feature: <beschreibung>
Tests geschrieben: N
Tests grün: ✅
Regressionen: keine

Neue Dateien:
- src/lib/...test.ts

Geänderte Dateien:
- src/lib/...ts
```
