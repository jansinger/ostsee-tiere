import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * WARUM ES DIESEN TEST GIBT
 *
 * `OLMap.svelte` hängt über `LocationInput` an der Einstiegsseite
 * (`src/routes/+page.svelte`). Solange die Komponente OpenLayers statisch
 * importiert — `#lib/utils/map/openLayersHelpers` und `ol/proj` —, liegt die
 * gesamte Bibliothek (~276 KB roh / ~80 KB gzip) im Initial-Bundle, und zwar
 * auch für Melder, die die Karte nie berühren. Das Formular wird an Deck und am
 * Strand ausgefüllt, oft über Mobilfunk; dieses Gewicht ist dort real spürbar.
 *
 * Die Wert-Importe stehen deshalb im Init-`$effect` hinter `await import(...)`.
 * Ein statischer Import zurückzuholen ist ein Einzeiler, sieht harmlos aus und
 * macht die Aufteilung sofort wieder zunichte — ohne dass irgendetwas bricht
 * oder auffällt. Genau deshalb steht hier ein Wächter über dem Quelltext: Der
 * Fehlermodus ist eine stille Verschlechterung, kein Fehler.
 *
 * Der Test ist also KEIN sinnloser Textabgleich — aber er ist auch nicht der
 * Beleg für die Bundle-Zusage, und das ist wichtig zu wissen:
 *
 * **Er sieht nur die direkten Importe DIESER Datei.** Wer OpenLayers über einen
 * Umweg zurückholt — ein `import … from '#lib/map/extentUtils'` etwa, das
 * seinerseits `ol/proj` statisch importiert —, kommt an ihm vorbei. Nachgemessen
 * am 2026-08-20: In genau diesem Fall bleibt dieser Test grün, während die
 * Karten-Laufzeit wieder eager in der Einstiegsseite liegt.
 *
 * Den Fall fängt `src/tools/checkEntryBundle.ts`, das nach dem Build auf dem
 * echten Chunk-Graphen rechnet (in CI hinter `npm run build`). Dieser Test hier
 * ist die schnelle Vorwarnung in `test:quick`: Er braucht keinen Build und nennt
 * den wahrscheinlichsten Rückfall beim Namen, bevor die Pipeline überhaupt
 * anläuft.
 *
 * Ausdrücklich erlaubt bleiben `import type`-Zeilen: Sie werden beim Kompilieren
 * restlos entfernt und tragen kein Byte ins Bundle.
 */

const SOURCE_PATH = fileURLToPath(new URL('./OLMap.svelte', import.meta.url));
const source = readFileSync(SOURCE_PATH, 'utf8');

/** Modul-Spezifizierer, die OpenLayers-Laufzeitcode nach sich ziehen. */
function isOpenLayersModule(specifier: string): boolean {
	return (
		specifier === 'ol' || specifier.startsWith('ol/') || specifier.includes('openLayersHelpers')
	);
}

/**
 * Alle statischen Import-Anweisungen der Datei — samt der Information, ob es
 * ein reiner Typ-Import ist (`import type …` bzw. `import { type X }`).
 */
type StaticImport = { statement: string; specifier: string; isTypeOnly: boolean };

/**
 * Reiner Typ-Import? Beide Schreibweisen zählen:
 *
 *     import type { Map } from 'ol';        // Klausel beginnt mit `type`
 *     import { type Map } from 'ol';        // jede Benennung trägt `type`
 *
 * Ein gemischter Import (`import { type Map, createMap }`) ist ausdrücklich
 * KEIN Typ-Import — er zieht Laufzeitcode nach sich und muss auffallen.
 */
function istNurTyp(clause: string): boolean {
	const getrimmt = clause.trim();
	if (/^type\s/.test(getrimmt)) return true;
	if (!getrimmt.startsWith('{') || !getrimmt.endsWith('}')) return false;

	const benennungen = getrimmt
		.slice(1, -1)
		.split(',')
		.map((teil) => teil.trim())
		.filter((teil) => teil !== '');

	return benennungen.length > 0 && benennungen.every((teil) => /^type\s/.test(teil));
}

function staticImports(code: string): StaticImport[] {
	const pattern = /^[ \t]*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"];?/gm;
	const found: StaticImport[] = [];
	for (const match of code.matchAll(pattern)) {
		const clause = match[1] ?? '';
		found.push({
			statement: match[0].trim(),
			specifier: match[2] ?? '',
			isTypeOnly: istNurTyp(clause)
		});
	}
	return found;
}

describe('OLMap.svelte — OpenLayers wird nachgeladen, nicht statisch importiert', () => {
	it('enthält keinen statischen Wert-Import von OpenLayers oder den OL-Helpers', () => {
		const verstoesse = staticImports(source)
			.filter((entry) => isOpenLayersModule(entry.specifier) && !entry.isTypeOnly)
			.map((entry) => entry.statement);

		expect(
			verstoesse,
			`Statische OpenLayers-Wert-Importe in OLMap.svelte gefunden — sie ziehen die ` +
				`Bibliothek zurück ins Initial-Bundle der Einstiegsseite:\n${verstoesse.join('\n')}`
		).toEqual([]);
	});

	it('lädt die OL-Helfer und ol/proj über dynamische Importe', () => {
		const dynamische = [...source.matchAll(/await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
			(match) => match[1] ?? ''
		);

		expect(dynamische.some((specifier) => specifier.includes('openLayersHelpers'))).toBe(true);
		expect(dynamische.some((specifier) => specifier === 'ol/proj')).toBe(true);
	});

	/**
	 * Gegenprobe: Ohne sie wäre das Grün oben auch dann zu haben, wenn der
	 * Erkenner gar nichts findet — etwa weil sich die Import-Schreibweise
	 * geändert hat. Typ-Importe müssen weiterhin erkannt UND durchgelassen
	 * werden.
	 */
	it('erkennt statische OL-Importe überhaupt und lässt Typ-Importe durch', () => {
		const beispiel = [
			"import { fromLonLat } from 'ol/proj';",
			"import { createMap } from '#lib/utils/map/openLayersHelpers.ts';",
			"import type { Map } from 'ol';",
			"import type { Coordinate } from 'ol/coordinate';",
			// Inline-Schreibweise: ebenfalls reiner Typ-Import.
			"import { type Point } from 'ol/geom';",
			// Gemischt: zieht Laufzeitcode nach sich, zählt deshalb als Wert-Import.
			"import { type View, Map as OLMap } from 'ol/Map';",
			"import * as m from '#lib/paraglide/messages.js';"
		].join('\n');

		const werteImporte = staticImports(beispiel).filter(
			(entry) => isOpenLayersModule(entry.specifier) && !entry.isTypeOnly
		);
		const typImporte = staticImports(beispiel).filter((entry) => entry.isTypeOnly);

		expect(werteImporte.map((entry) => entry.specifier)).toEqual([
			'ol/proj',
			'#lib/utils/map/openLayersHelpers.ts',
			'ol/Map'
		]);
		expect(typImporte.map((entry) => entry.specifier)).toEqual(['ol', 'ol/coordinate', 'ol/geom']);
	});

	/**
	 * Die Typ-Importe der Komponente bleiben ausdrücklich stehen — dieser Test
	 * hält fest, dass sie kein Kollateralschaden des Umbaus werden.
	 */
	it('behält die Typ-Importe aus OpenLayers', () => {
		const typSpezifizierer = staticImports(source)
			.filter((entry) => entry.isTypeOnly)
			.map((entry) => entry.specifier);

		expect(typSpezifizierer).toContain('ol');
		expect(typSpezifizierer).toContain('ol/coordinate');
	});
});
