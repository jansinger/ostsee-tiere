import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StoredWeatherData } from '#lib/services/weatherService.ts';

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

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn()
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {}
}));

// sql wird als tagged template literal UND mit .as() aufgerufen — muss beides unterstützen
vi.mock('drizzle-orm', () => ({
	and: vi.fn(),
	eq: vi.fn(),
	isNotNull: vi.fn(),
	// `sql` braucht auch die Hilfsmethoden, die der Produktionscode nutzt —
	// `berlinCalendarDate()` greift auf `sql.raw()` zu. Fehlt die Methode, wirft
	// der Aufruf einen TypeError, den das catch der Funktion als "keine Daten
	// gefunden" verschluckt: Der Test schlägt dann mit `null` statt mit dem
	// eigentlichen Fehler fehl.
	sql: Object.assign(
		vi.fn(() => ({ as: vi.fn() })),
		{ raw: vi.fn(() => ({})) }
	)
}));

import { db } from '#lib/server/db/index.ts';
import {
	isWeatherDataFresh,
	checkExistingWeatherData,
	getCachedWeatherData
} from './weatherDeduplication';

// Hilfsfunktion für minimales StoredWeatherData-Objekt
function makeWeatherData(fetchedAt: Date): StoredWeatherData {
	return {
		provider: 'open-meteo',
		fetched_at: fetchedAt.toISOString(),
		api_version: 'v1',
		data_type: 'historical',
		location: { latitude: 54.5, longitude: 10.5 },
		observation_time: '2024-06-15T12:00',
		raw_data: {
			temperature_2m: 18,
			wind_speed_10m: 15,
			wind_direction_10m: 180,
			weather_code: 0,
			visibility: 10000
		},
		processed: {
			temperature: 18,
			windSpeed: 15,
			windDirection: 180,
			windDirectionCardinal: 'S',
			weatherCode: 0,
			weatherDescription: 'Klarer Himmel',
			visibility: 10000,
			seaState: 1
		},
		quality: {
			confidence: 0.95,
			data_source: 'era5_reanalysis'
		}
	};
}

// Hilfsfunktion: Datum N Stunden in der Vergangenheit
function hoursAgo(hours: number): Date {
	return new Date(Date.now() - hours * 60 * 60 * 1000);
}

// Mock-Setup für die Drizzle Query Builder Chain:
// db.select().from().where().orderBy().limit()
function setupDbMock(resolvedValue: StoredWeatherData[] | null[]) {
	const mockLimit = vi.fn().mockResolvedValue(resolvedValue);
	const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
	vi.mocked(db.select).mockReturnValue({ from: mockFrom } as unknown as ReturnType<
		typeof db.select
	>);
	return { mockLimit, mockOrderBy, mockWhere, mockFrom };
}

describe('isWeatherDataFresh', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('gibt true zurück für Daten von vor 1 Stunde bei maxAge 24h', () => {
		const data = makeWeatherData(hoursAgo(1));
		expect(isWeatherDataFresh(data, 24)).toBe(true);
	});

	it('gibt true zurück für Daten von vor 23 Stunden bei maxAge 24h', () => {
		const data = makeWeatherData(hoursAgo(23));
		expect(isWeatherDataFresh(data, 24)).toBe(true);
	});

	it('gibt true zurück genau an der Grenze (24h = maxAge 24h)', () => {
		// Exakt 24h alt — ageHours <= maxAgeHours → true
		const data = makeWeatherData(hoursAgo(24));
		expect(isWeatherDataFresh(data, 24)).toBe(true);
	});

	it('gibt false zurück für Daten von vor 25 Stunden bei maxAge 24h', () => {
		const data = makeWeatherData(hoursAgo(25));
		expect(isWeatherDataFresh(data, 24)).toBe(false);
	});

	it('gibt false zurück bei maxAge 0.5h und Daten von vor 1 Stunde', () => {
		const data = makeWeatherData(hoursAgo(1));
		expect(isWeatherDataFresh(data, 0.5)).toBe(false);
	});

	it('gibt true zurück bei maxAge 0.5h und Daten von vor 10 Minuten', () => {
		const data = makeWeatherData(hoursAgo(10 / 60));
		expect(isWeatherDataFresh(data, 0.5)).toBe(true);
	});

	it('verwendet Standard-maxAge von 24h wenn nicht angegeben', () => {
		const data = makeWeatherData(hoursAgo(23));
		expect(isWeatherDataFresh(data)).toBe(true);
	});

	it('gibt false zurück bei ungültigem fetched_at Wert', () => {
		const data = makeWeatherData(new Date());
		// Ungültiges Datum durch direktes Überschreiben
		const invalidData = { ...data, fetched_at: 'kein-gueltiges-datum' };
		expect(isWeatherDataFresh(invalidData)).toBe(false);
	});

	it('gibt false zurück bei leerem fetched_at String', () => {
		const data = makeWeatherData(new Date());
		const invalidData = { ...data, fetched_at: '' };
		expect(isWeatherDataFresh(invalidData)).toBe(false);
	});
});

