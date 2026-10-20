/**
 * @fileoverview Status-Parameter der Sichtungskarte — Parsen und Autorisieren.
 *
 * Bewusst rein funktional und ohne SvelteKit- oder DB-Import: Die Regel, WER
 * einen Statusfilter setzen darf, ist die Sicherheitsgrenze dieses Features
 * und soll ohne Route testbar sein.
 *
 * **Kein dritter Veröffentlichungszustand.** Die drei Werte sind die bereits
 * abgeleiteten Bearbeitungszustände (`sightingStatus.ts`); öffentlich ist
 * unverändert genau `freigegeben_am IS NOT NULL` — siehe `.claude/rules/api.md`.
 */
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';
import { SIGHTING_STATUS_ORDER } from '#lib/components/admin/sightingStatus.ts';

/** Die Menge, die ohne Parameter (und damit für jeden Besucher) gilt. */
export const PUBLIC_MAP_STATUSES: readonly SightingStatus[] = ['approved'];

export type StatusSelection =
	| { ok: true; statuses: readonly SightingStatus[]; isPublicDefault: boolean }
	| { ok: false; status: 400 | 403; message: string };

const isKnownStatus = (value: string): value is SightingStatus =>
	(SIGHTING_STATUS_ORDER as readonly string[]).includes(value);

/**
 * `raw === null` heißt: kein Parameter gesendet — der öffentliche Normalfall.
 * Jeder gesendete Parameter verlangt Admin-Rechte, auch `status=approved`:
 * Geprüft wird, ob gefiltert werden darf, nicht was angefragt wurde.
 */
export function resolveMapStatuses(raw: string | null, isAdmin: boolean): StatusSelection {
	if (raw === null) {
		return { ok: true, statuses: PUBLIC_MAP_STATUSES, isPublicDefault: true };
	}

	if (!isAdmin) {
		return { ok: false, status: 403, message: 'Statusfilter erfordert eine Admin-Anmeldung' };
	}

	const tokens = raw
		.split(',')
		.map((token) => token.trim())
		.filter((token) => token.length > 0);

	if (tokens.length === 0) {
		return { ok: false, status: 400, message: 'Parameter "status" darf nicht leer sein' };
	}

	const unknown = tokens.filter((token) => !isKnownStatus(token));
	if (unknown.length > 0) {
		return {
			ok: false,
			status: 400,
			message: `Unbekannter Status: ${unknown.join(', ')}`
		};
	}

	const statuses = [...new Set(tokens.filter(isKnownStatus))];

	return {
		ok: true,
		statuses,
		isPublicDefault: statuses.length === 1 && statuses[0] === 'approved'
	};
}
