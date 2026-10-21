import type { ConfigItem } from '#lib/server/db/configRepository.ts';
import type { User } from '#lib/types/index.ts';
import { isSuperAdminUser } from '#lib/server/auth/auth.ts';

/**
 * Configuration keys that regular admins can access (non-system-critical)
 */
const ADMIN_ACCESSIBLE_CONFIG_KEYS = new Set([
	'notification.email.enabled',
	'notification.email.template',
	'notification.email.recipient',
	'security.maxFileSize',
	'display.maxSightingsPerPage',
	'display.maintenanceMode',
	'display.maintenanceMessage'
]);

/**
 * Configuration keys that only superadmins can access (system-critical)
 */
const SUPERADMIN_ONLY_CONFIG_KEYS = new Set([
	// SMTP Settings (system-critical)
	'email.smtp.host',
	'email.smtp.port',
	'email.smtp.secure',
	'email.smtp.user',
	'email.smtp.password',

	// Email sender configuration (system-critical)
	'notification.email.sender',
	'notification.email.senderName',
	'notification.email.cc',
	'notification.email.bcc',

	// Advanced security settings
	'security.allowedFileTypes',
	'security.maxVideoFileSize',
	'security.maxTotalUploadSize',
	'security.rateLimitPerIP',
	'security.requireEmailVerification',
	'security.autoApproveThreshold',

	// Data processing settings
	'data.duplicateCheckRadius',
	'data.duplicateCheckTimeframe',
	'data.exportFormats',
	'data.archiveAfterDays',

	// Advanced display settings
	'display.dateFormat',

	// Integration settings
	'integration.weatherApiKey',
	'integration.geoApiKey',
	'integration.webhookUrl',

	// Mobile app settings
	'mobile.minAppVersion',
	'mobile.updateMessage',
	'mobile.apiRateLimit'
]);

/**
 * Check if a user can access a specific configuration key
 */
export function canUserAccessConfigKey(user: User | null | undefined, configKey: string): boolean {
	if (!user) {
		return false;
	}

	// Superadmins can access everything
	if (isSuperAdminUser(user)) {
		return true;
	}

	// Regular admins can only access non-system-critical settings
	if (user.roles?.includes('admin')) {
		return ADMIN_ACCESSIBLE_CONFIG_KEYS.has(configKey);
	}

	// Non-admin users cannot access any config
	return false;
}

/**
 * Filter configuration items based on user access level
 */
export function filterConfigsByUserAccess(
	configs: ConfigItem[],
	user: User | null | undefined
): ConfigItem[] {
	return configs.filter((config) => canUserAccessConfigKey(user, config.key));
}

/**
 * Get the set of configuration keys accessible to admins (non-superadmins)
 */
export function getAdminAccessibleConfigKeys(): Set<string> {
	return new Set(ADMIN_ACCESSIBLE_CONFIG_KEYS);
}

/**
 * Get the set of configuration keys accessible only to superadmins
 */
export function getSuperAdminOnlyConfigKeys(): Set<string> {
	return new Set(SUPERADMIN_ONLY_CONFIG_KEYS);
}

/**
 * Check if a configuration key is system-critical (superadmin-only)
 */
export function isSystemCriticalConfig(configKey: string): boolean {
	return SUPERADMIN_ONLY_CONFIG_KEYS.has(configKey);
}
