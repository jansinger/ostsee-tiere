/**
 * Kommandozeilen-Einstieg für die Aufbewahrungsfrist des Legacy-Posteingangs.
 *
 * Aufruf: node src/tools/prune-legacy-inbox-cli.js --dir=/pfad/zum/datenverzeichnis
 *
 * Läuft auf dem Plesk-Server unter blankem `node`, einmal täglich aus
 * legacy-inbox/deploy/sync.sh. Exit-Codes:
 *
 *   0  aufgeräumt, nichts Auffälliges
 *   2  aufgeräumt, aber ein Mensch muss hinsehen (Posteingang über der Frist
 *      oder Dateien ohne lesbares Datum)
 *   1  Fehler — es wurde womöglich nichts gelöscht
 */
import { raeumeAuf } from './prune-legacy-inbox.js';

const dirArg = process.argv
	.slice(2)
	.find((a) => a.startsWith('--dir='))
	?.slice('--dir='.length);

if (!dirArg) {
	console.error('Aufruf: node src/tools/prune-legacy-inbox-cli.js --dir=/pfad');
	process.exit(1);
}

try {
	const bericht = await raeumeAuf({ datenVerzeichnis: dirArg });
	const auffaellig = bericht.posteingangUeberFrist > 0 || bericht.uebersprungen.length > 0;
	process.exit(auffaellig ? 2 : 0);
} catch (fehler) {
	console.error(`Aufräumen fehlgeschlagen: ${fehler instanceof Error ? fehler.message : fehler}`);
	process.exit(1);
}
