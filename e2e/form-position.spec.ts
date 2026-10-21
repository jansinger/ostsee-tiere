import { test, expect } from '@playwright/test';
import { FormPage } from './pages/FormPage';

// ── Phase 4A → Task 8: PositionAndTime, Single-Panel-Positionseingabe ──────
//
// Die dreiteilige Methodenwahl (Foto/Karte/Beschreibung) ist entfallen
// (Task 7) — `PositionPanel` zeigt jetzt einen einzigen Weg: Foto-Upload
// prominent, darunter GPS-Button, aufklappbare Karte und Ortsbeschreibung,
// alle gleichzeitig erreichbar. Diese Tests decken das neue Verhalten über
// die stabilen `data-testid`-Hooks ab (kein Prosa-Matching, s. Task-8-Brief).

test.describe('PositionAndTime — Single-Panel-Positionseingabe', () => {
	test.beforeEach(async ({ page }) => {
		const formPage = new FormPage(page);
		await formPage.goto();
	});

	test('Datum- und Uhrzeit-Felder sind immer sichtbar', async ({ page }) => {
		await expect(page.locator('[data-testid="field-sightingDate"]')).toBeVisible();
		await expect(page.locator('[data-testid="field-sightingTime"]')).toBeVisible();
	});

	test('zeigt den Foto-Weg aufklappbar und ohne Methodenwahl', async ({ page }) => {
		// Seit PR 3 liegt der Foto-Weg in einer zugeklappten Disclosure; die
		// Karte darüber ist die Hauptaktion. Der Inhalt existiert im DOM, ist
		// aber erst nach dem Aufklappen sichtbar.
		await expect(page.locator('[data-testid="photo-position-disclosure"]')).toBeVisible();

		// Die Methodenwahl ist ersatzlos entfallen.
		await expect(page.locator('#method-photo')).toHaveCount(0);
		await expect(page.locator('#method-map')).toHaveCount(0);
		await expect(page.locator('#method-manual')).toHaveCount(0);

		// Der Standort-Button ist im Startzustand sichtbar — er darf in keiner
		// Disclosure verschwinden (Spec, Zustand A).
		await expect(page.locator('[data-testid="use-current-position"]')).toBeVisible();

		// Zustand C (Foto ohne GPS) ist nur nach einem Upload erreichbar — im
		// Startzustand darf der Block nicht existieren.
		await expect(page.locator('[data-testid="photo-no-gps"]')).toHaveCount(0);
	});

	test('Ortsbeschreibung ist ohne Moduswechsel erreichbar und Pflicht', async ({ page }) => {
		await expect(page.locator('[data-testid="field-waterway"]')).toBeVisible({ timeout: 3000 });

		// Seit A2.4 (Wunsch des Deutschen Meeresmuseums) ist die Ortsbeschreibung
		// EIN Freitextfeld. `seaMark` bleibt im Schema und in der Admin-Maske,
		// steht im Meldeformular aber nicht mehr.
		await expect(page.locator('[data-testid="field-seaMark"]')).toHaveCount(0);

		// Ohne Koordinaten ist die Ortsbeschreibung Pflicht — sichtbar am Sternchen
		// und semantisch an aria-required. Kein nachgestelltes ` input`: das
		// data-testid hängt bereits am Input (FieldRenderer.svelte:188).
		await expect(page.locator('[data-testid="field-waterway"]')).toHaveAttribute(
			'aria-required',
			'true'
		);
	});

	test('Koordinatenfelder liegen offen unter der Karte', async ({ page }) => {
		// Die Karten-Disclosure ist mit PR 3 entfallen — die Karte steht
		// dauerhaft offen. Dass sie ohne Klick da ist, prüft die Gruppe
		// „Karte oben, Foto-GPS in der Disclosure" weiter unten.
		await expect(page.locator('[data-testid="map-disclosure"]')).toHaveCount(0);

		// Die Koordinatenfelder stehen seit dem 2026-07-31 offen unter der Karte
		// (`collapsibleCoordinates={false}`, Wunsch des Deutschen Meeresmuseums).
		// Vorher lagen sie hinter einer zweiten Disclosure und waren damit zwei
		// Klicks tief — die gibt es nicht mehr.
		await expect(page.locator('[data-testid="coordinate-fields"]')).toHaveCount(0);
		await expect(page.locator('#latitude')).toBeVisible();
		await expect(page.locator('#longitude')).toBeVisible();
		await expect(page.locator('[data-testid="coordinates-hint"]')).toContainText(
			/GPS-Koordinaten/i
		);
	});

	// ── Regression: Vorgänger-Fix machte den Block schließbar, obwohl waterway
	// ohne Koordinaten Pflicht bleibt (LocationDescription.svelte: einmalig
	// gesetztes `open={startsOpen}`, bewusst kein `bind:open`). Schließt der
	// Nutzer den Block und drückt „Weiter", landet er sonst wieder im
	// Sackgassen-Zustand, den diese Branch eigentlich beheben sollte: die
	// Fehlermeldung erscheint, aber das Feld ist unerreichbar
	// (`scrollToFirstError` in `#lib/utils/fieldNavigation.ts`).
	test('„Weiter" bei geschlossener Ortsbeschreibung öffnet sie wieder und fokussiert waterway', async ({
		page
	}) => {
		const disclosure = page.locator('[data-testid="location-description"]');
		// Ohne Koordinaten startet der Block offen — hier bewusst zuklappen, um
		// den Sackgassen-Zustand nachzustellen.
		await expect(disclosure).toHaveAttribute('open', '');
		await disclosure.locator('summary').click();
		await expect(disclosure).not.toHaveAttribute('open', '');

		await page.getByRole('button', { name: /Nächster Schritt/i }).click();

		await expect(disclosure).toHaveAttribute('open', '');
		await expect(page.locator('[data-testid="field-waterway"]')).toBeFocused();
	});
});

