/**
 * Prüft die Redaction gegen echtes Pino, nicht gegen die Pfadliste.
 *
 * Die Liste allein sagt nicht, ob ein Feld tatsächlich entfernt wird: Bis
 * 2026-11 führte sie für die Anschrift nur die Spaltennamen der Datenbank
 * (`strasse`, `plz`, `ort`), der Code loggt aber die Schlüssel des
 * Drizzle-Schemas (`street`, `zipCode`, `city`). `saveSighting` schrieb die
 * Anschrift deshalb ungefiltert ins Log — samt Fax, Schiffsname und
 * Heimathafen. Personenbezogene Daten im Log überdauern jede Löschfrist der
 * Datenbank (docs/ANONYMISIERUNG_KONZEPT.md).
 */
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACTION } from './redaction';

/** Personenbezogene Felder einer Sichtung — Drizzle-Schlüssel und Legacy-Namen. */
const CONTACT_FIELDS = {
	firstName: 'Erika',
	lastName: 'Mustermann',
	email: 'erika@example.invalid',
	phone: '0381 111111',
	fax: '0381 222222',
	street: 'Hafenstraße 1',
	zipCode: '18055',
	city: 'Rostock',
	shipName: 'Seeschwalbe',
	homePort: 'Warnemünde',
	vorname: 'Erika',
	name: 'Mustermann',
	telefon: '0381 333333',
	strasse: 'Am Strande 2',
	plz: '18119',
	ort: 'Warnemünde-Ost',
	schiffsname: 'Möwe',
	heimathafen: 'Kühlungsborn'
} as const;

function logAndCapture(payload: Record<string, unknown>): string {
	let output = '';
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			output += chunk.toString();
			callback();
		}
	});
	pino({ redact: LOG_REDACTION }, stream).info(payload, 'test');
	return output;
}

describe('LOG_REDACTION', () => {
	it.each(Object.entries(CONTACT_FIELDS))('entfernt %s auf oberster Ebene', (field, value) => {
		const output = logAndCapture({ [field]: value });

		expect(output).not.toContain(value);
	});

	it.each(Object.entries(CONTACT_FIELDS))(
		'entfernt %s eine Ebene tiefer (z. B. { sightingData })',
		(field, value) => {
			const output = logAndCapture({ sightingData: { id: 7, [field]: value } });

			expect(output).not.toContain(value);
			// Der Rest des Objekts bleibt lesbar — Redaction, kein Verschlucken.
			expect(output).toContain('"id":7');
		}
	);
});
