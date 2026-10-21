import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	windSpeedToBeaufort,
	kmhToMs,
	getVisibilityFormValue,
	mapWeatherToFormFields,
	convertToStoredWeatherData,
	type WeatherData,
	type OpenMeteoRawData
} from './weatherService';

vi.mock('#lib/constants/weather.ts', () => ({
	calculateSeaState: vi.fn((speed: number) => Math.min(12, Math.floor(speed / 10))),
	degreesToCardinal: vi.fn(() => 'N'),
	getWeatherDescription: vi.fn(() => 'Klarer Himmel')
}));

// Hilfsfunktion für minimales WeatherData-Objekt
function makeWeatherData(overrides: Partial<WeatherData> = {}): WeatherData {
	return {
		time: '2024-06-15T12:00',
		windSpeed: 20,
		windDirection: 180,
		windDirectionCardinal: 'S',
		temperature: 18,
		weatherCode: 0,
		weatherDescription: 'Klarer Himmel',
		visibility: 10000,
		...overrides
	};
}

// Hilfsfunktion für minimales OpenMeteoRawData-Objekt
function makeRawData(overrides: Partial<OpenMeteoRawData> = {}): OpenMeteoRawData {
	return {
		temperature_2m: 18,
		wind_speed_10m: 20,
		wind_direction_10m: 180,
		weather_code: 0,
		visibility: 10000,
		...overrides
	};
}

describe('windSpeedToBeaufort', () => {
	it('gibt 0 zurück bei 0 km/h (Windstille)', () => {
		expect(windSpeedToBeaufort(0)).toBe(0);
	});

	it('gibt 0 zurück bei 1 km/h (unter Windstille-Grenze)', () => {
		expect(windSpeedToBeaufort(1)).toBe(0);
	});

	it('gibt 1 zurück bei 5 km/h (Leiser Zug)', () => {
		expect(windSpeedToBeaufort(5)).toBe(1);
	});

	it('gibt 1 zurück an der oberen Grenze (< 6 km/h)', () => {
		expect(windSpeedToBeaufort(5.9)).toBe(1);
	});

	it('gibt 2 zurück bei 6 km/h (Leichte Brise, Grenzwert)', () => {
		expect(windSpeedToBeaufort(6)).toBe(2);
	});

	it('gibt 4 zurück bei 20 km/h (Grenze: < 20 → 3, ab 20 → 4)', () => {
		expect(windSpeedToBeaufort(20)).toBe(4);
	});

	it('gibt 4 zurück bei 28 km/h (knapp unter Beaufort 5, Grenze bei 29)', () => {
		expect(windSpeedToBeaufort(28)).toBe(4);
	});

	it('gibt 5 zurück bei 29 km/h (Grenze: < 29 → 4, ab 29 → 5)', () => {
		expect(windSpeedToBeaufort(29)).toBe(5);
	});

	it('gibt 7 zurück bei 61 km/h (Steifer Wind, knapp darunter)', () => {
		expect(windSpeedToBeaufort(61)).toBe(7);
	});

	it('gibt 8 zurück bei 62 km/h (Stürmischer Wind, Grenzwert)', () => {
		expect(windSpeedToBeaufort(62)).toBe(8);
	});

	it('gibt 11 zurück bei 117 km/h (knapp unter Orkan-Grenze)', () => {
		expect(windSpeedToBeaufort(117)).toBe(11);
	});

	it('gibt 12 zurück bei 118 km/h (Orkan, Grenzwert)', () => {
		expect(windSpeedToBeaufort(118)).toBe(12);
	});

	it('gibt 12 zurück bei sehr hohen Windgeschwindigkeiten (> 118 km/h)', () => {
		expect(windSpeedToBeaufort(200)).toBe(12);
	});
});

describe('kmhToMs', () => {
	it('gibt 0 zurück bei 0 km/h', () => {
		expect(kmhToMs(0)).toBe(0);
	});

	it('gibt 10 m/s zurück bei 36 km/h (exakte Umrechnung)', () => {
		expect(kmhToMs(36)).toBe(10);
	});

	it('berechnet korrekt nach Formel km/h / 3.6', () => {
		expect(kmhToMs(72)).toBe(20);
	});

	it('rundet auf eine Nachkommastelle', () => {
		// 50 / 3.6 = 13.888... → 13.9
		expect(kmhToMs(50)).toBe(13.9);
	});

	it('gibt 27.8 zurück bei 100 km/h', () => {
		// 100 / 3.6 = 27.777... → 27.8
		expect(kmhToMs(100)).toBe(27.8);
	});
});

