import * as m from '#lib/paraglide/messages.js';
import { createLogger } from '#lib/logger.server.ts';
import { checkBalticSeaFile } from '#lib/server/geo/checkBalticSeaFile.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { error, json, type RequestEvent } from '@sveltejs/kit';

const logger = createLogger('api:geo:inBaltic');

/**
 * GET-Handler für /api/geo/inBaltic
 * Prüft, ob ein Punkt in der Ostsee liegt
 *
 * Parameter:
 * - longitude: Längengrad (-180 bis +180)
 * - latitude: Breitengrad (-90 bis +90)
 *
 * Rückgabewerte:
 * - inBaltic: Boolean, ob der Punkt in der Ostsee liegt
 * - inChartArea: Boolean, ob der Punkt im Chart-Bereich liegt
 */
export async function GET(event: RequestEvent) {
	const clientIp = getClientIp(() => event.getClientAddress(), event.request);

	// Parameter aus der URL extrahieren
	const longitudeParam = event.url.searchParams.get('longitude');
	const latitudeParam = event.url.searchParams.get('latitude');

	logger.debug(
		{
			longitude: longitudeParam,
			latitude: latitudeParam,
			ip: clientIp
		},
		'Geo-API aufgerufen'
	);

	// Prüfen, ob die Parameter vorhanden sind
	if (!longitudeParam || !latitudeParam) {
		logger.warn({ ip: clientIp }, 'Fehlende Parameter');
		throw error(400, m.api_geo_inbaltic_text_parameter_longitude_latitude_angegeben());
	}

	// Parameter in Zahlen umwandeln
	const longitude = parseFloat(longitudeParam);
	const latitude = parseFloat(latitudeParam);

	// Runden auf eine sinnvolle Anzahl von Dezimalstellen
	const normalizedLongitude = Number(longitude.toFixed(6));
	const normalizedLatitude = Number(latitude.toFixed(6));

	// Prüfen, ob die Parameter gültige Zahlen sind
	if (isNaN(normalizedLongitude) || isNaN(normalizedLatitude)) {
		logger.warn(
			{ longitude: longitudeParam, latitude: latitudeParam, ip: clientIp },
			'Ungültige Zahlenformate'
		);

		throw error(400, m.api_geo_inbaltic_text_parameter_longitude_latitude_zahlen());
	}

	// Bereichsprüfung
	if (normalizedLongitude < -180 || normalizedLongitude > 180) {
		logger.warn(
			{ longitude: normalizedLongitude, ip: clientIp },
			'Longitude außerhalb des gültigen Bereichs'
		);

		throw error(400, m.api_geo_inbaltic_text_parameter_longitude_bereich());
	}

	if (normalizedLatitude < -90 || normalizedLatitude > 90) {
		logger.warn(
			{ latitude: normalizedLatitude, ip: clientIp },
			'Latitude außerhalb des gültigen Bereichs'
		);

		throw error(400, m.api_geo_inbaltic_text_parameter_latitude_bereich());
	}

	try {
		// Prüfen, ob der Punkt in der Ostsee liegt (mit Turf.js für korrekte Polygon-Hole-Behandlung)
		const result = checkBalticSeaFile(normalizedLongitude, normalizedLatitude);

		logger.info(
			{
				longitude: normalizedLongitude,
				latitude: normalizedLatitude,
				inBaltic: result.inBaltic,
				inChartArea: result.inChartArea
			},
			'Geo-Prüfung erfolgreich'
		);

		// Ergebnis zurückgeben
		return json(result);
	} catch (err) {
		logger.error(
			{
				longitude: normalizedLongitude,
				latitude: normalizedLatitude,
				error: err
			},
			'Fehler bei der Geo-Prüfung'
		);
	}

	throw error(500, m.api_geo_inbaltic_text_fehler_bei_der_geo_pruefung());
}
