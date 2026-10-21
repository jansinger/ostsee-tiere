import * as m from '#lib/paraglide/messages.js';
/**
 * Pure Zustands- und Fehlerlogik der LocationControl (N2) — vom DOM getrennt,
 * damit sie ohne OpenLayers/Browser testbar ist.
 */

// Funktionen statt Konstanten: Ein `export const` mit fertigem Text fröre die
// Sprache beim Modulladen ein (Entwurf 2.3/4.1).
export const locationLabelIdle = (): string => m.map_controls_text_gps_position_anzeigen();
export const locationLabelTracking = (): string => m.map_controls_text_gps_tracking_stoppen();

export interface LocationButtonState {
	/** Wert für aria-pressed — der Button ist ein Toggle. */
	pressed: boolean;
	/** Gemeinsames title/aria-label des Buttons. */
	label: string;
}

export function locationButtonState(isTracking: boolean): LocationButtonState {
	return isTracking
		? { pressed: true, label: locationLabelTracking() }
		: { pressed: false, label: locationLabelIdle() };
}

/**
 * Übersetzt GeolocationPositionError-Codes (1 = PERMISSION_DENIED,
 * 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT) in verständliche deutsche Meldungen.
 */
export function geolocationErrorMessage(code?: number): string {
	switch (code) {
		case 1:
			return m.map_controls_text_die_standortfreigabe_wurde_verweigert_bi();
		case 2:
			return m.map_controls_text_ihre_position_ist_derzeit_nicht_verfuegb();
		case 3:
			return m.map_controls_text_zeitueberschreitung_bei_der_standortbest();
		default:
			return m.map_controls_text_ihre_position_konnte_nicht_ermittelt_wer();
	}
}
