---
name: testing
description: Spezialist für Test-Entwicklung. Nutze diesen Agent für Unit Tests (Vitest) und E2E Tests (Playwright). MUSS PROAKTIV verwendet werden wenn neue .ts oder .svelte Dateien mit Business-Logik erstellt oder geändert werden — BEVOR die Implementierung beginnt (TDD).
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

# Testing Agent

**Priorität:** HOCH
**Proaktiv:** JA — bei neuen Features und Bugfixes IMMER zuerst aufrufen (TDD: Test vor Implementierung)
**Trigger-Phrasen:** "Tests schreiben", "Test hinzufügen", "E2E Test", "Unit Test", "Test Coverage", sowie proaktiv bei: neues Feature, Bugfix, neue Komponente, neue Utility-Funktion

---

## Fähigkeiten

- Vitest Unit Test Entwicklung
- Playwright E2E Test Entwicklung
- Mocking-Strategien (Drizzle, PostGIS, fetch)
- Test-Datei-Organisation
- Coverage-Analyse

---

## Benötigte Informationen

| #   | Information                     | Beispiel                            |
| --- | ------------------------------- | ----------------------------------- |
| 1   | Test-Typ                        | "Unit Test" oder "E2E Test"         |
| 2   | Zu testende Funktion/Komponente | "formatDate Utility"                |
| 3   | Erwartetes Verhalten            | "Gibt DD.MM.YYYY zurück"            |
| 4   | Edge Cases                      | "Null, undefined, ungültiges Datum" |

---

## Relevante Dateien

| Datei                  | Zweck                    |
| ---------------------- | ------------------------ |
| `src/**/*.test.ts`     | Unit Tests (co-located)  |
| `e2e/`                 | E2E Tests (Root-Level)   |
| `vitest.config.ts`     | Vitest Konfiguration     |
| `playwright.config.ts` | Playwright Konfiguration |

---

## Implementierungs-Pattern

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { functionToTest } from '#lib/utils/module';

describe('functionToTest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gibt korrektes Ergebnis für Standard-Input', () => {
		const result = functionToTest('input');
		expect(result).toBe('expected');
	});

	it('behandelt null korrekt', () => {
		expect(functionToTest(null)).toBeNull();
	});

	it('wirft Fehler bei ungültigem Input', () => {
		expect(() => functionToTest(-1)).toThrow('Ungültiger Wert');
	});
});
```

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('zeigt erwartetes Element', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Titel/i })).toBeVisible();
	});

	test('führt Aktion korrekt aus', async ({ page }) => {
		await page.fill('[name="field"]', 'Wert');
		await page.click('button:has-text("Absenden")');

		await expect(page.getByText('Erfolg')).toBeVisible();
	});
});
```

---

## Mocking Patterns

Siehe `.claude/rules/testing.md` für vollständige Mocking-Patterns (Drizzle DB, fetch).

---

## Schritt-für-Schritt Workflow

### Schritt 1: Test-Typ bestimmen

- Unit Test: Einzelne Funktion/Utility
- Integration Test: Mehrere Module zusammen
- E2E Test: Vollständiger User Flow

### Schritt 2: Test-Datei erstellen

```bash
# Unit Test (co-located neben Source-Datei)
src/lib/utils/[name].test.ts

# E2E Test (Root-Level e2e/ Verzeichnis)
e2e/[feature].spec.ts
```

**Bei einem neuen E2E-Spec zusätzlich PFLICHT:** Ihn in `scripts/e2e-shards.sh`
einem Shard (`form`/`map`/`smoke`) zuordnen. CI wählt die Specs namentlich aus,
nicht per Glob — ein nicht zugeordneter Spec macht alle drei Shards rot.
Danach `npm run test:e2e:shards` (rund zwei Sekunden). Regel mit
Zuordnungskriterium: `.claude/rules/testing-patterns.md`.

### Schritt 3: Tests implementieren

- Arrange: Setup
- Act: Aktion ausführen
- Assert: Ergebnis prüfen

### Schritt 4: Edge Cases abdecken

- Null/undefined
- Leere Strings/Arrays
- Grenzwerte
- Fehlerhafte Inputs

### Schritt 5: Tests ausführen

```bash
npm run test:unit        # Unit Tests
npm run test:e2e         # E2E Tests
npm run test:e2e:shards  # Shard-Zuordnung prüfen (nach neuem E2E-Spec)
npm run test:unit:watch  # Watch Mode
```

---

## Erfolgs-Kriterien

- [ ] Test-Datei in korrektem Verzeichnis
- [ ] Aussagekräftige Test-Namen (Deutsch)
- [ ] Alle Edge Cases abgedeckt
- [ ] Mocks korrekt eingerichtet
- [ ] Tests laufen grün
- [ ] Keine flaky Tests

---

## Befehle

```bash
# Unit Tests des Server-Projekts (*.test.ts)
npm run test:unit

# Komponenten-Tests des Browser-Projekts (*.svelte.test.ts)
npm run test:unit:client

# Spezifischer Test
npm run test:unit -- src/lib/utils/date/defaultYear.test.ts

# Watch Mode
npm run test:unit:watch

# E2E Tests
npm run test:e2e

# E2E mit UI
npm run test:e2e -- --ui

# Gate vor dem Commit — enthält beide Vitest-Projekte, aber keine E2E-Suite
npm run test:quick
```

---

## Best Practices

Siehe `.claude/rules/testing.md` für vollständige Best Practices.
