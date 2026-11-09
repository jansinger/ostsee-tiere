/**
 * Reservierte Schlüssel gehören einem Modul, nicht der Einstellungs-API.
 *
 * `privacy.anonymization.activatedAt` ist die Freigabe-Sperre des
 * Anonymisierungs-Jobs und wird genau einmal gesetzt
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, „Freigabe des ersten Laufs"). Über
 * `PUT`/`DELETE /api/config` ließe sie sich sonst vorziehen oder zurücknehmen —
 * auch von einem Superadmin, der sonst jeden Schlüssel schreiben darf.
 */
import { describe, expect, it } from 'vitest';
import { canUserAccessConfigKey } from './accessControl';

const SUPERADMIN = { sub: 's', email: 's@example.invalid', roles: ['superadmin'] };
const ADMIN = { sub: 'a', email: 'a@example.invalid', roles: ['admin'] };

describe('canUserAccessConfigKey — reservierte Schlüssel', () => {
	it.each(['privacy.anonymization.activatedAt', 'privacy.anonymization.lastRun'])(
		'sperrt %s auch für Superadmins',
		(key) => {
			expect(canUserAccessConfigKey(SUPERADMIN as never, key)).toBe(false);
			expect(canUserAccessConfigKey(ADMIN as never, key)).toBe(false);
		}
	);

	it('lässt übrige Schlüssel für Superadmins offen', () => {
		expect(canUserAccessConfigKey(SUPERADMIN as never, 'email.smtp.host')).toBe(true);
	});
});
