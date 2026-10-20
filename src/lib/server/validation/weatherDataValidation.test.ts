import { describe, it, expect, vi } from 'vitest';
import { validateWeatherData } from './weatherDataValidation';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

const validWeatherData = {
	provider: 'open-meteo',
	fetched_at: '2024-01-15T14:30:00Z',
	api_version: '1.0',
	data_type: 'historical',
	observation_time: '2024-01-15T14:00:00Z',
	location: { latitude: 54.5, longitude: 13.5, elevation: 0 },
	raw_data: {
		temperature_2m: 5.2,
		wind_speed_10m: 12.5,
		wind_direction_10m: 270,
		weather_code: 3,
		visibility: 15000
	},
	processed: {
		temperature: 5.2,
		windSpeed: 12.5,
		windDirection: 270,
		windDirectionCardinal: 'W',
		weatherCode: 3,
		weatherDescription: 'Bewölkt',
		visibility: 15000,
		seaState: 2
	},
	quality: {
		confidence: 0.85,
		data_source: 'era5_reanalysis'
	}
};

describe('validateWeatherData', () => {
	it('akzeptiert gültige WeatherData', () => {
		const result = validateWeatherData(validWeatherData);
		expect(result.valid).toBe(true);
	});

	describe('Top-Level Validierung', () => {
		it('weist null ab', () => {
			const result = validateWeatherData(null);
			expect(result.valid).toBe(false);
		});

		it('weist Arrays ab', () => {
			const result = validateWeatherData([1, 2, 3]);
			expect(result.valid).toBe(false);
		});

		it('weist Strings ab', () => {
			const result = validateWeatherData('not an object');
			expect(result.valid).toBe(false);
		});

		it('weist fehlenden provider ab', () => {
			const { provider, ...rest } = validWeatherData;
			const result = validateWeatherData(rest);
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/provider/);
		});

		it('weist fehlende fetched_at ab', () => {
			const { fetched_at, ...rest } = validWeatherData;
			const result = validateWeatherData(rest);
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/fetched_at/);
		});

		it('weist ungültigen data_type ab', () => {
			const result = validateWeatherData({ ...validWeatherData, data_type: 'invalid' });
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/data_type/);
		});

		it('akzeptiert data_type "forecast"', () => {
			const result = validateWeatherData({ ...validWeatherData, data_type: 'forecast' });
			expect(result.valid).toBe(true);
		});
	});

	describe('Location Validierung', () => {
		it('weist fehlende location ab', () => {
			const { location, ...rest } = validWeatherData;
			const result = validateWeatherData(rest);
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/location/);
		});

		it('weist location ohne latitude ab', () => {
			const result = validateWeatherData({
				...validWeatherData,
				location: { longitude: 13.5 }
			});
			expect(result.valid).toBe(false);
		});
	});

	describe('raw_data Validierung', () => {
		it('weist fehlende raw_data ab', () => {
			const { raw_data, ...rest } = validWeatherData;
			const result = validateWeatherData(rest);
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/raw_data/);
		});

		it('weist fehlende Pflichtfelder in raw_data ab', () => {
			const result = validateWeatherData({
				...validWeatherData,
				raw_data: { temperature_2m: 5.2 } // missing other required fields
			});
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/raw_data/);
		});

		it('weist nicht-numerische raw_data Felder ab', () => {
			const result = validateWeatherData({
				...validWeatherData,
				raw_data: { ...validWeatherData.raw_data, temperature_2m: 'warm' }
			});
			expect(result.valid).toBe(false);
		});
	});

	describe('Quality Validierung', () => {
		it('weist fehlende quality ab', () => {
			const { quality, ...rest } = validWeatherData;
			const result = validateWeatherData(rest);
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/quality/);
		});

		it('weist confidence > 1 ab', () => {
			const result = validateWeatherData({
				...validWeatherData,
				quality: { confidence: 1.5, data_source: 'test' }
			});
			expect(result.valid).toBe(false);
		});

		it('weist confidence < 0 ab', () => {
			const result = validateWeatherData({
				...validWeatherData,
				quality: { confidence: -0.1, data_source: 'test' }
			});
			expect(result.valid).toBe(false);
		});
	});

	describe('Size Guard', () => {
		it('weist übermäßig große Payloads ab', () => {
			const oversized = {
				...validWeatherData,
				raw_data: {
					...validWeatherData.raw_data,
					// Inject large payload
					huge_field: 'x'.repeat(15000)
				}
			};
			const result = validateWeatherData(oversized);
			expect(result.valid).toBe(false);
			if (!result.valid) expect(result.reason).toMatch(/size/i);
		});
	});
});
