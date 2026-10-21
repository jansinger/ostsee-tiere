/**
 * @fileoverview Modul-Attrappen, die einen fehlenden Export laut melden.
 *
 * Die Contract-Tests ersetzen `drizzle-orm` und `#lib/server/db/schema.js`
 * **vollständig**. Ein Export, den der getestete Code verwendet, hier aber
 * fehlt — eine Funktion wie `isNotNull` ebenso wie eine Tabelle wie
 * `auditLogs` —, ist damit zur Laufzeit nicht da. Das passiert auch
 * **mittelbar**: Seit
 * `/sichtungen/showreports.json` sein Freigabe-Prädikat über `approvedOnly()`
 * aus `#lib/server/db/approvalFilter.js` bezieht, hängt der Endpunkt an
 * `isNotNull`, ohne es selbst zu importieren (PR #701).
 *
 * Vitest wirft in diesem Fall bereits von sich aus eine brauchbare Meldung
 * (`[vitest] No "isNotNull" export is defined on the "drizzle-orm" mock`).
 * Nur sieht sie niemand: Der Zugriff passiert im `try`-Block der Route, deren
 * `catch` daraus eine 500 macht und den Fehler in einen gemockten Logger
 * schreibt. Der Test meldet dann bloß „expected 500 to be 200".
 *
 * Ein Proxy allein löst das also nicht. Deshalb tut dieser hier beides:
 *
 * 1. **werfen** — damit der Code nicht mit einem fehlenden Export weiterläuft;
 * 2. **den Fehlgriff vermerken** — damit er den `catch`-Block der Route
 *    überlebt. `vitest-setup-server.ts` prüft den Vermerk nach jedem Test und
 *    lässt ihn scheitern, auch wenn der Wurf unterwegs verschluckt wurde.
 */

import { expect } from 'vitest';
import { basename } from 'node:path';

/**
 * Symbole, die Vitest und der ESM-Interop auf jedem Modul-Namespace abfragen —
 * `then` allein rund acht Mal beim Auflösen von `await import(...)`. Für sie
 * darf der Trap nicht werfen, sonst bricht schon der Import.
 *
 * Von `Object.prototype` geerbte Namen (`toString`, `valueOf`, `constructor`, …)
 * stehen bewusst nicht in der Liste: Sie erfüllen `prop in target` und laufen
 * ohnehin durch.
 */
const MODULE_PROBES = new Set(['then', 'catch', 'finally', 'default', '__esModule', 'toJSON']);

/** Ein Zugriff auf einen Export, den die Attrappe nicht kennt. */
interface MissingMockExport {
	moduleName: string;
	exportName: string;
	testFile: string;
}

/**
 * Fehlgriffe des laufenden Tests. Modul-Zustand, weil die Attrappe im
 * `vi.mock`-Factory entsteht und dort keine Hooks registriert werden können.
 */
const missing: MissingMockExport[] = [];

/** Testdatei, in der der Fehlgriff passiert — zur Laufzeit des Traps gesetzt. */
function currentTestFile(): string {
	const testPath = expect.getState()?.testPath;
	return testPath ? basename(testPath) : 'dieser Testdatei';
}

/**
 * Bewusst neutral formuliert: Die Attrappe deckt zwei Modularten ab. Bei
 * `drizzle-orm` fehlt eine Funktion, bei `#lib/server/db/schema.js` eine Tabelle
 * wie `auditLogs` — die wird verwendet, nicht „aufgerufen".
 */
function describeMiss({ moduleName, exportName, testFile }: MissingMockExport): string {
	return (
		`${moduleName}-Attrappe in ${testFile} exportiert \`${exportName}\` nicht — ` +
		`der getestete Code verwendet es (ggf. mittelbar). ` +
		`Ergänze den Export in der Attrappe.`
	);
}

/**
 * Umhüllt das Attrappen-Objekt eines vollständig ersetzten Moduls.
 *
 * Der Zugriff auf einen nicht definierten String-Export wirft mit einer
 * Meldung, die Modul, Export und Testdatei nennt. Symbol-Keys und die
 * ESM-Sonden aus {@link MODULE_PROBES} laufen unverändert durch.
 *
 * @example
 * vi.mock('drizzle-orm', async () => {
 *   const { strictModuleMock } = await import('./helpers/strictModuleMock');
 *   return strictModuleMock('drizzle-orm', { and: vi.fn((...a) => a) });
 * });
 */
export function strictModuleMock<T extends object>(moduleName: string, exports: T): T {
	return new Proxy(exports, {
		get(target, prop, receiver) {
			if (typeof prop === 'string' && !Reflect.has(target, prop) && !MODULE_PROBES.has(prop)) {
				const miss: MissingMockExport = {
					moduleName,
					exportName: prop,
					testFile: currentTestFile()
				};
				// Erst vermerken, dann werfen: Fängt die Route den Fehler ab, holt
				// ihn `assertNoMissingMockExports()` nach dem Test wieder hervor.
				if (!missing.some((m) => m.moduleName === moduleName && m.exportName === prop)) {
					missing.push(miss);
				}
				throw new Error(describeMiss(miss));
			}
			return Reflect.get(target, prop, receiver);
		}
	});
}

/** Liefert die vermerkten Fehlgriffe und leert den Speicher. */
export function drainMissingMockExports(): MissingMockExport[] {
	return missing.splice(0, missing.length);
}

/**
 * Lässt den Test scheitern, wenn ein Export gefehlt hat — auch dann, wenn der
 * Wurf unterwegs verschluckt wurde. Wird global in `vitest-setup-server.ts`
 * nach jedem Test aufgerufen.
 */
export function assertNoMissingMockExports(): void {
	const misses = drainMissingMockExports();
	if (misses.length === 0) return;

	throw new Error(
		'Fehlender Export in einer Modul-Attrappe. Der Wurf wurde vom getesteten Code ' +
			'verschluckt (Routen fangen Fehler ab und antworten mit 500) — er ist die ' +
			'Ursache des Statuscode-Mismatch oben:\n' +
			misses.map((m) => `  • ${describeMiss(m)}`).join('\n')
	);
}
