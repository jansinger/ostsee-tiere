import { describe, expect, it } from 'vitest';
import extent from '#lib/server/geo/baltic-extent.json';
import rbushIndex from '#lib/server/geo/rbush-index.json';
import { BALTIC_SEA_BBOX, isInBalticArea } from './checkBalticSea';

/**
 * Sichert die beiden Zusagen an `BALTIC_SEA_BBOX` ab:
 *
 * 1. Die Konstante ist aus der Geometrie **abgeleitet**, nicht von Hand gepflegt.
 * 2. Das Polygon liegt vollständig **innerhalb** der Box — die Invariante, an der
 *    die alte, handgepflegte Box gescheitert ist.
 *
 * Hintergrund: `docs/archive/OSTSEE_GEOMETRIE_SPEC_2026-07-30.md`
 */

describe('BALTIC_SEA_BBOX ist aus der Geometrie abgeleitet', () => {
	// Die Rundungsregel wird hier NICHT nachgebaut. Sie steht ausschliesslich in
	// build-baltic-geometry.sh, das die gerundeten Kanten mit in
	// baltic-extent.json schreibt. Eine Kopie hier wuerde nur pruefen, dass zwei
	// Implementierungen derselben Regel uebereinstimmen — nicht, dass die
	// Konstante zur Geometrie passt.
	it('entspricht der gerundeten Box aus der Generator-Ausgabe', () => {
		expect(BALTIC_SEA_BBOX).toEqual({
			minLongitude: extent.boxMinLongitude,
			maxLongitude: extent.boxMaxLongitude,
			minLatitude: extent.boxMinLatitude,
			maxLatitude: extent.boxMaxLatitude
		});
	});

	it('umschliesst den ungerundeten Extent', () => {
		expect(BALTIC_SEA_BBOX.minLongitude).toBeLessThanOrEqual(extent.minLongitude);
		expect(BALTIC_SEA_BBOX.maxLongitude).toBeGreaterThanOrEqual(extent.maxLongitude);
		expect(BALTIC_SEA_BBOX.minLatitude).toBeLessThanOrEqual(extent.minLatitude);
		expect(BALTIC_SEA_BBOX.maxLatitude).toBeGreaterThanOrEqual(extent.maxLatitude);
	});
});

describe('Invariante: das Polygon liegt vollständig in der Bounding Box', () => {
	it('hält für jeden Stützpunkt der Geometrie', () => {
		const outside: Array<[number, number]> = [];

		const walk = (node: unknown): void => {
			if (Array.isArray(node) && typeof node[0] === 'number' && typeof node[1] === 'number') {
				const [longitude, latitude] = node as [number, number];
				if (!isInBalticArea(longitude, latitude)) outside.push([longitude, latitude]);
				return;
			}
			if (Array.isArray(node)) node.forEach(walk);
		};

		// RBush baut ab einer gewissen Größe einen mehrstufigen Baum: die obersten
		// `children` sind dann Zwischenknoten, nicht die Blätter mit `geometry`.
		// Bei den früheren fünf Features war der Baum flach — deshalb reicht ein
		// Durchlauf über die erste Ebene hier nicht.
		type Node = { children?: Node[]; geometry?: { coordinates: unknown } };
		let leaves = 0;
		const descend = (node: Node): void => {
			if (node.geometry) {
				leaves++;
				walk(node.geometry.coordinates);
				return;
			}
			node.children?.forEach(descend);
		};
		descend(rbushIndex.tree as Node);

		// Absichern, dass der Durchlauf überhaupt Blätter gesehen hat — sonst wäre
		// eine leere `outside`-Liste ein falsches Bestanden.
		expect(leaves).toBe(rbushIndex.itemCount);

		// Erst eine Stichprobe zeigen — bei einem Fehlschlag ist die Liste sonst
		// zu lang, um im Testbericht lesbar zu sein.
		expect(outside.slice(0, 5)).toEqual([]);
		expect(outside).toHaveLength(0);
	});
});
