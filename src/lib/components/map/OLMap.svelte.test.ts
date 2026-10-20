import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import OLMap from './OLMap.svelte';

/**
 * Tests für `OLMap` rund um das Nachladen von OpenLayers.
 *
 * Hintergrund: OpenLayers (~276 KB roh / ~80 KB gzip) hing über
 * `LocationInput` → `OLMap` statisch im Initial-Bundle der Einstiegsseite.
 * Die Wert-Importe (`openLayersHelpers`, `ol/proj`) wandern deshalb in den
 * Init-`$effect` hinter `await import(...)`. Ab dann vergeht zwischen dem
 * Rendern und der fertigen Karte messbare Zeit — und in dieser Zeit darf die
 * Kartenfläche nicht kommentarlos leer bleiben.
 *
 * Verankert wird der Ladezustand an `data-testid="map-loading"` und
 * `role="status"`, nicht am Wortlaut: Die Texte kommen aus
 * `#lib/paraglide/messages.js` und sind übersetzbar.
 *
 * Die Karte entsteht in einem `$effect` — auf `.ol-viewport` wird deshalb
 * gepollt statt sie synchron zu erwarten (dasselbe Muster wie in
 * `src/lib/report/components/form/LocationInput.svelte.test.ts`).
 */

function loadingIndicator(): HTMLElement | null {
	return document.querySelector('[data-testid="map-loading"]');
}

function viewportCount(): number {
	return document.querySelectorAll('.ol-viewport').length;
}

function gpsControlCount(): number {
	return document.querySelectorAll('.gps-control').length;
}

describe('OLMap — Ladezustand während OpenLayers nachlädt', () => {
	/*
	 * Dass der Ladehinweis überhaupt erscheint, prüft `OLMapSsr.test.ts` — und
	 * zwar serverseitig, weil die Aussage hier nur als Wettlauf zu haben wäre:
	 * „ist er unmittelbar nach dem Rendern noch da?" trifft nur zu, solange der
	 * OpenLayers-Chunk langsam genug lädt. Liegt er erst einmal im Modul-Cache,
	 * ist die Karte womöglich schon fertig, und der Test fiele ohne echten
	 * Fehler um. Hier bleibt deshalb nur die Gegenrichtung.
	 */
	it('nimmt den Ladehinweis wieder weg, sobald die Karte da ist', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect.poll(viewportCount, { timeout: 5000 }).toBe(1);
		expect(loadingIndicator(), 'Ladehinweis nach fertiger Karte').toBeNull();
	});
});

describe('OLMap — Karte funktioniert nach dem Nachladen weiterhin', () => {
	it('baut genau eine Karte auf', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect.poll(viewportCount, { timeout: 5000 }).toBe(1);
	});

	/**
	 * Das GPS-Control stammt aus `FormLocationControl`
	 * (`src/lib/utils/map/openLayersHelpers.ts`) und trägt die Klasse
	 * `gps-control`. Es entsteht in `createMap` — also in genau dem Modul, das
	 * künftig nachgeladen wird.
	 */
	it('erzeugt das GPS-Control, wenn enableGPS gesetzt ist', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5, enableGPS: true });

		await expect.poll(gpsControlCount, { timeout: 5000 }).toBe(1);
	});

	it('erzeugt kein GPS-Control ohne enableGPS', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		// Erst auf die fertige Karte warten, damit „kein Control" nicht nur
		// bedeutet, dass die Karte noch gar nicht existiert.
		await expect.poll(viewportCount, { timeout: 5000 }).toBe(1);
		expect(gpsControlCount()).toBe(0);
	});
});

describe('OLMap — readonly-Variante', () => {
	it('zeigt keinen Marker-Hinweis, aber trotzdem die Karte', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5, readonly: true });

		await expect.poll(viewportCount, { timeout: 5000 }).toBe(1);
		expect(document.querySelector('[data-testid="map-hint"]')).toBeNull();
	});

	it('unterdrückt das GPS-Control auch bei enableGPS', async () => {
		await render(OLMap, {
			latitude: 54.5,
			longitude: 13.5,
			readonly: true,
			enableGPS: true
		});

		await expect.poll(viewportCount, { timeout: 5000 }).toBe(1);
		expect(gpsControlCount()).toBe(0);
	});
});

/**
 * Regressionsschutz: `tabindex` am Ziel-Element der Karte hat schon einmal Pan
 * und Wheel-Zoom bis zum ersten Klick gebrochen; die Begründung, warum es hier
 * trotzdem stehen muss (OpenLayers-Tastatursteuerung, Rolle `application`),
 * steht als Kommentar im Markup über `svelte-ignore
 * a11y_no_noninteractive_tabindex`.
 *
 * Beim Umbau auf den lazy Import wird genau dieses Element angefasst — ein
 * Ladezustand muss darin oder daneben Platz finden, ohne die Auszeichnung zu
 * verlieren.
 */
describe('OLMap — Auszeichnung des Kartencontainers', () => {
	it('behält tabindex="0" und role="application" am Container', async () => {
		await render(OLMap, { latitude: 54.5, longitude: 13.5 });

		await expect
			.poll(() => document.querySelector('.ol-map-container'), { timeout: 5000 })
			.not.toBeNull();

		const container = document.querySelector('.ol-map-container');
		expect(container?.getAttribute('tabindex')).toBe('0');
		expect(container?.getAttribute('role')).toBe('application');
		expect(container?.getAttribute('aria-label')?.trim() ?? '').not.toBe('');
	});
});
