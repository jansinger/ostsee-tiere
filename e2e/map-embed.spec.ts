import { test, expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { MapPage } from './pages/MapPage';
import { MAP_TEST_TIMEOUTS } from './config/testTimeouts';
import { mockMapSightingsSuccess } from './fixtures/mockApi';
import { FormPage } from './pages/FormPage';
import { blockTileHosts, FORM_TILE_HOSTS, waitForOlMapReady } from './helpers/mapCanvas';

/**
 * Die Sichtungskarte im iframe auf deutsches-meeresmuseum.de.
 *
 * Gemessen am 2026-11-02: Das Museum bettet `/map` in einen 4:3-Rahmen
 * (`embed-responsive-4by3`) einer 545px breiten Spalte — 545×409. Für die App
 * ist das ein schmales Handy: Kein Breakpoint ab `md` greift, und die
 * Bedienelemente standen in voller Touch-Größe über einem Drittel der Karte.
 * Titel und Logo wiederholten, was die Museumsseite direkt darüber zeigt.
 *
 * Gefahren wird eine echte Einbettung (Host-Seite mit iframe) statt eines
 * Query-Parameters: Die App erkennt den Zustand an `window !== window.top`, und
 * genau diesen Weg nimmt der Besucher des Museums.
 */

const HOST_PATH = '/__e2e/einbettung-sichtungskarte';
const FRAME = { width: 545, height: 409 } as const;

async function openEmbedded(
	page: Page,
	{ width = FRAME.width, height = FRAME.height, src = '/map' } = {}
): Promise<FrameLocator> {
	await mockMapSightingsSuccess(page);
	await page.route(`**${HOST_PATH}`, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/html',
			body:
				'<!doctype html><html><body style="margin:0">' +
				`<iframe id="embed" src="${src}" title="Sichtungskarte" style="display:block;border:0;width:${width}px;height:${height}px"></iframe>` +
				'</body></html>'
		})
	);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(HOST_PATH);

	const frame = page.frameLocator('#embed');
	await expect(frame.getByRole('button', { name: /^filter$/i })).toBeVisible({
		timeout: MAP_TEST_TIMEOUTS.componentMount
	});
	return frame;
}

async function box(
	locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
	const b = await locator.boundingBox();
	expect(b, 'Element hat keine Box').not.toBeNull();
	return b!;
}

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test.describe('Karte im iframe — Bedienelemente', () => {
	test('zeigt weder eigenen Titel noch Museumslogo', async ({ page }) => {
		const frame = await openEmbedded(page);

		await expect(frame.getByRole('heading', { level: 1 })).toHaveCount(0);
		await expect(frame.getByTestId('map-logo-plate')).toHaveCount(0);
	});

	test('Tastaturhilfe steckt in der Legende statt als schwebender Knopf', async ({ page }) => {
		const frame = await openEmbedded(page);

		await expect(frame.getByTestId('map-help-fab')).toHaveCount(0);

		await frame.getByRole('button', { name: /^legende$/i }).click();
		await frame.getByRole('button', { name: 'Tastaturkürzel anzeigen' }).click();
		await expect(frame.getByRole('dialog', { name: 'Tastaturkürzel' })).toBeVisible();
	});

	test('bietet die große Karte in einem neuen Fenster an', async ({ page }) => {
		const frame = await openEmbedded(page);

		const link = frame.getByRole('link', { name: /neuem Fenster/ });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', /noopener/);
		await expect(link).toHaveAttribute('href', /\/map(\?|$)/);
	});

	// Desktop-Chromium meldet einen Mauszeiger und keinen Touch — der Fall des
	// Museumsbesuchers am Rechner. Die 44px gelten dort nicht (siehe unten für Touch).
	test('Bedienelemente sind bei Mausbedienung kompakt', async ({ page }) => {
		const frame = await openEmbedded(page);

		const zoomIn = await box(frame.locator('.ol-zoom-in'));
		expect(zoomIn.height).toBeLessThanOrEqual(32);

		for (const name of [/^filter$/i, /^legende$/i]) {
			const reiter = await box(frame.getByRole('button', { name }));
			expect(reiter.width, `Reiter ${name}`).toBeLessThanOrEqual(32);
		}
	});

	// Bei 409px Höhe nahmen die zwei 128px hohen Reiter samt Versatz zwei Drittel
	// des rechten Rands ein. In niedrigen Rahmen werden sie zu Icon-Knöpfen.
	test('Panel-Reiter sind im niedrigen Rahmen kompakt und überlappen nicht', async ({ page }) => {
		const frame = await openEmbedded(page);

		const filter = await box(frame.getByRole('button', { name: /^filter$/i }));
		const legende = await box(frame.getByRole('button', { name: /^legende$/i }));

		expect(filter.height).toBeLessThanOrEqual(48);
		expect(legende.height).toBeLessThanOrEqual(48);
		expect(filter.y + filter.height).toBeLessThanOrEqual(legende.y);
		expect(legende.y + legende.height).toBeLessThanOrEqual(FRAME.height / 2);
	});
});

