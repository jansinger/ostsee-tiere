import type { WeatherData } from '#lib/services/weatherService.ts';

/**
 * WeatherData with additional metadata for API calls and caching
 * Used by WeatherDataFetcher component to track data source and context
 */
export interface WeatherDataWithMetadata extends WeatherData {
	_metadata?: {
		source?: string;
		dataType?: 'forecast' | 'historical';
		cached?: boolean;
		latitude?: number;
		longitude?: number;
		date?: string;
		time?: string;
	};
}
