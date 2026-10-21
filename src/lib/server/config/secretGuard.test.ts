import { describe, expect, it } from 'vitest';
import {
	ENCRYPTION_KEY_LENGTH,
	PLACEHOLDER_ENCRYPTION_KEY,
	validateEncryptionKey,
	assertProductionSecrets
} from '#lib/server/config/secretGuard.ts';

describe('validateEncryptionKey', () => {
	const valid = 'a3f1'.repeat(16); // 64 Hex-Zeichen = 32 Byte

	it('akzeptiert 64 Hex-Zeichen', () => {
		expect(valid).toHaveLength(ENCRYPTION_KEY_LENGTH);
		expect(validateEncryptionKey(valid)).toBeNull();
	});

	it('akzeptiert Grossbuchstaben in der Hex-Darstellung', () => {
		expect(validateEncryptionKey(valid.toUpperCase())).toBeNull();
	});

	/* "ENCRYPTION_KEY" allein steht in jeder Fehlermeldung dieser Funktion — eine vertauschte
	   Prüfreihenfolge (leer erst nach der Längenprüfung) bliebe mit dieser Erwartung grün.
	   "erforderlich" kommt dagegen nur in der Pflicht-Meldung vor (Platzhalter-, Längen- und
	   Hex-Meldung enthalten das Wort nicht) und trifft damit gezielt den Pflicht-Zweig. */
	it('lehnt einen leeren Wert ab', () => {
		expect(validateEncryptionKey('')).toMatch(/erforderlich/);
	});

	it('lehnt den Platzhalter aus .env.example ab', () => {
		expect(validateEncryptionKey(PLACEHOLDER_ENCRYPTION_KEY)).toMatch(/Platzhalter/);
	});

	/* Der neue Fall: aes-256-gcm braucht 32 Byte. Ein 32-stelliger Hex-Wert sind 16 Byte
	   und liess createCipheriv bisher erst beim ersten Login werfen. */
	it('lehnt einen zu kurzen Hex-Wert ab, der bisher durchkam', () => {
		expect(validateEncryptionKey('a3f1'.repeat(8))).toMatch(/64/);
	});

	it('lehnt Nicht-Hex-Zeichen ab', () => {
		expect(validateEncryptionKey('z'.repeat(64))).toMatch(/hexadezimal/);
	});

	/* Ohne Trimmen erkennt die Längenprüfung den Platzhalter nicht als Platzhalter, sondern
	   als "66 statt 64 Zeichen" — eine irreführende Fehlermeldung, analog zu
	   validateSessionSecret oben. */
	it('lehnt den Platzhalter auch mit Leerraum drumherum ab', () => {
		expect(validateEncryptionKey(`  ${PLACEHOLDER_ENCRYPTION_KEY}\n`)).toMatch(/Platzhalter/);
	});
});

describe('assertProductionSecrets', () => {
	const good = { ENCRYPTION_KEY: 'a3f1'.repeat(16) };

	it('wirft nicht ausserhalb von production', () => {
		expect(() =>
			assertProductionSecrets({
				NODE_ENV: 'development',
				ENCRYPTION_KEY: '0'.repeat(64)
			})
		).not.toThrow();
	});

	it('wirft nicht bei gültiger Produktionskonfiguration', () => {
		expect(() => assertProductionSecrets({ NODE_ENV: 'production', ...good })).not.toThrow();
	});

	it('wirft in production bei Platzhalter-ENCRYPTION_KEY', () => {
		expect(() =>
			assertProductionSecrets({
				NODE_ENV: 'production',
				ENCRYPTION_KEY: '0'.repeat(64)
			})
		).toThrow(/Platzhalter/);
	});

	it('wirft in production bei zu kurzem ENCRYPTION_KEY', () => {
		expect(() =>
			assertProductionSecrets({
				NODE_ENV: 'production',
				...good,
				ENCRYPTION_KEY: 'a3f1'.repeat(8)
			})
		).toThrow(/64 Zeichen/);
	});

	it('nennt die betroffene Variable in der Meldung', () => {
		let message = '';
		try {
			assertProductionSecrets({ NODE_ENV: 'production', ENCRYPTION_KEY: '' });
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toMatch(/ENCRYPTION_KEY/);
	});

	/* Befund 4 (#635-Review): `NODE_ENV !== 'production'` war ein exakter Vergleich. Bei
	   "Production", " production " oder "PRODUCTION" blieb der Guard lautlos aus — ein
	   Betreiber, der eine dieser Schreibweisen setzt, bekommt keinen Schutz. */
	it.each(['Production', ' production ', 'PRODUCTION'])(
		'greift auch bei der Schreibweise NODE_ENV=%j',
		(nodeEnv) => {
			expect(() => assertProductionSecrets({ NODE_ENV: nodeEnv, ENCRYPTION_KEY: '' })).toThrow(
				/ENCRYPTION_KEY/
			);
		}
	);

	/* "prod" ist keine Schreibvariante von "production", sondern ein eigener Wert. SvelteKit
	   und die Skripte dieses Projekts setzen durchgehend "production" — eine Zusatzbedeutung
	   für "prod" zu erfinden wäre eine eigene Entscheidung, die der Guard nicht treffen soll. */
	it('behandelt NODE_ENV="prod" NICHT als Produktion', () => {
		expect(() => assertProductionSecrets({ NODE_ENV: 'prod', ENCRYPTION_KEY: '' })).not.toThrow();
	});
});
