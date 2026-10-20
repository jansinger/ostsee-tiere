import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import PositionPanel from './PositionPanel.svelte';

/**
 * Deckt nur die Verdrahtung der konditionalen Koordinaten-Pflicht ab.
 *
 * `latitude`/`longitude` sind laut Schema Pflicht, sobald `hasPosition` gesetzt
 * ist. Sie laufen als einzige Felder des Formulars nicht über `FormField` →
 * `FieldRenderer` (rohe Inputs in `LocationInput.svelte`), das Sternchen und
 * `aria-required` sonst zentral aus einer Variablen erzeugt — die Pflicht wird
 * hier als Prop durchgereicht. Wie sie in den drei Eingabeformaten dargestellt
 * wird, prüft `LocationInput.svelte.test.ts`.
 *
 * `hasPosition` ist im Meldeformular kein Bedienelement, sondern wird aus den
 * Koordinaten abgeleitet (`syncHasPosition`) — die beiden Fälle unten setzen es
 * deshalb zusammen mit den Koordinaten.
 */
function renderPositionPanel(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(PositionPanel, { overrides });
}

function requiredMarkIn(inputId: string): Element | null {
	return document.querySelector(`label[for="${inputId}"] [aria-label="Pflichtfeld"]`);
}

function ariaRequiredOf(inputId: string): string | null {
	return document.getElementById(inputId)?.getAttribute('aria-required') ?? null;
}

describe('PositionPanel — Pflicht-Markierung der Koordinaten', () => {
	it('markiert die Koordinaten, sobald eine Position vorliegt', async () => {
		renderPositionPanel({ hasPosition: true, latitude: 54.5, longitude: 13.5 });

		await expect.poll(() => document.getElementById('latitude'), { timeout: 5000 }).not.toBeNull();

		for (const inputId of ['latitude', 'longitude']) {
			expect(requiredMarkIn(inputId), `Sternchen an ${inputId}`).not.toBeNull();
			expect(ariaRequiredOf(inputId), `aria-required an ${inputId}`).toBe('true');
		}
	});

	/**
	 * Ohne Position ist die Ortsbeschreibung die Alternative — dann tragen die
	 * Koordinaten keine Pflicht, sondern `waterway` (siehe
	 * `LocationDescription.svelte.test.ts`).
	 *
	 * `toBeNull()` und nicht `.not.toBe('true')`: Im Nein-Fall soll das Attribut
	 * ganz fehlen statt als `aria-required="false"` dazustehen — so hält es
	 * `BaseInput.svelte` (`restProps.required || undefined`) für jedes andere
	 * Feld. Dieselbe Assertion wie in `LocationInput.svelte.test.ts`; eine
	 * laxere hier ließe die Verdrahtung ein `false` durchreichen, das die
	 * Komponententests längst verbieten.
	 */
	it('lässt die Koordinaten ohne Position unmarkiert', async () => {
		renderPositionPanel({ hasPosition: false, latitude: undefined, longitude: undefined });

		await expect.poll(() => document.getElementById('latitude'), { timeout: 5000 }).not.toBeNull();

		for (const inputId of ['latitude', 'longitude']) {
			expect(requiredMarkIn(inputId), `Sternchen an ${inputId}`).toBeNull();
			expect(ariaRequiredOf(inputId), `aria-required an ${inputId}`).toBeNull();
		}
	});
});

/**
 * Review Task 6, Befund 1 (Nachreview): `positionQuestion` (`#lib/report/wording.ts`)
 * ändert die Frage über der Positionsangabe am Totfund-Zweig. Abgedeckt war bisher
 * nur die reine Funktion (`wording.test.ts`) — kein Test rendert, was der Melder auf
 * Schritt 1 tatsächlich liest. Ein an die falsche Stelle verdrahteter Text wäre der
 * Suite dadurch nicht aufgefallen.
 */
describe('PositionPanel — Frage über der Position am Zweig', () => {
	it('fragt beim Totfund nach dem Fundort statt der Sichtung', async () => {
		renderPositionPanel({ isDead: true });

		await expect
			.element(page.getByText('Wo haben Sie das Tier gefunden?', { exact: true }))
			.toBeVisible();
	});

	it('fragt beim Lebend-Zweig weiterhin nach dem Sichtungsort', async () => {
		renderPositionPanel({ isDead: false });

		await expect
			.element(page.getByText('Wo haben Sie das Tier gesehen?', { exact: true }))
			.toBeVisible();
	});
});

