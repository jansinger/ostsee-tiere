import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { createLogger } from '#lib/logger.server.ts';
import { ServerConfigService } from '#lib/services/configService.ts';

const logger = createLogger('maintenanceMode');

/**
 * Maintenance mode middleware that redirects users when maintenance mode is enabled
 */
export const maintenanceMode: Handle = async ({ event, resolve }) => {
	// Skip maintenance check for admin users and API endpoints
	const isAdminRoute = event.url.pathname.startsWith('/admin');
	const isApiRoute = event.url.pathname.startsWith('/api');
	const isMaintenancePage = event.url.pathname === '/maintenance';

	// Allow access to these routes even in maintenance mode
	if (isAdminRoute || isApiRoute || isMaintenancePage) {
		return resolve(event);
	}

	let isMaintenanceEnabled = false;
	try {
		isMaintenanceEnabled = await ServerConfigService.isMaintenanceModeEnabled();
	} catch (error) {
		logger.error({ error, path: event.url.pathname }, 'Error checking maintenance mode');
	}

	if (isMaintenanceEnabled) {
		logger.info({ path: event.url.pathname }, 'Redirecting to maintenance page');
		throw redirect(302, '/maintenance');
	}

	return resolve(event);
};

/**
 * Get maintenance configuration
 */
export async function getMaintenanceConfig() {
	return {
		enabled: await ServerConfigService.isMaintenanceModeEnabled(),
		message: await ServerConfigService.getString('display.maintenanceMessage')
	};
}
