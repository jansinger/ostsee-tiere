import { browser } from '$app/env';
import { createLogger } from '#lib/logger.ts';
import { ConfigRepository } from '#lib/server/db/configRepository.ts';
import type { ConfigValue } from '#lib/server/db/configRepository.ts';
import { normalizeUploadSize } from '#lib/constants/uploadLimits.ts';

const logger = createLogger('configService');

// Default fallback values - these ensure the app works without database configurations
/**
 * Vorbelegung aller Konfigurationswerte. Exportiert, damit
 * `uploadLimitConsistency.test.ts` die Offline-Fallbacks dagegen prüfen kann.
 */
export const DEFAULT_CONFIG_VALUES = {
	// Email Settings
	'notification.email.enabled': false,
	'notification.email.recipient': '',
	'notification.email.sender': 'noreply@ostsee-tiere.de',
	'notification.email.senderName': 'Ostsee-Tiere',
	'notification.email.template': '',

	// Display Settings
	'display.maxSightingsPerPage': 50,
	'display.dateFormat': 'DD.MM.YYYY',
	'display.maintenanceMode': false,
	'display.maintenanceMessage':
		'Die Anwendung wird gewartet. Bitte versuchen Sie es später erneut.',

	// Security Settings
	'security.maxFileSize': 10,
	'security.maxVideoFileSize': 100,
	'security.maxTotalUploadSize': 250,
	'security.allowedFileTypes': [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'video/mp4',
		'video/quicktime'
	],
	'security.rateLimitPerIP': 10,
	'security.requireEmailVerification': false,
	'security.autoApproveThreshold': 5,

	// Data Processing Settings
	'data.duplicateCheckRadius': 1,
	'data.duplicateCheckTimeframe': 24,
	'data.exportFormats': ['csv', 'json', 'kml', 'xml'],
	'data.archiveAfterDays': 0,

	// Integration Settings
	'integration.weatherApiKey': '',
	'integration.geoApiKey': '',
	'integration.webhookUrl': '',

	// Mobile App Settings
	'mobile.minAppVersion': '1.0.0',
	'mobile.updateMessage':
		'Eine neue Version der App ist verfügbar. Bitte aktualisieren Sie für die beste Erfahrung.',
	'mobile.apiRateLimit': 100
} as const;

// In-memory cache for client-side usage
let clientConfigCache: Record<string, ConfigValue> = {};
let clientCacheTimestamp = 0;
const CLIENT_CACHE_TTL = 300000; // 5 minutes

/**
 * Server-side configuration service with database access
 */
