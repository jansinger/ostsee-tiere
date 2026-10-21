import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import OLMap from './OLMap.svelte';

/**
 * WARUM ES DIESE DATEI GIBT — UND WARUM SIE GETRENNT LIEGT
 *
 * Seit OpenLayers per `await import(...)` nachgeladen wird, gibt es einen
 * Fehlerfall, den es vorher nicht geben konnte: Das Nachladen kann scheitern.
 * Ein Deploy wechselt die Chunk-Namen unter einer offenen Seite, oder das
 * Funknetz bricht weg — das Formular wird an Deck und am Strand ausgefüllt.
 *
 * Ohne Behandlung wäre die Rejection unsichtbar: `void (async () => …)()`
 * verschluckt sie, und es gibt in diesem Projekt keinen `hooks.client.ts`, der
 * unbehandelte Rejections auffinge. Zurück bliebe ein Spinner, der nie aufhört
 * — ohne Erklärung, ohne Ausweg, und für den Melder ohne Möglichkeit, eine
 * Position anzugeben.
 *
 * Der Mock gilt für die ganze Datei, deshalb die eigene Datei: Die Nachbarn in
 * `OLMap.svelte.test.ts` brauchen das echte Modul.
 */
/*
 * Nachgestellt wird der Fehlschlag NICHT über eine abgewiesene `import()`-
 * Promise: Wirft die `vi.mock`-Factory selbst, meldet Vitest einen eigenen
 * Mocking-Fehler, statt die Rejection bis in die Komponente durchzureichen —
 * getestet wäre dann Vitest, nicht `OLMap`.
 *
 * Stattdessen scheitert `createMap`. Das liegt im selben `await`-Block hinter
 * demselben `.catch(...)` wie die Import-Rejection, nimmt also denselben Pfad,
 * und ist obendrein ein realer Fall für sich: ein WebGL-/Canvas-Fehlschlag auf
 * einem alten Telefon.
 */
vi.mock('#lib/utils/map/openLayersHelpers.ts', () => ({
	createMap: () => {
		throw new Error('Failed to fetch dynamically imported module (Test)');
	},
	addMarker: () => {
		throw new Error('nicht erreichbar — createMap wirft vorher');
	},
	setMapCenter: () => {}
}));

describe('OLMap — Nachladen von OpenLayers schlägt fehl', () => {
	it('zeigt einen Fehlerzustand statt eines endlosen Spinners', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect
			.poll(() => document.querySelector('[data-testid="map-load-error"]'), { timeout: 5000 })
			.not.toBeNull();

		// Der Kern der Sache: Der Ladehinweis ist WEG. Bliebe er stehen, wäre
		// genau der Zustand erreicht, den dieser Test verhindern soll.
		expect(document.querySelector('[data-testid="map-loading"]')).toBeNull();
	});

	it('meldet den Fehler assertiv und mit Text', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		const fehler = await expect
			.poll(() => document.querySelector('[data-testid="map-load-error"]'), { timeout: 5000 })
			.not.toBeNull()
			.then(() => document.querySelector('[data-testid="map-load-error"]'));

		// `role="alert"` statt `status`: Ohne Karte ist die Positionsangabe nur
		// noch über die Koordinatenfelder möglich — das muss ankommen.
		expect(fehler?.getAttribute('role')).toBe('alert');
		expect(fehler?.textContent?.trim() ?? '').not.toBe('');
	});

	/**
	 * Gegenprobe: Ohne sie wäre das Grün oben auch dann zu haben, wenn die
	 * Karte in Wahrheit gebaut worden wäre und der Fehlerzustand aus einem
	 * anderen Grund erscheint.
	 */
	it('baut in diesem Fall keine Karte auf', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect
			.poll(() => document.querySelector('[data-testid="map-load-error"]'), { timeout: 5000 })
			.not.toBeNull();

		expect(document.querySelectorAll('.ol-viewport').length).toBe(0);
	});
});
