import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `Icon.svelte` rendert für einen unbekannten Namen ein stummes „?" statt zu
 * scheitern. Das ist im Betrieb die richtige Wahl — ein fehlendes Icon soll
 * keine Seite abstürzen lassen — kostet aber jede Rückmeldung: Ein Tippfehler
 * oder ein neuer Name ohne Eintrag sieht im Code vollständig aus und liefert
 * dem Nutzer ein Fragezeichen aus.
 *
 * Dieser Test ist die fehlende Rückmeldung. Er ist entstanden, nachdem
 * `lucide:wifi-off`, `lucide:search-x` und `lucide:rotate-ccw` genau so
 * durchgerutscht sind und erst im Browser aufgefallen wären.
 */

const SOURCE_ROOT = 'src';
const ICON_COMPONENT = 'src/lib/components/Icon.svelte';

/** Alle im `iconMap` registrierten Namen. */
function registeredIcons(): Set<string> {
	const source = readFileSync(ICON_COMPONENT, 'utf-8');
	const mapStart = source.indexOf('const iconMap');
	expect(mapStart, 'iconMap in Icon.svelte nicht gefunden').toBeGreaterThan(-1);

	// `Array.from` statt `.map()` direkt auf dem Iterator: Die Iterator-Helper
	// (`Iterator.prototype.map`) gibt es erst ab Node 22. `package.json` lässt
	// über `engines` aber auch `^20.19.0` zu — dort wäre `.map()` undefined und
	// dieser Test würde mit einem TypeError abbrechen, statt die Registry zu
	// prüfen. Ein Test, der still nicht prüft, ist schlimmer als keiner.
	const names = Array.from(
		source.slice(mapStart).matchAll(/'(lucide:[a-z0-9-]+)'\s*:/g),
		(match) => match[1] as string
	);

	return new Set(names);
}

/** Jede `icon="lucide:…"`- bzw. `icon: 'lucide:…'`-Stelle im Quelltext. */
function usedIcons(): Map<string, string[]> {
	const usages = new Map<string, string[]>();

	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}
			if (!/\.(svelte|ts)$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
			if (path === ICON_COMPONENT) continue;

			const source = readFileSync(path, 'utf-8');
			for (const match of source.matchAll(/["'](lucide:[a-z0-9-]+)["']/g)) {
				const name = match[1] as string;
				usages.set(name, [...(usages.get(name) ?? []), path]);
			}
		}
	};

	walk(SOURCE_ROOT);
	return usages;
}

describe('Icon-Registry', () => {
	it('kennt jedes im Quelltext verwendete lucide-Icon', () => {
		const registered = registeredIcons();
		const missing = [...usedIcons().entries()]
			.filter(([name]) => !registered.has(name))
			.map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`);

		expect(missing, 'Nicht registrierte Icons rendern als „?" beim Nutzer').toEqual([]);
	});

	it('findet überhaupt Registrierungen — sonst greift die Prüfung ins Leere', () => {
		expect(registeredIcons().size).toBeGreaterThan(50);
	});
});
