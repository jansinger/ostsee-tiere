import { describe, expect, it } from 'vitest';
import {
	eagerClosure,
	findKeyForSource,
	fullClosure,
	isDynamicOnly,
	type ViteManifest
} from './entryBundleClosure';

/**
 * Geprüft wird die Rechnung an **konstruierten** Manifesten, nicht am gebauten
 * Bestand.
 *
 * Der Grund steht in `entryBundleClosure.ts`: Ein Wächter, der nur gegen einen
 * konformen Ist-Zustand läuft, ist auch dann grün, wenn er gar nichts findet.
 * Genau diese Lücke hatte die erste Fassung des OpenLayers-Wächters — sie las
 * die Importzeilen von `OLMap.svelte` und hätte einen Umweg über eine andere
 * Datei nie bemerkt.
 *
 * Die Fälle unten bilden deshalb beide Richtungen ab: die erlaubte Aufteilung
 * UND den Rückfall, den der Wächter fangen soll.
 */

/**
 * Nachbau der realen Lage nach dem Umbau:
 *
 * - `node5` (Einstiegsseite) importiert statisch `shared` und die Komponente.
 * - Die Komponente lädt `olHelpers` **dynamisch** nach.
 * - `olHelpers` zieht die schwere Laufzeit `olRuntime` hinter sich her.
 * - `olCoordinate` hängt an beiden Seiten: `shared` braucht es für
 *   `formatLocation`, die Laufzeit ohnehin. Es bleibt damit eager — das ist
 *   erwartet und kein Verstoß.
 */
const AUFGETEILT: ViteManifest = {
	'nodes/5.js': { file: 'nodes/5.hash.js', imports: ['_shared.js', '_olmap.js'] },
	'_shared.js': { file: 'chunks/shared.hash.js', imports: ['_olCoordinate.js'] },
	'_olmap.js': { file: 'chunks/olmap.hash.js', dynamicImports: ['src/lib/utils/map/olHelpers.ts'] },
	'src/lib/utils/map/olHelpers.ts': {
		file: 'chunks/olHelpers.hash.js',
		src: 'src/lib/utils/map/olHelpers.ts',
		isDynamicEntry: true,
		imports: ['_olRuntime.js', '_olCoordinate.js']
	},
	'_olRuntime.js': { file: 'chunks/olRuntime.hash.js', imports: ['_olCoordinate.js'] },
	'_olCoordinate.js': { file: 'chunks/olCoordinate.hash.js' }
};

const WURZELN = ['nodes/5.js'];

describe('eagerClosure — folgt statischen Kanten, nicht dynamischen', () => {
	it('nimmt die statisch erreichbaren Chunks auf', () => {
		const hülle = eagerClosure(AUFGETEILT, WURZELN);

		expect([...hülle].sort()).toEqual(
			['_olCoordinate.js', '_olmap.js', '_shared.js', 'nodes/5.js'].sort()
		);
	});

	it('lässt die dynamisch nachgeladene Karten-Laufzeit draußen', () => {
		const hülle = eagerClosure(AUFGETEILT, WURZELN);

		expect(hülle.has('src/lib/utils/map/olHelpers.ts')).toBe(false);
		expect(hülle.has('_olRuntime.js')).toBe(false);
	});

	/**
	 * Der geteilte Chunk ist der Fall, der bei der Messung am meisten Zeit
	 * gekostet hat: `ol/coordinate` bleibt eager, weil `formatLocation` es
	 * synchron braucht — die schwere Laufzeit daneben ist trotzdem lazy. Wer das
	 * für einen übersehenen Rest hält, baut `formatLocation` unnötig um.
	 */
	it('behält einen Chunk, den eager und lazy gemeinsam nutzen', () => {
		expect(eagerClosure(AUFGETEILT, WURZELN).has('_olCoordinate.js')).toBe(true);
	});
});

describe('fullClosure — folgt zusätzlich dynamischen Kanten', () => {
	it('nimmt die Karten-Laufzeit mit auf', () => {
		const hülle = fullClosure(AUFGETEILT, WURZELN);

		expect(hülle.has('src/lib/utils/map/olHelpers.ts')).toBe(true);
		expect(hülle.has('_olRuntime.js')).toBe(true);
	});
});

describe('isDynamicOnly — die Frage, die der Wächter stellt', () => {
	it('meldet die nachgeladene Karten-Laufzeit als dynamisch', () => {
		expect(isDynamicOnly(AUFGETEILT, WURZELN, 'src/lib/utils/map/olHelpers.ts')).toBe(true);
	});

	it('meldet einen eager eingebundenen Chunk als nicht dynamisch', () => {
		expect(isDynamicOnly(AUFGETEILT, WURZELN, '_shared.js')).toBe(false);
	});

	/**
	 * DER RÜCKFALL, UM DEN ES GEHT — und der Fall, den die alte Quelltext-Prüfung
	 * nicht sehen konnte.
	 *
	 * Niemand fasst `OLMap.svelte` an. Stattdessen importiert ein anderer Chunk
	 * der Einstiegsseite (hier `_shared.js`) etwas, das seinerseits statisch an
	 * der Karten-Laufzeit hängt — im echten Baum wäre das `#lib/map/extentUtils.js`
	 * mit seinem `import { fromLonLat } from 'ol/proj'`. Die Laufzeit ist damit
	 * wieder eager, und keine `ol`-Zeile steht in `OLMap.svelte`.
	 */
	it('fällt auf, wenn die Laufzeit über einen Umweg wieder eager wird', () => {
		const rückfall: ViteManifest = {
			...AUFGETEILT,
			'_shared.js': {
				file: 'chunks/shared.hash.js',
				imports: ['_olCoordinate.js', '_olRuntime.js']
			}
		};

		expect(eagerClosure(rückfall, WURZELN).has('_olRuntime.js')).toBe(true);
		expect(isDynamicOnly(rückfall, WURZELN, '_olRuntime.js')).toBe(false);
	});

	it('meldet einen gar nicht erreichbaren Chunk nicht als dynamisch', () => {
		expect(isDynamicOnly(AUFGETEILT, WURZELN, '_gibtEsNicht.js')).toBe(false);
	});
});

describe('Robustheit der Rechnung', () => {
	it('bricht bei einem Zyklus nicht ab', () => {
		const zyklus: ViteManifest = {
			a: { file: 'a.js', imports: ['b'] },
			b: { file: 'b.js', imports: ['a'] }
		};

		expect([...eagerClosure(zyklus, ['a'])].sort()).toEqual(['a', 'b']);
	});

	it('überspringt Verweise auf fehlende Einträge', () => {
		const lücke: ViteManifest = { a: { file: 'a.js', imports: ['fehlt'] } };

		expect([...eagerClosure(lücke, ['a'])]).toEqual(['a']);
	});
});

describe('findKeyForSource', () => {
	it('findet einen Eintrag, der direkt unter dem Quellpfad steht', () => {
		expect(findKeyForSource(AUFGETEILT, 'src/lib/utils/map/olHelpers.ts')).toBe(
			'src/lib/utils/map/olHelpers.ts'
		);
	});

	it('findet einen Eintrag über sein src-Feld', () => {
		const überSrc: ViteManifest = {
			'_hash.js': { file: 'chunks/hash.js', src: 'src/lib/irgendwas.ts' }
		};

		expect(findKeyForSource(überSrc, 'src/lib/irgendwas.ts')).toBe('_hash.js');
	});

	it('meldet null, wenn es den Quellpfad nicht gibt', () => {
		expect(findKeyForSource(AUFGETEILT, 'src/lib/gibtEsNicht.ts')).toBeNull();
	});
});
