/**
 * Sichert die Aufteilung der Konfigurationsschlüssel zwischen `admin` und
 * `superadmin` gegen Drift ab.
 *
 * Warum es diesen Test braucht: `canUserAccessConfigKey()` beantwortet einen
 * Schlüssel, der in **keiner** der beiden Listen steht, für Superadmins mit
 * `true` (früher Return) und für Admins mit `false`. Ein neu vorbelegter
 * Schlüssel wird dadurch stillschweigend superadmin-only. Die Richtung ist
 * fail-safe, das Schweigen ist es nicht: Niemand bemerkt, dass eine Einstellung
 * für Admins fehlt, die dort hingehört hätte.
 *
 * Es ist dieselbe Drift-Klasse, für die `admin/settings/configLabels.test.ts`
 * geschrieben wurde — dort für die Anzeigenamen, hier für die Rechte. Ohne
 * diesen Test ist die Aufteilung eine Momentaufnahme.
 */
import { describe, expect, it } from 'vitest';
import { getAvailableConfigurationKeys } from '$lib/server/services/configInitializer';
import type { User } from '$lib/types';
import {
	canUserAccessConfigKey,
	filterConfigsByUserAccess,
	getAdminAccessibleConfigKeys,
	getSuperAdminOnlyConfigKeys,
	isSystemCriticalConfig
} from './accessControl';

const admin = { sub: 'u-admin', roles: ['admin'] } as User;
const superadmin = { sub: 'u-super', roles: ['superadmin'] } as User;
const ohneRolle = { sub: 'u-plain', roles: [] } as unknown as User;

describe('Konfigurations-Zugriffsrechte', () => {
	const alleSchlüssel = getAvailableConfigurationKeys();
	const adminSchlüssel = getAdminAccessibleConfigKeys();
	const superadminSchlüssel = getSuperAdminOnlyConfigKeys();

	describe('Aufteilung der Schlüssel', () => {
		it('ordnet jede vorbelegte Einstellung genau einer Rolle zu', () => {
			const ohneZuordnung = alleSchlüssel.filter(
				(key) => !adminSchlüssel.has(key) && !superadminSchlüssel.has(key)
			);

			// Aussagekräftige Meldung: Der Test soll sagen, WELCHE Einstellung
			// fehlt — sonst sucht man den Schlüssel von Hand.
			expect(
				ohneZuordnung,
				`Weder admin- noch superadmin-Liste (wäre still superadmin-only): ${ohneZuordnung.join(', ')}`
			).toEqual([]);
		});

		it('ordnet keine Einstellung beiden Rollen gleichzeitig zu', () => {
			const doppelt = alleSchlüssel.filter(
				(key) => adminSchlüssel.has(key) && superadminSchlüssel.has(key)
			);

			expect(doppelt, `In beiden Listen: ${doppelt.join(', ')}`).toEqual([]);
		});

		it('enthält keine Rechte für Einstellungen, die es nicht mehr gibt', () => {
			const verwaist = [...adminSchlüssel, ...superadminSchlüssel].filter(
				(key) => !alleSchlüssel.includes(key)
			);

			expect(verwaist, `Recht ohne zugehörige Einstellung: ${verwaist.join(', ')}`).toEqual([]);
		});
	});

	describe('canUserAccessConfigKey()', () => {
		it('gibt einem Admin genau die admin-Schlüssel frei', () => {
			for (const key of alleSchlüssel) {
				expect(canUserAccessConfigKey(admin, key), `admin → ${key}`).toBe(adminSchlüssel.has(key));
			}
		});

		it('gibt einem Superadmin jede Einstellung frei', () => {
			for (const key of alleSchlüssel) {
				expect(canUserAccessConfigKey(superadmin, key), `superadmin → ${key}`).toBe(true);
			}
		});

		it('sperrt Benutzer ohne Rolle und ohne Anmeldung vollständig', () => {
			for (const key of alleSchlüssel) {
				expect(canUserAccessConfigKey(ohneRolle, key), `ohne Rolle → ${key}`).toBe(false);
				expect(canUserAccessConfigKey(null, key), `null → ${key}`).toBe(false);
				expect(canUserAccessConfigKey(undefined, key), `undefined → ${key}`).toBe(false);
			}
		});

		it('sperrt einen unbekannten Schlüssel für Admins', () => {
			// Der Gegenpol zum ersten Test: Solange ein Schlüssel nirgends steht,
			// darf ein Admin ihn nicht sehen — der frühe Superadmin-Return ist die
			// einzige Ausnahme, und die ist beabsichtigt.
			expect(canUserAccessConfigKey(admin, 'gibt.es.nicht')).toBe(false);
			expect(canUserAccessConfigKey(superadmin, 'gibt.es.nicht')).toBe(true);
		});
	});

	describe('isSystemCriticalConfig()', () => {
		it('meldet genau die superadmin-Schlüssel als systemkritisch', () => {
			for (const key of alleSchlüssel) {
				expect(isSystemCriticalConfig(key), key).toBe(superadminSchlüssel.has(key));
			}
		});
	});

	describe('filterConfigsByUserAccess()', () => {
		const configs = alleSchlüssel.map((key) => ({
			key,
			value: 'x',
			description: '',
			category: 'email' as const
		}));

		it('reicht einem Admin nur seine Einstellungen durch', () => {
			const gefiltert = filterConfigsByUserAccess(configs, admin).map((c) => c.key);

			expect(new Set(gefiltert)).toEqual(adminSchlüssel);
		});

		it('reicht einem Superadmin alles durch', () => {
			expect(filterConfigsByUserAccess(configs, superadmin)).toHaveLength(alleSchlüssel.length);
		});

		it('reicht ohne Anmeldung nichts durch', () => {
			expect(filterConfigsByUserAccess(configs, null)).toEqual([]);
		});
	});
});
