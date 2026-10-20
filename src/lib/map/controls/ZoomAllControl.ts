import * as m from '#lib/paraglide/messages.js';
import { Control } from 'ol/control';
import type { MapController } from '#lib/map/optimizedMapController.ts';

/**
 * Control zum Zoomen auf alle Features
 */
// Maximize/Fit-Extent-Icon (Lucide "maximize"), 20x20, currentColor.
const MAXIMIZE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

export class ZoomAllControl extends Control {
	constructor(mapInstance: MapController) {
		const button = document.createElement('button');
		button.type = 'button';
		button.innerHTML = MAXIMIZE_ICON_SVG;
		button.title = m.map_controls_text_auf_alle_sichtungen_zoomen();
		button.setAttribute('aria-label', m.map_controls_text_auf_alle_sichtungen_zoomen());

		const element = document.createElement('div');
		element.className = 'zoom-all-control ol-unselectable ol-control';
		element.appendChild(button);

		super({
			element: element
		});

		button.addEventListener('click', () => {
			mapInstance.zoomAllFeatures();
		});
	}
}