export class ServerConfigService {
	/**
	 * Get a configuration value with fallback to default
	 */
	static async get<T>(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<T> {
		try {
			const value = await ConfigRepository.get(key);
			return value !== null ? (value as T) : (DEFAULT_CONFIG_VALUES[key] as T);
		} catch (error) {
			logger.error({ error, key }, 'Failed to get config, using default');
			return DEFAULT_CONFIG_VALUES[key] as unknown as T;
		}
	}

	/**
	 * Get typed configuration values with proper fallbacks
	 */
	static async getString(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<string> {
		const value = await this.get(key);
		return String(value);
	}

	static async getNumber(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<number> {
		const value = await this.get(key);
		return Number(value);
	}

	static async getBoolean(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<boolean> {
		const value = await this.get(key);
		return Boolean(value);
	}

	static async getArray<T>(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<T[]> {
		const value = await this.get(key);
		return Array.isArray(value) ? value : [];
	}

	/**
	 * Check if maintenance mode is enabled
	 */
	static async isMaintenanceModeEnabled(): Promise<boolean> {
		try {
			return await this.getBoolean('display.maintenanceMode');
		} catch (error) {
			logger.error({ error }, 'Error checking maintenance mode - defaulting to false');
			return false;
		}
	}

	/**
	 * Get pagination settings
	 */
	static async getPaginationConfig() {
		return {
			maxSightingsPerPage: await this.getNumber('display.maxSightingsPerPage'),
			defaultPageSize: Math.min(await this.getNumber('display.maxSightingsPerPage'), 50)
		};
	}

	/**
	 * Get file upload configuration
	 *
	 * Die drei Größen werden hier zentral normalisiert (`normalizeUploadSize()`,
	 * `#lib/constants/uploadLimits.ts`): `getNumber()` liefert rohes
	 * `Number(dbValue)` ohne Prüfung, und ein kaputter DB-Wert (NaN, negativ,
	 * Infinity — z. B. durch `PUT /api/config` mit ungültiger Eingabe) lief
	 * sonst bis zu den Aufrufern durch. Für die Gesamtgrößen-Prüfung in
	 * `POST /api/files/upload` bedeutete das: `x > NaN` ist in JavaScript immer
	 * `false`, die Prüfung war also lautlos abgeschaltet statt den Upload
	 * abzulehnen. Restriktiver Fallback wie bei `maxUploadSizeFor()`: eine
	 * kaputte Grenze wird zu `0`, nicht zu „unbegrenzt".
	 */
	static async getUploadConfig() {
		const maxFileSize = normalizeUploadSize(await this.getNumber('security.maxFileSize'));
		const maxVideoFileSize = normalizeUploadSize(await this.getNumber('security.maxVideoFileSize'));
		const maxTotalUploadSize = normalizeUploadSize(
			await this.getNumber('security.maxTotalUploadSize')
		);

		return {
			maxFileSize,
			maxFileSizeBytes: maxFileSize * 1024 * 1024,
			maxVideoFileSize,
			maxVideoFileSizeBytes: maxVideoFileSize * 1024 * 1024,
			maxTotalUploadSize,
			maxTotalUploadSizeBytes: maxTotalUploadSize * 1024 * 1024,
			allowedTypes: await this.getArray<string>('security.allowedFileTypes')
		};
	}

	/**
	 * Get email configuration
	 */
	static async getEmailConfig() {
		return {
			enabled: await this.getBoolean('notification.email.enabled'),
			recipient: await this.getString('notification.email.recipient'),
			sender: await this.getString('notification.email.sender'),
			senderName: await this.getString('notification.email.senderName'),
			template: await this.getString('notification.email.template')
		};
	}

	/**
	 * Get security configuration
	 */
	static async getSecurityConfig() {
		return {
			rateLimitPerIP: await this.getNumber('security.rateLimitPerIP'),
			requireEmailVerification: await this.getBoolean('security.requireEmailVerification'),
			autoApproveThreshold: await this.getNumber('security.autoApproveThreshold')
		};
	}
}

/**
 * Client-side configuration service (for browser usage)
 */
export class ClientConfigService {
	/**
	 * Load configurations from server for client-side usage
	 */
	static async loadConfigs(): Promise<Record<string, ConfigValue>> {
		if (!browser) return {};

		// Check cache
		if (clientConfigCache && Date.now() - clientCacheTimestamp < CLIENT_CACHE_TTL) {
			return clientConfigCache;
		}

		try {
			const response = await fetch('/api/config/public');
			if (response.ok) {
				const configs = await response.json();
				clientConfigCache = configs;
				clientCacheTimestamp = Date.now();
				return configs;
			}
		} catch (error) {
			logger.error({ error }, 'Failed to load client configs');
		}

		// Return default values if loading fails
		return DEFAULT_CONFIG_VALUES as unknown as Record<string, ConfigValue>;
	}

	/**
	 * Get a configuration value on client-side
	 */
	static async get<T>(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<T> {
		const configs = await this.loadConfigs();
		return configs[key] !== undefined ? (configs[key] as T) : (DEFAULT_CONFIG_VALUES[key] as T);
	}

	/**
	 * Check if maintenance mode is enabled (client-side)
	 */
	static async isMaintenanceModeEnabled(): Promise<boolean> {
		return this.get<boolean>('display.maintenanceMode');
	}
}

/**
 * Universal configuration service that works on both server and client
 */
export const ConfigService = {
	// Server-side methods (only work on server)
	server: ServerConfigService,

	// Client-side methods (only work in browser)
	client: ClientConfigService,

	// Get default value for any config key
	getDefault(key: keyof typeof DEFAULT_CONFIG_VALUES) {
		return DEFAULT_CONFIG_VALUES[key];
	},

	// Check if we're on server or client and use appropriate service
	async get<T>(key: keyof typeof DEFAULT_CONFIG_VALUES): Promise<T> {
		if (browser) {
			return ClientConfigService.get<T>(key);
		} else {
			return ServerConfigService.get<T>(key);
		}
	}
};

export type ConfigKey = keyof typeof DEFAULT_CONFIG_VALUES;
