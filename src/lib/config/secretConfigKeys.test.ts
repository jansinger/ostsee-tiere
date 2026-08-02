/**
 * Sichert ab, dass Zugangsdaten aus `app_config` die Serverseite nicht im
 * Klartext verlassen.
 *
 * Ausgangslage: Die Settings-Seite lud jede Einstellung mit ihrem echten Wert
 * ins Payload und rendert sie über den generischen Text-Zweig. Das SMTP-Passwort
 * und die beiden API-Schlüssel standen damit im SSR-HTML und im DOM — sichtbar
 * im Seitenquelltext, in Screenshots und in jedem Browser-Profil, das die Seite
 * zwischenspeichert. Betroffen sind nur Superadmins (Rechte siehe
 * `accessControl.ts`), es war also keine Rechte-Lücke — aber eine unnötige.
 *
 * Der Platzhalter ist bewusst **nicht** der Leerstring: Sonst sieht ein gesetztes
 * Passwort genauso aus wie ein fehlendes, und wer das Feld anfasst und wieder
 * leert, überschreibt ein Passwort, von dem er nie wusste, dass es da war.
 * Gefüllt heißt „gesetzt", leer heißt „nicht gesetzt".
 */
import { describe, expect, it } from 'vitest';
import { getAvailableConfigurationKeys } from '$lib/server/services/configInitializer';
import {
	SECRET_CONFIG_KEYS,
	SECRET_PLACEHOLDER,
	isSecretConfigKey,
	isUnchangedSecret,
	maskSecretConfigValues
} from './secretConfigKeys';

describe('Geheime Konfigurationswerte', () => {
	describe('SECRET_CONFIG_KEYS', () => {
		it('nennt nur Schlüssel, die es wirklich gibt', () => {
			const alleSchlüssel = getAvailableConfigurationKeys();
			const verwaist = [...SECRET_CONFIG_KEYS].filter((key) => !alleSchlüssel.includes(key));

			expect(verwaist, `Als geheim geführt, aber unbekannt: ${verwaist.join(', ')}`).toEqual([]);
		});

		it('erfasst das SMTP-Passwort und die API-Schlüssel', () => {
			expect(isSecretConfigKey('email.smtp.password')).toBe(true);
			expect(isSecretConfigKey('integration.weatherApiKey')).toBe(true);
			expect(isSecretConfigKey('integration.geoApiKey')).toBe(true);
		});

		it('erfasst harmlose Einstellungen nicht', () => {
			expect(isSecretConfigKey('email.smtp.host')).toBe(false);
			expect(isSecretConfigKey('email.smtp.user')).toBe(false);
			expect(isSecretConfigKey('notification.email.recipient')).toBe(false);
			expect(isSecretConfigKey('display.maintenanceMode')).toBe(false);
		});
	});

	describe('maskSecretConfigValues()', () => {
		const bauen = (key: string, value: unknown) => [
			{ key, value: value as string, category: 'email' }
		];

		it('ersetzt einen gesetzten Geheimwert durch den Platzhalter', () => {
			const [item] = maskSecretConfigValues(bauen('email.smtp.password', 'hunter2'));

			expect(item?.value).toBe(SECRET_PLACEHOLDER);
		});

		it('gibt den Klartext unter keinen Umständen weiter', () => {
			const maskiert = maskSecretConfigValues(bauen('email.smtp.password', 'hunter2'));

			expect(JSON.stringify(maskiert)).not.toContain('hunter2');
		});

		it('lässt einen leeren Geheimwert leer — sonst wäre „gesetzt" nicht erkennbar', () => {
			expect(maskSecretConfigValues(bauen('email.smtp.password', ''))[0]?.value).toBe('');
			expect(maskSecretConfigValues(bauen('integration.geoApiKey', null))[0]?.value).toBe('');
		});

		it('lässt Einstellungen ohne Geheimnis unverändert', () => {
			const eingabe = bauen('email.smtp.host', 'smtp.example.com');

			expect(maskSecretConfigValues(eingabe)[0]?.value).toBe('smtp.example.com');
		});

		it('verändert die übergebenen Objekte nicht', () => {
			const eingabe = bauen('email.smtp.password', 'hunter2');
			maskSecretConfigValues(eingabe);

			expect(eingabe[0]?.value).toBe('hunter2');
		});

		it('maskiert jede geheime Einstellung einer gemischten Liste', () => {
			const gemischt = [
				{ key: 'email.smtp.host', value: 'smtp.example.com', category: 'email' },
				{ key: 'email.smtp.password', value: 'hunter2', category: 'email' },
				{ key: 'integration.weatherApiKey', value: 'abc123', category: 'integration' }
			];

			const werte = maskSecretConfigValues(gemischt).map((c) => c.value);

			expect(werte).toEqual(['smtp.example.com', SECRET_PLACEHOLDER, SECRET_PLACEHOLDER]);
		});
	});

	describe('isUnchangedSecret()', () => {
		it('erkennt den zurückgeschickten Platzhalter als „nicht geändert"', () => {
			expect(isUnchangedSecret('email.smtp.password', SECRET_PLACEHOLDER)).toBe(true);
		});

		it('lässt ein echtes neues Passwort durch', () => {
			expect(isUnchangedSecret('email.smtp.password', 'neues-passwort')).toBe(false);
		});

		it('lässt das bewusste Leeren durch', () => {
			// Ein Superadmin, der das Feld leert, will das Passwort löschen. Der
			// Platzhalter im Feld macht sichtbar, dass vorher eines gesetzt war —
			// die Aktion ist damit bewusst und darf nicht unterdrückt werden.
			expect(isUnchangedSecret('email.smtp.password', '')).toBe(false);
		});

		it('greift nicht bei harmlosen Schlüsseln', () => {
			// Sonst könnte niemand eine Einstellung auf den Platzhalter-Text setzen.
			expect(isUnchangedSecret('display.maintenanceMessage', SECRET_PLACEHOLDER)).toBe(false);
		});
	});
});
