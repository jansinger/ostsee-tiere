import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { initializeDefaultConfigurations } from '#lib/server/services/configInitializer.ts';
import { json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:config:init');

export const POST: RequestHandler = async ({ locals, url }: RequestEvent) => {
	// SECURITY: Must be outside try/catch so redirect(302) propagates correctly
	requireUserRole(url, locals.user, ['superadmin']);

	try {
		await initializeDefaultConfigurations();

		logger.info({ userId: locals.user!.sub }, 'Default configurations initialized'); // Safe after requireUserRole check

		return json({
			success: true,
			message: 'Default configurations have been initialized'
		});
	} catch (error) {
		logger.error({ error }, 'Failed to initialize default configurations');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
