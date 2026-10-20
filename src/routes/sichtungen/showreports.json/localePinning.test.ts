/**
 * @fileoverview Guard-Test: Legacy-Endpunkt bleibt deutsch, egal welche
 * Locale gerade aktiv ist.
 *
 * Analog zu `../../rest_sichtungen/antworten.json/localePinning.test.ts` —
 * siehe dort für die ausführliche Begründung. `+server.ts` pinnt
 * `getSpeciesLabel()` seit dem Paraglide-Umbau von `species.ts` explizit auf
 * `baseLocale`; dieser Test beweist, dass ein aktiv englischer Locale-Kontext
 * die Antwort trotzdem nicht verändert. Die englische Botschaftsfunktion wird
 * dafür für die Dauer des Tests künstlich auseinandergezogen, weil
 * `messages/en.json` heute noch denselben deutschen Wortlaut wie `de.json`
 * trägt und ein Vergleich mit dem echten Katalog den Fehler deshalb nicht
 * sichtbar machen würde.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
/*
 * `./+server` und die Paraglide-Runtime bewusst statisch am Dateikopf, nicht per
 * `await import()` im Testkörper: Der Modulgraph hinter `+server.ts` zieht über
 * `formOptions/species.ts` den kompletten Paraglide-Barrel
 * (`#lib/paraglide/messages.js` → 1.306 Einzelmodule) nach. Dessen Transform kostet
 * hier isoliert ~2,3 s und im vollen `test:quick`-Lauf 4,6–5,2 s, weil 340
 * Testdateien parallel um dieselben Kerne konkurrieren. Im Testkörper fällt das
 * unter Vitests 5000-ms-Grenze pro Test — der Test lief damit unter Last
 * zuverlässig in einen Timeout, ohne dass am Endpunkt irgendetwas kaputt war.
 * Am Dateikopf zählt derselbe Aufwand zur Collect-Phase, für die keine
 * Test-Zeitgrenze gilt (so macht es auch `showreports.test.ts` nebenan).
 *
 * Die Reihenfolge ist dabei unkritisch: `+server.ts` pinnt die Locale erst beim
 * Aufruf (`getSpeciesLabel(..., baseLocale)`), nicht beim Import. Der Test bleibt
 * also scharf — `vi.mock` wird ohnehin über alle Importe gehoben.
 */
import { baseLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { GET } from './+server';

const DIVERGED_EN_LABEL = 'TEST-ONLY-DIVERGED-ENGLISH-LABEL';

vi.mock('#lib/paraglide/messages.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/paraglide/messages.js')>();
	return {
		...actual,
		formoptions_species_harbor_porpoise: (
			inputs?: Record<string, never>,
			options?: { locale?: 'de' | 'en' }
		) =>
			options?.locale === 'en'
				? DIVERGED_EN_LABEL
				: actual.formoptions_species_harbor_porpoise(inputs, options)
	};
});

const mockSightingData = [
	{
		id: 817,
		sichtungsdatum: '2012-01-25T13:50:00.000Z',
		latitude: '54.646667',
		longitude: '11.333333',
		totalCount: 1,
		juvenileCount: 0,
		firstName: null,
		lastName: null,
		nameConsent: false,
		waterway: null,
		shipName: null,
		shipNameConsent: false,
		approvedAt: new Date('2012-01-26T10:00:00.000Z'),
		species: 0, // Schweinswal
		isDead: 0
	}
];

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve(mockSightingData))
					}))
				}))
			}))
		}))
	}
}));

function createMockRequestEvent(): RequestEvent {
	return {
		url: new URL('https://example.com/sichtungen/showreports.json'),
		locals: {},
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('GET /sichtungen/showreports.json — Locale-Pinnung', () => {
	afterEach(() => {
		// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
		// eingebauten Reset — auf den echten Default zurückschalten, damit
		// andere Tests im selben Prozess nicht die englische Locale erben.
		overwriteGetLocale(() => baseLocale);
	});

	it('liefert die deutsche Artbezeichnung (ta), obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET(createMockRequestEvent());
		const body = await response.json();

		expect(body[0].ta).toBe('Schweinswal');
		expect(body[0].ta).not.toBe(DIVERGED_EN_LABEL);
	});
});