// ── PR 3: Karte nach oben, Foto-GPS in eine Disclosure ─────────────────────
//
// Der Foto-Weg war bis hierher die Hero-Karte des Schritts und die Karte lag
// eingeklappt darunter. Auf Wunsch des Museums ist es jetzt umgekehrt: Karte
// und Koordinatenfelder stehen dauerhaft offen, der Foto-Weg liegt in einer
// zugeklappten Disclosure. Diese Gruppe deckt genau die neue Zusicherung ab.

test.describe('PositionAndTime — Karte oben, Foto-GPS in der Disclosure', () => {
	test.beforeEach(async ({ page }) => {
		const formPage = new FormPage(page);
		await formPage.goto();
	});

	test('Karte und Koordinatenfelder sind ohne Klick sichtbar', async ({ page }) => {
		await expect(page.locator('.ol-map-container')).toBeVisible();
		await expect(page.locator('#latitude')).toBeVisible();
		await expect(page.locator('#longitude')).toBeVisible();
	});

	test('die Foto-Disclosure ist zugeklappt und lässt sich öffnen', async ({ page }) => {
		const disclosure = page.locator('[data-testid="photo-position-disclosure"]');
		await expect(disclosure).toBeVisible();
		// Ein zugeklapptes <details> ist selbst weiterhin sichtbar — der Zustand
		// gehört ans `open`-Attribut, nicht an toBeVisible().
		await expect(disclosure).not.toHaveAttribute('open', '');

		await disclosure.locator('summary').click();
		await expect(disclosure).toHaveAttribute('open', '');
		await expect(page.locator('[data-testid="photo-position-card"]')).toBeVisible();
	});

	test('DOM-Reihenfolge: Standort-Button vor Karte vor Foto-Disclosure', async ({ page }) => {
		await expect(page.locator('.ol-map-container')).toBeVisible();

		const reihenfolge = await page.evaluate(() => {
			const selektoren = [
				'[data-testid="use-current-position"]',
				'.ol-map-container',
				'[data-testid="photo-position-disclosure"]'
			];
			const knoten = selektoren.map((selektor) => document.querySelector(selektor));
			if (knoten.some((element) => element === null)) return null;
			// Paarweise: folgt Element n+1 im Dokument auf Element n?
			return knoten
				.slice(1)
				.map((element, index) =>
					Boolean(
						knoten[index]!.compareDocumentPosition(element!) & Node.DOCUMENT_POSITION_FOLLOWING
					)
				);
		});

		expect(reihenfolge).toEqual([true, true]);
	});
});

// ── Karte: Tippen setzt die Position ───────────────────────────────────────
//
// Vor diesem Test setzte nur das Ziehen des Markers eine Koordinate. Auf dem
// Telefon ist Tippen die erwartete Geste — zusammen mit dem Marker, der schon
// auf dem Kartenmittelpunkt (54.5/13.5) stand, führte das dazu, dass ein
// Tippen scheinbar nichts tat und die Vorgabe für die eigene Position gehalten
// wurde. Genau diese „plausibel, aber falsch"-Position soll ausgeschlossen
// bleiben.

test.describe('PositionAndTime — Karte reagiert auf Tippen', () => {
	test.beforeEach(async ({ page }) => {
		const formPage = new FormPage(page);
		await formPage.goto();
	});

	test('Karte startet ohne Marker und ein Tippen setzt die Koordinaten', async ({ page }) => {
		const map = page.locator('.ol-map-container');
		await expect(map).toBeVisible();

		// Zustand A: keine Position gewählt — kein Marker, und der Hinweis sagt es.
		await expect(map).toHaveAttribute('data-position', 'unset');
		await expect(page.locator('[data-testid="map-hint"]')).toContainText(
			/Noch keine Position gewählt/i
		);

		// Abseits der Mitte tippen, damit der Wert sich vom Kartenmittelpunkt
		// unterscheidet, und abseits der Zoom-Controls oben links.
		const box = await map.boundingBox();
		expect(box).not.toBeNull();
		await map.click({ position: { x: box!.width * 0.7, y: box!.height * 0.7 } });

		await expect(map).toHaveAttribute('data-position', 'set');

		// Die Koordinatenfelder stehen offen unter der Karte — kein Aufklappen mehr.
		const latitude = page.locator('#latitude');
		const longitude = page.locator('#longitude');
		await expect(latitude).not.toHaveValue('');
		await expect(longitude).not.toHaveValue('');
		// Nicht der unveränderte Kartenmittelpunkt.
		await expect(latitude).not.toHaveValue('54.5');
		await expect(longitude).not.toHaveValue('13.5');
	});

	test('Hinweis unter der Karte nennt keinen GPS-Button (den es hier nicht gibt)', async ({
		page
	}) => {
		await expect(page.locator('.ol-map-container')).toBeVisible();

		await expect(page.locator('.gps-control')).toHaveCount(0);
		await expect(page.locator('[data-testid="map-hint"]')).not.toContainText(/GPS/i);
	});
});
