import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { resetToDefaultConfigurations } from '#lib/server/services/configInitializer.ts';
import { json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:config:reset');

export const POST: RequestHandler = async ({ locals, url }: RequestEvent) => {
	// SECURITY: Must be outside try/catch so redirect(302) propagates correctly
	requireUserRole(url, locals.user, ['superadmin']);

	try {
		await resetToDefaultConfigurations();

		logger.info({ userId: locals.user!.sub }, 'All configurations reset to defaults'); // Safe after requireUserRole check

		return json({
			success: true,
			message: 'All configurations have been reset to default values'
		});
	} catch (error) {
		logger.error({ error }, 'Failed to reset configurations to defaults');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
