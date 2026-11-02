/**
 * Räumt vor der SBOM-Erzeugung `node_modules/$app/` weg.
 *
 * SvelteKit 3 schreibt beim Sync erzeugte Typen und die Basis-`tsconfig` dorthin
 * (`tsconfig.json` erweitert `$app/tsconfig`). Das Verzeichnis hat keine
 * `package.json`; `@cyclonedx/cyclonedx-npm` hält es trotzdem für ein Paket,
 * `normalize-package-data` lehnt den Namen ab (`$` ist nicht URL-sicher), und
 * die Erzeugung bricht mit `Error: Invalid name: "$app"` ab. Seit dem Upgrade
 * (#982) scheiterte daran der Compliance Check jedes Dependabot-PRs, und das
 * Dockerfile (`sbom:prod || true` nach `npm run build`) lieferte still keine
 * SBOM mehr.
 *
 * Gefahrlos, weil reiner Generator-Output: Der nächste `svelte-kit sync` — beim
 * Dev-Server, `check`, `build` — legt das Verzeichnis neu an. Bewusst `.mjs`
 * statt `.ts`: Das Dockerfile ruft das Skript mit reinem `node` auf.
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string} projectDir */
export function removeSvelteKitAppDir(projectDir) {
	rmSync(path.join(projectDir, 'node_modules', '$app'), { recursive: true, force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	removeSvelteKitAppDir(process.cwd());
}
