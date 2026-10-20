/**
 * Server-side validation for client-provided weather data.
 * Validates StoredWeatherData structure before persisting to DB as JSONB.
 */

import { createLogger } from '#lib/logger.server.ts';

const logger = createLogger('validation:weatherData');

/**
 * Validates that weather data from the client has the expected structure.
 * Returns `{ valid: true, data }` on success or `{ valid: false, reason }` on failure.
 */
export function validateWeatherData(
	data: unknown
): { valid: true; data: Record<string, unknown> } | { valid: false; reason: string } {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return { valid: false, reason: 'Weather data must be a non-null object' };
	}

	const wd = data as Record<string, unknown>;

	// Required top-level fields
	if (typeof wd.provider !== 'string') {
		return { valid: false, reason: 'Missing or invalid provider field' };
	}

	if (typeof wd.fetched_at !== 'string') {
		return { valid: false, reason: 'Missing or invalid fetched_at field' };
	}

	if (typeof wd.data_type !== 'string' || !['historical', 'forecast'].includes(wd.data_type)) {
		return { valid: false, reason: 'data_type must be "historical" or "forecast"' };
	}

	// Location
	if (!wd.location || typeof wd.location !== 'object' || Array.isArray(wd.location)) {
		return { valid: false, reason: 'Missing or invalid location object' };
	}
	const loc = wd.location as Record<string, unknown>;
	if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
		return { valid: false, reason: 'location must have numeric latitude and longitude' };
	}

	// Raw data (required core fields)
	if (!wd.raw_data || typeof wd.raw_data !== 'object' || Array.isArray(wd.raw_data)) {
		return { valid: false, reason: 'Missing or invalid raw_data object' };
	}
	const raw = wd.raw_data as Record<string, unknown>;
	const requiredNumericFields = [
		'temperature_2m',
		'wind_speed_10m',
		'wind_direction_10m',
		'weather_code',
		'visibility'
	];
	for (const field of requiredNumericFields) {
		if (typeof raw[field] !== 'number') {
			return { valid: false, reason: `raw_data.${field} must be a number` };
		}
	}

	// Processed data
	if (!wd.processed || typeof wd.processed !== 'object' || Array.isArray(wd.processed)) {
		return { valid: false, reason: 'Missing or invalid processed object' };
	}

	// Quality data
	if (!wd.quality || typeof wd.quality !== 'object' || Array.isArray(wd.quality)) {
		return { valid: false, reason: 'Missing or invalid quality object' };
	}
	const quality = wd.quality as Record<string, unknown>;
	if (typeof quality.confidence !== 'number' || quality.confidence < 0 || quality.confidence > 1) {
		return { valid: false, reason: 'quality.confidence must be a number between 0 and 1' };
	}

	// Size guard: reject excessively large payloads (max 10KB serialized)
	const serialized = JSON.stringify(data);
	if (serialized.length > 10240) {
		logger.warn({ size: serialized.length }, 'Weather data exceeds 10KB size limit');
		return { valid: false, reason: 'Weather data exceeds maximum allowed size' };
	}

	logger.debug(
		{ provider: wd.provider, data_type: wd.data_type },
		'Weather data validated successfully'
	);
	return { valid: true, data: wd };
}