/**
 * Review Task 6, Befund 1 (Nachreview): Die Marker-Erklärung unter der Karte läuft
 * über zwei Durchreich-Stationen — `PositionPanel` setzt `mapHintText`
 * (`mapHint($form.isDead, …)`) als `mapHintOverride` an `LocationInput`, das den
 * Wert unverändert als `hintOverride` an `OLMap` weitergibt
 * (`LocationInput.svelte:473`). Fiele diese zweite Weitergabe weg, fiele `OLMap`
 * auf seinen eigenen Default-Wortlaut zurück, der UNABHÄNGIG vom Zweig immer
 * „gesehen" sagt (`OLMap.svelte:66`/`69`) — dieser Test wäre dann für den
 * Totfund-Zweig rot. Belegt per Mutationstest (siehe Bericht), nicht nur behauptet.
 */
describe('PositionPanel — Marker-Erklärung erreicht die Karte über LocationInput', () => {
	function mapHintText(): string {
		return document.querySelector('[data-testid="map-hint"]')?.textContent?.trim() ?? '';
	}

	it('zeigt beim Totfund den Fund-Wortlaut im Karten-Hinweis', async () => {
		renderPositionPanel({ isDead: true, hasPosition: true, latitude: 54.5, longitude: 13.5 });

		await expect.poll(() => mapHintText(), { timeout: 5000 }).toMatch(/gefunden/i);
		expect(mapHintText()).not.toMatch(/gesehen/i);
	});

	it('zeigt beim Lebend-Zweig weiterhin den Sichtungs-Wortlaut', async () => {
		renderPositionPanel({ isDead: false, hasPosition: true, latitude: 54.5, longitude: 13.5 });

		await expect.poll(() => mapHintText(), { timeout: 5000 }).toMatch(/gesehen/i);
		expect(mapHintText()).not.toMatch(/gefunden/i);
	});
});

/**
 * Review Task 6, Befund 1 (Nachreview): `PositionPanel` übergibt `noticeOverride`/
 * `severityOverride` an `VerifyLocation` (`PositionPanel.svelte:305-306`) — nur der
 * Bürger-Aufrufer tut das, der Admin-Pfad (`sections/Location.svelte`) bewusst
 * nicht. `sections/Location.svelte.test.ts` prüft bislang nur die ABWESENHEIT
 * dieser Props im Admin-Pfad; dass sie beim Bürger-Aufrufer tatsächlich ANKOMMEN,
 * prüfte nichts. Genau das war der Fehler, der zu diesem Nachreview führte.
 */
describe('PositionPanel — Ostsee-Hinweis in Bürger-Richtung', () => {
	/**
	 * Nur `/api/geo/inBaltic` wird gestubbt — `PositionPanel` lädt im selben
	 * `$effect` per `getUploadConfig()` auch `/api/config/upload` für die
	 * GPS-Foto-Konfiguration (siehe `PositionPanel.svelte:86`). Ein pauschaler
	 * Stub auf `globalThis.fetch` (wie in `sections/Location.svelte.test.ts`,
	 * wo das Admin-Formular diesen zweiten Aufruf nicht macht) beantwortet dort
	 * dieselbe Ostsee-Antwort und lässt `getUploadConfig` an der falschen Form
	 * scheitern (`config.allowedTypes.filter` auf `undefined`).
	 *
	 * `globalThis.fetch = vi.fn()` ist außerdem eine reine Zuweisung, kein
	 * `vi.spyOn` — `vi.restoreAllMocks()` kennt kein Original, zu dem es
	 * zurückkehren könnte (Review Task 6, Befund 2). Die echte Referenz wird
	 * deshalb hier selbst festgehalten und nach jedem Test zurückgeschrieben.
	 */
	const originalFetch = globalThis.fetch;

	function stubInBalticFetch(): void {
		globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/api/geo/inBaltic')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ inBaltic: false, inChartArea: true, longitude: 10, latitude: 54 })
				} as Response);
			}
			return originalFetch(input, init);
		}) as typeof fetch;
	}

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('zeigt beim Totfund außerhalb der Ostsee den entschärften Info-Hinweis', async () => {
		stubInBalticFetch();

		renderPositionPanel({ isDead: true, hasPosition: true, latitude: 54, longitude: 10 });

		const outsideNotice = page.getByTestId('verify-location-outside');
		await expect.element(outsideNotice).toBeVisible();
		await expect.element(outsideNotice).toHaveClass(/alert-info/);
		await expect
			.element(outsideNotice)
			.toHaveTextContent(
				'Bitte prüfen Sie die Position. Totfunde werden meist an Stränden oder Küstenabschnitten gefunden.'
			);
	});

	it('zeigt beim Lebend-Zweig außerhalb der Ostsee weiterhin die strengere Warnung', async () => {
		stubInBalticFetch();

		renderPositionPanel({ isDead: false, hasPosition: true, latitude: 54, longitude: 10 });

		const outsideNotice = page.getByTestId('verify-location-outside');
		await expect.element(outsideNotice).toBeVisible();
		await expect.element(outsideNotice).toHaveClass(/alert-warning/);
	});
});
