/**
 * Befund 1 (PR #682 Review): `getUploadConfig()` rechnete die drei
 * Größenwerte per `Number(...)` aus der DB hoch, ohne das Ergebnis zu prüfen.
 * Ein kaputter DB-Wert (NaN, negativ, 0 als „gesperrt“ ausgenommen, Infinity)
 * lief bis zur Gesamtgrößen-Prüfung in `POST /api/files/upload` durch, wo
 * `x > NaN` in JavaScript immer `false` ist — die Prüfung war damit lautlos
 * abgeschaltet. Zusätzlich serialisiert `JSON.stringify` NaN/Infinity als
 * `null`, sodass `/api/config/upload` einen kaputten Wert an den Client
 * durchreichte.
 *
 * Diese Tests sichern die Normalisierung in `getUploadConfig()` selbst ab —
 * unabhängig vom Aufrufer, im Gegensatz zur bereits vorhandenen Absicherung
 * in `maxUploadSizeFor()` (`uploadLimits.ts`), die nur für Einzeldateigrößen
 * greift.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const configValues: Record<string, unknown> = {};

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		get: vi.fn((key: string) => Promise.resolve(configValues[key] ?? null))
	}
}));

import { ServerConfigService } from './configService';

function resetConfigValues() {
	for (const key of Object.keys(configValues)) {
		delete configValues[key];
	}
}

const BROKEN_VALUES: Array<[string, number]> = [
	['NaN', NaN],
	['negativ', -5],
	['0', 0],
	['Infinity', Infinity]
];

const SIZE_KEYS = [
	{ configKey: 'security.maxFileSize', bytesField: 'maxFileSizeBytes', mbField: 'maxFileSize' },
	{
		configKey: 'security.maxVideoFileSize',
		bytesField: 'maxVideoFileSizeBytes',
		mbField: 'maxVideoFileSize'
	},
	{
		configKey: 'security.maxTotalUploadSize',
		bytesField: 'maxTotalUploadSizeBytes',
		mbField: 'maxTotalUploadSize'
	}
] as const;

describe('ServerConfigService.getUploadConfig — kaputte Konfigurationswerte', () => {
	beforeEach(() => {
		resetConfigValues();
	});

	for (const { configKey, bytesField, mbField } of SIZE_KEYS) {
		describe(configKey, () => {
			for (const [label, broken] of BROKEN_VALUES) {
				it(`bildet ${label} auf eine endliche, gesperrte Bytegröße ab (0)`, async () => {
					configValues[configKey] = broken;

					const config = await ServerConfigService.getUploadConfig();

					expect(Number.isFinite(config[bytesField])).toBe(true);
					expect(config[bytesField]).toBe(0);
					expect(Number.isFinite(config[mbField])).toBe(true);
					expect(config[mbField]).toBe(0);
				});
			}

			it('lässt einen gültigen Wert unverändert durch', async () => {
				configValues[configKey] = 42;

				const config = await ServerConfigService.getUploadConfig();

				expect(config[mbField]).toBe(42);
				expect(config[bytesField]).toBe(42 * 1024 * 1024);
			});
		});
	}

	it('meldet niemals einen nicht-endlichen Byte-Wert, egal welche der drei Grenzen kaputt ist', async () => {
		configValues['security.maxFileSize'] = NaN;
		configValues['security.maxVideoFileSize'] = Infinity;
		configValues['security.maxTotalUploadSize'] = -100;

		const config = await ServerConfigService.getUploadConfig();

		expect(Number.isFinite(config.maxFileSizeBytes)).toBe(true);
		expect(Number.isFinite(config.maxVideoFileSizeBytes)).toBe(true);
		expect(Number.isFinite(config.maxTotalUploadSizeBytes)).toBe(true);
	});
});
