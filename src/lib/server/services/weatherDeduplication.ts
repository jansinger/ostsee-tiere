/**
 * Weather data deduplication service for Issue #110
 *
 * Implements single fetch per position/day logic to minimize API calls
 * and reuse existing weather data for nearby sightings.
 */

import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { berlinCalendarDate } from '#lib/server/db/sqlTimeZone.ts';
import type { StoredWeatherData } from '#lib/services/weatherService.ts';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

const logger = createLogger('server:weatherDeduplication');

/**
 * Check if weather data already exists for similar position and date
 *
 * @param latitude Sighting latitude
 * @param longitude Sighting longitude
 * @param date Sighting date (YYYY-MM-DD format)
 * @returns Existing weather data or null
 */
export async function checkExistingWeatherData(
	latitude: number,
	longitude: number,
	date: string
): Promise<StoredWeatherData | null> {
	try {
		logger.info(
			{ latitude, longitude, date },
			'Checking for existing weather data within tolerance'
		);

		// Query for existing weather data within position tolerance and same date
		const existingData = await db
			.select({
				weatherData: sightings.weatherData,
				weatherFetchedAt: sightings.weatherFetchedAt,
				weatherProvider: sightings.weatherProvider,
				weatherDataType: sightings.weatherDataType,
				distance: sql<number>`ST_Distance(
					ST_SetSRID(ST_Point(${sightings.longitude}, ${sightings.latitude}), 4326)::geography, 
					ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography
				)`.as('distance')
			})
			.from(sightings)
			.where(
				and(
					// Use ST_DWithin for efficient proximity search (1km ≈ 1000m)
					sql`ST_DWithin(
						ST_SetSRID(ST_Point(${sightings.longitude}, ${sightings.latitude}), 4326)::geography,
						ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography,
						1000
					)`,
					// Gleicher Kalendertag in deutscher Ortszeit: `date` kommt als
					// lokales "YYYY-MM-DD" aus dem Formular, `sichtungsdatum` hält
					// seit der UTC-Migration echte Zeitpunkte.
					eq(berlinCalendarDate(sightings.sightingDate), date),
					// Has weather data
					isNotNull(sightings.weatherData)
				)
			)
			.orderBy(
				sql`ST_Distance(
				ST_SetSRID(ST_Point(${sightings.longitude}, ${sightings.latitude}), 4326)::geography, 
				ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography
			) ASC`
			)
			.limit(1);

		if (existingData.length === 0) {
			logger.info({ latitude, longitude, date }, 'No existing weather data found within tolerance');
			return null;
		}

		const result = existingData[0]!;
		const storedWeatherData = result.weatherData as StoredWeatherData;

		logger.info(
			{
				latitude,
				longitude,
				date,
				foundDistance: result.distance,
				weatherFetchedAt: result.weatherFetchedAt,
				weatherProvider: result.weatherProvider,
				weatherDataType: result.weatherDataType
			},
			'Found existing weather data within tolerance'
		);

		return storedWeatherData;
	} catch (error) {
		logger.error({ error, latitude, longitude, date }, 'Error checking for existing weather data');
		return null;
	}
}

/**
 * Check if weather data is still fresh enough to reuse
 *
 * @param weatherData Stored weather data
 * @param maxAgeHours Maximum age in hours (default: 24)
 * @returns True if data is fresh enough
 */
export function isWeatherDataFresh(
	weatherData: StoredWeatherData,
	maxAgeHours: number = 24
): boolean {
	try {
		const fetchedAt = new Date(weatherData.fetched_at);
		const now = new Date();
		const ageHours = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);

		const isFresh = ageHours <= maxAgeHours;

		logger.debug(
			{
				fetchedAt: weatherData.fetched_at,
				ageHours: Math.round(ageHours * 100) / 100,
				maxAgeHours,
				isFresh
			},
			'Checking weather data freshness'
		);

		return isFresh;
	} catch (error) {
		logger.warn({ error, weatherData }, 'Error checking weather data freshness');
		return false;
	}
}

/**
 * Get cached weather data if available and fresh, otherwise return null
 *
 * @param latitude Sighting latitude
 * @param longitude Sighting longitude
 * @param date Sighting date (YYYY-MM-DD format)
 * @param maxAgeHours Maximum cache age in hours
 * @returns Cached weather data or null if not available/fresh
 */
export async function getCachedWeatherData(
	latitude: number,
	longitude: number,
	date: string,
	maxAgeHours: number = 24
): Promise<StoredWeatherData | null> {
	const existingData = await checkExistingWeatherData(latitude, longitude, date);

	if (!existingData) {
		return null;
	}

	if (!isWeatherDataFresh(existingData, maxAgeHours)) {
		logger.info(
			{ latitude, longitude, date, fetchedAt: existingData.fetched_at },
			'Existing weather data is too old, will fetch fresh data'
		);
		return null;
	}

	logger.info(
		{ latitude, longitude, date, fetchedAt: existingData.fetched_at },
		'Using cached weather data'
	);

	return existingData;
}

/**
 * Statistics about weather data usage and caching effectiveness
 */
export async function getWeatherCacheStatistics(): Promise<{
	totalSightingsWithWeather: number;
	totalUniquePositionDates: number;
	averageReuseRate: number;
	cacheEfficiency: number;
}> {
	try {
		// Total sightings with weather data
		const [totalResult] = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(sightings)
			.where(isNotNull(sightings.weatherData));

		// Unique position+date combinations
		const [uniqueResult] = await db
			.select({
				count: sql<number>`COUNT(DISTINCT (ROUND(gps_breite::numeric, 2), ROUND(gps_laenge::numeric, 2), ${berlinCalendarDate(sightings.sightingDate)}))`
			})
			.from(sightings)
			.where(isNotNull(sightings.weatherData));

		const totalSightingsWithWeather = totalResult?.count || 0;
		const totalUniquePositionDates = uniqueResult?.count || 0;

		const averageReuseRate =
			totalUniquePositionDates > 0 ? totalSightingsWithWeather / totalUniquePositionDates : 0;

		const cacheEfficiency =
			totalSightingsWithWeather > 0
				? ((totalSightingsWithWeather - totalUniquePositionDates) / totalSightingsWithWeather) * 100
				: 0;

		return {
			totalSightingsWithWeather,
			totalUniquePositionDates,
			averageReuseRate: Math.round(averageReuseRate * 100) / 100,
			cacheEfficiency: Math.round(cacheEfficiency * 100) / 100
		};
	} catch (error) {
		logger.error({ error }, 'Error calculating weather cache statistics');
		return {
			totalSightingsWithWeather: 0,
			totalUniquePositionDates: 0,
			averageReuseRate: 0,
			cacheEfficiency: 0
		};
	}
}
