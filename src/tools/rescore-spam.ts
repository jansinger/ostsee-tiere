/**
 * Bewertet bestehende Sichtungen nachträglich mit der Spam-Heuristik und
 * schreibt `spam_score`/`spam_indicators`.
 *
 * Aufruf: npm run spam:rescore [-- --batch <n>]
 *
 * **Nur für Datenbanken, die von hier aus erreichbar sind** — also die lokale
 * Entwicklungs-DB. Auf den deployten Hosts geht das nicht: dmm gibt den
 * DB-Port nicht frei, hawking hat `allowtcpforwarding no`, und `src/tools/`
 * liegt gar nicht erst im Runtime-Image. Dort führt der Weg über
 * `POST /api/admin/spam-rescore` (siehe docs/SPAM_DETECTION.md).
 *
 * Die Bewertung selbst steht in `#lib/server/spam/rescoreSightings.js` — beide
 * Wege rechnen damit identisch, und die Logik ist dort getestet. Dieses
 * Werkzeug ist nur die Schleife drumherum plus Fortschrittsausgabe.
 *
 * Der npm-Eintrag setzt `TEST=true` vor den vite-node-Aufruf — dasselbe
 * Ventil wie bei generate-antworten-json.js, damit der Server-Import-Guard
 * des SvelteKit-Vite-Plugins außerhalb von `vite dev`/`vite build` nicht mit
 * "An impossible situation occurred" abbricht.
 *
 * `dotenv/config` lädt die `.env` ins process.env. ESM hoistet zwar alle
 * Imports, aber das trägt: `#lib/server/db/index.js` baut seine Verbindung lazy beim
 * ersten Zugriff auf (Proxy, siehe src/lib/server/db/index.ts), und kein
 * importiertes Modul liest die Verbindungszeichenfolge schon beim Laden.
 */
import 'dotenv/config';
import { MAX_RESCORE_BATCH, rescoreSightings } from '#lib/server/spam/rescoreSightings.ts';
import { maskConnection, resolveConnectionString } from './dbConnection';

function parseBatch(argv: string[]): number {
	const index = argv.indexOf('--batch');
	if (index < 0) return MAX_RESCORE_BATCH;
	const value = Number(argv[index + 1]);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error('--batch erwartet eine positive ganze Zahl');
	}
	return Math.min(value, MAX_RESCORE_BATCH);
}

const batch = parseBatch(process.argv.slice(2));

console.log(`Datenbank: ${maskConnection(resolveConnectionString(process.env))}`);

let scored = 0;
let skippedFailed = 0;
const distribution = new Map<number, number>();

// Batch-weise bis `done` — dieselbe Schleife, die ein Aufrufer auch gegen den
// Admin-Endpunkt fahren würde.
for (;;) {
	const report = await rescoreSightings({ limit: batch });

	scored += report.scored;
	skippedFailed += report.skippedFailed;
	for (const [score, count] of Object.entries(report.distribution)) {
		distribution.set(Number(score), (distribution.get(Number(score)) ?? 0) + count);
	}

	console.log(`  ${scored} bewertet, ${report.remaining} offen …`);

	if (report.stalled) {
		// Ganzer Batch gescheitert — weitere Läufe würden dieselben Zeilen laden.
		console.error(
			`\nAbbruch: Der letzte Batch hat nichts geschrieben (${report.skippedFailed} Prüfungen ` +
				`fehlgeschlagen, ${report.remaining} Zeilen weiterhin ohne Bewertung). Ursache im Log suchen.`
		);
		process.exit(1);
	}

	if (report.done) break;
}

console.log(
	`\nFertig: ${scored} bewertet, ${skippedFailed} übersprungen (Prüfung fehlgeschlagen).`
);
console.log('Score-Verteilung:');
for (const [score, count] of [...distribution.entries()].sort(([a], [b]) => a - b)) {
	console.log(`  Score ${score}: ${count}`);
}

process.exit(0);
