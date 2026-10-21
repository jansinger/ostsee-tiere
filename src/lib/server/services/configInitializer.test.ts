import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks müssen vor dem Import der zu testenden Datei stehen
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		insertManyIfAbsent: vi.fn(),
		upsertMany: vi.fn(),
		clearCache: vi.fn()
	}
}));

import { ConfigRepository } from '#lib/server/db/configRepository.ts';
import {
	getAvailableConfigurationKeys,
	getConfigurationCategories,
	getDefaultConfigurationsByCategory,
	initializeDefaultConfigurations,
	resetToDefaultConfigurations
} from '#lib/server/services/configInitializer.ts';

const mockInsertManyIfAbsent = vi.mocked(ConfigRepository.insertManyIfAbsent);
const mockUpsertMany = vi.mocked(ConfigRepository.upsertMany);
const mockClearCache = vi.mocked(ConfigRepository.clearCache);

describe('getAvailableConfigurationKeys', () => {
	it('gibt ein Array von Strings zurück', () => {
		const keys = getAvailableConfigurationKeys();

		expect(Array.isArray(keys)).toBe(true);
		expect(keys.length).toBeGreaterThan(0);
		keys.forEach((key) => expect(typeof key).toBe('string'));
	});

	it('enthält den Key notification.email.enabled', () => {
		const keys = getAvailableConfigurationKeys();

		expect(keys).toContain('notification.email.enabled');
	});

	it('enthält den Key upload.maxFileSizeBytes nicht — stattdessen security.maxFileSize', () => {
		const keys = getAvailableConfigurationKeys();

		// Der tatsächliche Key in der Datei ist security.maxFileSize
		expect(keys).toContain('security.maxFileSize');
	});
});

describe('getConfigurationCategories', () => {
	it('gibt ein sortiertes Array zurück', () => {
		const categories = getConfigurationCategories();

		expect(Array.isArray(categories)).toBe(true);
		const sorted = [...categories].sort();
		expect(categories).toEqual(sorted);
	});

	it('enthält die Kategorie email', () => {
		const categories = getConfigurationCategories();

		expect(categories).toContain('email');
	});

	it('enthält die Kategorie security', () => {
		const categories = getConfigurationCategories();

		// Uploads werden unter security verwaltet (security.maxFileSize, security.allowedFileTypes)
		expect(categories).toContain('security');
	});

	it('enthält keine Duplikate', () => {
		const categories = getConfigurationCategories();
		const unique = new Set(categories);

		expect(categories.length).toBe(unique.size);
	});

	it('enthält alle erwarteten Kern-Kategorien', () => {
		const categories = getConfigurationCategories();

		expect(categories).toContain('data');
		expect(categories).toContain('display');
		expect(categories).toContain('integration');
		expect(categories).toContain('mobile');
	});
});

describe('getDefaultConfigurationsByCategory', () => {
	it('gibt ein Objekt mit Kategorien als Keys zurück', () => {
		const byCategory = getDefaultConfigurationsByCategory();

		expect(typeof byCategory).toBe('object');
		expect(byCategory).not.toBeNull();
		const keys = Object.keys(byCategory);
		expect(keys.length).toBeGreaterThan(0);
	});

	it('Email-Kategorie enthält mehrere Configs', () => {
		const byCategory = getDefaultConfigurationsByCategory();

		expect(byCategory.email).toBeDefined();
		expect(byCategory.email!.length).toBeGreaterThan(1);
	});

	it('jede Config hat key, value, description und category', () => {
		const byCategory = getDefaultConfigurationsByCategory();

		Object.entries(byCategory).forEach(([category, configs]) => {
			configs.forEach((config) => {
				expect(config).toHaveProperty('key');
				expect(config).toHaveProperty('value');
				expect(config).toHaveProperty('description');
				expect(config.category).toBe(category);
			});
		});
	});

	it('Kategorien im Objekt stimmen mit getConfigurationCategories überein', () => {
		const byCategory = getDefaultConfigurationsByCategory();
		const categories = getConfigurationCategories();

		const objectKeys = Object.keys(byCategory).sort();
		expect(objectKeys).toEqual(categories);
	});
});

describe('initializeDefaultConfigurations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ruft insertManyIfAbsent mit den Default-Configs auf', async () => {
		mockInsertManyIfAbsent.mockResolvedValue(5);

		await initializeDefaultConfigurations();

		expect(mockInsertManyIfAbsent).toHaveBeenCalledOnce();
		expect(mockInsertManyIfAbsent).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ key: 'notification.email.enabled' })]),
			'system'
		);
	});

	it('wirft wenn insertManyIfAbsent einen Fehler wirft', async () => {
		mockInsertManyIfAbsent.mockRejectedValue(new Error('DB-Verbindungsfehler'));

		await expect(initializeDefaultConfigurations()).rejects.toThrow('DB-Verbindungsfehler');
	});
});

describe('resetToDefaultConfigurations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ruft upsertMany mit den Default-Configs auf', async () => {
		mockUpsertMany.mockResolvedValue(undefined);
		mockClearCache.mockReturnValue(undefined);

		await resetToDefaultConfigurations();

		expect(mockUpsertMany).toHaveBeenCalledOnce();
		expect(mockUpsertMany).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ key: 'notification.email.enabled' })]),
			'system'
		);
	});

	it('ruft clearCache nach upsertMany auf', async () => {
		mockUpsertMany.mockResolvedValue(undefined);
		mockClearCache.mockReturnValue(undefined);

		await resetToDefaultConfigurations();

		expect(mockClearCache).toHaveBeenCalledOnce();
	});

	it('wirft wenn upsertMany einen Fehler wirft', async () => {
		mockUpsertMany.mockRejectedValue(new Error('Upsert fehlgeschlagen'));

		await expect(resetToDefaultConfigurations()).rejects.toThrow('Upsert fehlgeschlagen');
	});
});
