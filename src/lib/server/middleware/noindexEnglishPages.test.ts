import type { Handle } from '@sveltejs/kit/hooks';
import { describe, it, expect } from 'vitest';
import { noindexEnglishPages } from '#lib/server/middleware/noindexEnglishPages.ts';

function createMockEvent(pathname: string) {
	return {
		url: new URL(`https://localhost${pathname}`),
		request: new Request(`https://localhost${pathname}`),
		locals: {},
		cookies: {},
		params: {},
		route: { id: '/' },
		isDataRequest: false,
		isSubRequest: false,
		platform: undefined
	};
}

async function runHandler(pathname: string): Promise<Response> {
	const event = createMockEvent(pathname);
	const resolve = async () => new Response(null);
	return noindexEnglishPages({
		event: event as Parameters<Handle>[0]['event'],
		resolve: resolve as Parameters<Handle>[0]['resolve']
	});
}

/**
 * Seit `TRANSLATION_ROLLOUT_COMPLETE = true` (2026-08-13,
 * `#lib/i18n/translationRolloutStage.ts`) setzt die Middleware den Header nie
 * mehr — die Bedingung `!TRANSLATION_ROLLOUT_COMPLETE` greift nie. Diese
 * Suite prüfte vorher das Gegenteil (Header gesetzt); siehe Git-Historie für
 * den vorherigen Wortlaut. Die Middleware selbst bleibt für einen möglichen
 * Rückschritt bestehen (siehe Docblock der Konstante).
 */
describe('noindexEnglishPages', () => {
	it('setzt X-Robots-Tag NICHT mehr auf /en', async () => {
		const response = await runHandler('/en');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});

	it('setzt X-Robots-Tag NICHT mehr auf /en/map', async () => {
		const response = await runHandler('/en/map');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});

	it('setzt X-Robots-Tag NICHT auf /', async () => {
		const response = await runHandler('/');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});

	it('setzt X-Robots-Tag NICHT auf präfixlose Pfade wie /map', async () => {
		const response = await runHandler('/map');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});

	// Der Legacy-Client (siehe CLAUDE.md, Legacy-REST-API) ruft weiterhin
	// `/en/rest_sichtungen/...` — byte-identisch zur deutschen Antwort, reine
	// Routenkosmetik der abgelösten CakePHP-Anwendung. Trug den Header vorher
	// aus demselben Grund wie /en/map, jetzt ebenfalls nicht mehr.
	it('setzt X-Robots-Tag NICHT mehr auf Legacy-Pfade unter /en/', async () => {
		const response = await runHandler('/en/rest_sichtungen/antworten.json');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});

	it('setzt X-Robots-Tag NICHT mehr, auch nicht bei /EN/map (Sprachpräfix case-insensitiv)', async () => {
		const response = await runHandler('/EN/map');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});

	it('behält vorhandene Antwort-Header bei', async () => {
		const event = createMockEvent('/en');
		const resolve = async () => new Response(null, { headers: { 'X-Test': 'wert' } });
		const response = await noindexEnglishPages({
			event: event as Parameters<Handle>[0]['event'],
			resolve: resolve as Parameters<Handle>[0]['resolve']
		});
		expect(response.headers.get('X-Test')).toBe('wert');
		expect(response.headers.get('X-Robots-Tag')).toBeNull();
	});
});
