import type { FrontendSighting } from '#lib/types/index.ts';

/**
 * Erzeugt JSON-Daten aus Sichtungen (Server-Side)
 * Basiert auf der ursprünglichen PHP-Funktion getJsonData
 */
export function generateJsonData(sightings: FrontendSighting[]): string {
	// Kopiere die Sichtungen, um die Originaldaten nicht zu verändern
	const processedSightings = sightings.map(cleanJsonData);

	return JSON.stringify(processedSightings, null, 2);
}

/**
 * Bereinigt Sichtungsdaten für JSON-Export
 */
function cleanJsonData(sighting: FrontendSighting): Record<string, unknown> {
	// Erstellen einer Kopie des Sighting-Objekts
	const cleanedSighting = { ...sighting };

	// In der PHP-Version werden bestimmte Felder ausgeschlossen oder transformiert
	// Hier können wir ähnliche Transformationen durchführen, falls nötig

	return cleanedSighting;
}
