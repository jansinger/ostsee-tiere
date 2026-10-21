import { expect, test } from '@playwright/test';

/**
 * Vormaliger Auslieferungs-Riegel für Etappe 0 der Mehrsprachigkeit (siehe
 * `src/lib/server/middleware/noindexEnglishPages.ts` für die vollständige
 * Begründung und die Entfernungsbedingung).
 *
 * Bis `TRANSLATION_ROLLOUT_COMPLETE = true` (2026-08-13,
 * `#lib/i18n/translationRolloutStage.ts`) trugen alle Antworten unter `/en`
 * den Header `X-Robots-Tag: noindex, follow`, damit Suchmaschinen den
 * deutschen Inhalt nicht unter der englischen URL indexierten. Dieser Test
 * prüfte vorher das Vorhandensein des Headers — siehe Git-Historie für den
 * vorherigen Wortlaut. Jetzt prüft er dessen Abwesenheit: Der Riegel greift
 * nur bei `TRANSLATION_ROLLOUT_COMPLETE === false`, die Middleware selbst
 * bleibt für einen möglichen Rückschritt bestehen.
 *
 * Ohne Browser: `request` genügt, es geht ausschließlich um Antwort-Header.
 */
test.describe('Ehemaliger Auslieferungs-Riegel: kein X-Robots-Tag mehr auf /en', () => {
	test('/en trägt keinen noindex-Header mehr', async ({ request }) => {
		const antwort = await request.get('/en');
		expect(antwort.headers()['x-robots-tag']).toBeUndefined();
	});

	test('/en/map trägt keinen noindex-Header mehr', async ({ request }) => {
		const antwort = await request.get('/en/map');
		expect(antwort.headers()['x-robots-tag']).toBeUndefined();
	});

	test('/ trägt weiterhin keinen noindex-Header', async ({ request }) => {
		const antwort = await request.get('/');
		expect(antwort.headers()['x-robots-tag']).toBeUndefined();
	});

	// Legacy-Pfad unter /en/: byte-identische deutsche Antwort, reine
	// Routenkosmetik der abgelösten CakePHP-Anwendung (siehe
	// `src/lib/legacy-api/languagePrefix.ts`) — trug den Header vorher
	// ebenfalls, aus demselben Grund wie /en/map.
	test('/en/rest_sichtungen/antworten.json trägt keinen noindex-Header mehr', async ({
		request
	}) => {
		const antwort = await request.get('/en/rest_sichtungen/antworten.json');
		expect(antwort.status()).toBe(200);
		expect(antwort.headers()['x-robots-tag']).toBeUndefined();
	});
});
