/**
 * Wächter über das Initial-Bundle der Einstiegsseite.
 *
 * Rechnet auf dem gebauten Chunk-Graphen (`npm run build`) statt auf dem
 * Quelltext und beantwortet drei Fragen:
 *
 *  1. Liegt die OpenLayers-Laufzeit hinter einer dynamischen Kante?
 *  2. Wie viel teilt sich die statische Hülle mit der Karten-Laufzeit?
 *  3. Wie schwer ist die statische Hülle insgesamt?
 *
 * Die drei greifen gestaffelt: (1) fängt den direkten Rückfall in
 * `OLMap.svelte`, (2) den Umweg über eine andere Datei, (3) Zuwachs jeder
 * anderen Art. Warum es (2) braucht, obwohl (3) existiert, steht bei
 * `OL_SHARED_BUDGET_BYTES` — mit den gemessenen Zahlen.
 *
 * WARUM NICHT IN `test:quick`
 *
 * Die Prüfung braucht ein `manifest.json`, das erst `vite build` erzeugt — ein
 * Build kostet rund zehn Sekunden und gehört nicht in ein Gate, das in siebzig
 * Sekunden durchlaufen soll. Sie hängt deshalb in CI hinter dem Build-Schritt
 * des `Validate`-Jobs.
 *
 * Fehlt das Manifest, bricht dieses Skript ab, statt die Prüfung zu
 * überspringen. Ein Wächter, der sich bei fehlender Eingabe still grün meldet,
 * ist schlimmer als keiner: Er sieht nach Abdeckung aus und liefert keine.
 *
 * Die reine Graph-Rechnung steht in `entryBundleClosure.ts` und ist an
 * konstruierten Manifesten getestet (`entryBundleClosure.test.ts`, läuft in
 * `test:quick`).
 */
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	eagerClosure,
	findKeyForSource,
	fullClosure,
	type ViteManifest
} from './entryBundleClosure.ts';

const CLIENT_OUT = '.svelte-kit/output/client';
const MANIFEST = join(CLIENT_OUT, '.vite/manifest.json');
const NODES_DIR = '.svelte-kit/generated/client-optimized/nodes';

/** Einstieg in die Karten-Laufzeit; alles Schwere hängt hier dran. */
const OL_ENTRY_SOURCE = 'src/lib/utils/map/openLayersHelpers.ts';

/**
 * Obergrenze für die Chunks, die sich die statische Hülle mit der
 * Karten-Laufzeit **teilt**.
 *
 * WAS HIER GEMESSEN WIRD — und was nicht
 *
 * Das ist NICHT „so viele Bytes OpenLayers liegen eager herum". Das Manifest
 * sagt nicht, welches Modul in welchem Chunk steckt; gemessen wird die
 * Schnittmenge zweier Hüllen. Darin stecken deshalb auch harmlose
 * App-Chunks, die `openLayersHelpers` seinerseits importiert — Logger,
 * Karten-Tokens, übersetzte Meldungen. Wer die 21 KB unten für reines
 * OpenLayers hält, sucht anschließend an der falschen Stelle.
 *
 * Nützlich ist die Zahl trotzdem, und zwar als **empfindlicher Indikator**:
 * Ihr Grundwert ist stabil — solange die Bundling-Strategie selbst stabil
 * bleibt, siehe die Anhebung vom 2026-09-18 unten. Jede neue statische
 * `ol`-Kante hebt ihn dagegen deutlich. Gemessen am 2026-08-20, beide Male
 * mit `npm run build`:
 *
 * | Stand                                            | Schnittmenge | Hülle gzip |
 * | ------------------------------------------------ | ------------ | ---------- |
 * | aufgeteilt (Soll)                                | 21.253 B     | 321.968 B  |
 * | mit `import … from '$lib/map/extentUtils'`       | 31.185 B     | 326.140 B  |
 *
 * Der Rückfall kostet hier also 9,9 KB — am Gesamtgewicht dagegen nur 4,2 KB
 * gzip, und die gingen im Budget weiter unten unter. **Diese Prüfung ist der
 * Grund, warum der Umweg über eine andere Datei auffällt**, nicht das
 * Gesamtbudget.
 *
 * ANHEBUNG 2026-09-18 (svelte 5.56.10 → 5.57.0, vite-Bump, PR #928)
 *
 * Derselbe Vergleich vor/nach dem Bump, wieder mit `npm run build`:
 *
 * | Stand                     | Schnittmenge | Hülle gzip |
 * | ------------------------- | ------------ | ---------- |
 * | vor dem Bump              | 21.253 B     | 316,0 KB   |
 * | nach dem Bump             | 108.930 B    | 316,5 KB   |
 *
 * Der Sprung ist real, aber kein Rückfall der hier gesuchten Art: Die
 * Gesamt-Hülle bleibt praktisch unverändert (+0,5 KB gzip), und der neue,
 * mit der Karten-Laufzeit geteilte Chunk (88.805 B roh) enthält nachweislich
 * ausschließlich `svelte/internal/client` — geprüft per String-Suche nach
 * `createEventDispatcher`, `onMount`, `beforeUpdate` etc., keine Treffer für
 * `Projection`, `GeoJSON`, `proj4` oder sonst etwas OpenLayers-Spezifisches.
 * Vorher lag derselbe Svelte-Runtime-Code offenbar dupliziert in mehreren
 * kleineren, jeweils für sich nicht auffälligen Chunks; die neue
 * Bundler-Version (Rolldown-basiertes Vite) konsolidiert ihn in einen
 * einzigen, echt geteilten Chunk — weniger Duplikation insgesamt, aber ein
 * größerer Schnittmengen-Wert für genau diese Prüfung.
 *
 * Die Grenze liegt weiterhin knapp über dem gemessenen Sollwert: genug
 * Puffer für normales Wachstum an den geteilten App-Chunks, aber ein
 * erneuter Rückfall vom dokumentierten Ausmaß (+9,9 KB) schlägt weiterhin an.
 */
