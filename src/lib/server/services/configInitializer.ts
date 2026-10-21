import { createLogger } from '#lib/logger.server.ts';
import { ConfigRepository, type ConfigItem } from '#lib/server/db/configRepository.ts';
import { NOTIFICATION_EMAIL_DEFAULT_TEMPLATE } from '#lib/server/templates/notificationEmailDefault.ts';

const logger = createLogger('configInitializer');

const defaultConfigurations: ConfigItem[] = [
	// Email Settings
	//
	// `notification.email.*` betrifft ausschließlich die interne Mail an das
	// Museum. Die meldende Person wird nicht angeschrieben (#621). Die
	// Beschreibungen sagen das jetzt ausdrücklich — sie erreichen allerdings nur
	// Neuinstallationen, weil `initializeDefaultConfigurations()` über
	// `insertManyIfAbsent` läuft und bestehende Zeilen unangetastet lässt. Die
	// verlässliche Anzeigeebene ist deshalb `admin/settings/configLabels.ts`.
	{
		key: 'notification.email.enabled',
		value: false,
		description: 'Interne Benachrichtigung an das Museum bei neuer Sichtung aktivieren',
		category: 'email'
	},
	{
		key: 'notification.email.recipient',
		value: '',
		description: 'Interne Empfänger-Adresse für Benachrichtigungen über neue Sichtungen',
		category: 'email'
	},
	// CC/BCC werden von emailService.getEmailConfig() über
	// `ConfigRepository.getArray('notification.email.cc', [])` gelesen, standen aber
	// bis 2026-07-30 in keiner Vorbelegung und damit auch in keinem Formular der
	// Settings-Seite — gelesen, aber nicht konfigurierbar.
	{
		key: 'notification.email.cc',
		value: [],
		description: 'Zusätzliche Empfänger in Kopie (kommagetrennt)',
		category: 'email'
	},
	{
		key: 'notification.email.bcc',
		value: [],
		description: 'Zusätzliche Empfänger in Blindkopie (kommagetrennt)',
		category: 'email'
	},
	{
		key: 'notification.email.sender',
		value: 'noreply@ostsee-tiere.de',
		description: 'Absender E-Mail Adresse',
		category: 'email'
	},
	{
		key: 'notification.email.senderName',
		value: 'Ostsee-Tiere',
		description: 'Name des E-Mail Absenders',
		category: 'email'
	},
	{
		key: 'notification.email.template',
		value: NOTIFICATION_EMAIL_DEFAULT_TEMPLATE,
		description: 'HTML Template für die interne Benachrichtigung (Handlebars Syntax)',
		category: 'email'
	},
	{
		key: 'email.smtp.host',
		value: '',
		description: 'SMTP Server Hostname',
		category: 'email'
	},
	{
		key: 'email.smtp.port',
		value: 587,
		description: 'SMTP Server Port',
		category: 'email'
	},
	{
		key: 'email.smtp.secure',
		value: false,
		description: 'SMTP SSL/TLS verwenden',
		category: 'email'
	},
	{
		key: 'email.smtp.user',
		value: '',
		description: 'SMTP Benutzername',
		category: 'email'
	},
	{
		key: 'email.smtp.password',
		value: '',
		description: 'SMTP Passwort',
		category: 'email'
	},

	// Display Settings
	{
		key: 'display.maxSightingsPerPage',
		value: 50,
		description: 'Maximale Anzahl Sichtungen pro Seite in der Admin-Übersicht',
		category: 'display'
	},
	{
		key: 'display.dateFormat',
		value: 'DD.MM.YYYY',
		description: 'Standard Datumsformat',
		category: 'display'
	},
	{
		key: 'display.maintenanceMode',
		value: false,
		description: 'Wartungsmodus aktivieren',
		category: 'display'
	},
	{
		key: 'display.maintenanceMessage',
		value: 'Die Anwendung wird gewartet. Bitte versuchen Sie es später erneut.',
		description: 'Nachricht für Wartungsmodus',
		category: 'display'
	},

	// Security Settings
	{
		key: 'security.maxFileSize',
		value: 10,
		description: 'Maximale Dateigröße für Uploads in MB',
		category: 'security'
	},
	{
		key: 'security.maxVideoFileSize',
		value: 100,
		description: 'Maximale Dateigröße für Video-Uploads in MB',
		category: 'security'
	},
	{
		key: 'security.maxTotalUploadSize',
		value: 250,
		description: 'Maximale Gesamtgröße aller Dateien einer Meldung in MB',
		category: 'security'
	},
	{
		key: 'security.allowedFileTypes',
		value: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'],
		description: 'Erlaubte MIME-Typen für Datei-Uploads',
		category: 'security'
	},
	{
		key: 'security.rateLimitPerIP',
		value: 10,
		description: 'Maximale Anzahl Requests pro IP pro Minute',
		category: 'security'
	},
	{
		key: 'security.requireEmailVerification',
		value: false,
		description: 'E-Mail Verifikation für neue Sichtungen erforderlich',
		category: 'security'
	},
	{
		key: 'security.autoApproveThreshold',
		value: 5,
		description: 'Auto-Genehmigung nach X verifizierten Meldungen vom selben Benutzer',
		category: 'security'
	},

	// Data Processing Settings
	{
		key: 'data.duplicateCheckRadius',
		value: 1,
		description: 'Radius für Duplikatsprüfung in Kilometern',
		category: 'data'
	},
	{
		key: 'data.duplicateCheckTimeframe',
		value: 24,
		description: 'Zeitfenster für Duplikatsprüfung in Stunden',
		category: 'data'
	},
	{
		key: 'data.exportFormats',
		value: ['csv', 'json', 'kml', 'xml'],
		description: 'Verfügbare Export-Formate',
		category: 'data'
	},
	{
		key: 'data.archiveAfterDays',
		value: 0,
		description: 'Sichtungen archivieren nach X Tagen (0 = nie)',
		category: 'data'
	},

	// Integration Settings
	{
		key: 'integration.weatherApiKey',
		value: '',
		description: 'API Schlüssel für Wetterdaten',
		category: 'integration'
	},
	{
		key: 'integration.geoApiKey',
		value: '',
		description: 'API Schlüssel für Geocoding',
		category: 'integration'
	},
	{
		key: 'integration.webhookUrl',
		value: '',
		description: 'Webhook URL für neue Sichtungen (optional)',
		category: 'integration'
	},

	// Mobile App Settings
	{
		key: 'mobile.minAppVersion',
		value: '1.0.0',
		description: 'Minimale unterstützte App-Version',
		category: 'mobile'
	},
	{
		key: 'mobile.updateMessage',
		value:
			'Eine neue Version der App ist verfügbar. Bitte aktualisieren Sie für die beste Erfahrung.',
		description: 'Nachricht für App-Updates',
		category: 'mobile'
	},
	{
		key: 'mobile.apiRateLimit',
		value: 100,
		description: 'API Rate-Limit für Mobile Apps pro Minute',
		category: 'mobile'
	}
];

