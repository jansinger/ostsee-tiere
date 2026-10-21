import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import OLMap from './OLMap.svelte';

/**
 * Der halb gelungene Aufbau: `createMap` klappt, ein Schritt danach nicht.
 *
 * Das ist der unangenehmere der beiden Fehlerfälle und deshalb eine eigene
 * Datei (der `vi.mock` gilt jeweils für die ganze Datei — der Nachbar
 * `OLMapLoadFailure.svelte.test.ts` deckt den Fall ab, dass schon `createMap`
 * scheitert).
 *
 * Ohne Aufräumen bliebe hier eine **funktionsfähige** Karte samt Listenern im
 * DOM stehen — unsichtbar unter dem Fehler-Overlay, aber am Leben. Der
 * Cleanup-Return des Effekts läuft in diesem Pfad nicht: Er greift erst beim
 * Verwerfen des Effekts, nicht bei einem Fehler in seinem asynchronen Teil.
 */
const disposeSpy = vi.fn();

vi.mock('#lib/utils/map/openLayersHelpers.ts', () => ({
	createMap: () => ({
		// Nur das, was `OLMap` auf dem Rückgabewert aufruft.
		dispose: disposeSpy,
		on: vi.fn(),
		updateSize: vi.fn()
	}),
	addMarker: () => {
		throw new Error('addMarker gescheitert (Test)');
	},
	setMapCenter: vi.fn()
}));

describe('OLMap — Aufbau scheitert NACH createMap', () => {
	it('entsorgt die bereits erzeugte Karte', async () => {
		disposeSpy.mockClear();
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect
			.poll(() => disposeSpy.mock.calls.length, { timeout: 5000 })
			.toBeGreaterThanOrEqual(1);
	});

	it('zeigt trotzdem den Fehlerzustand und keinen Dauer-Spinner', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect
			.poll(() => document.querySelector('[data-testid="map-load-error"]'), { timeout: 5000 })
			.not.toBeNull();

		expect(document.querySelector('[data-testid="map-loading"]')).toBeNull();
	});
});
