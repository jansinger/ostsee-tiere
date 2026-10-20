import { createLogger } from '#lib/logger.server.ts';
import { ServerConfigService, DEFAULT_CONFIG_VALUES } from '#lib/services/configService.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:config:public');

// Configuration keys that are safe to expose to clients
const PUBLIC_CONFIG_KEYS = [
	'display.dateFormat',
	'display.maintenanceMode',
	'display.maintenanceMessage',
	'mobile.minAppVersion',
	'mobile.updateMessage',
	'data.exportFormats'
] as const;

export const GET: RequestHandler = async ({ setHeaders }) => {
	try {
		const publicConfigs: Record<string, unknown> = {};

		// Fetch only public configuration values
		for (const key of PUBLIC_CONFIG_KEYS) {
			try {
				publicConfigs[key] = await ServerConfigService.get(key);
			} catch (error) {
				logger.warn({ error, key }, 'Failed to get public config, using default');
				publicConfigs[key] = DEFAULT_CONFIG_VALUES[key];
			}
		}

		// Set cache headers (5 minutes)
		setHeaders({
			'Cache-Control': 'public, max-age=300',
			'Content-Type': 'application/json'
		});

		return json(publicConfigs);
	} catch (error) {
		logger.error({ error }, 'Failed to get public configurations');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
