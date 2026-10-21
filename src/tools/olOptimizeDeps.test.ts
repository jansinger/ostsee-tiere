import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OL_OPTIMIZE_DEPS } from './olOptimizeDeps';

/**
 * Hält `OL_OPTIMIZE_DEPS` mit den tatsächlichen Importen von
 * `openLayersHelpers.ts` zusammen.
 *
 * Der Fehlermodus ohne diesen Test ist besonders unangenehm: Wer dort einen
 * `ol/...`-Import ergänzt, ohne die Liste zu pflegen, bekommt lokal grüne Tests
 * (der Dep-Cache in `node_modules/.vite` enthält den Pfad nach dem ersten Lauf)
 * und in CI ein `effect_orphan` in einer ganz anderen Komponente. Die Ursache
 * steht dann nirgends im Fehlerbild.
 *
 * Geprüft wird nur die Richtung, die wehtut: Jeder **Wert**-Import muss in der
 * Liste stehen. Umgekehrt darf die Liste mehr enthalten — ein zusätzlicher
 * Eintrag kostet nur etwas Bündelzeit und bricht nichts.
 */

const HELPERS = fileURLToPath(new URL('../lib/utils/map/openLayersHelpers.ts', import.meta.url));

/**
 * Alle `ol/...`-Spezifizierer, die als **Wert** importiert werden.
 *
 * `import type ...` fällt raus: Solche Zeilen verschwinden beim Kompilieren und
 * erreichen den Dependency-Scanner nie.
 */
function olValueImports(source: string): string[] {
	const treffer = new Set<string>();
	const muster = /^[ \t]*import\s+(?!type\s)([\s\S]*?)\s+from\s+['"](ol(?:\/[^'"]+)?)['"]/gm;

	for (const match of source.matchAll(muster)) {
		const klausel = match[1] ?? '';
		const spezifizierer = match[2];
		// `import { type X } from 'ol/...'` ist ebenfalls reiner Typ-Import.
		const nurTypen =
			klausel.trim().startsWith('{') &&
			klausel
				.replace(/[{}]/g, '')
				.split(',')
				.filter((teil) => teil.trim() !== '')
				.every((teil) => teil.trim().startsWith('type '));
		if (spezifizierer !== undefined && !nurTypen) treffer.add(spezifizierer);
	}
	return [...treffer].sort();
}

describe('OL_OPTIMIZE_DEPS deckt die Importe von openLayersHelpers ab', () => {
	it('enthält jeden ol-Wert-Import der Datei', () => {
		const gefunden = olValueImports(readFileSync(HELPERS, 'utf8'));
		const fehlend = gefunden.filter((pfad) => !OL_OPTIMIZE_DEPS.includes(pfad as never));

		expect(
			fehlend,
			`Diese ol-Unterpfade fehlen in OL_OPTIMIZE_DEPS (src/tools/olOptimizeDeps.ts).\n` +
				`Ohne sie optimiert Vite mitten im Browser-Testlauf nach und die Svelte-Laufzeit\n` +
				`existiert doppelt — sichtbar als \`effect_orphan\` in fremden Komponenten,\n` +
				`und zwar nur bei kaltem Cache (also in CI, nicht lokal):\n  ${fehlend.join('\n  ')}`
		).toEqual([]);
	});

	it('findet überhaupt Importe — sonst prüft der Abgleich oben nichts', () => {
		expect(olValueImports(readFileSync(HELPERS, 'utf8')).length).toBeGreaterThan(5);
	});

	/**
	 * Gegenprobe an einem konstruierten Beispiel: Der Erkenner muss Wert-Importe
	 * finden UND Typ-Importe durchlassen. Ohne sie wäre das Grün oben auch dann
	 * zu haben, wenn das Muster gar nichts mehr trifft.
	 */
	it('trennt Wert- von Typ-Importen', () => {
		const beispiel = [
			"import OLMap from 'ol/Map';",
			"import { fromLonLat, toLonLat } from 'ol/proj';",
			"import type { Coordinate } from 'ol/coordinate';",
			"import { type Map } from 'ol';",
			"import { createLogger } from '#lib/logger';"
		].join('\n');

		expect(olValueImports(beispiel)).toEqual(['ol/Map', 'ol/proj']);
	});
});
