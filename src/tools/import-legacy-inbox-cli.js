/**
 * Kommandozeilen-Einstieg für den Legacy-Posteingang-Import.
 *
 * Aufruf: npm run import:legacy-inbox -- <datenverzeichnis>
 *
 * Warum eine eigene Datei? Der Einstieg stand vorher als
 * `if (import.meta.url === \`file://${process.argv[1]}\`)`-Block in
 * import-legacy-inbox.js. Unter vite-node ist `process.argv[1]` aber der
 * Loader (…/node_modules/.bin/vite-node), nie die Tool-Datei — die Bedingung
 * war damit nie wahr und der Befehl endete kommentarlos. Der Einstieg liegt
 * deshalb hier auf der obersten Ebene, ohne Bedingung, so wie in
 * generate-antworten-json.js. `importiere()` bleibt in import-legacy-inbox.js
 * und damit importierbar und testbar.
 *
 * Der npm-Eintrag setzt `TEST=true` vor den vite-node-Aufruf. Das ist kein
 * Test-Schalter im üblichen Sinn, sondern deaktiviert einen Guard im
 * Vite-Plugin von @sveltejs/kit: Er prüft, ob Client-Code versehentlich
 * Server-Code über `#lib/server/*` hereinzieht, und verfolgt dafür den
 * Importgraphen zu einem bekannten Einstiegspunkt zurück. Außerhalb von
 * `vite dev`/`vite build` — also hier beim Laden über vite-node — existiert
 * dieser Graph nicht, und der Guard scheitert mit "An impossible situation
 * occurred". `TEST=true` ist das Ventil, das das Plugin selbst vorsieht
 * (dieselbe Bedingung, die Vitest für Server-Routen-Tests nutzt). Die Variable
 * muss vor dem Prozessstart gesetzt sein — ein `process.env.TEST = 'true'` in
 * dieser Datei käme zu spät, weil vite-node den importierten Modulgraphen
 * (inklusive der Server-Module) per ESM-Hoisting lädt, bevor die erste Zeile
 * hier ausgeführt wird. Dieselbe Begründung steht in
 * generate-antworten-json.js.
 */
import { fehlerText, importiere } from './import-legacy-inbox.js';

const [datenVerzeichnis] = process.argv.slice(2);

if (!datenVerzeichnis) {
	console.error('Aufruf: npm run import:legacy-inbox -- <datenverzeichnis>');
	process.exit(1);
}

let ergebnis;

try {
	ergebnis = await importiere({ datenVerzeichnis });
} catch (fehler) {
	// Typischer Fall: Das Verzeichnis existiert nicht oder enthält kein
	// posteingang/. Ein roher Stacktrace hilft dabei niemandem — der Pfad, den
	// der Aufrufer eingetippt hat, schon.
	console.error(
		`Der Import konnte das Datenverzeichnis ${datenVerzeichnis} nicht lesen: ${fehlerText(fehler)}\n` +
			'Erwartet wird ein Verzeichnis mit den Unterverzeichnissen posteingang/ und importiert/.'
	);
	process.exit(1);
}

console.log(`${ergebnis.uebernommen} übernommen, ${ergebnis.fehlgeschlagen} offen.`);

if (ergebnis.moveFailure) {
	console.error(
		`Lauf abgebrochen: ${ergebnis.moveFailure.file} (Sichtung ${ergebnis.moveFailure.sightingId}) ` +
			'konnte nicht verschoben werden — siehe Fehlermeldung oben.'
	);
}

process.exit(ergebnis.fehlgeschlagen > 0 || ergebnis.moveFailure ? 1 : 0);
