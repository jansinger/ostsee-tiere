/**
 * @fileoverview Extent-Hilfsfunktionen für die OpenLayers-Karte.
 *
 * Eigenes Modul statt Ergänzung von `mapUtils.ts`: `mapUtils.ts` wird auch
 * serverseitig importiert (`src/routes/api/map/sightings/+server.ts`) und
 * importiert aktuell kein `ol`. Die hier benötigten OL-Extent-/Proj-Helfer
 * bleiben deshalb in einem separaten, browser-orientierten Modul.
 */
import { boundingExtent, getIntersection, isEmpty } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import { BALTIC_SEA_BBOX } from '#lib/utils/geo/checkBalticSea.ts';

/** [minX, minY, maxX, maxY] in der Kartenprojektion (EPSG:3857). */
export type Extent = [number, number, number, number];

let cachedBalticExtent: Extent | null = null;

/**
 * Ostsee-BBox (`BALTIC_SEA_BBOX`, WGS84) nach EPSG:3857 transformiert.
 * Wird lazy berechnet und gecacht, da sie sich zur Laufzeit nie ändert.
 */
function getBalticExtent(): Extent {
	if (!cachedBalticExtent) {
		cachedBalticExtent = boundingExtent([
			fromLonLat([BALTIC_SEA_BBOX.minLongitude, BALTIC_SEA_BBOX.minLatitude]),
			fromLonLat([BALTIC_SEA_BBOX.maxLongitude, BALTIC_SEA_BBOX.maxLatitude])
		]) as Extent;
	}
	return cachedBalticExtent;
}

function isFiniteExtent(extent: Extent): boolean {
	return extent.every((value) => Number.isFinite(value));
}

/**
 * Klemmt einen EPSG:3857-Extent auf den Ostsee-Kartenbereich.
 *
 * Hintergrund: Datensätze mit ungültigen Koordinaten (z. B. Null Island
 * [0,0]) lassen den Feature-Extent auf Weltgröße anwachsen — „Auf alle
 * Sichtungen zoomen" (ZoomAllControl) würde dann auf die Weltansicht statt
 * auf die Ostsee zoomen. Diese Funktion verschneidet den übergebenen Extent
 * mit dem Ostsee-Extent; ist die Schnittmenge leer oder der Input
 * ungültig/unendlich, wird der Ostsee-Extent selbst zurückgegeben.
 *
 * @param extent EPSG:3857-Extent, z. B. aus `VectorSource.getExtent()`
 * @returns Extent innerhalb der Ostsee-Grenzen
 */
export function clampExtentToBaltic(extent: Extent): Extent {
	const balticExtent = getBalticExtent();

	if (!isFiniteExtent(extent) || isEmpty(extent)) {
		return balticExtent;
	}

	const intersection = getIntersection(extent, balticExtent) as Extent;
	if (isEmpty(intersection)) {
		return balticExtent;
	}

	return intersection;
}
