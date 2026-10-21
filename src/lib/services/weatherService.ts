import { calculateSeaState } from '#lib/constants/weather.ts';

/**
 * Weather data from Open-Meteo API
 */
export interface WeatherData {
	time: string; // ISO date-time string
	windSpeed: number; // km/h
	windDirection: number; // degrees
	windDirectionCardinal: string; // N, NO, O, SO, S, SW, W, NW
	temperature: number; // °C
	weatherCode: number; // OpenWeatherMap weather code
	weatherDescription: string; // Weather description in German
	visibility: number; // meters
	seaState?: number; // Beaufort scale (calculated from wind speed)
	pressure?: number; // hPa
	humidity?: number; // %
}

/**
 * Extended weather data structure for database storage (Issue #110)
 * Includes all metadata, raw data, processed values, and quality information
 */
export interface StoredWeatherData {
	// Metadata for database storage
	provider: 'open-meteo';
	fetched_at: string; // ISO timestamp
	api_version: string;
	data_type: 'historical' | 'forecast'; // NEW: Distinguish data source
	location: {
		latitude: number;
		longitude: number;
		elevation?: number;
	};
	observation_time: string; // ISO timestamp of sighting

	// Complete raw data from Open-Meteo API
	raw_data: {
		temperature_2m: number;
		wind_speed_10m: number;
		wind_direction_10m: number;
		weather_code: number;
		visibility: number;
		surface_pressure?: number;
		relative_humidity_2m?: number;
		precipitation?: number;
		cloud_cover?: number;

		// Additional parameters for Marine API (if available)
		wave_height?: number;
		wave_direction?: number;
		wave_period?: number;
		sea_surface_temperature?: number;
	};

	// Processed/calculated values (as currently implemented)
	processed: {
		temperature: number; // °C
		windSpeed: number; // km/h
		windDirection: number; // degrees
		windDirectionCardinal: string; // N, NO, O, SO, S, SW, W, NW
		weatherCode: number;
		weatherDescription: string; // German description
		visibility: number; // meters
		seaState: number; // calculated from wind speed
		pressure?: number; // hPa
		humidity?: number; // %
	};

	// Quality information
	quality: {
		confidence: number; // 0.0 - 1.0
		data_source: string; // 'era5_reanalysis' or 'gfs_forecast'
		notes?: string;
	};
}

/**
 * Form fields mapped from weather data
 */
export interface WeatherFormFields {
	windForce: string;
	windDirection: string;
	seaState: string;
	visibility: number;
}

// Sichtweiten-Grenzen als Konstanten
const VISIBILITY_CLEAR_KM = 20;
const VISIBILITY_MODERATE_KM = 4;
const VISIBILITY_POOR_KM = 1;

/**
 * Convert wind speed to Beaufort scale
 * https://de.wikipedia.org/wiki/Beaufortskala
 */
export function windSpeedToBeaufort(speedKmh: number): number {
	if (speedKmh < 2) return 0;
	if (speedKmh < 6) return 1;
	if (speedKmh < 12) return 2;
	if (speedKmh < 20) return 3;
	if (speedKmh < 29) return 4;
	if (speedKmh < 39) return 5;
	if (speedKmh < 50) return 6;
	if (speedKmh < 62) return 7;
	if (speedKmh < 75) return 8;
	if (speedKmh < 89) return 9;
	if (speedKmh < 103) return 10;
	if (speedKmh < 118) return 11;
	return 12;
}

/**
 * Convert km/h to m/s
 */
export function kmhToMs(speedKmh: number): number {
	return Math.round((speedKmh / 3.6) * 10) / 10; // Round to 1 decimal
}

/**
 * Convert visibility meters to form value
 */
export function getVisibilityFormValue(visibilityMeters: number): number {
	const visibilityKm = visibilityMeters / 1000;
	if (visibilityKm >= VISIBILITY_CLEAR_KM) return 1; // Klar >20 km
	if (visibilityKm >= VISIBILITY_MODERATE_KM) return 2; // Mäßig 4-20 km
	if (visibilityKm >= VISIBILITY_POOR_KM) return 3; // Schlecht 1-4 km
	return 4; // Neblig
}

/**
 * Map weather data to form fields
 */
