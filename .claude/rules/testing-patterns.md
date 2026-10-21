---
paths:
  - '**/*.test.ts'
  - '**/*.svelte.test.ts'
  - 'e2e/**'
  - 'vitest.config.ts'
  - 'vitest-setup-*.ts'
  - 'playwright.config.ts'
---

# Test-Patterns — Vitest & Playwright

Ergänzt `testing.md` (immer geladen), wo die verbindliche Test-First-Regel und die
Datei-Konventionen stehen. Hier stehen die konkreten Rezepte.

---

## Vitest Unit Tests

### Grundstruktur

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatDate } from '#lib/utils/date';

describe('formatDate', () => {
	it('formatiert deutsches Datum korrekt', () => {
		const result = formatDate(new Date('2024-01-15'));
		expect(result).toBe('15.01.2024');
	});

	it('gibt leeren String bei null zurück', () => {
		expect(formatDate(null)).toBe('');
	});
});
```

### Svelte Component Tests (vitest-browser-svelte v2)

**Datei-Suffix:** `*.svelte.test.ts` (nicht `*.test.ts`!)

```typescript
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Button from '#lib/components/Button.svelte';

describe('Button', () => {
	it('zeigt Label an', async () => {
		// v2: Props direkt übergeben (KEIN { props: {...} } Wrapper!)
		render(Button, { label: 'Absenden' });
		await expect.element(page.getByText('Absenden')).toBeVisible();
	});

	it('ruft onClick auf', async () => {
		const onClick = vi.fn();
		render(Button, { label: 'Klick', onClick });

		await page.getByRole('button').click();
		expect(onClick).toHaveBeenCalled();
	});
});
```

**Hinweis:** Projekt nutzt `vitest-browser-svelte` v2 + `page` API, NICHT `@testing-library/svelte`.
In v2 werden Props direkt als zweites Argument übergeben — **kein `{ props: {...} }` Wrapper** (v1-Syntax).

**Ausnahme: sobald ein `context` mitgegeben wird.** Dann ist das zweite Argument das
Optionen-Objekt, und die Props müssen wieder unter den `props`-Schlüssel — sonst gelten
sie als unbekannte Svelte-Optionen und kommen nie an der Komponente an.

### Formular-Komponenten: `renderWithFormContext`

Jede Komponente unterhalb von `Form.svelte` braucht den Form-Context (`FormField` wirft
ohne ihn beim ersten Feld). Den Aufbau nicht abschreiben, sondern
`src/lib/report/components/testing/renderWithFormContext.testutil.ts` nutzen — er kapselt
auch die `props`-Ausnahme von oben:

```typescript
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';

// Startwerte über `overrides`, Props typgeprüft über `props`
renderWithFormContext(DeadAnimal, { overrides: { isDead: true }, props: { adminMode: true } });

