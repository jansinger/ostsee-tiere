import { expect, test } from '@playwright/test';

/**
 * Sprachpräfix der abgelösten CakePHP-Anwendung: Jeder Legacy-Pfad war dort
 * zusätzlich unter `/de/…` und `/en/…` erreichbar, mit byte-identischer
 * (deutscher) Antwort. Umgesetzt ist das im `reroute`-Hook (`src/hooks.ts`).
 *
 * Die Regel selbst ist als Unit-Test abgedeckt
 * (`src/lib/legacy-api/languagePrefix.test.ts`). Hier steht das, was nur über
 * HTTP prüfbar ist: dass SvelteKit den Hook überhaupt anwendet — ein
 * vergessenes oder falsch benanntes `src/hooks.ts` fiele sonst nirgends auf.
 *
 * Ohne Browser: `request` spricht direkt mit dem Server.
 */
test.describe('Legacy-API: Sprachpräfix /de/ und /en/', () => {
	const legacyGets = [
		'/rest_sichtungen/antworten.json',
		'/rest_sichtungen/inBaltic.json?location=54.5,12.5',
		'/sichtungen/showreports.json?year=2024'
	];

	for (const pfad of legacyGets) {
		for (const sprache of ['de', 'en']) {
			test(`/${sprache}${pfad} antwortet identisch zu ${pfad}`, async ({ request }) => {
				const ohne = await request.get(pfad);
				const mit = await request.get(`/${sprache}${pfad}`);

				expect(ohne.status()).toBe(200);
				expect(mit.status()).toBe(200);
				// Byte-identisch: Das Präfix ist Routenkosmetik, keine Übersetzung.
				expect(await mit.body()).toEqual(await ohne.body());
			});
		}
	}

	test('POST /en/rest_sichtungen erreicht denselben Endpunkt', async ({ request }) => {
		// Leerer Body: Die Fehlerantwort der Validierung genügt als Nachweis, dass
		// die Route bedient wird — angelegt wird dabei nichts.
		const ohne = await request.post('/rest_sichtungen', { data: {} });
		const mit = await request.post('/en/rest_sichtungen', { data: {} });

		expect(mit.status()).toBe(ohne.status());
		expect(await mit.body()).toEqual(await ohne.body());
	});

	test('vor /admin und /api gilt das Präfix bewusst nicht', async ({ request }) => {
		// /admin und /api stehen in NICHT_LOKALISIERT — eine Umfangsentscheidung,
		// kein Sicherheitsmechanismus: Der Zugriffsschutz auf /admin ist
		// route-basiert (requireUserRole in src/routes/admin/+layout.server.ts)
		// und griffe unverändert auch unter /en/admin.
		for (const pfad of ['/en/admin', '/en/api/sightings']) {
			const antwort = await request.get(pfad, { maxRedirects: 0 });
			expect(antwort.status(), pfad).toBe(404);
		}
	});

	test('/en/ (mit Trailing Slash) liefert keine 404, sondern die Startseite', async ({
		request
	}) => {
		// Kein Ausschluss-Fall: `/en/` ist kein Legacy-Pfad (steht nicht in
		// LEGACY_PFADE) und keiner der acht Einträge aus NICHT_LOKALISIERT. In
		// `reroute` (src/hooks.ts) landet er deshalb im dritten Schritt:
		// `deLocalizeUrl('/en/').pathname` liefert `/` (die Wurzel kennt keinen
		// Trailing Slash), `istAusgeschlossen('/')` ist false, also wird auf `/`
		// umgeschrieben — die Startseite, nicht 404. Da SvelteKit `/` selbst mit
		// `trailingSlash: 'never'` normalisiert, kommt der Client-Request mit
		// überflüssigem Slash aber gar nicht direkt bis dorthin: Er bekommt zuerst
		// SvelteKits eigene Trailing-Slash-Normalisierung als 308 auf `/en`.
		// Ehemals stand `/en/` hier in der 404-Liste dieses Tests — ein Befund aus
		// dem Review zu Task 6 (2026-08-10): Live gegen den Dev-Server verifiziert
		// per `curl -sk -D - -o /dev/null "https://localhost:4000/en/"` → Status
		// 308, `location: /en`, nicht 404.
		//
		// Seit SvelteKit 3 steht im Header eine RELATIVE Angabe (`../en` statt `/en`).
		// Geprüft wird deshalb das aufgelöste Ziel, nicht der wörtliche Header — beide
		// Schreibweisen führen von `/en/` nach `/en`, und Browser wie HTTP-Clients lösen
		// relative `Location`-Header auf.
		const antwort = await request.get('/en/', { maxRedirects: 0 });
		expect(antwort.status()).toBe(308);
		const ziel = new URL(antwort.headers()['location'] ?? '', new URL('/en/', antwort.url()));
		expect(ziel.pathname).toBe('/en');
	});
});
