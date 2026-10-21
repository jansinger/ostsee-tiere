/**
 * @fileoverview Legacy REST API endpoint - PDF specification compliance
 *
 * GET /rest_sichtungen/inBaltic.json
 *
 * Checks if coordinates are in Baltic Sea using EXACT legacy format from PDF specification.
 * This endpoint MUST maintain 100% compatibility with original schweinswalsichtung.de API.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import { createLogger } from '#lib/logger.server.ts';
import { checkBalticSeaFile } from '#lib/server/geo/checkBalticSeaFile.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { json, type RequestEvent } from '@sveltejs/kit';

const logger = createLogger('api:legacy:inBaltic:pdf-compliant');

/**
 * GET handler for PDF-compliant Baltic Sea position check
 *
 * Expected URL format: /rest_sichtungen/inBaltic.json?location=latitude,longitude
 * Response format exactly as specified in PDF: { "inbaltic": boolean, "inchartarea": boolean }
 */
export async function GET(event: RequestEvent): Promise<Response> {
	const clientIp = getClientIp(() => event.getClientAddress());
	const locationParam = event.url.searchParams.get('location');

	try {
		// Validate required location parameter
		if (!locationParam) {
			logger.warn({ ip: clientIp }, 'Missing location parameter in PDF-compliant inBaltic check');

			return json(
				{
					error: 'MissingParameter',
					message: 'Parameter "location" is required in format "latitude,longitude"'
				},
				{ status: 400 }
			);
		}

		// Parse coordinates (latitude,longitude format)
		const coords = locationParam.split(',');
		if (coords.length !== 2) {
			logger.warn(
				{
					location: locationParam,
					ip: clientIp
				},
				'Invalid location format in PDF-compliant inBaltic check'
			);

			return json(
				{
					error: 'InvalidFormat',
					message: 'Parameter "location" must be in format "latitude,longitude"'
				},
				{ status: 400 }
			);
		}

		const latStr = coords[0]!.trim();
		const lonStr = coords[1]!.trim();

		const latitude = parseFloat(latStr);
		const longitude = parseFloat(lonStr);

		// Validate coordinates are numeric
		if (isNaN(latitude) || isNaN(longitude)) {
			logger.warn(
				{
					location: locationParam,
					latitude: latStr,
					longitude: lonStr,
					ip: clientIp
				},
				'Non-numeric coordinates in PDF-compliant inBaltic check'
			);

			return json(
				{
					error: 'InvalidCoordinates',
					message: 'Coordinates must be valid numbers'
				},
				{ status: 400 }
			);
		}

		// Validate coordinate ranges
		if (latitude < -90 || latitude > 90) {
			logger.warn(
				{
					location: locationParam,
					latitude,
					ip: clientIp
				},
				'Latitude out of range in PDF-compliant inBaltic check'
			);

			return json(
				{
					error: 'InvalidLatitude',
					message: 'Latitude must be between -90 and 90'
				},
				{ status: 400 }
			);
		}

		if (longitude < -180 || longitude > 180) {
			logger.warn(
				{
					location: locationParam,
					longitude,
					ip: clientIp
				},
				'Longitude out of range in PDF-compliant inBaltic check'
			);

			return json(
				{
					error: 'InvalidLongitude',
					message: 'Longitude must be between -180 and 180'
				},
				{ status: 400 }
			);
		}

		// Normalize coordinates to 6 decimal places for consistency
		const normalizedLat = Math.round(latitude * 1000000) / 1000000;
		const normalizedLon = Math.round(longitude * 1000000) / 1000000;

		logger.debug(
			{
				originalLocation: locationParam,
				normalizedLat,
				normalizedLon,
				ip: clientIp
			},
			'Processing PDF-compliant Baltic Sea location check'
		);

		// Perform geo validation using existing utility
		const geoResult = checkBalticSeaFile(normalizedLon, normalizedLat);

		// Create PDF-compliant response format (lowercase field names!)
		const response = {
			inbaltic: geoResult.inBaltic, // Note: lowercase 'b' as per PDF spec
			inchartarea: geoResult.inChartArea // Note: lowercase as per PDF spec
		};

		logger.info(
			{
				location: locationParam,
				normalizedCoords: { lat: normalizedLat, lon: normalizedLon },
				result: response,
				ip: clientIp
			},
			'PDF-compliant Baltic Sea location check completed'
		);

		return json(response, {
			headers: {
				'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
				'Content-Type': 'application/json'
			}
		});
	} catch (geoError) {
		const error = geoError instanceof Error ? geoError : new Error('Unknown geo validation error');
		logger.error(
			{
				error: error.message,
				stack: error.stack,
				location: locationParam,
				ip: clientIp
			},
			'Error in PDF-compliant Baltic Sea location validation'
		);

		const errorResponse = {
			error: 'GeoValidationError',
			message: 'Failed to validate location coordinates'
		};

		return json(errorResponse, { status: 500 });
	}
}

/**
 * Handle unsupported HTTP methods
 */
export async function POST() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}

export async function PUT() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}

export async function DELETE() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}