// Rückgabe ist der gebaute Context — für Tests, die danach `form`/`mediaStore` prüfen
const context = renderWithFormContext(DropzoneEnhanced, { props, mediaStore });
```

Der Helper heißt `.testutil.ts`, nicht `.ts`: `vitest.config.ts` nimmt `src/lib/**/*.ts`
in die Coverage auf und schließt nur `**/*.testutil.ts` aus. Ohne das Suffix zählt ein
Test-Helfer als ungedeckter Produktionscode (Präzedenz:
`src/lib/server/datetime/withTimeZone.testutil.ts`).

### Mocking

```typescript
// Mock eines Moduls
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockResolvedValue([])
		})
	}
}));

// Mock einer einzelnen Funktion (vi.spyOn)
import * as emailService from '#lib/server/services/emailService.ts';
vi.spyOn(emailService, 'sendNotification').mockResolvedValue(undefined);

// Mock von fetch
global.fetch = vi.fn().mockResolvedValue({
	ok: true,
	json: () => Promise.resolve({ data: [] })
});
```

---

## Playwright E2E Tests

### Neuer Spec → Shard zuordnen (PFLICHT)

E2E-Specs laufen in CI **nicht** über ein Verzeichnis-Glob, sondern über drei
namentliche Listen in `scripts/e2e-shards.sh` (`form`, `map`, `smoke`). Ein
neuer Spec, der in keiner Liste steht, liefe nirgends — deshalb bricht der
Abgleich im Skript ab, und zwar in **allen drei Shards gleichzeitig**, bevor
ein einziger Test läuft.

Wer einen Spec anlegt, umbenennt oder löscht, pflegt die Liste mit und prüft:

```bash
npm run test:e2e:shards
```

Das kostet rund zwei Sekunden (`playwright test --list`, ohne Dev-Server und
ohne Datenbank), hängt in `npm run test:quick` und in `.husky/pre-push`.

**In welchen Shard?** Die Zuordnung folgt der gemessenen CI-Schrittdauer und
erst danach dem Thema — die drei Shards laufen parallel, die Job-Laufzeit ist
die des längsten. Die Begründungen je Spec und die Messanleitung stehen als
Kommentare im Skript; lokale Laufzeiten taugen dafür nicht (siehe Messblock
dort).

Das war zwischen dem 2026-08-08 und dem 2026-08-09 die häufigste
CI-Fehlerursache überhaupt: vier von neun Fehlschlägen, jedes Mal ein beim
Anlegen vergessener Eintrag.

### Grundstruktur

```typescript
import { test, expect } from '@playwright/test';

test.describe('Sichtung melden', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('zeigt Multi-Step Form', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Sichtung/i })).toBeVisible();
		await expect(page.getByText('Schritt 1')).toBeVisible();
	});

	test('navigiert zum nächsten Schritt', async ({ page }) => {
		await page.fill('[name="date"]', '2024-01-15');
		await page.fill('[name="time"]', '14:30');
		await page.click('button:has-text("Weiter")');

		await expect(page.getByText('Schritt 2')).toBeVisible();
	});
});
```

### Page Object Pattern

```typescript
// e2e/pages/SightingFormPage.ts
export class SightingFormPage {
	constructor(private page: Page) {}

	async fillStep1(data: { date: string; time: string }) {
		await this.page.fill('[name="date"]', data.date);
		await this.page.fill('[name="time"]', data.time);
	}

	async nextStep() {
		await this.page.click('button:has-text("Weiter")');
	}

	async getCurrentStep(): Promise<number> {
		const text = await this.page.textContent('.step-indicator');
		return parseInt(text?.match(/\d+/)?.[0] ?? '1');
	}
}
```

### Map-Interaktion testen

```typescript
test('wählt Position auf Karte', async ({ page }) => {
	await page.goto('/');

	// Karte laden
	await page.waitForSelector('.ol-viewport');

	// Klick auf Karte simulieren
	const map = page.locator('.ol-viewport');
	await map.click({ position: { x: 200, y: 200 } });

	// Koordinaten prüfen
	await expect(page.locator('[name="lat"]')).not.toBeEmpty();
	await expect(page.locator('[name="lng"]')).not.toBeEmpty();
});
```

---

## Mocking-Strategien

### Drizzle DB Mock

```typescript
import { vi } from 'vitest';

export const mockDb = {
	select: vi.fn().mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue([{ id: 1, species: 'Schweinswal' }])
		})
	}),
	insert: vi.fn().mockReturnValue({
		values: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: 1 }])
		})
	})
};

vi.mock('#lib/server/db/index.ts', () => ({ db: mockDb }));
```

---

## Best Practices

### Do's

- Tests vor dem Commit ausführen (`npm run test:quick`)
- Aussagekräftige Test-Namen auf Deutsch
- Arrange-Act-Assert Pattern verwenden
- Jeden Edge Case testen

### Don'ts

- Keine Tests die von externen Services abhängen
- Keine sleep/timeout in Tests (waitFor verwenden)
- Keine Test-Daten in Produktion-DB

---

## CI Integration

Tests werden automatisch in GitHub Actions ausgeführt:

- Unit Tests bei jedem Push
- E2E Tests bei Pull Requests — in drei parallelen Shards, deren Zusammensetzung
  in `scripts/e2e-shards.sh` steht (siehe „Neuer Spec → Shard zuordnen")
- Coverage-Report wird generiert

### Was bei reinen Doku-PRs läuft

Ändert ein PR ausschließlich `*.md`, `docs/**` oder `.claude/**`, laufen weder
`Validate` (Lint, Typen, svelte-check, Unit Tests, Build) noch Component- oder
E2E-Tests — keiner dieser Schritte fasst dann eine geänderte Datei an. Übrig
bleibt `Commit Lint`; die Commit-Konvention gilt auch für Doku.

Entschieden wird das über zwei `paths-filter`-Schritte in
`.github/workflows/ci.yml`. Der zweite arbeitet mit Negationen und
`predicate-quantifier: every`, fragt also „gibt es eine geänderte Datei, die
**kein** Dokument ist" — eine Positivliste würde beim Vergessen still zu wenig
prüfen, diese Richtung prüft im Zweifel zu viel.

Wer daran etwas ändert, hat einen Wächter: `scripts/ciJobGating.test.ts` liest
den Workflow und rechnet die Gates für Beispiel-Dateimengen nach (in
`test:quick` enthalten). Er benutzt bewusst **picomatch** wie paths-filter und
nicht `node:path.matchesGlob` — letzteres lässt `**` nicht in
Punkt-Verzeichnisse laufen und würde `.github/…md` fälschlich als Code zählen.
