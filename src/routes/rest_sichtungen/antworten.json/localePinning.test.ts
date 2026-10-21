/**
 * @fileoverview Guard-Test: Legacy-Endpunkt bleibt deutsch, egal welche
 * Locale gerade aktiv ist.
 *
 * Hintergrund: `getSpeciesLabel()` hat seit dem Paraglide-Umbau von
 * `species.ts` einen optionalen Locale-Parameter mit Default `getLocale()`.
 * `+server.ts` ruft ihn seither mit explizitem `baseLocale` auf (siehe
 * Kommentar dort und CLAUDE.md, Abschnitt "Legacy REST API — 100 %
 * Kompatibilität") — dieser Test beweist, dass das so bleibt.
 *
 * Seit Aufgabe 3.3 (Gruppe 1) gilt dieselbe Pinnung zusätzlich für
 * `getSeaStateLabel()`, `getSexLabel()`, `getVisibilityLabel()` und
 * `getWindStrengthLabel()` — je ein Feld unten, nach demselben Muster.
 *
 * Seit Aufgabe 3.3 (Gruppe 2) gilt sie zusätzlich für `getDistanceLabel()`,
 * `getDistributionLabel()` und `getWindDirectionLabel()`.
 *
 * Seit Aufgabe 3.3 (Gruppe 3) gilt sie zusätzlich für
 * `getAnimalBehaviorLabel()` und `getAnimalConditionLabel()`.
 *
 * Seit Aufgabe 3.3 (Gruppe 4) gilt sie zusätzlich für `getSightingFromLabel()`,
 * `getEntryChannelLabel()` und `getBoatDriveLabel()`.
 *
 * Ein Test, der sich auf den heutigen Wortlaut von `messages/en.json`
 * verlässt, wäre nutzlos: die Datei trägt vorerst denselben deutschen Text
 * wie `de.json`, ein ungepinnter Aufruf sähe also identisch aus. Deshalb wird
 * die englische Botschaftsfunktion für die Dauer des Tests durch einen Wert
 * ersetzt, der sich sichtbar vom deutschen unterscheidet — nur so kann der
 * Test tatsächlich rot werden, wenn die Pinnung verschwindet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
/*
 * `./+server` und die Paraglide-Runtime bewusst statisch am Dateikopf, nicht per
 * `await import()` im Testkörper — Begründung ausführlich in
 * `../../sichtungen/showreports.json/localePinning.test.ts`: Der Modulgraph zieht
 * den kompletten Paraglide-Barrel (1.306 Module) nach, dessen Transform unter
 * Last 4,6–5,2 s kostet und damit in Vitests 5000-ms-Grenze pro Test läuft. Am
 * Dateikopf zählt derselbe Aufwand zur Collect-Phase, die keine Test-Zeitgrenze
 * kennt. Hier fiel es nur deshalb noch nicht als Fehlschlag auf, weil der erste
 * Test knapp unter der Grenze blieb.
 */
import { baseLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { GET } from './+server';

const DIVERGED_EN_LABEL = 'TEST-ONLY-DIVERGED-ENGLISH-LABEL';

function divergeInEnglish(
	actualFn: (inputs?: Record<string, never>, options?: { locale?: 'de' | 'en' }) => string
) {
	return (inputs?: Record<string, never>, options?: { locale?: 'de' | 'en' }) =>
		options?.locale === 'en' ? DIVERGED_EN_LABEL : actualFn(inputs, options);
}

vi.mock('#lib/paraglide/messages.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/paraglide/messages.js')>();
	return {
		...actual,
		// Zwingt die englische Botschaft auseinander, egal was messages/en.json
		// heute tatsächlich enthält (siehe Docblock oben).
		formoptions_species_harbor_porpoise: divergeInEnglish(
			actual.formoptions_species_harbor_porpoise
		),
		formoptions_seastate_smooth: divergeInEnglish(actual.formoptions_seastate_smooth),
		formoptions_sex_female: divergeInEnglish(actual.formoptions_sex_female),
		formoptions_visibility_clear: divergeInEnglish(actual.formoptions_visibility_clear),
		formoptions_windstrength_windstill: divergeInEnglish(actual.formoptions_windstrength_windstill),
		formoptions_distance_less_than_10m: divergeInEnglish(actual.formoptions_distance_less_than_10m),
		formoptions_distribution_single: divergeInEnglish(actual.formoptions_distribution_single),
		formoptions_winddirection_n: divergeInEnglish(actual.formoptions_winddirection_n),
		formoptions_animalbehavior_other: divergeInEnglish(actual.formoptions_animalbehavior_other),
		formoptions_animalcondition_unknown: divergeInEnglish(
			actual.formoptions_animalcondition_unknown
		),
		formoptions_sightingfrom_sailboat: divergeInEnglish(actual.formoptions_sightingfrom_sailboat),
		formoptions_entrychannel_web: divergeInEnglish(actual.formoptions_entrychannel_web),
		formoptions_boatdrive_motor: divergeInEnglish(actual.formoptions_boatdrive_motor)
	};
});

describe('GET /rest_sichtungen/antworten.json — Locale-Pinnung', () => {
	afterEach(() => {
		// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
		// eingebauten Reset — auf den echten Default zurückschalten, damit
		// andere Tests im selben Prozess nicht die englische Locale erben.
		overwriteGetLocale(() => baseLocale);
	});

	it('liefert die deutsche Artbezeichnung, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		// Simuliert eine Anfrage, deren Locale-Kontext auf Englisch steht — genau
		// der Fall, den ein ungepinnter getSpeciesLabel()-Aufruf übernehmen würde.
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.tierart['0']).toBe('Schweinswal');
		expect(body.tierart['0']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Seegang-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.seegang['1']).toBe('Glatte See, keine Wellen');
		expect(body.seegang['1']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert die deutsche Geschlechtsbezeichnung (totfund_geschlecht), obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.totfund_geschlecht['1']).toBe('Weiblich');
		expect(body.totfund_geschlecht['1']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Sichtweiten-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.sichtweite['2']).toBe('Klar (bis 20km)');
		expect(body.sichtweite['2']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Windstärke-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.windstaerke['0']).toBe('0 - Windstille (< 1 km/h)');
		expect(body.windstaerke['0']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Entfernungs-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.entfernung['1']).toBe('weniger als 10 Meter');
		expect(body.entfernung['1']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Verteilungs-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.verteilung['1']).toBe('Einzeln');
		expect(body.verteilung['1']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Windrichtungs-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.windrichtung['N']).toBe('Nord');
		expect(body.windrichtung['N']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Verhaltens-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.verhalten['0']).toBe('Sonstiges Verhalten');
		expect(body.verhalten['0']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Tierzustands-Text (totfund_zustand), obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.totfund_zustand['0']).toBe('Unbekannt');
		expect(body.totfund_zustand['0']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Beobachtungsort-Text (vonwo), obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.vonwo['1']).toBe('Segelschiff');
		expect(body.vonwo['1']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Eingangskanal-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.eingangskanal['0']).toBe('Web');
		expect(body.eingangskanal['0']).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert den deutschen Bootsantrieb-Text, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		overwriteGetLocale(() => 'en');

		const response = await GET({
			url: new URL('https://localhost/rest_sichtungen/antworten.json'),
			getClientAddress: () => '127.0.0.1',
			request: new Request('https://localhost/rest_sichtungen/antworten.json')
		} as never);
		const body = await response.json();

		expect(body.bootsantrieb['1']).toBe('Motor');
		expect(body.bootsantrieb['1']).not.toBe(DIVERGED_EN_LABEL);
	});
});
