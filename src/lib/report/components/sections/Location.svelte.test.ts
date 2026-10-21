import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import Location from './Location.svelte';

/**
 * Die **Admin-Maske** behält beide Ortsfelder — auch nachdem das Meldeformular
 * sie zu einem zusammengelegt hat (A2.4). Sie ist der einzige Ort, an dem die
 * `seezeichen`-Spalte des Altbestands noch bearbeitet werden kann; die
 * Legacy-API nimmt `seezeichen` weiterhin entgegen.
 *
 * Der Test existiert wegen eines konkreten Präzedenzfalls: In PR #669 hat eine
 * Feld-Entfernung im Meldeformular der Admin-Maske drei Felder mit weggenommen,
 * weil beide dieselbe Komponente teilten. Hier sind es zwei getrennte
 * (`position/LocationDescription.svelte` vs. diese) — dieser Test hält fest,
 * dass das so bleibt.
 *
 * **Beide Felder stehen unabhängig von der GPS-Position.** Vorher lagen sie im
 * `{:else}`-Zweig von `{#if hasPosition}`, und `adminEditInitialValues.ts:46`
 * leitet `hasPosition` aus den Koordinaten ab — eine Sichtung MIT Koordinaten
 * zeigte deshalb weder `waterway` noch `seaMark`. Im Bestand betraf das 902 der
 * 1.033 Datensätze mit Seezeichen und 1.191 mit Fahrwasser (gemessen am
 * 2026-08-02): genau die Altmeldungen, die zu korrigieren der Grund ist, aus dem
 * `seaMark` überhaupt im Schema bleibt. Die Kopplung an `hasPosition` war im
 * Meldeformular sinnvoll (dort ist die Beschreibung die Alternative zur
 * Position), in der Admin-Maske ist sie es nie gewesen: Dort wird ein
 * vorhandener Datensatz korrigiert, nicht eine Meldung erfasst.
 */
function renderAdminLocation(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(Location, { overrides });
}

function field(name: string): HTMLInputElement | null {
	return document.querySelector<HTMLInputElement>(`[data-testid="field-${name}"]`);
}

