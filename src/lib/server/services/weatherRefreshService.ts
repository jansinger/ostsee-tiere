import { createLogger } from '#lib/logger.server.ts';
import {
	convertToStoredWeatherData,
	type StoredWeatherData,
	type WeatherData
} from '#lib/services/weatherService.ts';
import {
	degreesToCardinal,
	getWeatherDescription,
	calculateSeaState
} from '#lib/constants/weather.ts';
import { hourIndexFromLocalTime } from '#lib/server/weather/hourIndex.ts';
import { berlinCalendarDayIso } from '#lib/utils/format/dateTime.ts';

const logger = createLogger('service:weather-refresh');

interface OpenMeteoResponse {
	hourly?: {
		time: string[];
		temperature_2m: number[];
		wind_speed_10m: number[];
		wind_direction_10m: number[];
		weather_code: number[];
		visibility: number[];
		relative_humidity_2m?: number[];
		surface_pressure?: number[];
		precipitation?: number[];
		cloud_cover?: number[];
	};
	hourly_units?: {
		temperature_2m: string;
		wind_speed_10m: string;
		wind_direction_10m: string;
		weather_code: string;
		visibility: string;
	};
}

interface MarineResponse {
	hourly?: {
		time: string[];
		wave_height?: number[];
		wave_direction?: number[];
		wave_period?: number[];
	};
}

/**
 * Fetch weather data directly from Open-Meteo API
 */
