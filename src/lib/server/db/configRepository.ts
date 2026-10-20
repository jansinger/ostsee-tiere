import { createLogger } from '#lib/logger.server.ts';
import { eq, sql } from 'drizzle-orm';
import { db, getDb, isDatabaseAvailable } from './index';
import { appConfig } from './schema';

const logger = createLogger('configRepository');

export type ConfigValue = string | number | boolean | Record<string, unknown> | unknown[];

export interface ConfigItem {
	id?: number;
	key: string;
	value: ConfigValue;
	description?: string | null;
	category: string;
	updatedAt?: Date;
	updatedBy?: string | null;
}

export type ConfigCategory = 'email' | 'display' | 'security' | 'data' | 'integration' | 'mobile';

const configCache = new Map<string, { value: ConfigValue; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

export class ConfigRepository {
	/**
	 * Get a configuration value by key
	 */
	static async get(key: string): Promise<ConfigValue | null> {
		// If database is not configured, return null (caller should use defaults)
		if (!isDatabaseAvailable()) {
			logger.debug({ key }, 'Database not configured, returning null for config key');
			return null;
		}

		try {
			// Check cache first
			const cached = configCache.get(key);
			if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
				return cached.value;
			}

			const result = await db
				.select({
					value: appConfig.value
				})
				.from(appConfig)
				.where(eq(appConfig.key, key))
				.limit(1);

			if (result.length === 0) {
				return null;
			}

			const value = result[0]?.value as ConfigValue;

			// Update cache
			configCache.set(key, { value, timestamp: Date.now() });

			return value;
		} catch (error) {
			logger.error({ error, key }, 'Failed to get configuration');
			throw error;
		}
	}

	/**
	 * Get multiple configuration values by category
	 */
	static async getByCategory(category: ConfigCategory): Promise<ConfigItem[]> {
		const database = getDb();
		try {
			const result = await database
				.select({
					id: appConfig.id,
					key: appConfig.key,
					value: appConfig.value,
					description: appConfig.description,
					category: appConfig.category,
					updatedAt: appConfig.updatedAt,
					updatedBy: appConfig.updatedBy
				})
				.from(appConfig)
				.where(eq(appConfig.category, category));

			return result.map((row) => ({
				...row,
				value: row.value as ConfigValue
			}));
		} catch (error) {
			logger.error({ error, category }, 'Failed to get configurations by category');
			throw error;
		}
	}

	/**
	 * Get all configuration values
	 */
	static async getAll(): Promise<ConfigItem[]> {
		const database = getDb();
		try {
			const result = await database
				.select({
					id: appConfig.id,
					key: appConfig.key,
					value: appConfig.value,
					description: appConfig.description,
					category: appConfig.category,
					updatedAt: appConfig.updatedAt,
					updatedBy: appConfig.updatedBy
				})
				.from(appConfig)
				.orderBy(appConfig.category, appConfig.key);

			return result.map((row) => ({
				...row,
				value: row.value as ConfigValue
			}));
		} catch (error) {
			logger.error({ error }, 'Failed to get all configurations');
			throw error;
		}
	}

	/**
	 * Set a configuration value
	 */
	static async set(key: string, value: ConfigValue, userId?: string): Promise<void> {
		const database = getDb();
		try {
			const existing = await database
				.select({ id: appConfig.id })
				.from(appConfig)
				.where(eq(appConfig.key, key))
				.limit(1);

			if (existing.length > 0) {
				// Update existing
				await database
					.update(appConfig)
					.set({
						value: JSON.parse(JSON.stringify(value)) as unknown,
						updatedAt: new Date(),
						updatedBy: userId
					})
					.where(eq(appConfig.key, key));
			} else {
				// Insert new - requires category
				throw new Error(
					`Configuration key '${key}' does not exist. Use upsert() to create new configurations.`
				);
			}

			// Clear cache
			configCache.delete(key);

			logger.info({ key, userId }, 'Configuration updated');
		} catch (error) {
			logger.error({ error, key }, 'Failed to set configuration');
			throw error;
		}
	}

	/**
	 * Upsert a configuration value (insert or update)
	 */
	static async upsert(item: ConfigItem, userId?: string): Promise<void> {
		const database = getDb();
		try {
			const existing = await database
				.select({ id: appConfig.id })
				.from(appConfig)
				.where(eq(appConfig.key, item.key))
				.limit(1);

			if (existing.length > 0) {
				// Update existing
				await database
					.update(appConfig)
					.set({
						value: JSON.parse(JSON.stringify(item.value)) as unknown,
						description: item.description,
						category: item.category,
						updatedAt: new Date(),
						updatedBy: userId
					})
					.where(eq(appConfig.key, item.key));
			} else {
				// Insert new
				await database.insert(appConfig).values({
					key: item.key,
					value: JSON.parse(JSON.stringify(item.value)) as unknown,
					description: item.description,
					category: item.category,
					updatedAt: new Date(),
					updatedBy: userId
				});
			}

			// Clear cache
			configCache.delete(item.key);

			logger.info({ key: item.key, userId }, 'Configuration upserted');
		} catch (error) {
			logger.error({ error, item }, 'Failed to upsert configuration');
			throw error;
		}
	}

	/**
	 * Bulk upsert multiple configurations in a single query.
	 * Uses ON CONFLICT DO UPDATE to insert new and update existing entries.
	 */
	static async upsertMany(items: ConfigItem[], userId?: string): Promise<void> {
		if (items.length === 0) return;
		const database = getDb();
		try {
			const now = new Date();
			await database
				.insert(appConfig)
				.values(
					items.map((item) => ({
						key: item.key,
						value: JSON.parse(JSON.stringify(item.value)) as unknown,
						description: item.description,
						category: item.category,
						updatedAt: now,
						updatedBy: userId
					}))
				)
				.onConflictDoUpdate({
					target: appConfig.key,
					set: {
						value: sql`excluded.value`,
						description: sql`excluded.description`,
						category: sql`excluded.category`,
						updatedAt: sql`excluded.updated_at`,
						updatedBy: sql`excluded.updated_by`
					}
				});

			// Clear affected cache entries
			for (const item of items) {
				configCache.delete(item.key);
			}

			logger.info({ count: items.length, userId }, 'Bulk upserted configurations');
		} catch (error) {
			logger.error({ error, count: items.length }, 'Failed to bulk upsert configurations');
			throw error;
		}
	}

	/**
	 * Bulk insert configurations, skipping those that already exist.
	 * Uses ON CONFLICT DO NOTHING — existing entries are not modified.
	 */
	static async insertManyIfAbsent(items: ConfigItem[], userId?: string): Promise<number> {
		if (items.length === 0) return 0;
		const database = getDb();
		try {
			const now = new Date();
			const result = await database
				.insert(appConfig)
				.values(
					items.map((item) => ({
						key: item.key,
						value: JSON.parse(JSON.stringify(item.value)) as unknown,
						description: item.description,
						category: item.category,
						updatedAt: now,
						updatedBy: userId
					}))
				)
				.onConflictDoNothing()
				.returning({ key: appConfig.key });

			logger.info(
				{ inserted: result.length, skipped: items.length - result.length, userId },
				'Bulk inserted configurations (skipped existing)'
			);
			return result.length;
		} catch (error) {
			logger.error({ error, count: items.length }, 'Failed to bulk insert configurations');
			throw error;
		}
	}

	/**
	 * Delete a configuration
	 */
	static async delete(key: string): Promise<void> {
		const database = getDb();
		try {
			await database.delete(appConfig).where(eq(appConfig.key, key));

			// Clear cache
			configCache.delete(key);

			logger.info({ key }, 'Configuration deleted');
		} catch (error) {
			logger.error({ error, key }, 'Failed to delete configuration');
			throw error;
		}
	}

	/**
	 * Clear the configuration cache
	 */
	static clearCache(): void {
		configCache.clear();
		logger.debug('Configuration cache cleared');
	}

	/**
	 * Get typed configuration value with default
	 */
	static async getString(key: string, defaultValue: string): Promise<string> {
		const value = await this.get(key);
		return value !== null ? String(value) : defaultValue;
	}

	static async getNumber(key: string, defaultValue: number): Promise<number> {
		const value = await this.get(key);
		return value !== null ? Number(value) : defaultValue;
	}

	/**
	 * Liest einen Wahrheitswert und versteht dabei auch die String-Schreibweisen.
	 *
	 * Das schlichte `Boolean(value)` von früher war eine Falle: Jeder nichtleere
	 * String ist wahr, der gespeicherte String `'false'` also **`true`**. Die
	 * Spalte ist zwar `jsonb` und die Einstellungs-Oberfläche schreibt echte
	 * Booleans — `PUT /api/config` nimmt aber jeden JSON-Wert entgegen, und
	 * Altbestand wie von Hand abgesetztes SQL erst recht.
	 *
	 * Was der Fall kostet, zeigte das SMTP-Debugging am 2026-08-19: Ein so
	 * verdrehtes `email.smtp.secure` hätte nodemailer auf sofortiges TLS gegen
	 * einen Klartext-Port gestellt, und der Abbruch wäre als `ESOCKET`/`CONN`
	 * im Log gelandet — ununterscheidbar von einem Netzwerkfehler.
	 *
	 * Unverständliche Werte ergeben den Default, nicht `true`: Sie als „an" zu
	 * lesen wäre dieselbe stille Fehlinterpretation in Grün.
	 */
	static async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
		const value = await this.get(key);

		if (value === null) {
			return defaultValue;
		}

		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();

			if (['true', '1', 'yes', 'on'].includes(normalized)) {
				return true;
			}

			if (['false', '0', 'no', 'off', ''].includes(normalized)) {
				return false;
			}

			// Nur der Schlüssel, nicht der Wert: Diese Methode ist generisch, und
			// unter den Konfigurationsschlüsseln stehen Geheimnisse
			// (`email.smtp.password`, `integration.*ApiKey`). Der Schlüssel sagt
			// genau, wo nachzusehen ist — das Feld hieße hier `value` und würde
			// von der Redaction in `logger/serverLogger.ts` nicht erfasst.
			logger.warn({ key }, 'Konfigurationswert ist kein Wahrheitswert — Default wird verwendet');
			return defaultValue;
		}

		return Boolean(value);
	}

	static async getObject<T extends Record<string, unknown>>(
		key: string,
		defaultValue: T
	): Promise<T> {
		const value = await this.get(key);
		return value !== null && typeof value === 'object' && !Array.isArray(value)
			? (value as T)
			: defaultValue;
	}

	static async getArray<T>(key: string, defaultValue: T[]): Promise<T[]> {
		const value = await this.get(key);
		return Array.isArray(value) ? (value as T[]) : defaultValue;
	}
}

// Export convenience functions
export const getConfig = ConfigRepository.get.bind(ConfigRepository);
export const setConfig = ConfigRepository.set.bind(ConfigRepository);
export const upsertConfig = ConfigRepository.upsert.bind(ConfigRepository);
export const getAllConfigs = ConfigRepository.getAll.bind(ConfigRepository);
export const getConfigsByCategory = ConfigRepository.getByCategory.bind(ConfigRepository);
