/**
 * DOM-Tests für die LocationControl (N2) — laufen im Browser-Projekt, weil das
 * Control echte DOM-Elemente baut (ol/control braucht document).
 */
import { describe, expect, it, vi } from 'vitest';
import type { MapController } from '#lib/map/optimizedMapController.ts';
import { LocationControl } from './LocationControl';

/** Minimaler MapController-Fake: Tracking-Zustand + Listener wie der echte Controller. */
function createControllerFake() {
	let tracking = false;
	const listeners: ((isTracking: boolean) => void)[] = [];
	const controller: MapController = {
		toggleGeolocation: vi.fn(() => {
			tracking = !tracking;
			listeners.forEach((cb) => cb(tracking));
		}),
		zoomAllFeatures: vi.fn(),
		onTrackingChange: (cb) => listeners.push(cb)
	};
	return {
		controller,
		/** Simuliert einen Geolocation-Fehler: Controller stoppt und benachrichtigt. */
		emitTrackingStopped() {
			tracking = false;
			listeners.forEach((cb) => cb(false));
		}
	};
}

function getButton(control: LocationControl): HTMLButtonElement {
	// `element` ist in den OL-Typings protected, zur Laufzeit aber zugänglich —
	// für den DOM-Test reicht der lesende Zugriff.
	const element = (control as unknown as { element: HTMLElement }).element;
	const button = element.querySelector('button');
	if (!button) throw new Error('LocationControl rendert keinen Button');
	return button;
}

describe('LocationControl', () => {
	it('rendert einen type=button mit deutschem Label und aria-pressed=false', () => {
		const { controller } = createControllerFake();
		const control = new LocationControl(controller);
		const button = getButton(control);

		expect(button.type).toBe('button');
		expect(button.getAttribute('aria-label')).toBe('GPS-Position anzeigen');
		expect(button.title).toBe('GPS-Position anzeigen');
		expect(button.getAttribute('aria-pressed')).toBe('false');
	});

	it('nutzt ein Inline-SVG-Icon mit aria-hidden statt Emoji', () => {
		const { controller } = createControllerFake();
		const control = new LocationControl(controller);
		const button = getButton(control);

		const svg = button.querySelector('svg');
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(button.textContent).not.toContain('📍');
	});

	it('wechselt beim Klick auf aria-pressed=true und Stopp-Label', () => {
		const { controller } = createControllerFake();
		const control = new LocationControl(controller);
		const button = getButton(control);

		button.click();

		expect(controller.toggleGeolocation).toHaveBeenCalledOnce();
		expect(button.getAttribute('aria-pressed')).toBe('true');
		expect(button.getAttribute('aria-label')).toBe('GPS-Tracking stoppen');
		expect(button.title).toBe('GPS-Tracking stoppen');
	});

	it('setzt den Zustand zurück, wenn der Controller das Tracking stoppt (Fehlerpfad)', () => {
		const fake = createControllerFake();
		const control = new LocationControl(fake.controller);
		const button = getButton(control);

		button.click();
		expect(button.getAttribute('aria-pressed')).toBe('true');

		// z. B. verweigerte Berechtigung: Controller stoppt Tracking von sich aus
		fake.emitTrackingStopped();

		expect(button.getAttribute('aria-pressed')).toBe('false');
		expect(button.getAttribute('aria-label')).toBe('GPS-Position anzeigen');
	});
});