describe('checkExistingWeatherData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gibt null zurück wenn die DB keine Daten hat', async () => {
		setupDbMock([]);
		const result = await checkExistingWeatherData(54.5, 10.5, '2024-06-15');
		expect(result).toBeNull();
	});

	it('gibt StoredWeatherData zurück wenn die DB Daten liefert', async () => {
		const existingWeather = makeWeatherData(hoursAgo(2));
		const mockLimit = vi.fn().mockResolvedValue([
			{
				weatherData: existingWeather,
				weatherFetchedAt: existingWeather.fetched_at,
				weatherProvider: 'open-meteo',
				weatherDataType: 'historical',
				distance: 500
			}
		]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		vi.mocked(db.select).mockReturnValue({ from: mockFrom } as unknown as ReturnType<
			typeof db.select
		>);

		const result = await checkExistingWeatherData(54.5, 10.5, '2024-06-15');
		expect(result).toEqual(existingWeather);
	});

	it('gibt null zurück wenn die DB einen Fehler wirft', async () => {
		const mockLimit = vi.fn().mockRejectedValue(new Error('DB-Verbindungsfehler'));
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		vi.mocked(db.select).mockReturnValue({ from: mockFrom } as unknown as ReturnType<
			typeof db.select
		>);

		const result = await checkExistingWeatherData(54.5, 10.5, '2024-06-15');
		expect(result).toBeNull();
	});
});

describe('getCachedWeatherData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gibt null zurück wenn checkExistingWeatherData null zurückgibt (kein Cache)', async () => {
		setupDbMock([]);
		const result = await getCachedWeatherData(54.5, 10.5, '2024-06-15');
		expect(result).toBeNull();
	});

	it('gibt null zurück wenn vorhandene Daten zu alt sind', async () => {
		const staleWeather = makeWeatherData(hoursAgo(48));
		const mockLimit = vi.fn().mockResolvedValue([
			{
				weatherData: staleWeather,
				weatherFetchedAt: staleWeather.fetched_at,
				weatherProvider: 'open-meteo',
				weatherDataType: 'historical',
				distance: 200
			}
		]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		vi.mocked(db.select).mockReturnValue({ from: mockFrom } as unknown as ReturnType<
			typeof db.select
		>);

		// maxAge 24h, Daten sind 48h alt → zu alt
		const result = await getCachedWeatherData(54.5, 10.5, '2024-06-15', 24);
		expect(result).toBeNull();
	});

	it('gibt StoredWeatherData zurück wenn Daten frisch genug sind', async () => {
		const freshWeather = makeWeatherData(hoursAgo(1));
		const mockLimit = vi.fn().mockResolvedValue([
			{
				weatherData: freshWeather,
				weatherFetchedAt: freshWeather.fetched_at,
				weatherProvider: 'open-meteo',
				weatherDataType: 'historical',
				distance: 200
			}
		]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		vi.mocked(db.select).mockReturnValue({ from: mockFrom } as unknown as ReturnType<
			typeof db.select
		>);

		// maxAge 24h, Daten sind 1h alt → frisch genug
		const result = await getCachedWeatherData(54.5, 10.5, '2024-06-15', 24);
		expect(result).toEqual(freshWeather);
	});

	it('nutzt Standard-maxAge von 24h wenn nicht angegeben', async () => {
		const freshWeather = makeWeatherData(hoursAgo(12));
		const mockLimit = vi.fn().mockResolvedValue([
			{
				weatherData: freshWeather,
				weatherFetchedAt: freshWeather.fetched_at,
				weatherProvider: 'open-meteo',
				weatherDataType: 'historical',
				distance: 100
			}
		]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		vi.mocked(db.select).mockReturnValue({ from: mockFrom } as unknown as ReturnType<
			typeof db.select
		>);

		// Kein maxAge-Argument → Standard 24h, Daten 12h alt → frisch
		const result = await getCachedWeatherData(54.5, 10.5, '2024-06-15');
		expect(result).toEqual(freshWeather);
	});
});