/** Das Pflicht-Sternchen der Feld-Pipeline, auf ein Feld eingegrenzt. */
function requiredMark(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-field="${name}"] [aria-label="Pflichtfeld"]`);
}

describe('sections/Location — Admin-Maske', () => {
	it('zeigt ohne GPS-Position weiterhin BEIDE Ortsfelder', () => {
		renderAdminLocation({ hasPosition: false });

		expect(field('waterway')).not.toBeNull();
		expect(field('seaMark')).not.toBeNull();
	});

	it('lässt das Seezeichen bearbeiten — der Altbestand muss korrigierbar bleiben', () => {
		renderAdminLocation({ hasPosition: false, seaMark: 'Tonne 14' });

		const seaMark = field('seaMark');
		expect(seaMark?.value).toBe('Tonne 14');
		expect(seaMark?.disabled).toBe(false);
		expect(seaMark?.readOnly).toBe(false);
	});

	/**
	 * Der praktisch wichtigere Fall: 902 der 1.033 Datensätze mit Seezeichen
	 * tragen zugleich Koordinaten. Blieben die Felder an `hasPosition` gekoppelt,
	 * wäre genau dieser Altbestand nicht erreichbar.
	 */
	it('zeigt beide Ortsfelder AUCH mit GPS-Position', () => {
		renderAdminLocation({
			hasPosition: true,
			latitude: 54.5,
			longitude: 13.5,
			waterway: 'Greifswalder Bodden',
			seaMark: 'Leuchtturm Warnemünde'
		});

		expect(field('waterway')?.value).toBe('Greifswalder Bodden');
		expect(field('seaMark')?.value).toBe('Leuchtturm Warnemünde');
	});

	it('lässt beide Felder mit GPS-Position bearbeiten', () => {
		renderAdminLocation({ hasPosition: true, latitude: 54.5, longitude: 13.5 });

		for (const name of ['waterway', 'seaMark']) {
			expect(field(name)?.disabled, name).toBe(false);
			expect(field(name)?.readOnly, name).toBe(false);
		}
	});

	/**
	 * Die Koordinaten sind laut Schema Pflicht, sobald `hasPosition` gesetzt ist
	 * (`latitude.when('hasPosition', { is: true, … })`). Sie laufen aber nicht
	 * über `FormField` → `FieldRenderer`, das Sternchen und `aria-required` sonst
	 * zentral setzt — `LocationInput` bekommt die Pflicht deshalb als Prop
	 * durchgereicht. Dieser Test hält die Verdrahtung fest; die Darstellung in
	 * allen drei Eingabeformaten prüft `LocationInput.svelte.test.ts`.
	 */
	it('markiert die Koordinaten als Pflicht, sobald die Position angegeben wird', async () => {
		renderAdminLocation({ hasPosition: true, latitude: 54.5, longitude: 13.5 });

		await expect.poll(() => document.getElementById('latitude'), { timeout: 5000 }).not.toBeNull();

		for (const inputId of ['latitude', 'longitude']) {
			expect(
				document.querySelector(`label[for="${inputId}"] [aria-label="Pflichtfeld"]`),
				`Sternchen an ${inputId}`
			).not.toBeNull();
			expect(
				document.getElementById(inputId)?.getAttribute('aria-required'),
				`aria-required an ${inputId}`
			).toBe('true');
		}
	});
});

/**
 * Die Ortsbeschreibung ist Pflicht, solange keine GPS-Position vorliegt
 * (`waterway.when('hasPosition', { is: (v) => v !== true, … })`) — und zwar in
 * beiden Masken, `adminSightingSchema` lockert das Feld nicht.
 *
 * `FieldRenderer` sieht ein `when()` in `describe()` nicht, deshalb braucht jede
 * Aufrufstelle den `required`-Override. Im Meldeformular ist er gesetzt
 * (`position/LocationDescription.svelte`); hier fehlte er.
 *
 * **Anders als bei `deadCondition` oder `boatDrive` muss er konditional sein.**
 * Dort rendert der umgebende Zweig ohnehin nur unter der Schema-Bedingung, hier
 * steht das Feld seit dem 2026-08-02 bewusst unabhängig von `hasPosition` im
 * Markup (Kommentar in `Location.svelte`). Ein festes `required={true}` würde
 * also auch dann ein Sternchen zeigen, wenn Koordinaten vorliegen und niemand
 * eine Beschreibung verlangt.
 */
describe('sections/Location — Ortsbeschreibung als konditionales Pflichtfeld', () => {
	it('markiert die Ortsbeschreibung ohne GPS-Position als Pflicht', () => {
		renderAdminLocation({ hasPosition: false });

		expect(requiredMark('waterway')).not.toBeNull();
		expect(field('waterway')?.getAttribute('aria-required')).toBe('true');
	});

	it('markiert sie MIT GPS-Position nicht als Pflicht', () => {
		renderAdminLocation({ hasPosition: true, latitude: 54.5, longitude: 13.5 });

		expect(requiredMark('waterway')).toBeNull();
		expect(field('waterway')?.getAttribute('aria-required')).toBeNull();
	});

	/** Das Seezeichen ist in keinem Fall Pflicht — es hat gar kein `when()`. */
	it.each([true, false])('lässt das Seezeichen bei hasPosition=%s optional', (hasPosition) => {
		renderAdminLocation({ hasPosition });

		expect(requiredMark('seaMark')).toBeNull();
	});
});

/**
 * Review Task 6, Befund A: `VerifyLocation.svelte` las den Zweig bisher selbst
 * aus `getFormContext()`. `buildAdminEditInitialValues` spreadet den
 * bearbeiteten Datensatz in `$form` — beim Öffnen eines Totfund-Datensatzes
 * trug `$form.isDead` also den echten Wert, und der Ostsee-Hinweis wechselte
 * in der Admin-Maske unbeabsichtigt Farbe (`alert-warning` → `alert-info`) und
 * Wortlaut. `AdminSightingEditForm.svelte` darf sich dadurch nicht verändern.
 *
 * `Location.svelte` (dieser Admin-Pfad) setzt bewusst keine Override-Props an
 * `VerifyLocation` — der Test hält fest, dass der Hinweis dadurch beim
 * Totfund-Datensatz genau so bleibt wie beim Lebend-Datensatz.
 */
describe('sections/Location — Ostsee-Hinweis bleibt admin-seitig unverändert', () => {
	/**
	 * Review Task 6, Befund 2: Der `fetch`-Stub unten überschreibt
	 * `globalThis.fetch` ohne Rücknahme. Bisher folgenlos, weil dieser Block der
	 * letzte in der Datei war — ein später angehängter Test hätte den Stub sonst
	 * unbemerkt erhalten. `globalThis.fetch = vi.fn()` ist eine reine Zuweisung,
	 * kein `vi.spyOn` — `vi.restoreAllMocks()` kennt deshalb kein Original, zu
	 * dem es zurückkehren könnte, und ließe die Zuweisung stehen. Die echte
	 * Referenz wird deshalb hier selbst festgehalten und zurückgeschrieben.
	 */
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('zeigt beim Bearbeiten eines Totfund-Datensatzes weiterhin den bisherigen Sichtungs-Wortlaut in alert-warning', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ inBaltic: false, inChartArea: true, longitude: 10, latitude: 54 })
		}) as unknown as typeof fetch;

		renderAdminLocation({ hasPosition: true, isDead: true, latitude: 54, longitude: 10 });

		const outsideNotice = page.getByTestId('verify-location-outside');
		await expect.element(outsideNotice).toBeVisible();
		await expect.element(outsideNotice).toHaveClass(/alert-warning/);
		await expect
			.element(outsideNotice)
			.toHaveTextContent('Die Koordinaten liegen scheinbar außerhalb der Ostsee.');
	});
});
