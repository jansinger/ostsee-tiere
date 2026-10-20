import { expect, test } from '@playwright/test';
import { NICHT_LOKALISIERT, stripLegacyLanguagePrefix } from '../src/lib/legacy-api/languagePrefix';

/**
 * Name des Locale-Cookies — bewusst als Literal und nicht importiert aus
 * `#lib/i18n/localeCookie.ts`: Kein anderer Spec in diesem Verzeichnis
 * importiert aus `#lib` (Playwright läuft hier ohne den Vite-Alias-Resolver
 * der Anwendung), und ein Import wäre ungetesteter Neuboden. Einzige
 * verlässliche Quelle bleibt `LOCALE_COOKIE` in `localeCookie.ts` — dessen
 * eigener Kommentar verbietet, den Wert zu raten; er ist hier deshalb
 * abgeschrieben, nicht neu erfunden.
 *
 * `NICHT_LOKALISIERT` dagegen wird importiert, per relativem Pfad
 * (`../src/lib/...`) statt über den `#lib`-Alias — derselbe Weg, den andere
 * Specs in diesem Verzeichnis bereits für Quellcode-Konstanten nutzen (z. B.
 * `SightingFromEnum` in `horizontal-overflow.spec.ts`). Der Alias ist ohne
 * Vite-Resolver das Problem, nicht der Import als solcher.
 */
const LOCALE_COOKIE = 'PARAGLIDE_LOCALE';

/**
 * Wächter über die Ausschlussliste aus `languagePrefix.ts`.
 *
 * Die Schleife läuft über `NICHT_LOKALISIERT` selbst, nicht über eine eigene
 * Literalliste — bis 2026-08-10 gab es hier eine siebenteilige (später
 * fünfteilige) Kopie, die von der achtteiligen Konstante lief auseinander,
 * unbemerkt. Ein Import macht dieses konkrete Auseinanderlaufen strukturell
 * unmöglich: Jeder Eintrag in der Konstante bekommt jetzt automatisch einen
 * 404-Test, ohne dass ihn hier jemand nachträgt.
 *
 * Was das NICHT behebt: Fehlt ein Pfad in `NICHT_LOKALISIERT` selbst, obwohl
 * er dort stehen sollte, testet diese Schleife ihn gar nicht erst — sie kennt
 * nur, was in der Konstante steht. Genau deshalb steht `/en/admin ist kein
 * zweiter Weg auf /admin` weiter unten als eigener, von der Konstante
 * unabhängiger Test: Er bliebe auch dann treffend, wenn `/admin` versehentlich
 * aus der Liste flöge.
 *
 * Eine naive Annahme „jeder Eintrag liefert unter `/en` einen 404" trifft
 * NICHT auf `/rest_sichtungen` zu: `src/hooks.ts` prüft `LEGACY_PFADE` (die
 * vier Endpunkte aus `docs/LEGACY_API_SPECIFICATION.md`) VOR
 * `istAusgeschlossen`, und `/rest_sichtungen` steht in beiden Listen. Für
 * `/en/rest_sichtungen` greift deshalb nie die Ausschlussregel — die
 * Legacy-Weiche entscheidet zuerst und liefert bewusst denselben Status wie
 * der unpräfigierte Pfad (`GET /rest_sichtungen` re-exportiert
 * `showreports.json`, also 200 mit deutschem Inhalt).
 *
 * Die Schleife unten erzeugt deshalb pro Eintrag GENAU EINEN Test, nie einen
 * übersprungenen: Ein `continue` für legacy-abgefangene Einträge (frühere
 * Fassung) hätte für sie schlicht keinen Test erzeugt — bricht `LEGACY_PFADE`
 * oder `PRAEFIX_MUSTER` in `languagePrefix.ts` irgendwann so weiter auf, dass
 * noch mehr Einträge überlappen, verschwinden immer mehr Tests lautlos statt
 * rot zu werden (Review-Fund 2026-08-10). Statt eines hartkodierten „200 im
 * Legacy-Fall" vergleicht der Test hier den Status von `/en<präfix>` direkt
 * mit dem des unpräfigierten Legacy-Ziels (`stripLegacyLanguagePrefix`) — das
 * bewacht die Überlappung in beide Richtungen: sowohl ein Legacy-Pfad, der
 * fälschlich 404 liefert, als auch ein Ausschluss-Pfad, der fälschlich vom
 * 404 abweicht.
 */
