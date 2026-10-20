/**
 * Generates frozen antworten.json files for the legacy inbox.
 *
 * The inbox does not reproduce the 13 formOptions enums inline — it receives
 * the result once, generated here. The drift test in
 * src/routes/rest_sichtungen/antworten.json/frozen.test.ts keeps both versions
 * in sync.
 *
 * Invoked via: npm run generate:antworten
 *
 * The npm script sets `TEST=true` before the vite-node call. This is not a
 * test flag in the usual sense, but rather disables a guard in @sveltejs/kit's
 * Vite plugin: the guard checks whether client-side code accidentally pulls in
 * server-side code when importing `#lib/server/*` modules, and traces the
 * import graph back to a known entry point. Outside of `vite dev`/`vite build`
 * — as here when loading via vite-node — this graph does not exist, and the
 * guard fails with "An impossible situation occurred." `TEST=true` is the
 * escape valve the plugin itself provides (the same condition Vitest uses for
 * server route tests like frozen.test.ts). It must be set before process
 * startup — a `process.env.TEST = 'true'` in this module would be too late
 * because vite-node loads the imported module graph (including +server.js) via
 * ESM hoisting before the first line of this file executes.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GET } from '../routes/rest_sichtungen/antworten.json/+server.js';

const TARGET_DIR = path.resolve('legacy-inbox/data');

async function fetchOptions(routePath) {
	const response = await GET({
		url: new URL(`https://localhost${routePath}`),
		getClientAddress: () => '127.0.0.1',
		request: new Request(`https://localhost${routePath}`)
	});
	return response.json();
}

const german = await fetchOptions('/rest_sichtungen/antworten.json');
const english = await fetchOptions('/en/rest_sichtungen/antworten.json');

await writeFile(
	path.join(TARGET_DIR, 'antworten.de.json'),
	JSON.stringify(german, null, '\t') + '\n'
);
await writeFile(
	path.join(TARGET_DIR, 'antworten.en.json'),
	JSON.stringify(english, null, '\t') + '\n'
);

console.log('antworten.de.json and antworten.en.json generated.');