const OL_SHARED_BUDGET_BYTES = 113_000;

/**
 * Obergrenze für die statische Hülle insgesamt, gzip.
 *
 * Stand 2026-08-20: 321.968 B. Der Puffer von rund 18 KB trägt normales
 * Wachstum; die gesamte Karten-Laufzeit zurückzuholen wären rund 90 KB gzip und
 * schlüge sofort durch.
 *
 * Diese Grenze ist bewusst der **grobe** Rückhalt gegen Zuwachs jeder Art. Den
 * schleichenden Fall — eine einzelne `ol`-Kante über einen Umweg, gemessen
 * 4,2 KB gzip — fängt sie NICHT; dafür ist `OL_SHARED_BUDGET_BYTES` da.
 *
 * **Die Grenze ist die Zusage, nicht die Stellschraube.** Wer sie anhebt, trifft
 * eine Entscheidung über die Ladezeit auf Mobilfunk — das Formular wird an Deck
 * und am Strand ausgefüllt. Anheben also mit Begründung im Commit, nicht im
 * Vorbeigehen.
 */
const EAGER_GZIP_BUDGET_BYTES = 340_000;

function fail(message: string): never {
	console.error(`\n❌ ${message}\n`);
	process.exit(1);
}

function loadManifest(): ViteManifest {
	if (!existsSync(MANIFEST)) {
		fail(
			`Kein Client-Manifest unter ${MANIFEST}.\n` +
				`   Diese Prüfung setzt einen Build voraus: npm run build`
		);
	}
	return JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest;
}

/**
 * Der generierte Node zur Route `/`.
 *
 * Die Nummerierung unter `nodes/` hängt an der Routen-Reihenfolge und
 * verschiebt sich, sobald jemand eine Route anlegt. Deshalb wird nach dem
 * re-exportierten Quellpfad gesucht statt eine Nummer festzuschreiben — sonst
 * prüfte der Wächter irgendwann still die falsche Seite.
 */
function findHomeNodeKey(): string {
	if (!existsSync(NODES_DIR)) {
		fail(`Kein generiertes Node-Verzeichnis unter ${NODES_DIR}. Erst bauen: npm run build`);
	}

	const treffer: string[] = [];
	for (const datei of readdirSync(NODES_DIR)) {
		if (!datei.endsWith('.js')) continue;
		const inhalt = readFileSync(join(NODES_DIR, datei), 'utf8');
		// Exakt die Wurzelseite — `admin/+page.svelte` darf nicht mitgehen.
		if (/from\s+"(?:\.\.\/)+src\/routes\/\+page\.svelte"/.test(inhalt)) {
			treffer.push(`${NODES_DIR}/${datei}`);
		}
	}

	if (treffer.length !== 1) {
		fail(
			`Erwartet genau einen Node für die Route \`/\`, gefunden: ${treffer.length}` +
				(treffer.length > 0 ? `\n   ${treffer.join('\n   ')}` : '')
		);
	}
	return treffer[0] as string;
}

function findClientEntryKey(manifest: ViteManifest): string {
	const treffer = Object.keys(manifest).filter((key) =>
		key.includes('@sveltejs/kit/src/runtime/client/entry.js')
	);
	if (treffer.length !== 1) {
		fail(`Erwartet genau einen Client-Entry im Manifest, gefunden: ${treffer.length}`);
	}
	return treffer[0] as string;
}

interface Groesse {
	raw: number;
	gzip: number;
}

