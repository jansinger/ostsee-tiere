/**
 * @fileoverview Guard-Test: Die Wetterbeschreibung, die in die Datenbank
 * geschrieben wird, bleibt deutsch — egal welche Locale gerade aktiv ist.
 *
 * **Warum das kein theoretischer Fall ist.** `getWeatherDescription()` hat zwei
 * Verbraucher, und sie ziehen in entgegengesetzte Richtungen:
 *
 * 1. `server/services/weatherRefreshService.ts:250` und
 *    `routes/api/weather/historical/+server.ts` legen den Text als Teil des
 *    `weatherData`-Objekts ab, das in der Spalte `weather_data` (JSONB,
 *    `schema.ts:111`) **gespeichert** wird. Was dort landet, ist Datenbestand
 *    und muss deutsch sein — sonst trägt derselbe Bestand zwei Sprachen, je
 *    nachdem, in welcher der Melder das Formular ausgefüllt hat.
 * 2. `components/weather/WeatherDisplay.svelte` **zeigt** eine Beschreibung an.
 *    Die soll der aktiven Sprache folgen.
 *
 * Deshalb ist die Aufteilung: `getWeatherDescription(code)` liefert ohne
 * weiteres Zutun `baseLocale`-Deutsch (Persistenz, API-Antwort), und nur die
 * Anzeige reicht ausdrücklich `getLocale()` durch.
 *
 * Das ist die **vierte** Ausprägung derselben Falle in diesem Vorhaben — nach
 * Legacy-API, CSV-Export und Museums-Mail (`ARBEITSPROTOKOLL_ETAPPE1.md`).
 * Anders als dort betrifft sie hier nicht eine Ausgabe, sondern den
 * gespeicherten Bestand; ein Fehler wäre damit nicht durch erneutes Ausliefern
 * zu heilen.
 *
 * Die englische Botschaft wird für die Dauer des Tests künstlich
 * auseinandergezogen: `messages/en.json` trägt heute noch denselben deutschen
 * Wortlaut, ein Vergleich mit dem echten Katalog wäre also grün, ohne etwas zu
 * belegen — genau der blinde Fleck, der in Etappe 1 vierzig Commits lang
 * unbemerkt blieb.
 */
import { describe, expect, it, vi } from 'vitest';

const DIVERGED_EN = 'TEST-ONLY-DIVERGED-ENGLISH-WEATHER';

vi.mock('#lib/paraglide/messages.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/paraglide/messages.js')>();
	return {
		...actual,
		constants_weather_text_bedeckt: (
			inputs?: Record<string, never>,
			options?: { locale?: 'de' | 'en' }
		) =>
			options?.locale === 'en'
				? DIVERGED_EN
				: actual.constants_weather_text_bedeckt(inputs, options)
	};
});

const { getWeatherDescription } = await import('./weather');
const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');

describe('getWeatherDescription — Locale-Pinnung', () => {
	it('liefert Deutsch, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', () => {
		overwriteGetLocale(() => 'en');
		try {
			expect(getWeatherDescription(3)).toBe('Bedeckt');
		} finally {
			overwriteGetLocale(() => baseLocale);
		}
	});

	it('liefert die englische Fassung nur, wenn die Anzeige sie ausdrücklich anfordert', () => {
		// Die Gegenprobe zur Zusicherung oben: Ohne sie wäre der Test auch dann
		// grün, wenn `getWeatherDescription` das Locale-Argument schlicht
		// ignorierte — die Anwendung wäre einsprachig, und nichts sagte es.
		expect(getWeatherDescription(3, 'en')).toBe(DIVERGED_EN);
	});

	it('gibt für einen unbekannten Wettercode den Code aus, ebenfalls gepinnt', () => {
		overwriteGetLocale(() => 'en');
		try {
			expect(getWeatherDescription(1234)).toContain('1234');
		} finally {
			overwriteGetLocale(() => baseLocale);
		}
	});
});
