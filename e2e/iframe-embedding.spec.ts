import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

/**
 * Einbettung auf deutsches-meeresmuseum.de — Höhe und Scrollen.
 *
 * Bis 2026-11 stand der iframe dort fest auf 3350px (unser eigener
 * Einbettungscode), weil eine fremde Seite die Höhe eines Cross-Origin-iframes
 * nicht auslesen kann. Jetzt meldet die App sie per `postMessage`
 * (`src/lib/utils/client/embedMessages.ts`), und `static/embed.js` auf der
 * Museumsseite setzt sie.
 *
 * Die Elternseite liegt bewusst auf einer anderen Origin — auf derselben
 * könnte sie die Höhe direkt lesen, und der Test bewiese nichts über den Weg.
 * Ausgeliefert wird sie von einem eigenen HTTP-Server auf 127.0.0.1 — anderer
 * Port, also fremde Origin, und von `frame-ancestors` (`sveltekit.options.ts`)
 * erlaubt. Zwei naheliegende Abkürzungen tragen nicht: Die Museumsadresse per
 * `page.route` weist Chromium ab (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`),
 * und dasselbe gilt für jedes per `route.fulfill` erzeugte Dokument — es hat
 * keine Adresse und zählt deshalb als öffentlich.
 */

const START_HEIGHT = 3350;

let parentServer: Server;
let parentOrigin: string;
let parentHtml = '';

