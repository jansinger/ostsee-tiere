import { getMaintenanceConfig } from '#lib/server/middleware/maintenanceMode.ts';
import { ServerConfigService } from '#lib/services/configService.ts';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// If maintenance mode is disabled, redirect to home
	const isMaintenanceEnabled = await ServerConfigService.isMaintenanceModeEnabled();

	if (!isMaintenanceEnabled) {
		throw redirect(302, '/');
	}

	// Get maintenance configuration
	const config = await getMaintenanceConfig();

	return {
		maintenanceMessage: config.message
	};
};
