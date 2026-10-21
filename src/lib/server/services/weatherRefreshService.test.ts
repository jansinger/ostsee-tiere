import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StoredWeatherData } from '#lib/services/weatherService.ts';
import { withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { berlinCalendarDayIso } from '#lib/utils/format/dateTime.ts';

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

vi.mock('#lib/services/weatherService.ts', () => ({
	convertToStoredWeatherData: vi.fn(
		(
			w: { time: string },
			_r: unknown,
			_t: string,
			lat: number,
			lon: number
		): StoredWeatherData => ({
			provider: 'open-meteo',
			fetched_at: new Date().toISOString(),
			api_version: 'v1',
			data_type: 'historical',
			location: { latitude: lat, longitude: lon },
			observation_time: w.time,
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
				windDirectionCardinal: 'N',
				weatherCode: 0,
				weatherDescription: 'Klarer Himmel',
				visibility: 10000,
				seaState: 1
			},
			quality: {
				confidence: 0.95,
				data_source: 'era5_reanalysis'
			}
		})
	)
}));

vi.mock('#lib/constants/weather.ts', () => ({
	degreesToCardinal: vi.fn(() => 'N'),
	getWeatherDescription: vi.fn(() => 'Klarer Himmel'),
	calculateSeaState: vi.fn(() => 1)
}));

import { fetchWeatherData } from './weatherRefreshService';

// Minimales valides Open-Meteo Response für ein Datum
function makeWeatherResponse(date = '2024-06-15') {
	return {
		hourly: {
			time: [`${date}T12:00`],
			temperature_2m: [18],
			wind_speed_10m: [15],
			wind_direction_10m: [180],
			weather_code: [0],
			visibility: [10000],
			relative_humidity_2m: [60],
			surface_pressure: [1013]
		}
	};
}

function makeMarineResponse() {
	return {
		hourly: {
			time: ['2024-06-15T12:00'],
			wave_height: [0.5],
			wave_direction: [90],
			wave_period: [5]
		}
	};
}

/**
 * Heutiges Datum im Format YYYY-MM-DD — im **Berliner** Kalendertag, nicht UTC.
 *
 * `fetchWeatherData` entscheidet mit derselben Funktion, ob Forecast- oder
 * Archive-API zuständig ist (`weatherRefreshService.ts`, `berlinCalendarDayIso()`).
 * Ein `toISOString()` hier hätte in den ersten ein bis zwei Stunden nach
 * Berliner Mitternacht noch den Vortag geliefert, während der Dienst schon den
 * neuen Tag sieht — der Test forderte dann den Forecast für ein Datum, das aus
 * Sicht des Dienstes Vergangenheit ist, und schlug fehl. Beide Seiten müssen
 * denselben Kalendertag meinen.
 *
 * Tests, die "heute" verwenden, frieren die Uhr zusätzlich mit
 * `freezeClock()` ein, damit das Ergebnis nicht vom realen Systemdatum
 * abhängt (und der Vergleich Test↔Dienst nicht am Berliner Tageswechsel
 * racen kann).
 */
function todayString(): string {
	return berlinCalendarDayIso();
}

/**
 * Friert die Systemzeit auf einen festen Zeitpunkt ein (Berliner Vormittag,
 * weit weg vom Tageswechsel). `afterEach` setzt die Uhr per
 * `vi.useRealTimers()` wieder zurück.
 */
function freezeClock(instant = '2026-03-15T10:00:00Z'): void {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(instant));
}

// Historisches Datum (immer in der Vergangenheit)
const HISTORICAL_DATE = '2024-06-15';