export function mapWeatherToFormFields(weather: WeatherData): WeatherFormFields {
	return {
		windForce: windSpeedToBeaufort(weather.windSpeed).toString(),
		windDirection: weather.windDirectionCardinal,
		seaState: weather.seaState?.toString() || '',
		visibility: getVisibilityFormValue(weather.visibility)
	};
}

/**
 * Raw API data structure from Open-Meteo
 */
export interface OpenMeteoRawData {
	elevation?: number;
	temperature_2m?: number;
	wind_speed_10m?: number;
	wind_direction_10m?: number;
	weather_code?: number;
	visibility?: number;
	surface_pressure?: number;
	relative_humidity_2m?: number;
	precipitation?: number;
	cloud_cover?: number;
	wave_height?: number;
	wave_direction?: number;
	wave_period?: number;
	sea_surface_temperature?: number;
}

/**
 * Convert WeatherData to StoredWeatherData for database storage (Issue #110)
 */
export function convertToStoredWeatherData(
	weather: WeatherData,
	rawApiData: OpenMeteoRawData,
	dataType: 'historical' | 'forecast',
	latitude: number,
	longitude: number
): StoredWeatherData {
	const now = new Date().toISOString();

	return {
		provider: 'open-meteo',
		fetched_at: now,
		api_version: 'v1',
		data_type: dataType,
		location: {
			latitude,
			longitude,
			...(rawApiData.elevation !== undefined && { elevation: rawApiData.elevation })
		},
		// `weather.time` ist ein zonenloser String (Open-Meteo liefert ihn mit
		// `timezone=Europe/Berlin`, siehe weather.md) — bereits Berlin-Wanduhrzeit,
		// keine UTC/Instant-Angabe. Anzeigecode darf ihn deshalb nicht nochmal per
		// formatLocalDateTime nach Berlin konvertieren (M4) — formatISOLikeDatetime
		// reicht ihn stattdessen verbatim durch.
		observation_time: weather.time,

		raw_data: {
			temperature_2m: rawApiData.temperature_2m || weather.temperature,
			wind_speed_10m: rawApiData.wind_speed_10m || weather.windSpeed,
			wind_direction_10m: rawApiData.wind_direction_10m || weather.windDirection,
			weather_code: rawApiData.weather_code || weather.weatherCode,
			visibility: rawApiData.visibility || weather.visibility,
			...(rawApiData.surface_pressure !== undefined && {
				surface_pressure: rawApiData.surface_pressure
			}),
			...(weather.pressure !== undefined &&
				!rawApiData.surface_pressure && { surface_pressure: weather.pressure }),
			...(rawApiData.relative_humidity_2m !== undefined && {
				relative_humidity_2m: rawApiData.relative_humidity_2m
			}),
			...(weather.humidity !== undefined &&
				!rawApiData.relative_humidity_2m && { relative_humidity_2m: weather.humidity }),
			...(rawApiData.precipitation !== undefined && { precipitation: rawApiData.precipitation }),
			...(rawApiData.cloud_cover !== undefined && { cloud_cover: rawApiData.cloud_cover }),
			...(rawApiData.wave_height !== undefined && { wave_height: rawApiData.wave_height }),
			...(rawApiData.wave_direction !== undefined && { wave_direction: rawApiData.wave_direction }),
			...(rawApiData.wave_period !== undefined && { wave_period: rawApiData.wave_period }),
			...(rawApiData.sea_surface_temperature !== undefined && {
				sea_surface_temperature: rawApiData.sea_surface_temperature
			})
		},

		processed: {
			temperature: weather.temperature,
			windSpeed: weather.windSpeed,
			windDirection: weather.windDirection,
			windDirectionCardinal: weather.windDirectionCardinal,
			weatherCode: weather.weatherCode,
			weatherDescription: weather.weatherDescription,
			visibility: weather.visibility,
			seaState: weather.seaState || calculateSeaState(weather.windSpeed),
			...(weather.pressure !== undefined && { pressure: weather.pressure }),
			...(weather.humidity !== undefined && { humidity: weather.humidity })
		},

		quality: {
			confidence: dataType === 'historical' ? 0.95 : 0.85, // Historical data more reliable
			data_source: dataType === 'historical' ? 'era5_reanalysis' : 'gfs_forecast',
			...(dataType === 'forecast' && { notes: 'Forecast data for current day sighting' })
		}
	};
}
