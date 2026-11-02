import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeSvelteKitAppDir } from './sbom-prepare.mjs';
import { readScripts } from './testGate';

/**
 * SvelteKit 3 schreibt beim Sync erzeugte Typen nach `node_modules/$app/` — ein
 * Verzeichnis ohne `package.json`. `@cyclonedx/cyclonedx-npm` hält es für ein Paket,
 * `normalize-package-data` lehnt den Namen ab (`$` ist nicht URL-sicher), und die
 * SBOM-Erzeugung bricht mit `Error: Invalid name: "$app"` ab. Im Compliance Check
 * legt `license:audit` (vite-node lädt die Vite-Konfiguration) das Verzeichnis an,
 * im Dockerfile `npm run build`. Seit dem Upgrade (#982) scheiterte deshalb jeder
 * Dependabot-PR — und das Docker-Image erhielt still keine SBOM mehr.
 */
describe('removeSvelteKitAppDir', () => {
	let projectDir: string;

	beforeEach(() => {
		projectDir = mkdtempSync(path.join(tmpdir(), 'sbom-prepare-'));
	});

	afterEach(() => {
		rmSync(projectDir, { recursive: true, force: true });
	});

	it('entfernt node_modules/$app samt Inhalt', () => {
		const appDir = path.join(projectDir, 'node_modules', '$app', 'types');
		mkdirSync(appDir, { recursive: true });
		writeFileSync(path.join(appDir, 'index.d.ts'), 'export {};');

		removeSvelteKitAppDir(projectDir);

		expect(existsSync(path.join(projectDir, 'node_modules', '$app'))).toBe(false);
	});

	it('lässt echte Pakete unangetastet', () => {
		const pkgDir = path.join(projectDir, 'node_modules', 'some-package');
		mkdirSync(pkgDir, { recursive: true });
		writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"some-package"}');
		mkdirSync(path.join(projectDir, 'node_modules', '$app'), { recursive: true });

		removeSvelteKitAppDir(projectDir);

		expect(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).toContain('some-package');
	});

	it('wirft nicht, wenn das Verzeichnis fehlt', () => {
		expect(() => removeSvelteKitAppDir(projectDir)).not.toThrow();
	});
});

describe('sbom-Skripte', () => {
	const sbomScripts = Object.entries(readScripts()).filter(([, command]) =>
		command.includes('@cyclonedx/cyclonedx-npm')
	);

	it('es gibt SBOM-Skripte (sonst prüft der Wächter nichts)', () => {
		expect(sbomScripts.map(([name]) => name)).toContain('sbom:prod');
	});

	it.each(sbomScripts)('%s räumt node_modules/$app vor cyclonedx weg', (_name, command) => {
		const prepare = command.indexOf('scripts/sbom-prepare.mjs');
		expect(prepare, command).toBeGreaterThanOrEqual(0);
		expect(prepare).toBeLessThan(command.indexOf('@cyclonedx/cyclonedx-npm'));
	});
});