function measure(manifest: ViteManifest, keys: Iterable<string>): Groesse {
	let raw = 0;
	let gzip = 0;
	for (const key of keys) {
		const entry = manifest[key];
		if (entry === undefined) continue;
		const pfad = join(CLIENT_OUT, entry.file);
		if (!existsSync(pfad)) continue;
		const buf = readFileSync(pfad);
		raw += buf.length;
		gzip += gzipSync(buf).length;
	}
	return { raw, gzip };
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;

function main(): void {
	const manifest = loadManifest();

	const roots = [
		findHomeNodeKey(),
		`${NODES_DIR}/0.js`, // Root-Layout
		findClientEntryKey(manifest)
	];

	const eager = eagerClosure(manifest, roots);
	const eagerGroesse = measure(manifest, eager);

	console.log('Statische Hülle der Einstiegsseite `/`');
	console.log(`  Wurzeln:  ${roots.length} (Route-Node, Root-Layout, Client-Entry)`);
	console.log(`  Chunks:   ${eager.size}`);
	console.log(`  Größe:    ${kb(eagerGroesse.raw)} roh / ${kb(eagerGroesse.gzip)} gzip`);
	console.log(`  Budget:   ${kb(EAGER_GZIP_BUDGET_BYTES)} gzip`);

	const fehler: string[] = [];

	// --- 1. Die Karten-Laufzeit muss hinter einer dynamischen Kante liegen ----
	const olKey = findKeyForSource(manifest, OL_ENTRY_SOURCE);
	if (olKey === null) {
		fehler.push(
			`\`${OL_ENTRY_SOURCE}\` taucht im Manifest nicht als eigener Chunk auf.\n` +
				`     Das heißt in aller Regel: Es wird nirgends mehr dynamisch importiert,\n` +
				`     sondern ist in einen anderen Chunk eingeschmolzen — genau der Rückfall,\n` +
				`     den diese Prüfung verhindern soll (siehe OLMap.svelte).`
		);
	} else if (eager.has(olKey)) {
		fehler.push(
			`Die OpenLayers-Laufzeit liegt in der statischen Hülle der Einstiegsseite.\n` +
				`     Chunk: ${manifest[olKey]?.file ?? olKey}\n` +
				`     Erwartet war ein dynamischer Import in \`OLMap.svelte\`.`
		);
	}

	// --- 2. Schnittmenge mit der Karten-Laufzeit ------------------------------
	//
	// Der empfindliche Teil: Er fängt den Umweg, den weder Prüfung 1 noch das
	// Gesamtbudget sieht — jemand importiert `ol` transitiv über eine andere
	// Datei, ohne `OLMap.svelte` anzufassen.
	if (olKey !== null) {
		const olLaufzeit = fullClosure(manifest, [olKey]);
		const geteilt = [...eager].filter((key) => olLaufzeit.has(key));
		const geteiltGroesse = measure(manifest, geteilt);

		console.log(
			`  geteilt mit der Karten-Laufzeit: ${kb(geteiltGroesse.raw)} roh ` +
				`in ${geteilt.length} Chunk(s), Grenze ${kb(OL_SHARED_BUDGET_BYTES)}`
		);

		if (geteiltGroesse.raw > OL_SHARED_BUDGET_BYTES) {
			const liste = geteilt
				.map((key) => `       ${manifest[key]?.file ?? key}`)
				.sort()
				.join('\n');
			fehler.push(
				`Die statische Hülle teilt sich zu viel mit der Karten-Laufzeit: ` +
					`${geteiltGroesse.raw} B > ${OL_SHARED_BUDGET_BYTES} B.\n` +
					`     Beteiligte Chunks:\n${liste}\n` +
					`     Wahrscheinlichster Grund: ein statischer \`ol/...\`-Import über einen\n` +
					`     Umweg — \`$lib/map/extentUtils\` etwa importiert \`ol/proj\`. Suchen also\n` +
					`     nicht nur in \`OLMap.svelte\`, sondern in allem, was die Einstiegsseite\n` +
					`     statisch erreicht.`
			);
		}
	}

	// --- 3. Gesamtgewicht ----------------------------------------------------
	if (eagerGroesse.gzip > EAGER_GZIP_BUDGET_BYTES) {
		fehler.push(
			`Die statische Hülle überschreitet das Budget: ` +
				`${eagerGroesse.gzip} B gzip > ${EAGER_GZIP_BUDGET_BYTES} B.\n` +
				`     Das Budget ist die Zusage, nicht die Stellschraube — vor dem Anheben\n` +
				`     prüfen, was dazugekommen ist und ob es eager sein muss.`
		);
	}

	if (fehler.length > 0) {
		console.error('');
		for (const [i, f] of fehler.entries()) {
			console.error(`❌ ${i + 1}. ${f}`);
		}
		console.error('');
		process.exit(1);
	}

	console.log('\n✅ Initial-Bundle der Einstiegsseite in Ordnung.');
}

main();
