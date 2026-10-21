/**
 * Graph-Rechnung über das Vite-Client-Manifest.
 *
 * WOZU
 *
 * `OLMap.svelte` lädt OpenLayers per `await import(...)` nach, damit die
 * Bibliothek nicht im Initial-Bundle der Einstiegsseite liegt. Diese Zusage
 * lässt sich am Quelltext nur ungefähr prüfen: Ein Wächter, der die Importzeilen
 * einer einzelnen Datei liest, sieht nicht, wenn OpenLayers über einen Umweg
 * zurückkommt — `#lib/map/extentUtils` etwa importiert `ol/proj` statisch, und
 * ein solcher Import in irgendeiner Komponente der Einstiegsseite macht die
 * Aufteilung zunichte, ohne dass eine einzige `ol`-Zeile in `OLMap.svelte`
 * auftauchte.
 *
 * Die Funktionen hier rechnen deshalb auf dem, was tatsächlich ausgeliefert
 * wird: dem Chunk-Graphen aus `.svelte-kit/output/client/.vite/manifest.json`.
 *
 * Bewusst ohne Dateizugriff — die Rechnung ist damit an konstruierten Manifesten
 * prüfbar (`entryBundleClosure.test.ts`). Ein Wächter, der nur gegen den
 * konformen Ist-Zustand läuft, belegt über die Regel selbst nichts; genau daran
 * ist die Vorgänger-Fassung gescheitert.
 */

/** Ein Eintrag aus `manifest.json`, auf die hier benutzten Felder verkürzt. */
export interface ManifestEntry {
	file: string;
	src?: string;
	imports?: string[];
	dynamicImports?: string[];
	isEntry?: boolean;
	isDynamicEntry?: boolean;
}

export type ViteManifest = Record<string, ManifestEntry>;

/**
 * Die **statische** Hülle: alles, was der Browser laden muss, bevor die Seite
 * läuft.
 *
 * Folgt ausschließlich `imports`. `dynamicImports` werden absichtlich NICHT
 * verfolgt — genau sie sind die Grenze, um die es geht. Würde die Rechnung sie
 * mitnehmen, wäre jede Aufteilung unsichtbar und der Wächter wertlos.
 *
 * Unbekannte Schlüssel werden übersprungen statt zu werfen: Ein Manifest kann
 * auf Einträge zeigen, die nicht als eigener Chunk auftauchen.
 */
export function eagerClosure(manifest: ViteManifest, roots: readonly string[]): Set<string> {
	return closure(manifest, roots, false);
}

/**
 * Die **vollständige** Hülle: statisch plus dynamisch erreichbar.
 *
 * Gebraucht, um die Menge „gehört zur Karten-Laufzeit" zu bestimmen, ohne sie
 * von Hand aufzuzählen.
 */
export function fullClosure(manifest: ViteManifest, roots: readonly string[]): Set<string> {
	return closure(manifest, roots, true);
}

function closure(
	manifest: ViteManifest,
	roots: readonly string[],
	followDynamic: boolean
): Set<string> {
	const seen = new Set<string>();
	const stack = [...roots];

	while (stack.length > 0) {
		const key = stack.pop();
		if (key === undefined || seen.has(key)) continue;

		const entry = manifest[key];
		if (entry === undefined) continue;

		seen.add(key);
		for (const dep of entry.imports ?? []) stack.push(dep);
		if (followDynamic) {
			for (const dep of entry.dynamicImports ?? []) stack.push(dep);
		}
	}

	return seen;
}

/**
 * Findet den Manifest-Schlüssel zu einem Quellpfad.
 *
 * Vite schlüsselt Entry- und Dynamic-Entry-Chunks nach ihrem Quellmodul; geteilte
 * Chunks tragen dagegen nur einen Hash-Namen. Gesucht wird deshalb über den
 * Schlüssel selbst **und** über `src` — je nach Chunk-Art steht der Pfad mal an
 * der einen, mal an der anderen Stelle.
 */
export function findKeyForSource(manifest: ViteManifest, sourcePath: string): string | null {
	if (manifest[sourcePath] !== undefined) return sourcePath;

	for (const [key, entry] of Object.entries(manifest)) {
		if (entry.src === sourcePath) return key;
	}
	return null;
}

/**
 * Ist `key` von einer der Wurzeln aus **ausschließlich** dynamisch erreichbar?
 *
 * Das ist die Frage, die der Wächter stellt: Die Karten-Laufzeit darf im
 * Chunk-Graphen der Einstiegsseite vorkommen — aber nur hinter einer dynamischen
 * Kante.
 */
export function isDynamicOnly(
	manifest: ViteManifest,
	roots: readonly string[],
	key: string
): boolean {
	return fullClosure(manifest, roots).has(key) && !eagerClosure(manifest, roots).has(key);
}
