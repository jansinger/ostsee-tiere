import { Control } from 'ol/control';
import type { MapController } from '#lib/map/optimizedMapController.ts';
import { locationButtonState } from './locationControlState';

/**
 * Control für GPS-Standortbestimmung (N2)
 */
// Locate-Icon (Lucide "locate"), 20x20, currentColor — analog ZoomAllControl.
const LOCATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/></svg>`;

export class LocationControl extends Control {
	private button: HTMLButtonElement;

	constructor(mapInstance: MapController) {
		const button = document.createElement('button');
		button.type = 'button';
		button.innerHTML = LOCATE_ICON_SVG;

		const element = document.createElement('div');
		element.className = 'location-control ol-unselectable ol-control';
		element.appendChild(button);

		super({
			element: element
		});

		this.button = button;
		this.applyState(false);

		button.addEventListener('click', () => {
			mapInstance.toggleGeolocation();
		});

		// Button-Zustand kommt ausschließlich vom Controller: so setzt auch ein
		// Geolocation-Fehler (z. B. verweigerte Berechtigung) den Toggle zurück.
		mapInstance.onTrackingChange((isTracking) => this.applyState(isTracking));
	}

	private applyState(isTracking: boolean): void {
		const state = locationButtonState(isTracking);
		this.button.setAttribute('aria-pressed', String(state.pressed));
		this.button.title = state.label;
		this.button.setAttribute('aria-label', state.label);
	}
}
