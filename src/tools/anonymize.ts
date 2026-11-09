/**
 * Anonymisiert Kontaktdaten 3 Monate nach Eingang — lokale Datenbank.
 *
 * Aufruf:
 *   npm run privacy:anonymize:dry-run   # Vorschau, ändert nichts
 *   npm run privacy:anonymize           # leert, in Stapeln bis nichts mehr fällig ist
 *
 * **Nur für Datenbanken, die von hier aus erreichbar sind.** Auf den deployten
 * Hosts läuft alles über `POST /api/admin/anonymize` (Datenbank von außen
 * nicht erreichbar, `src/tools/` nicht im Image).
 *
 * Es gelten dieselben Sperren wie am Endpunkt, weil derselbe Ablauf rechnet
 * (`#lib/server/privacy/anonymizeSightings.ts`): ohne `REPORTER_HASH_KEY`
 * Abbruch, ohne Freischaltung nur Vorschau.
 */
import 'dotenv/config';
import { createAnonymizationPorts } from '#lib/server/privacy/anonymizationQueries.ts';
import {
	anonymizeSightings,
	MAX_ANONYMIZE_BATCH,
	type AnonymizationReport
} from '#lib/server/privacy/anonymizeSightings.ts';
import { ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { maskConnection, resolveConnectionString } from './dbConnection';

const execute = process.argv.slice(2).includes('--execute');
const ports = createAnonymizationPorts();

function printPreview(report: AnonymizationReport): void {
	console.log(`Schlüssel gesetzt:     ${report.keyConfigured ? 'ja' : 'NEIN'}`);
	console.log(`Freigeschaltet:        ${report.activatedAt ?? 'nein'}`);
	console.log(`Adressen ohne Hash:    ${report.pendingHashes}`);
	console.log(`Fällig:                ${report.due}`);
	console.log(`Jüngster fälliger Eingang: ${report.newestDueReceivedAt ?? '–'}`);
	if (report.byYear.length > 0) {
		console.table(report.byYear);
	}
}

console.log(`Datenbank: ${maskConnection(resolveConnectionString(process.env))}\n`);

try {
	if (!execute) {
		printPreview(await anonymizeSightings({ now: new Date(), ports }));
		process.exit(0);
	}

	let anonymized = 0;
	for (;;) {
		const report = await anonymizeSightings({
			mode: 'execute',
			limit: MAX_ANONYMIZE_BATCH,
			now: new Date(),
			trigger: 'cli',
			ports
		});
		if (report.skipped) {
			console.error(`Nichts geleert: ${report.skipped}`);
			printPreview(report);
			process.exit(1);
		}
		anonymized += report.anonymized;
		console.log(`  ${anonymized} anonymisiert, ${report.remaining} fällig …`);
		if (report.done) {
			// Kein Fortschritt mehr, aber noch fällige Zeilen — etwa von einer
			// anderen Transaktion gesperrt. Kein Erfolg, sondern ein Fall zum
			// Nachsehen; der nächste Lauf holt sie nach.
			if (report.remaining > 0) {
				console.error(
					`\nUnvollständig: ${anonymized} anonymisiert, ${report.remaining} weiterhin fällig.`
				);
				process.exit(1);
			}
			break;
		}
	}
	console.log(`\nFertig: ${anonymized} Sichtungen anonymisiert.`);
	process.exit(0);
} catch (error) {
	if (error instanceof ReporterHashKeyMissingError) {
		console.error(`\nAbbruch: ${error.message}. Nichts geändert.`);
		process.exit(1);
	}
	throw error;
}
