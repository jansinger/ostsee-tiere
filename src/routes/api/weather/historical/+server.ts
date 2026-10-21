import * as m from '#lib/paraglide/messages.js';
import {
	calculateSeaState,
	degreesToCardinal,
	getWeatherDescription
} from '#lib/constants/weather.ts';
import { createLogger } from '#lib/logger.server.ts';
import { getCachedWeatherForSighting } from '#lib/server/db/sightingRepository.ts';
import {
	mapWeatherToFormFields,
	type OpenMeteoRawData,
	type WeatherData
} from '#lib/services/weatherService.ts';
import { hourIndexFromLocalTime } from '#lib/server/weather/hourIndex.ts';
import {
	berlinCalendarDayIso,
	combineToDate,
	formatISOLikeDatetime
} from '#lib/utils/format/dateTime.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:weather:historical');

interface MarineResponse {
	hourly?: {
		time: string[];
		wave_height?: number[];
		wave_direction?: number[];
		wave_period?: number[];
	};
}

/**
 * Determine if sighting date is today (Issue #110).
 *
 * N4: Vergleich in deutscher Ortszeit, nicht in Prozesszone. `date` ist bereits
 * ein "YYYY-MM-DD"-Kalendertag (deutsche Ortszeit); ein `Date`-basierter
 * Vergleich in UTC-Prozesszone würde in den ersten 1-2 Stunden nach Mitternacht
 * Berlin (UTC hat den Tageswechsel noch nicht vollzogen) ein heutiges
 * Berlin-Datum fälschlich als "nicht heute" werten und ans Archiv statt an die
 * Forecast-API routen — das Archiv kennt den laufenden Tag noch nicht.
 */
function isTodayDate(date: string): boolean {
	return date === berlinCalendarDayIso();
}

/**
 * Fetch weather data from Open-Meteo Forecast API for current day
 */