describe('fetchWeatherData', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('wirft Fehler wenn fetch einen Netzwerkfehler wirft', async () => {
		vi.mocked(fetch).mockRejectedValue(new Error('Netzwerkfehler'));

		await expect(fetchWeatherData(54.5, 10.5, HISTORICAL_DATE)).rejects.toThrow();
	});

	it('wirft Fehler wenn die Weather API einen HTTP-Fehler zurückgibt', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				json: async () => ({})
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await expect(fetchWeatherData(54.5, 10.5, HISTORICAL_DATE)).rejects.toThrow(
			/Open-Meteo Weather API error/
		);
	});

	it('gibt StoredWeatherData zurück bei erfolgreicher historischer Anfrage', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(HISTORICAL_DATE)
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		const result = await fetchWeatherData(54.5, 10.5, HISTORICAL_DATE);

		expect(result).toBeDefined();
		expect(result.provider).toBe('open-meteo');
		expect(result.location.latitude).toBe(54.5);
		expect(result.location.longitude).toBe(10.5);
	});

	it('gibt StoredWeatherData zurück bei erfolgreicher aktueller Anfrage (heutiges Datum)', async () => {
		freezeClock();
		const today = todayString();
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(today)
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		const result = await fetchWeatherData(54.5, 10.5, today);

		expect(result).toBeDefined();
		expect(result.provider).toBe('open-meteo');
	});

	it('wählt den Archive-API-Endpunkt für historische Daten', async () => {
		// Uhr einfrieren: HISTORICAL_DATE liegt damit garantiert in der
		// Vergangenheit, unabhängig vom realen Systemdatum.
		freezeClock();
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(HISTORICAL_DATE)
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await fetchWeatherData(54.5, 10.5, HISTORICAL_DATE);

		const firstCallUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
		expect(firstCallUrl).toContain('archive-api.open-meteo.com');
	});

	it('wählt den Forecast-API-Endpunkt für das heutige Datum', async () => {
		// Uhr einfrieren: "heute" ist damit ein festes Datum — der Test hängt
		// nicht mehr am realen Systemdatum und kann nicht am Berliner
		// Tageswechsel zwischen todayString() und Dienst-Aufruf racen.
		freezeClock();
		const today = todayString();
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(today)
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await fetchWeatherData(54.5, 10.5, today);

		const firstCallUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
		expect(firstCallUrl).toContain('api.open-meteo.com');
		expect(firstCallUrl).not.toContain('archive-api');
	});

	it('gibt trotzdem Ergebnis zurück wenn die Marine API einen Fehler liefert (graceful degradation)', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(HISTORICAL_DATE)
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 503,
				statusText: 'Service Unavailable',
				json: async () => ({})
			} as Response);

		// Sollte NICHT werfen, sondern Wetterdaten ohne Meeresdaten zurückgeben
		const result = await fetchWeatherData(54.5, 10.5, HISTORICAL_DATE);
		expect(result).toBeDefined();
		expect(result.provider).toBe('open-meteo');
	});

	it('gibt trotzdem Ergebnis zurück wenn die Marine API einen Netzwerkfehler wirft (graceful degradation)', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(HISTORICAL_DATE)
			} as Response)
			.mockRejectedValueOnce(new Error('Marine API nicht erreichbar'));

		const result = await fetchWeatherData(54.5, 10.5, HISTORICAL_DATE);
		expect(result).toBeDefined();
		expect(result.provider).toBe('open-meteo');
	});

	it('wirft Fehler wenn keine hourly.time Daten vorhanden sind', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ hourly: { time: [], temperature_2m: [] } })
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await expect(fetchWeatherData(54.5, 10.5, HISTORICAL_DATE)).rejects.toThrow(
			/No weather data available/
		);
	});

	it('wirft Fehler wenn hourly komplett fehlt in der API-Antwort', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({})
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await expect(fetchWeatherData(54.5, 10.5, HISTORICAL_DATE)).rejects.toThrow();
	});

	it('wählt den Index über die Ortszeit-Stunde (positionsbasiert), nicht über die kleinste Zeitdifferenz', async () => {
		// N6: `hourly.time[]` ist durch `timezone=Europe/Berlin` bereits ortszeit-
		// indiziert (Index i = Stunde i). Der Index muss deshalb über
		// `hourIndexFromLocalTime` kommen statt über eine Date-Differenz-Suche.
		// Um beide Implementierungen zu unterscheiden, trägt Index 14 hier absichtlich
		// einen "falschen" Zeitstempel, während Index 2 zufällig den Zieltext "14:00"
		// trägt — eine Differenz-Suche (alter Code) würde Index 2 wählen, die
		// Ortszeit-Stunde muss trotzdem Index 14 liefern.
		const { convertToStoredWeatherData } = await import('#lib/services/weatherService.ts');

		const time = Array.from(
			{ length: 24 },
			(_, i) => `${HISTORICAL_DATE}T${String(i).padStart(2, '0')}:00`
		);
		time[14] = `${HISTORICAL_DATE}T02:00`; // falsch beschriftet
		time[2] = `${HISTORICAL_DATE}T14:00`; // trägt zufällig den Zieltext

		const temperature_2m = Array.from({ length: 24 }, (_, i) => i);
		temperature_2m[14] = 99;
		temperature_2m[2] = 11;

		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					hourly: {
						time,
						temperature_2m,
						wind_speed_10m: new Array(24).fill(10),
						wind_direction_10m: new Array(24).fill(180),
						weather_code: new Array(24).fill(0),
						visibility: new Array(24).fill(10000)
					}
				})
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await fetchWeatherData(54.5, 10.5, HISTORICAL_DATE, '14:00');

		expect(vi.mocked(convertToStoredWeatherData)).toHaveBeenCalledWith(
			expect.objectContaining({ time: time[14], temperature: 99 }),
			expect.anything(),
			expect.anything(),
			54.5,
			10.5
		);
	});

	it('wählt denselben Index unabhängig von der Prozess-Zeitzone', async () => {
		// Positionsbasierte Auswahl über hourIndexFromLocalTime ist per Konstruktion
		// prozesszonen-fest (String-Parsing statt Date-Arithmetik). Abgesichert unter
		// einer von Berlin/UTC abweichenden Zone, damit eine Rückkehr zu Date-Diffs
		// hier auffällt.
		const { convertToStoredWeatherData } = await import('#lib/services/weatherService.ts');

		await withTimeZone('America/New_York', async () => {
			vi.mocked(fetch)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => makeWeatherResponse(HISTORICAL_DATE)
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => makeMarineResponse()
				} as Response);

			await fetchWeatherData(54.5, 10.5, HISTORICAL_DATE, '12:00');

			expect(vi.mocked(convertToStoredWeatherData)).toHaveBeenCalledWith(
				expect.objectContaining({ time: `${HISTORICAL_DATE}T12:00` }),
				expect.anything(),
				expect.anything(),
				54.5,
				10.5
			);
		});
	});

	it('bestimmt "heute" über die Berliner Ortszeit, nicht über UTC (N5)', async () => {
		// 23:30 UTC entspricht im Sommer (Berlin = UTC+2) bereits 01:30 Uhr des
		// Folgetages in Berlin — UTC- und Berlin-Kalendertag weichen 30 Minuten lang
		// voneinander ab. Das angefragte Datum ist zu diesem Zeitpunkt in Berlin
		// bereits "gestern" und muss die Archive-API treffen, nicht die Forecast-API.
		freezeClock('2024-07-14T23:30:00Z');

		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse('2024-07-14')
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await fetchWeatherData(54.5, 10.5, '2024-07-14');

		const firstCallUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string;
		expect(firstCallUrl).toContain('archive-api.open-meteo.com');
	});

	it('übergibt latitude und longitude korrekt an convertToStoredWeatherData', async () => {
		const { convertToStoredWeatherData } = await import('#lib/services/weatherService.ts');
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeWeatherResponse(HISTORICAL_DATE)
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeMarineResponse()
			} as Response);

		await fetchWeatherData(55.1, 12.3, HISTORICAL_DATE);

		expect(vi.mocked(convertToStoredWeatherData)).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'historical',
			55.1,
			12.3
		);
	});
});