test.describe('Sprachpräfix-Routing', () => {
	for (const praefix of NICHT_LOKALISIERT) {
		const pfad = `/en${praefix}`;
		const legacyZiel = stripLegacyLanguagePrefix(pfad);

		test(
			legacyZiel === undefined
				? `${pfad} liefert 404`
				: `${pfad} liefert denselben Status wie der Legacy-Pfad ${legacyZiel}`,
			async ({ request }) => {
				const antwort = await request.get(pfad);
				if (legacyZiel === undefined) {
					expect(antwort.status()).toBe(404);
				} else {
					const referenz = await request.get(legacyZiel);
					expect(antwort.status()).toBe(referenz.status());
				}
			}
		);
	}

	/**
	 * Stichproben auf tiefere Pfade unter einem ausgeschlossenen Präfix —
	 * die Schleife oben prüft nur den bloßen Präfix selbst, und für `/api`
	 * existiert unter genau diesem bloßen Pfad gar keine Route (nur
	 * `/api/sightings` & Co.). Ein `/en/api` wäre also auch ganz ohne
	 * `istAusgeschlossen`-Treffer ein 404 — kein Beleg für die Ausschlussregel.
	 * `istAusgeschlossen` vergleicht zudem auf ganze Segmente
	 * (`pfad.startsWith(praefix + '/')`), nicht auf Teilstrings; diese Stichproben
	 * belegen das für die praktisch relevanten Fälle.
	 */
	for (const pfad of [
		'/en/api/sightings',
		'/en/admin/sichtungen',
		'/en/uploads/test.jpg',
		'/en/rest_sichtungen/view/1840.json'
	]) {
		test(`${pfad} liefert 404`, async ({ request }) => {
			expect((await request.get(pfad)).status()).toBe(404);
		});
	}

	/**
	 * `/de/...` ist kein Fall von `NICHT_LOKALISIERT` — die Ablehnung greift
	 * schon davor, über den `baseLocale`-Vergleich in `src/hooks.ts`
	 * (`toLocale(erstesSegment) === baseLocale`). Deutsch ist präfixlos; ein
	 * `/de/`-Präfix ist ein zweiter Pfad auf denselben Inhalt und bleibt 404.
	 */
	for (const pfad of ['/de', '/de/sichtungen']) {
		test(`${pfad} liefert 404`, async ({ request }) => {
			expect((await request.get(pfad)).status()).toBe(404);
		});
	}

	test('/en liefert die Seite aus', async ({ page }) => {
		await page.goto('/en');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('/en/admin ist kein zweiter Weg auf /admin', async ({ request }) => {
		// Getrennt geprüft, weil ein 404 aus dem falschen Grund entstehen könnte:
		// Antwortet der Auth-Ablauf auf /admin mit 302 auf den Login, muss
		// /en/admin sich davon unterscheiden — es darf gar keine Route treffen.
		const geschuetzt = await request.get('/admin', { maxRedirects: 0 });
		const praefix = await request.get('/en/admin', { maxRedirects: 0 });
		expect(praefix.status()).toBe(404);
		expect(praefix.status()).not.toBe(geschuetzt.status());
	});

	test('Legacy-Präfix liefert weiterhin deutsche Werte', async ({ request }) => {
		const antwort = await request.get('/en/rest_sichtungen/antworten.json');
		expect(antwort.status()).toBe(200);
		expect(JSON.stringify(await antwort.json())).toContain('Grobe See');
	});
});

/**
 * `/` ohne englische Präferenz bleibt deutsch — eigene Gruppe mit
 * `test.use({ locale })`, statt den Header per `context.setExtraHTTPHeaders`
 * zu setzen.
 *
 * `setExtraHTTPHeaders` überschreibt `Accept-Language` bei einer echten
 * Chromium-Top-Level-Navigation NICHT zuverlässig — nachgewiesen per
 * `page.on('request', ...)`: Mit `setExtraHTTPHeaders({ 'Accept-Language':
 * 'de-DE,de;q=0.9' })` kam beim Server weiterhin Chromiums Standard `en-US`
 * an, während `test.use({ locale: 'de-DE' })` den Header korrekt auf
 * `de-DE` setzt. Ohne diesen Fund wäre der Test von Chromiums Default
 * abhängig gewesen (der zufällig ohnehin auf Englisch steht) und hätte nie
 * wirklich geprüft, was er behauptet.
 */
test.describe('/ ohne Präferenz', () => {
	test.use({ locale: 'de-DE' });

	test('/ bleibt deutsch', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	});
});

/**
 * Der Cookie-Fall aus Task 4/5, der dort nie über einen echten Browser lief —
 * mit dem richtigen Cookie-Namen (`LOCALE_COOKIE`, oben abgeschrieben aus
 * `localeCookie.ts`), tatsächlich per `context.addCookies` gesetzt.
 *
 * `curl` sendet kein `Sec-Fetch-Dest: document` — genau daran hängt Paraglides
 * eigener Redirect-Zweig in `paraglideMiddleware` (siehe
 * `src/lib/paraglide/server.js`: `request.headers.get("Sec-Fetch-Dest") ===
 * "document"`). Task 4/5 haben den Cookie-Fall deshalb nur per `curl`
 * verifiziert — ein Pfad, der beim echten Browser nie durchlief. Playwrights
 * `request`-Fixture ist derselbe unbrowserte HTTP-Client wie `curl` und würde
 * hier denselben blinden Fleck reproduzieren; deshalb ausschließlich über
 * `page.goto`, das als echte Chromium-Top-Level-Navigation den Header setzt.
 *
 * Der ursprüngliche erste Test dieser Gruppe hielt einen inzwischen
 * überholten Befund fest: Ein `PARAGLIDE_LOCALE=en`-Cookie leite `/` NICHT
 * nach `/en` um, weil Paraglides eigene `strategy: ['url', 'cookie',
 * 'baseLocale']` in `vite.config.ts` die `url`-Strategie zuerst prüft und die
 * unpräfigierte `/` deren Muster für `baseLocale` bereits erfüllt. Das
 * beschrieb Paraglides eigenes Verhalten korrekt, aber nicht mehr das der
 * Anwendung: `zielFuerStartseite()` in `src/lib/i18n/startseitenWeiterleitung.ts`
 * wird VOR Paraglide in `handleStartseitenSprache` (`hooks.server.ts`)
 * aufgerufen und leitet bei `cookieLocale === 'en'` jetzt selbst weiter,
 * unabhängig vom `Accept-Language`-Header. Begründung laut Entwurf: Eine
 * ausdrückliche frühere Sprachwahl schlägt die Header-Vermutung — wer einmal
 * auf Englisch umgeschaltet hat, darf auf `/` nicht wieder auf Deutsch
 * landen. Der erste Test unten prüft entsprechend das neue Verhalten.
 */
test.describe('Cookie-gesteuerte Sprachwahl (Browser-Navigation)', () => {
	// `en-GB` für die ganze Gruppe: Der erste Test ist davon unabhängig (das
	// gesetzte Cookie blockiert die Accept-Language-Vermutung in
	// `zielFuerStartseite` unabhängig vom Sprachwert), der zweite Test
	// braucht genau diese Präferenz. Aus demselben Grund wie bei „/ ohne
	// Präferenz" oben: `context.setExtraHTTPHeaders` überschreibt
	// `Accept-Language` bei einer echten Navigation nicht zuverlässig,
	// `test.use({ locale })` schon.
	test.use({ locale: 'en-GB' });

	test('Cookie PARAGLIDE_LOCALE=en allein leitet / nach /en um', async ({
		page,
		context,
		baseURL
	}) => {
		if (!baseURL) throw new Error('baseURL fehlt — playwright.config.ts setzt sie normalerweise');

		await context.addCookies([
			{
				name: LOCALE_COOKIE,
				value: 'en',
				url: baseURL
			}
		]);

		// Bewusst geändertes Verhalten: Die ausdrückliche frühere Wahl (Cookie)
		// schlägt die Vermutung aus Accept-Language — in beide Richtungen. Wer
		// einmal auf Englisch umgeschaltet hat, darf auf `/` nicht wieder auf
		// Deutsch landen, auch wenn (wie hier über `test.use({ locale: 'en-GB' })`
		// oben) der Accept-Language-Header ohnehin Englisch nahelegen würde.
		// `zielFuerStartseite()` in `startseitenWeiterleitung.ts` fängt das ab,
		// bevor Paraglide zum Zug kommt — Paraglides eigene Strategie
		// (`strategy: ['url', 'cookie', 'baseLocale']`) würde das nicht leisten,
		// weil die `url`-Strategie vorn steht und der präfixlose Pfad `/` immer
		// auf `baseLocale` trifft.
		await page.goto('/?ref=museum');

		const ziel = new URL(page.url());
		expect(ziel.pathname).toBe('/en');
		// Der Query-String muss über die Weiterleitung erhalten bleiben — sein
		// Verlust war zuvor ein Critical-Befund und darf nicht zurückkehren.
		expect(ziel.search).toBe('?ref=museum');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('Cookie PARAGLIDE_LOCALE=de schlägt englischen Accept-Language-Header', async ({
		page,
		context,
		baseURL
	}) => {
		if (!baseURL) throw new Error('baseURL fehlt — playwright.config.ts setzt sie normalerweise');

		// Die ausdrückliche frühere Wahl (Cookie) muss die Vermutung aus
		// Accept-Language schlagen — in beide Richtungen, siehe
		// zielFuerStartseite() in startseitenWeiterleitung.ts. Die englische
		// Präferenz kommt aus `test.use({ locale: 'en-GB' })` oben.
		await context.addCookies([
			{
				name: LOCALE_COOKIE,
				value: 'de',
				url: baseURL
			}
		]);

		await page.goto('/');

		expect(new URL(page.url()).pathname).toBe('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	});
});

/**
 * Deckung für die Verdrahtung aus Task 5: `handleStartseitenSprache` in der
 * `sequence` von `src/hooks.server.ts`.
 *
 * Ohne diese Tests bliebe eine entfernte Verdrahtung unsichtbar — die
 * eigentliche Entscheidungslogik (`zielFuerStartseite`) ist bereits als
 * Unit-Test abgedeckt und liefe auch dann weiter grün, weil sie die
 * `sequence` gar nicht kennt. Genau diese Lücke benennt der Kommentar über
 * `zielFuerStartseite` in `startseitenWeiterleitung.ts` ausdrücklich.
 *
 * `maxRedirects: 0`, sonst folgt `request` der Weiterleitung automatisch und
 * die 302 selbst — inklusive `Vary` — wird nie sichtbar.
 */
test.describe('Verdrahtung: handleStartseitenSprache in der sequence', () => {
	test('Accept-Language en-GB ohne Cookie leitet / nach /en um, mit Vary', async ({ request }) => {
		const antwort = await request.get('/', {
			maxRedirects: 0,
			headers: { 'Accept-Language': 'en-GB,en;q=0.9' }
		});

		expect(antwort.status()).toBe(302);
		expect(antwort.headers()['location']).toBe('/en');

		const vary = antwort.headers()['vary'] ?? '';
		expect(vary).toContain('Accept-Language');
		expect(vary).toContain('Cookie');
	});

	test('deutscher Accept-Language-Header leitet / nicht um', async ({ request }) => {
		const antwort = await request.get('/', {
			maxRedirects: 0,
			headers: { 'Accept-Language': 'de-DE,de;q=0.9' }
		});

		expect(antwort.status()).toBe(200);
	});
});