/**
 * Initialize default configurations in the database
 */
export async function initializeDefaultConfigurations(): Promise<void> {
	try {
		logger.info('Initializing default configurations...');

		const insertedCount = await ConfigRepository.insertManyIfAbsent(
			defaultConfigurations,
			'system'
		);
		const skippedCount = defaultConfigurations.length - insertedCount;

		logger.info(
			{
				total: defaultConfigurations.length,
				inserted: insertedCount,
				skipped: skippedCount
			},
			'Default configurations initialization completed'
		);
	} catch (error) {
		logger.error({ error }, 'Failed to initialize default configurations');
		throw error;
	}
}

/**
 * Reset all configurations to default values
 * WARNING: This will overwrite all existing configurations!
 */
export async function resetToDefaultConfigurations(): Promise<void> {
	try {
		logger.warn('Resetting all configurations to defaults...');

		await ConfigRepository.upsertMany(defaultConfigurations, 'system');

		// Clear cache
		ConfigRepository.clearCache();

		logger.warn('All configurations have been reset to defaults');
	} catch (error) {
		logger.error({ error }, 'Failed to reset configurations to defaults');
		throw error;
	}
}

/**
 * Get list of all available configuration keys
 */
export function getAvailableConfigurationKeys(): string[] {
	return defaultConfigurations.map((config) => config.key);
}

/**
 * Get configuration categories
 */
export function getConfigurationCategories(): string[] {
	const categories = new Set(defaultConfigurations.map((config) => config.category));
	return Array.from(categories).sort();
}

/**
 * Get default configurations grouped by category
 */
export function getDefaultConfigurationsByCategory(): Record<string, ConfigItem[]> {
	return defaultConfigurations.reduce(
		(acc, config) => {
			if (!acc[config.category]) {
				acc[config.category] = [];
			}
			acc[config.category]?.push(config);
			return acc;
		},
		{} as Record<string, ConfigItem[]>
	);
}
