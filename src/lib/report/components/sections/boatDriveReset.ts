/**
 * Pure Entscheidungslogik für den Bootsantrieb-Reset in SightingDetails.svelte.
 *
 * Hintergrund (Bugfix): `boatDrive`/`boatDriveText` dürfen nur zurückgesetzt
 * werden, wenn der NUTZER `sightingFrom` aktiv von einem Boot mit Antrieb
 * (Segelschiff/Motorboot) auf einen Nicht-Boot-Wert (Land/Fähre/Sonstiges)
 * ändert. Beim initialen Mount mit bereits vorbefüllten Daten (z.B. im
 * Admin-Edit-Formular für eine bestehende Land-Sichtung) darf KEIN Reset
 * passieren, da sonst ein gespeicherter `boatDrive`-Wert unsichtbar aus dem
 * Formular-State gelöscht und beim Speichern durch 0 ("Sonstiger
 * Bootsantrieb") überschrieben wird.
 */

import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';

/** Formularwert für "Sichtung erfolgte von" - String (HTML-Select) oder Number (Yup-Schema) */
export type SightingFromValue = string | number | undefined | null;

/** Sentinel: es wurde noch kein vorheriger `sightingFrom`-Wert beobachtet (initialer Mount). */
export const NOT_YET_TRACKED = Symbol('sightingFrom:not-yet-tracked');

/** Zustand des "zuletzt gesehenen" `sightingFrom`-Werts, inkl. Initialzustand. */
export type TrackedSightingFromValue = typeof NOT_YET_TRACKED | SightingFromValue;

/**
 * Sichtung erfolgte von einem Boot mit Antrieb (Segelschiff/Motorboot) aus.
 * String-Vergleich, damit sowohl Number- (Yup) als auch String-Werte
 * (HTML-Select via bind:value) robust erkannt werden.
 */
export function isBoatSightingFrom(value: SightingFromValue): boolean {
	return (
		String(value) === String(SightingFromEnum.SAILBOAT) ||
		String(value) === String(SightingFromEnum.MOTORBOAT)
	);
}

/**
 * Entscheidet, ob `boatDrive`/`boatDriveText` zurückgesetzt werden müssen.
 *
 * Reset nur beim ECHTEN Übergang "Boot mit Antrieb" -> "kein Boot mit Antrieb":
 * - `previous` ist bereits bekannt (kein initialer Mount, siehe `NOT_YET_TRACKED`)
 * - `previous` war ein Boot mit Antrieb
 * - `next` ist KEIN Boot mit Antrieb (mehr)
 *
 * Alle anderen Fälle (initialer Mount, Wechsel zwischen zwei Nicht-Boot-Werten,
 * Wechsel zu einem Boot-Wert) lösen bewusst KEINEN Reset aus.
 */
export function shouldResetBoatDrive(
	previous: TrackedSightingFromValue,
	next: SightingFromValue
): boolean {
	if (previous === NOT_YET_TRACKED) {
		return false;
	}

	return isBoatSightingFrom(previous) && !isBoatSightingFrom(next);
}
