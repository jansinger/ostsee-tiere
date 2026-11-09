/**
 * Holt den Melder-Hash für bestehende Sichtungen nach.
 *
 * Aufruf: npm run privacy:hash-reporters [-- --batch <n>]
 *
 * **Nur für Datenbanken, die von hier aus erreichbar sind** — also die lokale
 * Entwicklungs-DB. Auf den deployten Hosts ist die Datenbank von außen nicht
 * erreichbar, und `src/tools/` liegt nicht im Runtime-Image. Dort führt der
 * Weg über `POST /api/admin/reporter-hash` (siehe docs/ENVIRONMENT.md,
 * Abschnitt `REPORTER_HASH_KEY`).
 *
 * Die Logik steht in `#lib/server/privacy/hashReporters.ts` — beide Wege
 * rechnen damit identisch. Dieses Werkzeug ist nur die Schleife drumherum.
 * `TEST=true` und `dotenv/config` wie bei `rescore-spam.ts` (Begründung dort).
 * Der Schlüssel kommt aus `REPORTER_HASH_KEY` in der `.env`; ohne ihn bricht
 * das Werkzeug ab, bevor es etwas schreibt.
 */
import 'dotenv/config';
import {
	hashReporters,
	MAX_HASH_BATCH,
	ReporterHashKeyMissingError
} from '#lib/server/privacy/hashReporters.ts';
import { maskConnection, resolveConnectionString } from './dbConnection';

function parseBatch(argv: string[]): number {
	const index = argv.indexOf('--batch');
	if (index < 0) return MAX_HASH_BATCH;
	const value = Number(argv[index + 1]);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error('--batch erwartet eine positive ganze Zahl');
	}
	return Math.min(value, MAX_HASH_BATCH);
}

const batch = parseBatch(process.argv.slice(2));

console.log(`Datenbank: ${maskConnection(resolveConnectionString(process.env))}`);

let hashed = 0;

try {
	for (;;) {
		const report = await hashReporters({ limit: batch });
		hashed += report.hashed;
		console.log(`  ${hashed} gehasht, ${report.remaining} offen …`);
		if (report.stalled) {
			console.error(
				`\nAbbruch: Der letzte Batch bestand nur aus Adressen ohne verwertbaren Inhalt ` +
					`(${report.skipped} Zeilen, ${report.remaining} weiterhin ohne Hash). Von Hand prüfen.`
			);
			process.exit(1);
		}
		if (report.done) break;
	}
} catch (error) {
	if (error instanceof ReporterHashKeyMissingError) {
		console.error(`\nAbbruch: ${error.message}. Nichts geschrieben.`);
		process.exit(1);
	}
	throw error;
}

console.log(`\nFertig: ${hashed} Sichtungen gehasht.`);
process.exit(0);
