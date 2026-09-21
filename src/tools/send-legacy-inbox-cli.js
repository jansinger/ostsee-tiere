/**
 * Kommandozeilen-Einstieg für den HTTP-Versand des Legacy-Posteingangs.
 *
 * Aufruf: npm run send:legacy-inbox -- <ziel-url> [--ssh=host:/pfad | --dir=/pfad]
 *
 * Beispiel (Produktion, Posteingang auf dem Plesk-Server):
 *   npm run send:legacy-inbox -- https://ostsee-tiere.de
 *
 * Der Einstieg steht wie in import-legacy-inbox-cli.js auf der obersten Ebene
 * und nicht hinter einer `import.meta.url`-Bedingung — unter einem Loader ist
 * `process.argv[1]` der Loader, nie diese Datei, und die Bedingung wäre nie
 * wahr. Anders als der Import braucht dieses Skript aber weder Datenbank noch
 * `$lib/server/*`, es läuft deshalb unter blankem `node`.
 */
import {
	erstelleDateiSpeicher,
	erstelleSshSpeicher,
	fehlerText,
	sende
} from './send-legacy-inbox.js';

const STANDARD_SSH = 'hawking:/var/www/vhosts/schweinswalsichtung.de/legacy-inbox-data';

const argumente = process.argv.slice(2);
const zielUrl = argumente.find((a) => !a.startsWith('--'));
// `.find()` liefert das ganze Argument, `undefined` bedeutet also „nicht
// angegeben" — ein leerer Wert (`--dir=`) ist dagegen eine Angabe und wird
// unten abgelehnt, statt still auf den SSH-Standard zurückzufallen.
const dirArg = argumente.find((a) => a.startsWith('--dir='))?.slice('--dir='.length);
const sshArg = argumente.find((a) => a.startsWith('--ssh='))?.slice('--ssh='.length);

if (!zielUrl) {
	console.error(
		'Aufruf: npm run send:legacy-inbox -- <ziel-url> [--ssh=host:/pfad | --dir=/pfad]\n' +
			`Ohne --ssh/--dir wird ${STANDARD_SSH} verwendet.`
	);
	process.exit(1);
}

let speicher;

if (dirArg !== undefined) {
	if (dirArg === '') {
		console.error('--dir= erwartet einen Pfad.');
		process.exit(1);
	}
	speicher = erstelleDateiSpeicher(dirArg);
} else {
	const roh = sshArg ?? STANDARD_SSH;
	const trenner = roh.indexOf(':');
	if (trenner < 1) {
		console.error(`--ssh erwartet die Form host:/pfad, bekam: ${roh}`);
		process.exit(1);
	}
	speicher = erstelleSshSpeicher({
		host: roh.slice(0, trenner),
		datenVerzeichnis: roh.slice(trenner + 1)
	});
}

console.log(`Posteingang: ${speicher.beschreibung}`);
console.log(`Ziel:        ${zielUrl}`);
console.log(
	'\nErinnerung: Jede angenommene Sichtung löst am Ziel eine Benachrichtigungs-E-Mail aus.\n' +
		'Bei einem größeren Rückstand vorher notification.email.enabled abschalten — und danach\n' +
		'wieder einschalten.\n'
);

// Die Ziel-URL vor dem `try` prüfen. `sende()` baut daraus als Erstes eine
// `URL` und wirft bei einer unbrauchbaren Eingabe, noch bevor der Posteingang
// überhaupt angefasst wird — der `catch` unten würde einen Tippfehler in der
// URL dann als „Posteingang nicht lesbar" melden und in die Irre führen.
try {
	new URL('/rest_sichtungen', zielUrl);
} catch {
	console.error(`Keine brauchbare Ziel-URL: ${zielUrl}`);
	process.exit(1);
}

let ergebnis;

try {
	ergebnis = await sende({ basisUrl: zielUrl, speicher });
} catch (fehler) {
	console.error(
		`Der Posteingang ${speicher.beschreibung} war nicht lesbar: ${fehlerText(fehler)}\n` +
			'Erwartet wird ein Verzeichnis mit den Unterverzeichnissen posteingang/ und importiert/.'
	);
	process.exit(1);
}

console.log(
	`\n${ergebnis.uebernommen}/${ergebnis.gesamt} übernommen und nach importiert/ verschoben, ` +
		`${ergebnis.abgelehnt.length} abgelehnt.`
);

for (const eintrag of ergebnis.abgelehnt) {
	console.error(`  abgelehnt: ${eintrag.datei} — ${eintrag.grund ?? `HTTP ${eintrag.http}`}`);
}

if (ergebnis.abbruch) {
	console.error(`\nLauf abgebrochen (${ergebnis.abbruch.grund}) bei ${ergebnis.abbruch.datei}.`);
	if (ergebnis.abbruch.grund === 'rate-limit') {
		console.error('In einer Stunde erneut starten — der Lauf macht dort weiter, wo er stand.');
	}
}

process.exit(ergebnis.abbruch || ergebnis.abgelehnt.length > 0 ? 1 : 0);
