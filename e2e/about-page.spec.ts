import { expect, test } from '@playwright/test';

/**
 * about-page.spec.ts — was die Über-uns-Seite tragen muss
 *
 * Die beiden Vorgänger-Tests hingen beide am Technologie-Abschnitt: einer
 * suchte das Versions-Badge über `.badge-neutral` *im* diesem Block, der andere
 * prüfte dessen Überschrift samt „SvelteKit"- und „PostGIS"-Badges. Damit war
 * ausgerechnet der Teil der Seite festgenagelt, der am wenigsten mit „Über uns"
 * zu tun hat — und jede Kürzung dort hätte Tests gebrochen, ohne dass etwas
 * kaputt gewesen wäre.
 *
 * Die Tests hier prüfen stattdessen Aussagen, die unabhängig vom Layout gelten
 * sollen: die Version ist auffindbar, die Lizenz ist verlinkt statt ausgebreitet,
 * und die Handlungsaufforderungen führen dorthin, wo ein Bürger etwas tun kann.
 */
test.describe('About Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/about', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { name: 'Über Ostsee-Tiere', level: 1 })).toBeVisible({
			timeout: 15000
		});
	});

	/* Bewusst ohne Bezug auf den umgebenden Abschnitt oder die Badge-Variante:
	   Geprüft ist, dass die laufende Version überhaupt ablesbar ist — nicht, in
	   welcher Kachel sie steht. Genau diese Kopplung hat der Vorgänger gehabt. */
	test('die laufende Version ist auf der Seite ablesbar', async ({ page }) => {
		const versionBadge = page.locator('.badge').filter({ hasText: /Version \d+\.\d+\.\d+/ });

		await expect(versionBadge).toBeVisible({ timeout: 10000 });
		expect(await versionBadge.textContent()).toMatch(/Version \d+\.\d+\.\d+/);
	});

	/* Der MIT-Volltext stand als scrollbarer 190-Wörter-Block auf einer
	   deutschsprachigen Seite für Bürger. Die Lizenz gehört genannt und
	   verlinkt — nicht ausgebreitet. Der Test hält beide Hälften fest, damit die
	   Kürzung nicht versehentlich die Angabe ganz verliert. */
	test('die Lizenz ist genannt und verlinkt, nicht ausgebreitet', async ({ page }) => {
		await expect(page.getByText('MIT-Lizenz').first()).toBeVisible();

		await expect(
			page.getByRole('link', { name: /Lizenz|LICENSE/ }),
			'Die Lizenz muss als Link erreichbar bleiben, sonst ist die Angabe eine Behauptung ohne Beleg.'
		).toHaveAttribute('href', /github\.com\/.+/);

		await expect(
			page.getByText('THE SOFTWARE IS PROVIDED "AS IS"'),
			'Der MIT-Volltext gehört nicht auf die Seite — er ist über den Lizenz-Link erreichbar.'
		).toHaveCount(0);
	});

	/* Der Betreiber-Abschnitt war der einzige der Seite **ohne** Überschrift — und
	   stand zugleich an vierter Stelle, hinter Mission und Plattform. „Wer
	   betreibt das?" ist aber die Frage, die eine Über-uns-Seite zuerst
	   beantworten muss.

	   Der Test prüft beides: dass er eine eigene Überschrift trägt, und dass er
	   vor den übrigen Abschnitten steht. Die Reihenfolge über die Position im
	   DOM, nicht über Pixel — das ist unabhängig vom Layout.

	   `level: 2` und `main h2` sind kein Zierrat: Ohne Ebene würde der Locator
	   auch eine h3 „… Meeresmuseum" treffen, und ohne `main` zählten Überschriften
	   aus Navbar und Footer in den Index mit. Beides trifft heute nicht zu — aber
	   der Test würde dann das Falsche prüfen, ohne rot zu werden. */
	test('der Betreiber steht mit eigener Überschrift an erster Stelle', async ({ page }) => {
		const betreiber = page.getByRole('heading', { name: /Meeresmuseum/, level: 2 });
		await expect(betreiber).toBeVisible();

		const reihenfolge = await page.evaluate(() =>
			[...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim() ?? '')
		);

		expect(
			reihenfolge.findIndex((t) => /Meeresmuseum/.test(t)),
			`Der Betreiber-Abschnitt muss die erste h2 sein. Gefunden: ${reihenfolge.join(' | ')}`
		).toBe(0);
	});

	/* Überschriften-Ebenen dürfen keine Stufe überspringen (WCAG 1.3.1). Auf
	   dieser Seite ist das keine Formalie: Beim Kürzen fallen ganze Abschnitte
	   weg, und eine `h4`, deren umgebende `h3` mit verschwindet, hängt danach
	   ohne Zwischenebene unter einer `h2`. Genau das ist der Fehler, den man beim
	   Löschen nicht sieht. */
	test('die Überschriften-Ebenen überspringen keine Stufe', async ({ page }) => {
		const ebenen = await page.evaluate(() =>
			[...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map(
				(h) => ({ level: Number(h.tagName[1]), text: h.textContent?.trim().slice(0, 40) ?? '' })
			)
		);

		expect(
			ebenen.length,
			'Die Seite rendert keine Überschriften — Selektor prüfen.'
		).toBeGreaterThan(0);
		expect(ebenen[0].level, 'Die erste Überschrift muss die h1 sein.').toBe(1);

		const spruenge = ebenen
			.slice(1)
			.map((h, i) => ({ von: ebenen[i], zu: h }))
			.filter(({ von, zu }) => zu.level > von.level + 1)
			.map(({ von, zu }) => `h${von.level} „${von.text}" → h${zu.level} „${zu.text}"`);

		expect(spruenge, 'Übersprungene Überschriften-Ebene (WCAG 1.3.1)').toEqual([]);
	});

	/* `/docs` ist die OpenAPI-Dokumentation („Testen Sie alle Endpunkte direkt im
	   Browser") und damit für die Zielgruppe dieser Schaltflächen das falsche
	   Ziel. Der Test verbietet es ausdrücklich, statt nur die richtigen Ziele
	   aufzuzählen: Sonst wäre ein dritter Knopf zurück auf /docs wieder erlaubt. */
	test('die Handlungsaufforderungen führen ins Formular und auf die Karte', async ({ page }) => {
		const cta = page.locator('.hero');

		await expect(cta.getByRole('link', { name: /Sichtung melden/ })).toHaveAttribute('href', '/');
		await expect(cta.getByRole('link', { name: /Karte erkunden/ })).toHaveAttribute('href', '/map');

		await expect(
			cta.locator('a[href="/docs"]'),
			'Die API-Dokumentation ist kein Ziel für Bürger. Sobald es eine Bestimmungshilfen-Seite gibt, gehört der dritte Knopf dorthin.'
		).toHaveCount(0);
	});
});
