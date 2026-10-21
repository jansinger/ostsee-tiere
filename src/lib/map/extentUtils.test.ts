import { describe, it, expect } from 'vitest';
import { boundingExtent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import { BALTIC_SEA_BBOX } from '#lib/utils/geo/checkBalticSea.ts';
import { clampExtentToBaltic, type Extent } from './extentUtils';

// Referenz-Extent, unabhängig von der Implementierung berechnet, damit der Test
// eine echte Aussage über das Verschneidungsverhalten trifft.
const BALTIC_EXTENT = boundingExtent([
	fromLonLat([BALTIC_SEA_BBOX.minLongitude, BALTIC_SEA_BBOX.minLatitude]),
	fromLonLat([BALTIC_SEA_BBOX.maxLongitude, BALTIC_SEA_BBOX.maxLatitude])
]) as Extent;

describe('clampExtentToBaltic', () => {
	it('gibt den Ostsee-Extent zurück, wenn der Input komplett außerhalb liegt (z. B. Null Island)', () => {
		// [0,0] in EPSG:3857 entspricht Lon/Lat (0,0) — weit westlich der Ostsee-BBox (minLon 9.4°)
		const nullIslandExtent: Extent = [-1000, -1000, 1000, 1000];
		expect(clampExtentToBaltic(nullIslandExtent)).toEqual(BALTIC_EXTENT);
	});

	it('gibt den Ostsee-Extent zurück bei unendlichem Extent (leere reportsSource)', () => {
		expect(clampExtentToBaltic([Infinity, Infinity, -Infinity, -Infinity])).toEqual(BALTIC_EXTENT);
	});

	it('gibt den Ostsee-Extent zurück bei NaN-Werten', () => {
		expect(clampExtentToBaltic([NaN, NaN, NaN, NaN])).toEqual(BALTIC_EXTENT);
	});

	it('verschneidet einen die Ostsee überragenden Extent auf die Ostsee-Grenzen', () => {
		const hugeEuropeExtent: Extent = [...fromLonLat([-20, 30]), ...fromLonLat([40, 70])] as Extent;
		expect(clampExtentToBaltic(hugeEuropeExtent)).toEqual(BALTIC_EXTENT);
	});

	it('lässt einen Extent innerhalb der Ostsee unverändert', () => {
		const kielExtent: Extent = [...fromLonLat([10, 54]), ...fromLonLat([11, 55])] as Extent;
		expect(clampExtentToBaltic(kielExtent)).toEqual(kielExtent);
	});

	it('gibt den Ostsee-Extent zurück bei einem invertierten (leeren) Extent', () => {
		expect(clampExtentToBaltic([10, 10, 5, 5])).toEqual(BALTIC_EXTENT);
	});
});
