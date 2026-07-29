import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import LoadingOverlay from './LoadingOverlay.svelte';

/**
 * Tests für LoadingOverlay (Befund H5): Der Ladezustand ist kein Dialog,
 * sondern eine Statusmeldung — role="status" + aria-live="polite" auf einer
 * dauerhaft vorhandenen Live-Region. Das frühere role="dialog"/aria-modal
 * saß auf dem leeren Backdrop-Div, und aria-labelledby zeigte in einen
 * anderen Teilbaum.
 */

function getStatusRegion(): HTMLElement {
	const status = document.querySelector('[role="status"]');
	if (!(status instanceof HTMLElement)) {
		throw new Error('Status-Live-Region nicht gefunden');
	}
	return status;
}

describe('LoadingOverlay', () => {
	it('Live-Region existiert schon vor dem Sichtbarwerden (sonst verpassen Screenreader die erste Meldung)', () => {
		render(LoadingOverlay, { isVisible: false, type: 'initial' });

		const status = getStatusRegion();
		expect(status.getAttribute('aria-live')).toBe('polite');
		expect(status.textContent?.trim()).toBe('');
	});

	it('zeigt Statusmeldung und Initial-Hinweis innerhalb der Live-Region', () => {
		render(LoadingOverlay, { isVisible: true, type: 'initial' });

		const status = getStatusRegion();
		expect(status.textContent).toContain('Karte wird initialisiert...');
		expect(status.textContent).toContain('Tastaturkürzel');
	});

	it('enthält keine Dialog-/Modal-Attribute mehr', () => {
		render(LoadingOverlay, { isVisible: true, type: 'initial' });

		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.querySelector('[aria-modal]')).toBeNull();
	});

	it('dekoratives Spinner-Icon ist aria-hidden (wird in der Live-Region nicht mit angesagt)', () => {
		render(LoadingOverlay, { isVisible: true, type: 'initial' });

		const svg = document.querySelector('[role="status"] svg');
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	/**
	 * Das Overlay sperrt mit `fixed inset-0` plus Backdrop die ganze Karte. Beim
	 * ersten Aufbau ist das richtig — es gibt noch nichts zu bedienen. Für
	 * Filterwechsel wäre es der falsche Griff, und genau dafür gab es früher die
	 * Varianten `filter`, `features` und `default` (ohne Aufrufstelle). Sie sind
	 * entfernt; Filter zeigen ihren Ladezustand inline im `FilterPanel`.
	 */
	it('kennt nur noch den Initial-Ladevorgang', () => {
		render(LoadingOverlay, { isVisible: true });

		expect(document.body.textContent).toContain('Karte wird initialisiert...');
		expect(document.body.textContent).not.toContain('Filter werden angewendet');
	});
});
