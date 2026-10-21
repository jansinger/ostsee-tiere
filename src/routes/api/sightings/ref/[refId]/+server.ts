import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { getSightingByReferenceId } from '#lib/server/db/sightingRepository.ts';
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('SightingByRefIdAPI');

export const GET: RequestHandler = async ({ params, url, locals }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { refId } = params;

	if (!refId) {
		logger.error('No reference ID provided');
		return error(400, 'Reference ID is required');
	}

	try {
		logger.info(`Getting sighting by reference ID: ${refId}`);
		const sighting = await getSightingByReferenceId(refId);

		if (!sighting) {
			logger.warn(`Sighting not found for reference ID: ${refId}`);
			return error(404, 'Sighting not found');
		}

		logger.info(`Successfully retrieved sighting ${sighting.id} for reference ID: ${refId}`);
		return json(sighting);
	} catch (err) {
		if (isHttpError(err)) {
			throw err;
		}
		logger.error(`Error retrieving sighting by reference ID ${refId}: ${String(err)}`);
		return error(500, 'Internal server error');
	}
};
