import { describe, expect, it } from 'vitest';
import { flushSync, tick } from 'svelte';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import LocationDescription from './LocationDescription.svelte';

/**
 * Der Block darf das Feld, in dem gerade getippt wird, nicht neu aufbauen.
 *
 * Ursprünglich rendert die Komponente die Beschreibungsfelder in zwei Zweigen
 * eines `{#if collapsed}` — und `collapsed` hängt an genau diesen Feldern. Der
 * erste Tastendruck, der `waterway` füllt, riss deshalb den gesamten Teilbaum
 * ab: Das gerade fokussierte Feld wurde ersetzt, `document.activeElement` fiel
 * auf `<body>` zurück und der nächste Tab begann wieder oben auf der Seite.
 *
 * Seit dem Zusammenlegen der Ortsbeschreibung (A2.4) steht dort genau ein Feld;
 * die Teardown-Gefahr bleibt dieselbe, weil `startsOpen` weiterhin aus dem
 * Feldwert abgeleitet wird.
 */
function renderWithForm(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(LocationDescription, { overrides });
}

function field(name: string): HTMLInputElement {
	const element = document.querySelector<HTMLInputElement>(`[data-testid="field-${name}"]`);
	if (!element) throw new Error(`Feld "${name}" nicht im DOM`);
	return element;
}

function block(): HTMLDetailsElement {
	const element = document.querySelector<HTMLDetailsElement>(
		'[data-testid="location-description"]'
	);
	if (!element) throw new Error('Ortsbeschreibung nicht im DOM');
	return element;
}

/** Simuliert das `change`-Ereignis, das der Browser beim Verlassen des Feldes feuert. */
async function fireChange(input: HTMLInputElement, value: string): Promise<void> {
	input.value = value;
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
	await tick();
}

const WITH_COORDINATES: Partial<SightingFormData> = {
	latitude: 54.5,
	longitude: 13.5,
	hasPosition: true,
	waterway: ''
};

describe('LocationDescription', () => {
	/**
	 * Wunsch des Deutschen Meeresmuseums (A2.4): eine Ortsbeschreibung als **ein**
	 * Freitextfeld. `seaMark` bleibt im Schema und in der Admin-Maske, hier darf es
	 * aber nicht mehr auftauchen.
	 */
	it('zeigt genau ein Beschreibungsfeld — kein separates Seezeichen-Feld', async () => {
		renderWithForm({ latitude: undefined, longitude: undefined, waterway: '' });

		expect(document.querySelectorAll('[data-testid^="field-"]')).toHaveLength(1);
		expect(document.querySelector('[data-testid="field-seaMark"]')).toBeNull();
		expect(field('waterway')).toBeTruthy();
	});

	it('behält Fokus und Feld-Knoten, wenn waterway seinen ersten Wert bekommt', async () => {
		renderWithForm(WITH_COORDINATES);

		// Nutzer klappt den Block auf und tippt — genau der Pfad, der vorher brach.
		block().open = true;
		await tick();

		const waterwayBefore = field('waterway');
		waterwayBefore.focus();
		expect(document.activeElement).toBe(waterwayBefore);

		await fireChange(waterwayBefore, 'Kieler Bucht');

		expect(document.activeElement).toBe(waterwayBefore);
		expect(field('waterway')).toBe(waterwayBefore);
	});

	it('verliert den getippten Text nicht, wenn waterway wieder geleert wird', async () => {
		renderWithForm(WITH_COORDINATES);

		block().open = true;
		await tick();

		const waterwayBefore = field('waterway');
		await fireChange(waterwayBefore, 'Kieler Bucht');
		await fireChange(waterwayBefore, '');

		// Derselbe Knoten, und der Block bleibt offen — kein Zuklappen mitten im Tippen.
		expect(field('waterway')).toBe(waterwayBefore);
		expect(block().open).toBe(true);
	});

	it('ist ohne Koordinaten von Anfang an offen', async () => {
		renderWithForm({ latitude: undefined, longitude: undefined, waterway: '' });

		expect(block().open).toBe(true);
	});

	/**
	 * Die konditionale Pflicht (`waterway.when('hasPosition', …)`) ist aus
	 * `describe()` nicht ableitbar — sie hängt am `required`-Override der
	 * Komponente. Ohne ihn widersprächen Sternchen und Validierung einander.
	 */
	it('markiert die Ortsbeschreibung ohne GPS-Position als Pflichtfeld', async () => {
		renderWithForm({ latitude: undefined, longitude: undefined, hasPosition: false, waterway: '' });

		expect(field('waterway').getAttribute('aria-required')).toBe('true');
	});

	it('nimmt der Ortsbeschreibung die Pflicht, sobald Koordinaten vorliegen', async () => {
		renderWithForm(WITH_COORDINATES);

		expect(field('waterway').getAttribute('aria-required')).not.toBe('true');
	});

	it('startet mit Koordinaten und leerem Feld zugeklappt, bleibt aber erreichbar', async () => {
		renderWithForm(WITH_COORDINATES);

		expect(block().open).toBe(false);
		// `PositionPanel.focusDescription()` klappt Vorfahren-<details> imperativ auf.
		// Das funktioniert nur, solange hier kein `bind:open` dagegenhält.
		block().open = true;
		await tick();
		field('waterway').focus();
		expect(document.activeElement).toBe(field('waterway'));
	});
});