export async function fetchWeatherData(
	latitude: number,
	longitude: number,
	date: string,
	time?: string
): Promise<StoredWeatherData> {
	const startDate = date;
	const endDate = date;

	// Prüfe ob das Datum heute oder in der Zukunft ist (N5: deutsche Ortszeit,
	// nicht UTC — sonst wird in den ersten 1-2 Stunden nach Mitternacht Berlin
	// noch der UTC-Vortag als "heute" gewertet).
	const today = berlinCalendarDayIso();
	const isToday = date >= today;

	// Build Open-Meteo API URL - verwende Forecast API für heutige/zukünftige Daten
	const params = new URLSearchParams({
		latitude: latitude.toString(),
		longitude: longitude.toString(),
		timezone: 'Europe/Berlin'
	});

	let url: string;
	if (isToday) {
		// Aktuelle/zukünftige Daten: Forecast API
		params.append(
			'hourly',
			[
				'temperature_2m',
				'wind_speed_10m',
				'wind_direction_10m',
				'weather_code',
				'visibility',
				'relative_humidity_2m',
				'surface_pressure',
				'precipitation',
				'cloud_cover'
			].join(',')
		);
		url = `https://api.open-meteo.com/v1/forecast?${params}`;
		logger.debug(
			{ date, isToday, apiType: 'forecast' },
			'Using Forecast API for current/future date'
		);
	} else {
		// Historische Daten: Archive API
		params.append('start_date', startDate);
		params.append('end_date', endDate);
		params.append(
			'hourly',
			[
				'temperature_2m',
				'wind_speed_10m',
				'wind_direction_10m',
				'weather_code',
				'visibility',
				'relative_humidity_2m',
				'surface_pressure',
				'precipitation',
				'cloud_cover'
			].join(',')
		);
		url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
		logger.debug({ date, isToday, apiType: 'archive' }, 'Using Archive API for historical date');
	}

	// Build Marine API URL for wave data
	const marineParams = new URLSearchParams({
		latitude: latitude.toString(),
		longitude: longitude.toString(),
		timezone: 'Europe/Berlin'
	});

	let marineUrl: string;
	if (isToday) {
		marineParams.append('hourly', 'wave_height,wave_direction,wave_period');
		marineParams.append('forecast_days', '1');
		marineUrl = `https://marine-api.open-meteo.com/v1/marine?${marineParams}`;
	} else {
		marineParams.append('start_date', startDate);
		marineParams.append('end_date', endDate);
		marineParams.append('hourly', 'wave_height,wave_direction,wave_period');
		marineUrl = `https://marine-api.open-meteo.com/v1/marine?${marineParams}`;
	}

	logger.info(
		{ url, marineUrl, latitude, longitude, date, time },
		'Fetching weather and marine data from Open-Meteo'
	);

	try {
		// Fetch both weather and marine data in parallel.
		// Timeout von 5s pro Request, damit ein langsames/hängendes Open-Meteo den
		// Aufruf (und damit den Sichtungs-Speichervorgang) nicht unbegrenzt blockiert.
		const [weatherResponse, marineResponse] = await Promise.allSettled([
			fetch(url, { signal: AbortSignal.timeout(5000) }),
			fetch(marineUrl, { signal: AbortSignal.timeout(5000) })
		]);

		if (weatherResponse.status === 'rejected') {
			throw new Error(`Open-Meteo Weather API error: ${weatherResponse.reason}`);
		}

		if (!weatherResponse.value.ok) {
			throw new Error(
				`Open-Meteo Weather API error: ${weatherResponse.value.status} ${weatherResponse.value.statusText}`
			);
		}

		const data: OpenMeteoResponse = await weatherResponse.value.json();

		// Try to get marine data, but don't fail if it's not available
		let marineData: MarineResponse | null = null;
		if (marineResponse.status === 'fulfilled' && marineResponse.value.ok) {
			try {
				marineData = await marineResponse.value.json();
				logger.info(
					{ hasMarineData: true, marineDataKeys: marineData ? Object.keys(marineData) : [] },
					'Marine data successfully fetched'
				);
			} catch (error) {
				logger.error({ error }, 'Failed to parse marine data response');
			}
		} else {
			logger.error(
				{
					status: marineResponse.status,
					statusText:
						marineResponse.status === 'fulfilled' ? marineResponse.value.statusText : 'rejected',
					statusCode: marineResponse.status === 'fulfilled' ? marineResponse.value.status : 'N/A'
				},
				'Marine API request failed or rejected'
			);
		}

		if (!data.hourly?.time || data.hourly.time.length === 0) {
			logger.error(
				{ latitude, longitude, date, time, apiResponse: data },
				'No weather data available from Open-Meteo API'
			);
			throw new Error('No weather data available for the specified date and location');
		}

		logger.debug(
			{
				availableTimes: data.hourly.time.slice(0, 5),
				totalTimeSlots: data.hourly.time.length,
				requestedDate: date,
				requestedTime: time
			},
			'Available weather data slots from Open-Meteo'
		);

		// N6: Index über die deutsche Ortszeit-Stunde ermitteln, nicht über eine
		// Date-Differenz-Suche. `hourly.time[]` ist durch `timezone=Europe/Berlin`
		// bereits ortszeit-indiziert (Index i = Stunde i) — `new Date(t)`-Vergleiche
		// hingen dagegen an der Prozess-Zeitzone.
		let bestIndex = hourIndexFromLocalTime(time);
		if (bestIndex >= data.hourly.time.length) {
			bestIndex = 0;
		}

		// Extract weather data for the best matching time
		const hourly = data.hourly;
		const observationTime = hourly.time[bestIndex];

		// Debug logging für den bestIndex
		logger.debug(
			{
				bestIndex,
				observationTime,
				totalSlots: hourly.time.length,
				timeSlotAtIndex: hourly.time[bestIndex],
				temperatureAtIndex: hourly.temperature_2m[bestIndex]
			},
			'Selected weather data slot'
		);

		if (!observationTime) {
			logger.error(
				{ bestIndex, totalSlots: hourly.time.length },
				'Invalid bestIndex - no observation time found'
			);
			throw new Error('Invalid time index selected for weather data');
		}

		const temperature = hourly.temperature_2m[bestIndex] ?? 0;
		const windSpeed = hourly.wind_speed_10m[bestIndex] ?? 0;
		const windDirection = hourly.wind_direction_10m[bestIndex] ?? 0;
		const weatherCode = hourly.weather_code[bestIndex] ?? 0;
		const visibility = hourly.visibility[bestIndex] ?? 10000;

		const weatherData: WeatherData = {
			time: observationTime,
			temperature,
			windSpeed,
			windDirection,
			windDirectionCardinal: degreesToCardinal(windDirection),
			weatherCode,
			weatherDescription: getWeatherDescription(weatherCode),
			visibility,
			seaState: calculateSeaState(windSpeed),
			...(hourly.surface_pressure?.[bestIndex] !== undefined && {
				pressure: hourly.surface_pressure[bestIndex]
			}),
			...(hourly.relative_humidity_2m?.[bestIndex] !== undefined && {
				humidity: hourly.relative_humidity_2m[bestIndex]
			})
		};

		// Build raw data object with marine data if available
		const rawData = {
			temperature_2m: hourly.temperature_2m[bestIndex] ?? 0,
			wind_speed_10m: hourly.wind_speed_10m[bestIndex] ?? 0,
			wind_direction_10m: hourly.wind_direction_10m[bestIndex] ?? 0,
			weather_code: hourly.weather_code[bestIndex] ?? 0,
			visibility: hourly.visibility[bestIndex] ?? 10000,
			...(hourly.relative_humidity_2m?.[bestIndex] !== undefined && {
				relative_humidity_2m: hourly.relative_humidity_2m[bestIndex]
			}),
			...(hourly.surface_pressure?.[bestIndex] !== undefined && {
				surface_pressure: hourly.surface_pressure[bestIndex]
			}),
			...(hourly.precipitation?.[bestIndex] !== undefined && {
				precipitation: hourly.precipitation[bestIndex]
			}),
			...(hourly.cloud_cover?.[bestIndex] !== undefined && {
				cloud_cover: hourly.cloud_cover[bestIndex]
			}),
			// Add marine data if available
			...(marineData?.hourly?.wave_height?.[bestIndex] !== undefined && {
				wave_height: marineData.hourly.wave_height[bestIndex]
			}),
			...(marineData?.hourly?.wave_direction?.[bestIndex] !== undefined && {
				wave_direction: marineData.hourly.wave_direction[bestIndex]
			}),
			...(marineData?.hourly?.wave_period?.[bestIndex] !== undefined && {
				wave_period: marineData.hourly.wave_period[bestIndex]
			})
		};

		// Convert to StoredWeatherData format
		const dataType = isToday ? 'forecast' : 'historical';
		const storedWeatherData = convertToStoredWeatherData(
			weatherData,
			rawData,
			dataType,
			latitude,
			longitude
		);

		logger.info(
			{
				latitude,
				longitude,
				date,
				time,
				observationTime,
				temperature: weatherData.temperature,
				weatherCode: weatherData.weatherCode,
				hasMarineData: !!marineData,
				marineDataSample: marineData?.hourly
					? {
							waveHeightCount: marineData.hourly.wave_height?.length || 0,
							firstWaveHeight: marineData.hourly.wave_height?.[bestIndex]
						}
					: null
			},
			'Weather data successfully fetched from Open-Meteo'
		);

		return storedWeatherData;
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error, latitude, longitude, date, time },
			'Failed to fetch weather data'
		);
		throw error;
	}
}
