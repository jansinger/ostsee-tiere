import { createLogger } from '$lib/logger.server';
import { ConfigRepository, type ConfigItem } from '$lib/server/db/configRepository';
import { filterConfigsByUserAccess } from '$lib/server/config/accessControl';
import { maskSecretConfigValues } from '$lib/config/secretConfigKeys';
import {
	getDefaultConfigurationsByCategory,
	initializeDefaultConfigurations
} from '$lib/server/services/configInitializer';
import { isSuperAdminUser, requireUserRole } from '$lib/server/auth/auth';
import type { PageServerLoad } from './$types';

const logger = createLogger('admin:settings:page');

export const load: PageServerLoad = async ({ locals, url }) => {
	// Layout guard allows ['admin', 'superadmin']; settings requires at least one of these
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	try {
		// Ensure default configurations are initialized
		await initializeDefaultConfigurations();

		// Get all current configurations from database
		const currentConfigs = await ConfigRepository.getAll();

		// Get default configuration structure
		const defaultConfigsByCategory = getDefaultConfigurationsByCategory();

		// Merge default structure with current values and filter by user access
		const mergedConfigs: Record<string, ConfigItem[]> = {};

		for (const [category, defaultConfigs] of Object.entries(defaultConfigsByCategory)) {
			const categoryConfigs = (defaultConfigs as ConfigItem[]).map((defaultConfig: ConfigItem) => {
				// Find current value from database
				const currentConfig = currentConfigs.find((c) => c.key === defaultConfig.key);

				return {
					...defaultConfig,
					value: currentConfig?.value ?? defaultConfig.value,
					id: currentConfig?.id ?? 0,
					updatedAt: currentConfig?.updatedAt ?? new Date(),
					updatedBy: currentConfig?.updatedBy ?? null
				};
			});

			// Filter configurations based on user access level, then mask credentials.
			// Reihenfolge ist egal, die Maskierung aber nicht optional: ohne sie
			// stünde das SMTP-Passwort im SSR-HTML dieser Seite.
			const accessibleConfigs = maskSecretConfigValues(
				filterConfigsByUserAccess(categoryConfigs, locals.user)
			);

			// Only include categories that have accessible configurations
			if (accessibleConfigs.length > 0) {
				mergedConfigs[category] = accessibleConfigs;
			}
		}

		return {
			groupedConfigs: mergedConfigs,
			hasUnsavedChanges: false,
			isSuperAdmin: isSuperAdminUser(locals.user)
		};
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Failed to load admin settings'
		);

		// Fallback: Just show default configurations without database values, filtered by user access
		const defaultConfigsByCategory = getDefaultConfigurationsByCategory();
		const fallbackConfigs: Record<string, ConfigItem[]> = {};

		for (const [category, defaultConfigs] of Object.entries(defaultConfigsByCategory)) {
			const categoryConfigs = (defaultConfigs as ConfigItem[]).map((defaultConfig: ConfigItem) => ({
				...defaultConfig,
				id: 0,
				updatedAt: new Date(),
				updatedBy: null
			}));

			// Auch hier maskieren: Der Fallback zeigt zwar nur Vorbelegungen, aber
			// eine spätere Änderung an dieser Verzweigung soll das Leck nicht
			// wieder aufreißen.
			const accessibleConfigs = maskSecretConfigValues(
				filterConfigsByUserAccess(categoryConfigs, locals.user)
			);

			// Only include categories that have accessible configurations
			if (accessibleConfigs.length > 0) {
				fallbackConfigs[category] = accessibleConfigs;
			}
		}

		return {
			groupedConfigs: fallbackConfigs,
			hasUnsavedChanges: false,
			isSuperAdmin: isSuperAdminUser(locals.user),
			error:
				'Datenbankfehler: Einstellungen werden als Standard-Werte angezeigt. Bitte prüfen Sie die Datenbankverbindung.'
		};
	}
};