describe('getVisibilityFormValue', () => {
	it('gibt 1 zurück bei genau 20000 m (außergewöhnlich klar, Grenzwert)', () => {
		expect(getVisibilityFormValue(20000)).toBe(1);
	});

	it('gibt 1 zurück bei mehr als 20 km Sichtweite', () => {
		expect(getVisibilityFormValue(50000)).toBe(1);
	});

	it('gibt 2 zurück bei 4001 m (klar, knapp über Grenze)', () => {
		expect(getVisibilityFormValue(4001)).toBe(2);
	});

	it('gibt 2 zurück bei 10000 m (klar, typische Sichtweite)', () => {
		expect(getVisibilityFormValue(10000)).toBe(2);
	});

	it('gibt 2 zurück bei genau 4000 m (klar, Grenzwert)', () => {
		expect(getVisibilityFormValue(4000)).toBe(2);
	});

	it('gibt 3 zurück bei 3999 m (diesig, knapp unter Grenze)', () => {
		expect(getVisibilityFormValue(3999)).toBe(3);
	});

	it('gibt 3 zurück bei 2000 m (diesig)', () => {
		expect(getVisibilityFormValue(2000)).toBe(3);
	});

	it('gibt 3 zurück bei genau 1000 m (diesig, Grenzwert)', () => {
		expect(getVisibilityFormValue(1000)).toBe(3);
	});

	it('gibt 4 zurück bei 999 m (Nebel, knapp unter Grenze)', () => {
		expect(getVisibilityFormValue(999)).toBe(4);
	});

	it('gibt 4 zurück bei 500 m (Nebel)', () => {
		expect(getVisibilityFormValue(500)).toBe(4);
	});

	it('gibt 4 zurück bei 0 m (kein Sicht)', () => {
		expect(getVisibilityFormValue(0)).toBe(4);
	});
});

describe('mapWeatherToFormFields', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('mappt windSpeed via windSpeedToBeaufort als String', () => {
		const weather = makeWeatherData({ windSpeed: 20 });
		const result = mapWeatherToFormFields(weather);
		// windSpeedToBeaufort(20) = 4 (< 20 → 3, ab 20 → 4)
		expect(result.windForce).toBe('4');
	});

	it('mappt windDirectionCardinal als windDirection', () => {
		const weather = makeWeatherData({ windDirectionCardinal: 'SW' });
		const result = mapWeatherToFormFields(weather);
		expect(result.windDirection).toBe('SW');
	});

	it('mappt seaState als String wenn vorhanden', () => {
		const weather = makeWeatherData({ seaState: 3 });
		const result = mapWeatherToFormFields(weather);
		expect(result.seaState).toBe('3');
	});

	it('gibt leeren String für seaState zurück wenn nicht gesetzt', () => {
		const { seaState: _omit, ...weatherWithoutSeaState } = makeWeatherData({});
		const weather = weatherWithoutSeaState as Parameters<typeof mapWeatherToFormFields>[0];
		const result = mapWeatherToFormFields(weather);
		expect(result.seaState).toBe('');
	});

	it('mappt visibility über getVisibilityFormValue', () => {
		const weather = makeWeatherData({ visibility: 25000 });
		const result = mapWeatherToFormFields(weather);
		// 25000m > 20km → Formwert 1
		expect(result.visibility).toBe(1);
	});

	it('enthält alle erwarteten Felder im Ergebnis', () => {
		const weather = makeWeatherData();
		const result = mapWeatherToFormFields(weather);
		expect(result).toHaveProperty('windForce');
		expect(result).toHaveProperty('windDirection');
		expect(result).toHaveProperty('seaState');
		expect(result).toHaveProperty('visibility');
	});
});

describe('convertToStoredWeatherData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gibt StoredWeatherData mit provider open-meteo zurück', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.provider).toBe('open-meteo');
	});

	it('enthält fetched_at als gültigen ISO-String', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		expect(() => new Date(result.fetched_at)).not.toThrow();
	});

	it('enthält location.latitude und location.longitude', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.location.latitude).toBe(54.5);
		expect(result.location.longitude).toBe(10.5);
	});

	it('setzt data_type auf historical für vergangene Daten', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.data_type).toBe('historical');
	});

	it('setzt data_type auf forecast für aktuelle Daten', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'forecast', 54.5, 10.5);
		expect(result.data_type).toBe('forecast');
	});

	it('setzt api_version auf v1', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.api_version).toBe('v1');
	});

	it('enthält observation_time aus weather.time', () => {
		const weather = makeWeatherData({ time: '2024-06-15T14:00' });
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.observation_time).toBe('2024-06-15T14:00');
	});

	it('setzt elevation in location wenn rawApiData.elevation vorhanden', () => {
		const weather = makeWeatherData();
		const raw = makeRawData({ elevation: 5 });
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.location.elevation).toBe(5);
	});

	it('enthält quality.confidence 0.95 für historische Daten', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.quality.confidence).toBe(0.95);
	});

	it('enthält quality.confidence 0.85 für Forecast-Daten', () => {
		const weather = makeWeatherData();
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'forecast', 54.5, 10.5);
		expect(result.quality.confidence).toBe(0.85);
	});

	it('enthält processed-Objekt mit allen Wetterwerten', () => {
		const weather = makeWeatherData({ temperature: 20, windSpeed: 15, windDirection: 90 });
		const raw = makeRawData();
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.processed.temperature).toBe(20);
		expect(result.processed.windSpeed).toBe(15);
		expect(result.processed.windDirection).toBe(90);
	});

	it('enthält raw_data-Objekt aus rawApiData', () => {
		const weather = makeWeatherData();
		const raw = makeRawData({ temperature_2m: 22, wind_speed_10m: 30 });
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.raw_data.temperature_2m).toBe(22);
		expect(result.raw_data.wind_speed_10m).toBe(30);
	});

	it('enthält wave_height in raw_data wenn in rawApiData vorhanden', () => {
		const weather = makeWeatherData();
		const raw = makeRawData({ wave_height: 0.8 });
		const result = convertToStoredWeatherData(weather, raw, 'historical', 54.5, 10.5);
		expect(result.raw_data.wave_height).toBe(0.8);
	});
});
