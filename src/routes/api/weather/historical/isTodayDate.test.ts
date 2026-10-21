/**
 * @fileoverview N4 — `isTodayDate` verglich in Prozesszone statt in Europe/Berlin.
 * In den ersten 1-2 Stunden nach Mitternacht Berlin (UTC hat den Tageswechsel
 * noch nicht vollzogen) wurde ein heutiges Berlin-Datum fälschlich als
 * "nicht heute" gewertet und ans Archiv statt an die Forecast-API geroutet —
 * das Archiv kennt den laufenden Tag noch nicht (404/leere Antwort).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	getCachedWeatherForSighting: vi.fn().mockResolvedValue(null)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

import { GET } from './+server';

function makeHourlyResponse(date: string) {
	return {
		hourly: {
			time: Array.from({ length: 24 }, (_, i) => `${date}T${String(i).padStart(2, '0')}:00`),
			temperature_2m: new Array(24).fill(18),
			wind_speed_10m: new Array(24).fill(15),
			wind_direction_10m: new Array(24).fill(180),
			weather_code: new Array(24).fill(0),
			visibility: new Array(24).fill(10000),
			surface_pressure: new Array(24).fill(1013),
			relative_humidity_2m: new Array(24).fill(60)
		}
	};
}

describe('GET /api/weather/historical — "heute" in Berliner Ortszeit', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => makeHourlyResponse('2024-07-15')
			} as Response)
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('routet ein Berlin-heutiges Datum an die Forecast-API, auch wenn UTC den Tag noch nicht gewechselt hat', async () => {
		// 23:30 UTC am 14.07. entspricht im Sommer (Berlin = UTC+2) bereits
		// 01:30 Uhr Berlin am 15.07. — UTC hat den Tageswechsel noch nicht vollzogen.
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-07-14T23:30:00Z'));

		const url = new URL(
			'http://localhost/api/weather/historical?lat=54.5&lng=13.5&date=2024-07-15&time=00:30'
		);
		const response = await GET({ url } as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(body.metadata.dataType).toBe('forecast');

		const firstCallUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
		expect(firstCallUrl).toContain('api.open-meteo.com/v1/forecast');
		expect(firstCallUrl).not.toContain('archive-api');
	});

	it('routet ein tatsächlich vergangenes Berlin-Datum weiterhin an die Archiv-API', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-07-14T23:30:00Z'));

		const url = new URL(
			'http://localhost/api/weather/historical?lat=54.5&lng=13.5&date=2024-07-13&time=12:00'
		);
		const response = await GET({ url } as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(body.metadata.dataType).toBe('historical');

		const firstCallUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
		expect(firstCallUrl).toContain('archive-api.open-meteo.com');
	});
});