test.describe('Karte im iframe — Grenzfälle der Anordnung', () => {
	// Ein Handy auf der Museumsseite: Der Fenster-Link teilt sich die untere
	// Zeile mit dem zentrierten Karte/Liste-Umschalter.
	test('Fenster-Link überdeckt im 320px-Rahmen den Umschalter nicht', async ({ page }) => {
		const frame = await openEmbedded(page, { width: 320 });

		const link = frame.getByRole('link', { name: /neuem Fenster/ });
		await expect(link).toBeVisible();
		const umschalter = await box(frame.getByRole('button', { name: 'Liste', exact: true }));
		expect(overlaps(await box(link), umschalter)).toBe(false);
	});

	// Feldmodus hebt die Filter-Chips auf 56px. Der Zoom-Stapel darf nicht
	// darunter beginnen — im iframe fehlt der Titel, der ihn sonst nach unten schiebt.
	test('Zoom-Stapel liegt im Feldmodus unter der Chip-Zeile', async ({ page }) => {
		const frame = await openEmbedded(page, { src: '/map?q=Wal' });
		await frame.locator('html').evaluate((html) => (html.dataset.density = 'field'));

		const chip = frame.getByRole('button', { name: /Suchfilter.*entfernen/ });
		await expect(chip).toBeVisible();
		const c = await box(chip);
		const zoom = await box(frame.locator('.ol-zoom-in'));
		expect(zoom.y).toBeGreaterThanOrEqual(c.y + c.height);
	});
});

test.describe('Karte im iframe — Touch-Gerät', () => {
	test.use({ hasTouch: true });

	// Ein Handy auf der Museumsseite bekommt dieselbe Einbettung. Dort bleibt die
	// Trefferfläche bei 44px (WCAG 2.5.5, design-system.md) — kompakt wird nur,
	// was ausschließlich mit der Maus bedient wird.
	test('behält 44px-Trefferflächen', async ({ page }) => {
		const frame = await openEmbedded(page);

		const zoomIn = await box(frame.locator('.ol-zoom-in'));
		expect(zoomIn.height).toBeGreaterThanOrEqual(44);

		const reiter = await box(frame.getByRole('button', { name: /^filter$/i }));
		expect(reiter.width).toBeGreaterThanOrEqual(44);
	});
});

test.describe('Karte im iframe — Safari ignoriert die History-API', () => {
	// Das Museum lädt die Karte erst nach der Einwilligung: Sein Cookie-Skript
	// tauscht `src` des iframes vom Platzhalter auf /map. Safari ignoriert in
	// einem so umgesetzten iframe pushState/replaceState still (WebKit-Bug
	// 227474) — `history.state` bleibt null. SvelteKit 3.1 liest seine
	// Metadaten nach dem replaceState beim Start ungeprüft zurück und bricht mit
	// „undefined is not an object (evaluating 't.resetIndex')" ab; /map rendert
	// nur im Browser und blieb leer (gemeldet am 2026-11-02, Release 2.24.0).
	//
	// Chromium hat den Fehler nicht, deshalb wird er hier nachgestellt: Im iframe
	// laufen beide Methoden ins Leere, bevor irgendein Skript der App lädt.
	test('Karte startet trotzdem', async ({ page }) => {
		await page.addInitScript(() => {
			if (window === window.top) return;
			History.prototype.pushState = () => undefined;
			History.prototype.replaceState = () => undefined;
		});
		const fehler: string[] = [];
		page.on('pageerror', (error) => fehler.push(error.message));

		const frame = await openEmbedded(page);

		await expect(frame.locator('.ol-viewport')).toBeVisible();
		expect(fehler).toEqual([]);
	});
});

test.describe('Kompakte Reiter außerhalb des iframes', () => {
	// Handy in Querlage: niedrig genug für die kompakten Reiter, aber anders als
	// im iframe steht oben die Navigationsleiste. Die Reiter gehören auf die Karte.
	test('liegen bei 667×375 unterhalb der Navigationsleiste', async ({ page }) => {
		await page.setViewportSize({ width: 667, height: 375 });
		await mockMapSightingsSuccess(page);
		await new MapPage(page).goto();

		const filter = page.getByRole('button', { name: /^filter$/i });
		await expect(filter).toBeVisible({ timeout: MAP_TEST_TIMEOUTS.componentMount });
		const karte = await box(page.locator('.map-container-wrapper'));
		for (const name of [/^filter$/i, /^legende$/i]) {
			const reiter = await box(page.getByRole('button', { name }));
			expect(reiter.height, `Reiter ${name} kompakt`).toBeLessThanOrEqual(48);
			expect(reiter.y, `Reiter ${name} beginnt auf der Karte`).toBeGreaterThanOrEqual(karte.y);
		}
	});
});

test.describe('Positionskarte im Meldeformular', () => {
	// Die Zoom-Knöpfe der Formular-Karte teilen sich die OpenLayers-Klassen mit
	// der Sichtungskarte. Die kompakte Größe gilt nur dort — das Formular wird
	// an Deck ausgefüllt und behält 44px, auch bei Mausbedienung.
	test('Zoom-Knöpfe behalten 44px', async ({ page }) => {
		await blockTileHosts(page, FORM_TILE_HOSTS);
		await new FormPage(page).goto();
		await waitForOlMapReady(page);

		const zoomIn = await box(page.locator('.ol-map-container .ol-zoom-in'));
		expect(zoomIn.height).toBeGreaterThanOrEqual(44);
	});
});

test.describe('Karte als eigene Seite — Gegenprobe', () => {
	// Ohne iframe bleibt alles, wie es war. Sonst wäre das Grün oben auch mit
	// einer Änderung zu haben, die Titel und Logo überall entfernt.
	test('zeigt Titel, Logo und Hilfe-Knopf, aber keinen Fenster-Link', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await mockMapSightingsSuccess(page);
		const mapPage = new MapPage(page);
		await mapPage.goto();

		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
			timeout: MAP_TEST_TIMEOUTS.defaultUi
		});
		await expect(page.getByTestId('map-logo-plate')).toBeVisible();
		await expect(page.getByTestId('map-help-fab')).toBeVisible();
		await expect(page.getByRole('link', { name: /neuem Fenster/ })).toHaveCount(0);

		// Genug Höhe: die Reiter behalten ihre beschriftete Form.
		const reiter = await box(page.getByRole('button', { name: /^filter$/i }));
		expect(reiter.height).toBeGreaterThan(100);
	});
});
