import * as m from '#lib/paraglide/messages.js';
import { baseLocale, type Locale } from '#lib/paraglide/runtime.js';

/** Eine parameterlose Paraglide-Botschaft, mit ausdrücklicher Locale. */
type WeatherMessage = (inputs: Record<string, never>, options: { locale: Locale }) => string;

/**
 * Weather-related constants and utility functions
 * Consolidated from various weather services to avoid duplication
 */

/**
 * WMO-Wettercode → Botschaft, aus der die Beschreibung gebaut wird.
 *
 * Bewusst die Botschafts-FUNKTION statt ihres Ergebnisses: Ein Record aus
 * fertigen Zeichenketten würde beim Modulladen einmal aufgelöst und fröre die
 * Sprache für die Lebensdauer des Prozesses ein — genau der Defekt, den
 * Entwurf 2.3/4.1 für die Modulkonstanten der Schicht B beschreibt.
 */
const WEATHER_MESSAGES: Record<number, WeatherMessage> = {
	0: m.constants_weather_text_klar,
	1: m.constants_weather_text_groesstenteils_klar,
	2: m.constants_weather_text_teilweise_bewoelkt,
	3: m.constants_weather_text_bedeckt,
	45: m.constants_weather_text_nebel,
	48: m.constants_weather_text_reifnebel,
	51: m.constants_weather_text_leichter_nieselregen,
	53: m.constants_weather_text_maessiger_nieselregen,
	55: m.constants_weather_text_dichter_nieselregen,
	56: m.constants_weather_text_leichter_gefrierender_nieselregen,
	57: m.constants_weather_text_dichter_gefrierender_nieselregen,
	61: m.constants_weather_text_leichter_regen,
	63: m.constants_weather_text_maessiger_regen,
	65: m.constants_weather_text_starker_regen,
	66: m.constants_weather_text_leichter_gefrierender_regen,
	67: m.constants_weather_text_starker_gefrierender_regen,
	71: m.constants_weather_text_leichter_schneefall,
	73: m.constants_weather_text_maessiger_schneefall,
	75: m.constants_weather_text_starker_schneefall,
	77: m.constants_weather_text_schneekoerner,
	80: m.constants_weather_text_leichte_regenschauer,
	81: m.constants_weather_text_maessige_regenschauer,
	82: m.constants_weather_text_heftige_regenschauer,
	85: m.constants_weather_text_leichte_schneeschauer,
	86: m.constants_weather_text_starke_schneeschauer,
	95: m.constants_weather_text_leichtes_bis_maessiges_gewitter,
	96: m.constants_weather_text_gewitter_mit_leichtem_hagel,
	99: m.constants_weather_text_gewitter_mit_starkem_hagel
};

/**
 * Cardinal directions for wind direction display
 * Ordered by compass position (N=0°, NE=45°, etc.)
 */
export const CARDINAL_DIRECTIONS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const;

/**
 * Convert wind direction in degrees to cardinal direction
 * @param degrees Wind direction in degrees (0-360)
 * @returns Cardinal direction (N, NO, O, SO, S, SW, W, NW)
 */
export function degreesToCardinal(degrees: number): string {
	const index = Math.round(degrees / 45) % 8;
	return CARDINAL_DIRECTIONS[index] ?? 'N';
}

/**
 * Wetterbeschreibung zu einem WMO-Wettercode.
 *
 * **Der Vorgabewert `baseLocale` ist die eigentliche Aussage dieser Signatur.**
 * Zwei Aufrufer speichern das Ergebnis: Der Wetter-Auffrischungsdienst und der
 * `historical`-Endpunkt legen es als Teil von `weatherData` in der
 * JSONB-Spalte `weather_data` ab. Was dort landet, ist Datenbestand — er darf
 * nicht davon abhängen, in welcher Sprache der Melder gerade unterwegs war.
 * Nur die Anzeige (`WeatherDisplay.svelte`) reicht ausdrücklich `getLocale()`
 * durch.
 *
 * Belegt durch `weatherLocalePinning.test.ts`, der die englische Botschaft
 * künstlich abweichen lässt — er ist also nicht grün, nur weil `de` und `en`
 * heute denselben Wortlaut tragen.
 *
 * @param weatherCode WMO-Wettercode der Open-Meteo-API
 * @param locale Anzeigesprache; ohne Angabe die Basissprache (Deutsch)
 */
export function getWeatherDescription(weatherCode: number, locale: Locale = baseLocale): string {
	const message = WEATHER_MESSAGES[weatherCode];
	return message
		? message({}, { locale })
		: m.constants_weather_text_wetter_code_code({ code: weatherCode }, { locale });
}

/**
 * Calculate sea state (Douglas scale approximation) from wind speed
 * @param windSpeedKmh Wind speed in km/h
 * @returns Sea state value (0-8)
 */
export function calculateSeaState(windSpeedKmh: number): number {
	if (windSpeedKmh < 2) return 0; // Calm
	if (windSpeedKmh < 12) return 1; // Smooth
	if (windSpeedKmh < 20) return 2; // Slight
	if (windSpeedKmh < 29) return 3; // Moderate
	if (windSpeedKmh < 50) return 4; // Rough
	if (windSpeedKmh < 62) return 5; // Very rough
	if (windSpeedKmh < 75) return 6; // High
	if (windSpeedKmh < 89) return 7; // Very high
	return 8; // Phenomenal
}