test.beforeAll(async () => {
	parentServer = createServer((_req, res) => {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(parentHtml);
	});
	await new Promise<void>((resolve) => parentServer.listen(0, '127.0.0.1', resolve));
	parentOrigin = `http://127.0.0.1:${(parentServer.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
	await new Promise((resolve) => parentServer.close(resolve));
});

interface EmbedOptions {
	path?: string;
	/** Inhalt von `static/embed.js` direkt im `<script>` statt per `src` (Variante B der Anleitung). */
	inline?: boolean;
	/** `data-scroll-offset` am `<script>` (fest stehende Kopfleiste der Elternseite). */
	scrollOffset?: number;
}

function embedScript(baseURL: string, { inline, scrollOffset }: EmbedOptions): string {
	const offset = scrollOffset === undefined ? '' : ` data-scroll-offset="${scrollOffset}"`;
	if (!inline)
		return `<script src="${new URL('/embed.js', baseURL).href}"${offset} defer></script>`;
	// Wie auf der Museumsseite, nur dass die Produktionsadresse durch die des
	// Testservers ersetzt wird — genau die Zeile, die die Anleitung dafür nennt.
	const code = readFileSync('static/embed.js', 'utf8').replace(
		"var APP_ORIGIN = 'https://ostsee-tiere.de';",
		`var APP_ORIGIN = '${new URL(baseURL).origin}';`
	);
	if (!code.includes(new URL(baseURL).origin))
		throw new Error('APP_ORIGIN-Zeile in embed.js nicht gefunden');
	return `<script${offset}>${code}</script>`;
}

async function openEmbedded(
	page: Page,
	baseURL: string,
	options: EmbedOptions = {}
): Promise<void> {
	parentHtml = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Elternseite</title></head>
<body style="margin:0">
	<div style="height:600px">Inhalt der Museumsseite davor</div>
	<iframe id="app" src="${new URL(options.path ?? '/', baseURL).href}" title="Sichtung melden"
		style="display:block; width:100%; min-width:320px; height:${START_HEIGHT}px; border:0;"></iframe>
	${embedScript(baseURL, options)}
	<div style="height:400px">Inhalt danach</div>
</body></html>`;
	await page.goto(`${parentOrigin}/sichtung-melden`);
}

/** „Weiter“ — sein barrierefreier Name ist „Nächster Schritt“ (wie `FormPage`). */
const NEXT_STEP = /Nächster Schritt|Next step/i;

const iframeHeight = (page: Page): Promise<number> =>
	page.locator('#app').evaluate((el) => el.getBoundingClientRect().height);

test.describe('iframe-Einbettung', () => {
	test('der iframe nimmt die Höhe des Inhalts an — kürzer und länger', async ({
		page,
		baseURL
	}) => {
		await openEmbedded(page, baseURL!);
		const frame = page.frameLocator('#app');
		await expect(frame.getByTestId('report-kind-choice')).toBeVisible();

		// Einstiegsseite: weit unter der alten Festhöhe
		await expect.poll(() => iframeHeight(page)).toBeLessThan(1500);
		const entryHeight = await iframeHeight(page);
		expect(entryHeight).toBeGreaterThan(300);

		// Formular-Schritt 1 ist länger — der iframe wächst mit
		await frame.getByTestId('report-kind-option-lebend').click();
		await expect(frame.getByRole('button', { name: NEXT_STEP })).toBeVisible();
		await expect.poll(() => iframeHeight(page)).toBeGreaterThan(entryHeight + 200);

		// Keine Scrollleiste im iframe: Inhalt und iframe sind gleich hoch
		const appFrame = (await (await page.locator('#app').elementHandle())!.contentFrame())!;
		await expect
			.poll(async () => {
				const [content, viewport] = await appFrame.evaluate(() => [
					document.documentElement.scrollHeight,
					window.innerHeight
				]);
				return content - viewport;
			})
			.toBeLessThanOrEqual(1);
	});

	test('Inline-Variante: derselbe Code direkt im <script> passt die Höhe ebenso an', async ({
		page,
		baseURL
	}) => {
		await page.route(/\/embed\.js$/, (route) => route.abort());
		await openEmbedded(page, baseURL!, { inline: true });
		await expect(page.frameLocator('#app').getByTestId('report-kind-choice')).toBeVisible();

		await expect.poll(() => iframeHeight(page)).toBeLessThan(1500);
	});

	/**
	 * Review PR #994: Fehler- und Erfolgsseite trugen `min-h-screen`. Im iframe
	 * ist „screen" der iframe selbst — jede Höhenmeldung lag damit über der
	 * aktuellen Höhe, der iframe wuchs, die nächste Meldung lag wieder darüber.
	 * Beide nutzen dieselbe Klasse; die Fehlerseite ist ohne Absenden erreichbar.
	 */
	test('die Fehlerseite schaukelt den iframe nicht auf', async ({ page, baseURL }) => {
		await openEmbedded(page, baseURL!, { path: '/gibt-es-nicht' });
		await expect.poll(() => iframeHeight(page)).toBeLessThan(1500);

		const settled = await iframeHeight(page);
		await page.waitForTimeout(1000);
		expect(await iframeHeight(page)).toBe(settled);
	});

	/**
	 * Gegenstück: `/map` füllt das Fenster, statt mit dem Inhalt zu wachsen. Hebt
	 * die automatische Höhe dort `min-h-dvh` auf, fällt die Karte auf Höhe 0
	 * (CI-Shard `map`, `map-pan-zoom.spec.ts`).
	 */
	test('die Karte behält eingebettet ihre Höhe', async ({ page, baseURL }) => {
		await openEmbedded(page, baseURL!, { path: '/map' });
		const map = page.frameLocator('#app').locator('.ol-viewport').first();
		await expect(map).toBeVisible();
		await expect.poll(async () => (await map.boundingBox())?.height ?? 0).toBeGreaterThan(300);
	});

	test('ohne embed.js bleibt der iframe auf seiner Starthöhe', async ({ page, baseURL }) => {
		await page.route(/\/embed\.js$/, (route) => route.abort());
		await openEmbedded(page, baseURL!);
		await expect(page.frameLocator('#app').getByTestId('report-kind-choice')).toBeVisible();

		expect(await iframeHeight(page)).toBe(START_HEIGHT);
	});

	/**
	 * Beim Schrittwechsel scrollt die App zum Kopf des neuen Schritts und
	 * fokussiert ihn mit `preventScroll` — im eingebetteten Zustand bewegt das
	 * die Museumsseite nicht. Ohne Nachricht bliebe man unten beim Knopf stehen,
	 * mitten im neuen Schritt.
	 *
	 * Bewusst NICHT der Fehlerfall („Weiter" auf leerem Schritt): Dort
	 * fokussiert die App das Feld ohne `preventScroll`, und Chromium scrollt die
	 * Elternseite dabei von selbst mit. Der Test war in dieser Form auch ohne
	 * die Nachricht grün (Gegenprobe 2026-11-02).
	 */
	async function goToStep2(page: Page, baseURL: string, scrollOffset?: number): Promise<number> {
		await page.setViewportSize({ width: 390, height: 700 });
		await openEmbedded(page, baseURL, { path: '/?meldung=lebend', scrollOffset });
		const frame = page.frameLocator('#app');
		// Erst nach der Hydration klicken — sonst verpufft der Klick (wie `FormPage.goto`).
		await page.waitForLoadState('networkidle');
		await frame.locator('[aria-current="step"]:visible').waitFor();

		await frame.locator('[data-testid="field-sightingTime"]').fill('14:30');
		await frame.locator('[data-testid="field-waterway"]').fill('Kieler Bucht');

		const next = frame.getByRole('button', { name: NEXT_STEP });
		await next.scrollIntoViewIfNeeded();
		const before = await page.evaluate(() => window.scrollY);

		await next.click();
		await expect(
			frame
				.getByText(/Schritt 2 von 4/)
				.filter({ visible: true })
				.first()
		).toBeVisible();

		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before - 300);
		// Warten, bis das sanfte Scrollen steht, dann die Lage der Überschrift melden.
		const heading = frame.locator('#form-content h2').first();
		let last = -1;
		await expect
			.poll(async () => {
				const y = (await heading.boundingBox())?.y ?? -1;
				const settled = y === last;
				last = y;
				return settled;
			})
			.toBe(true);
		return last;
	}

	// Die App scrollt mit 80px Abstand über dem Schrittkopf (`scrollToElement`).
	test('Weiter scrollt die Elternseite zum Kopf des nächsten Schritts', async ({
		page,
		baseURL
	}) => {
		const y = await goToStep2(page, baseURL!);
		expect(y).toBeGreaterThanOrEqual(0);
		expect(y).toBeLessThan(150);
	});

	test('data-scroll-offset hält beim Scrollen Platz für eine feste Kopfleiste frei', async ({
		page,
		baseURL
	}) => {
		const y = await goToStep2(page, baseURL!, 150);
		expect(y).toBeGreaterThan(200);
		expect(y).toBeLessThan(700);
	});
});