async function fetchForecastData(
	latitude: number,
	longitude: number,
	date: string,
	time: string
): Promise<{ weatherData: WeatherData; rawData: OpenMeteoRawData; dataType: 'forecast' } | null> {
	try {
		const dateObj = combineToDate(date, time);
		if (isNaN(dateObj.getTime())) {
			logger.warn({ date }, 'Invalid date format for forecast');
			return null;
		}

		// Build API URL for Open-Meteo Forecast API
		const params = new URLSearchParams({
			latitude: latitude.toString(),
			longitude: longitude.toString(),
			hourly:
				'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,visibility,surface_pressure,relative_humidity_2m',
			timezone: 'Europe/Berlin',
			forecast_days: '1'
		});

		const url = `https://api.open-meteo.com/v1/forecast?${params}`;

		// Build Marine API URL for wave data
		const marineParams = new URLSearchParams({
			latitude: latitude.toString(),
			longitude: longitude.toString(),
			hourly: 'wave_height,wave_direction,wave_period',
			timezone: 'Europe/Berlin',
			forecast_days: '1'
		});
		const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${marineParams}`;

		logger.info(
			{ latitude, longitude, date, time },
			'Fetching current day forecast data from Open-Meteo'
		);

		// Fetch both weather and marine data in parallel
		const [weatherResponse, marineResponse] = await Promise.allSettled([
			fetch(url),
			fetch(marineUrl)
		]);

		if (weatherResponse.status === 'rejected' || !weatherResponse.value.ok) {
			logger.error(
				{
					status: weatherResponse.status === 'fulfilled' ? weatherResponse.value.status : 'rejected'
				},
				'Open-Meteo Forecast API request failed'
			);
			return null;
		}

		const forecastData = await weatherResponse.value.json();

		// Try to get marine data
		let marineData: MarineResponse | null = null;
		if (marineResponse.status === 'fulfilled' && marineResponse.value.ok) {
			try {
				marineData = await marineResponse.value.json();
			} catch (error) {
				logger.warn({ error }, 'Failed to parse marine forecast data');
			}
		}

		// Find the closest hour index for today
		const hourly = forecastData.hourly;
		if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
			logger.warn('No forecast data available for current day');
			return null;
		}

		// `hourly.time[]` steht in deutscher Ortszeit (Abfrage mit timezone=Europe/Berlin),
		// die Uhrzeit der Sichtung ebenfalls — der Index wird deshalb direkt aus "HH:MM"
		// gebildet und nicht über die Prozess-Zeitzone eines Date-Objekts.
		let targetIndex = hourIndexFromLocalTime(time);
		if (targetIndex >= hourly.time.length) {
			targetIndex = 12; // Default to noon
		}

		const windSpeedKmh = Math.round(hourly.wind_speed_10m[targetIndex] ?? 0);

		const weatherData: WeatherData = {
			time: formatISOLikeDatetime(hourly.time[targetIndex]),
			windSpeed: windSpeedKmh,
			windDirection: Math.round(hourly.wind_direction_10m[targetIndex] ?? 0),
			windDirectionCardinal: degreesToCardinal(hourly.wind_direction_10m[targetIndex] ?? 0),
			temperature: Math.round(hourly.temperature_2m[targetIndex] ?? 0),
			weatherCode: hourly.weather_code[targetIndex] ?? 0,
			weatherDescription: getWeatherDescription(hourly.weather_code[targetIndex] ?? 0),
			visibility: Math.round(hourly.visibility?.[targetIndex] ?? 10000),
			seaState: calculateSeaState(windSpeedKmh),
			pressure: Math.round(hourly.surface_pressure?.[targetIndex] ?? 0),
			humidity: Math.round(hourly.relative_humidity_2m?.[targetIndex] ?? 0)
		};

		const rawData: OpenMeteoRawData = {
			elevation: forecastData.elevation,
			temperature_2m: hourly.temperature_2m[targetIndex],
			wind_speed_10m: hourly.wind_speed_10m[targetIndex],
			wind_direction_10m: hourly.wind_direction_10m[targetIndex],
			weather_code: hourly.weather_code[targetIndex],
			visibility: hourly.visibility?.[targetIndex],
			surface_pressure: hourly.surface_pressure?.[targetIndex],
			relative_humidity_2m: hourly.relative_humidity_2m?.[targetIndex],
			// Add marine data if available
			...(marineData?.hourly?.wave_height?.[targetIndex] !== undefined && {
				wave_height: marineData.hourly.wave_height[targetIndex]
			}),
			...(marineData?.hourly?.wave_direction?.[targetIndex] !== undefined && {
				wave_direction: marineData.hourly.wave_direction[targetIndex]
			}),
			...(marineData?.hourly?.wave_period?.[targetIndex] !== undefined && {
				wave_period: marineData.hourly.wave_period[targetIndex]
			})
		};

		logger.info(
			{ weatherData, hasMarineData: !!marineData },
			'Forecast data fetched successfully from Open-Meteo'
		);

		return {
			weatherData,
			rawData,
			dataType: 'forecast'
		};
	} catch (error) {
		logger.error({ error }, 'Failed to fetch forecast data from Open-Meteo');
		return null;
	}
}

/**
 * Fetch historical weather data from Open-Meteo Archive API
 */
async function fetchHistoricalData(
	latitude: number,
	longitude: number,
	date: string,
	time: string
): Promise<{ weatherData: WeatherData; rawData: OpenMeteoRawData; dataType: 'historical' } | null> {
	try {
		// Format date for API
		const dateObj = combineToDate(date, time);
		if (isNaN(dateObj.getTime())) {
			logger.warn({ date }, 'Invalid date format');
			return null;
		}

		const startDate = date;
		const endDate = date;

		// Build API URL for Open-Meteo
		const params = new URLSearchParams({
			latitude: latitude.toString(),
			longitude: longitude.toString(),
			start_date: startDate,
			end_date: endDate,
			hourly:
				'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,visibility,surface_pressure,relative_humidity_2m',
			timezone: 'Europe/Berlin'
		});

		const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;

		// Build Marine API URL for historical wave data
		const marineParams = new URLSearchParams({
			latitude: latitude.toString(),
			longitude: longitude.toString(),
			start_date: startDate,
			end_date: endDate,
			hourly: 'wave_height,wave_direction,wave_period',
			timezone: 'Europe/Berlin'
		});
		const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${marineParams}`;

		logger.info(
			{ latitude, longitude, date, time },
			'Fetching historical weather and marine data from Open-Meteo'
		);

		// Fetch both weather and marine data in parallel
		const [weatherResponse, marineResponse] = await Promise.allSettled([
			fetch(url),
			fetch(marineUrl)
		]);

		if (weatherResponse.status === 'rejected' || !weatherResponse.value.ok) {
			logger.error(
				{
					status: weatherResponse.status === 'fulfilled' ? weatherResponse.value.status : 'rejected'
				},
				'Open-Meteo Archive API request failed'
			);
			return null;
		}

		const response = weatherResponse.value;

		if (!response.ok) {
			logger.error(
				{ status: response.status, statusText: response.statusText },
				'Open-Meteo Archive API request failed'
			);
			return null;
		}

		const data = await response.json();

		// Try to get marine data
		let marineData: MarineResponse | null = null;
		if (marineResponse.status === 'fulfilled' && marineResponse.value.ok) {
			try {
				marineData = await marineResponse.value.json();
			} catch (error) {
				logger.warn({ error }, 'Failed to parse marine historical data');
			}
		}

		// Defensive checks for hourly data
		const hourly = data.hourly;
		if (
			!hourly ||
			!Array.isArray(hourly.time) ||
			hourly.time.length === 0 ||
			!Array.isArray(hourly.wind_speed_10m) ||
			!Array.isArray(hourly.wind_direction_10m) ||
			!Array.isArray(hourly.temperature_2m) ||
			!Array.isArray(hourly.weather_code)
		) {
			logger.warn(
				'No historical weather data available or unexpected format for the specified date'
			);
			return null;
		}

		// Find the closest hour index
		// `hourly.time[]` steht in deutscher Ortszeit (Abfrage mit timezone=Europe/Berlin),
		// die Uhrzeit der Sichtung ebenfalls — der Index wird deshalb direkt aus "HH:MM"
		// gebildet und nicht über die Prozess-Zeitzone eines Date-Objekts.
		let targetIndex = hourIndexFromLocalTime(time);
		if (targetIndex >= hourly.time.length) {
			targetIndex = 12; // Default to noon if out of range
		}

		// Convert wind speed from km/h (Open-Meteo returns km/h)
		const windSpeedKmh = Math.round(hourly.wind_speed_10m[targetIndex] ?? 0);

		// Extract weather data
		const weatherData: WeatherData = {
			time: formatISOLikeDatetime(hourly.time[targetIndex]),
			windSpeed: windSpeedKmh,
			windDirection: Math.round(hourly.wind_direction_10m[targetIndex] ?? 0),
			windDirectionCardinal: degreesToCardinal(hourly.wind_direction_10m[targetIndex] ?? 0),
			temperature: Math.round(hourly.temperature_2m[targetIndex] ?? 0),
			weatherCode: hourly.weather_code[targetIndex] ?? 0,
			weatherDescription: getWeatherDescription(hourly.weather_code[targetIndex] ?? 0),
			visibility: Math.round(hourly.visibility?.[targetIndex] ?? 10000),
			seaState: calculateSeaState(windSpeedKmh),
			pressure: Math.round(hourly.surface_pressure?.[targetIndex] ?? 0),
			humidity: Math.round(hourly.relative_humidity_2m?.[targetIndex] ?? 0)
		};

		const rawData: OpenMeteoRawData = {
			elevation: data.elevation,
			temperature_2m: hourly.temperature_2m[targetIndex],
			wind_speed_10m: hourly.wind_speed_10m[targetIndex],
			wind_direction_10m: hourly.wind_direction_10m[targetIndex],
			weather_code: hourly.weather_code[targetIndex],
			visibility: hourly.visibility?.[targetIndex],
			surface_pressure: hourly.surface_pressure?.[targetIndex],
			relative_humidity_2m: hourly.relative_humidity_2m?.[targetIndex],
			// Add marine data if available
			...(marineData?.hourly?.wave_height?.[targetIndex] !== undefined && {
				wave_height: marineData.hourly.wave_height[targetIndex]
			}),
			...(marineData?.hourly?.wave_direction?.[targetIndex] !== undefined && {
				wave_direction: marineData.hourly.wave_direction[targetIndex]
			}),
			...(marineData?.hourly?.wave_period?.[targetIndex] !== undefined && {
				wave_period: marineData.hourly.wave_period[targetIndex]
			})
		};

		logger.info(
			{ weatherData, hasMarineData: !!marineData },
			'Historical weather data fetched successfully from Open-Meteo Archive'
		);

		return {
			weatherData,
			rawData,
			dataType: 'historical'
		};
	} catch (error) {
		logger.error({ error }, 'Failed to fetch weather data from Open-Meteo');
		return null;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Extract query parameters
		const latitudeRaw = url.searchParams.get('lat');
		const longitudeRaw = url.searchParams.get('lng');
		const date = url.searchParams.get('date') || '';
		const time = url.searchParams.get('time') || '';

		const latitude = latitudeRaw ? parseFloat(latitudeRaw) : NaN;
		const longitude = longitudeRaw ? parseFloat(longitudeRaw) : NaN;

		// Validate parameters
		if (isNaN(latitude) || isNaN(longitude) || !date) {
			return json(
				{ error: m.api_weather_historical_text_fehlende_oder_ungueltige_parameter() },
				{ status: 400 }
			);
		}

		// Validate coordinates are in Baltic Sea region (approximate)
		if (latitude < 53 || latitude > 66 || longitude < 9 || longitude > 31) {
			logger.warn({ latitude, longitude }, 'Coordinates outside Baltic Sea region');
		}

		// Check for cached weather data first
		const cachedWeather = await getCachedWeatherForSighting(latitude, longitude, date);

		let weatherResult: {
			weatherData: WeatherData;
			rawData: OpenMeteoRawData;
			dataType: 'forecast' | 'historical';
		} | null = null;

		if (cachedWeather) {
			logger.info({ latitude, longitude, date }, 'Using cached weather data from database');

			// Use cached data - convert from StoredWeatherData to WeatherData format
			const weatherData: WeatherData = {
				time: cachedWeather.observation_time,
				windSpeed: cachedWeather.processed.windSpeed,
				windDirection: cachedWeather.processed.windDirection,
				windDirectionCardinal: cachedWeather.processed.windDirectionCardinal,
				temperature: cachedWeather.processed.temperature,
				weatherCode: cachedWeather.processed.weatherCode,
				weatherDescription: cachedWeather.processed.weatherDescription,
				visibility: cachedWeather.processed.visibility,
				seaState: cachedWeather.processed.seaState,
				...(cachedWeather.processed.pressure !== undefined && {
					pressure: cachedWeather.processed.pressure
				}),
				...(cachedWeather.processed.humidity !== undefined && {
					humidity: cachedWeather.processed.humidity
				})
			};

			// Create raw data object for consistency
			const rawData: OpenMeteoRawData = {
				...(cachedWeather.location.elevation !== undefined && {
					elevation: cachedWeather.location.elevation
				}),
				temperature_2m: cachedWeather.raw_data.temperature_2m,
				wind_speed_10m: cachedWeather.raw_data.wind_speed_10m,
				wind_direction_10m: cachedWeather.raw_data.wind_direction_10m,
				weather_code: cachedWeather.raw_data.weather_code,
				visibility: cachedWeather.raw_data.visibility,
				...(cachedWeather.raw_data.surface_pressure !== undefined && {
					surface_pressure: cachedWeather.raw_data.surface_pressure
				}),
				...(cachedWeather.raw_data.relative_humidity_2m !== undefined && {
					relative_humidity_2m: cachedWeather.raw_data.relative_humidity_2m
				})
			};

			weatherResult = {
				weatherData,
				rawData,
				dataType: cachedWeather.data_type
			};
		} else {
			// No cached data - fetch from API
			logger.info(
				{ latitude, longitude, date },
				'No cached data found, fetching from Open-Meteo API'
			);

			// Determine if we need forecast or historical data
			if (isTodayDate(date)) {
				weatherResult = await fetchForecastData(latitude, longitude, date, time);
			} else {
				weatherResult = await fetchHistoricalData(latitude, longitude, date, time);
			}

			// Note: Weather data is NOT cached separately in the database.
			// It will be stored with the actual sighting when the form is submitted.
			// This prevents creating phantom sighting entries just for weather caching.
		}

		if (!weatherResult) {
			return json(
				{ error: m.api_weather_historical_text_fuer_diesen_ort_und_dieses_datum_konnten() },
				{ status: 404 }
			);
		}

		// Map to form fields (see $lib/services/weatherService for mapping details)
		const formFields = mapWeatherToFormFields(weatherResult.weatherData);

		// Return combined response with enhanced metadata
		return json({
			success: true,
			weather: weatherResult.weatherData,
			formFields,
			metadata: {
				source:
					weatherResult.dataType === 'forecast'
						? 'Open-Meteo Forecast API'
						: 'Open-Meteo Historical Weather API',
				dataType: weatherResult.dataType,
				cached: !!cachedWeather,
				latitude,
				longitude,
				date,
				time
			}
		});
	} catch (error) {
		logger.error({ error }, 'Failed to process weather request');
		return json({ error: m.api_weather_historical_text_interner_serverfehler() }, { status: 500 });
	}
};
