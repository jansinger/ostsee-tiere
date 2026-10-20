import { createLogger } from '#lib/logger.server.ts';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const logger = createLogger('AdminRefIdRoute');

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { refId } = params;

	if (!refId) {
		logger.error('No reference ID provided');
		return error(400, 'Reference ID is required');
	}

	logger.info(`Looking up sighting by reference ID: ${refId}`);

	// Use the API route we just created to get the sighting
	const response = await fetch(`/api/sightings/ref/${refId}`);

	if (!response.ok) {
		if (response.status === 404) {
			logger.warn(`Sighting not found for reference ID: ${refId}`);
			return error(404, 'Sighting with this reference ID not found');
		}
		logger.error(`API error for reference ID ${refId}: ${response.status} ${response.statusText}`);
		return error(response.status, { message: 'Error retrieving sighting' });
	}

	const sighting = await response.json();
	logger.info(`Found sighting ${sighting.id} for reference ID: ${refId}, redirecting`);

	// Redirect to the regular sighting view using the database ID
	redirect(302, `/admin/${sighting.id}`);
};
