import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { CountData } from '$lib/map/countManager';
import type { MapTranslations } from '$lib/map/mapUtils';
import LegendPanel from './LegendPanel.svelte';

const mockCountManager = {
	setSpeciesVisibility: vi.fn(),
	setColorVisibility: vi.fn()
};

vi.mock('$lib/map/mapContext', () => ({
	getMapCountManager: () => mockCountManager
}));

const translations: MapTranslations = {
	overview: 'Uebersicht',
	zoom_title: 'Zoom',
	zoom: 'Zoom',
	report_date: 'Meldedatum',
	language: 'Sprache',
	species: 'Tierart',
	species_legend: 'Arten',
	position: 'Position',
	count: 'Anzahl',
	young: 'Jungtiere',
	ship: 'Schiff',
	name: 'Name',
	area: 'Gebiet',
	latitude: 'Breitengrad',
	longitude: 'Laengengrad',
	found_dead: 'Totfund',
	speciesMap: {
		'0': 'Schweinswal',
		'1': 'Kegelrobbe',
		'2': 'Seehund',
		'8': 'Unbekannte Walart'
	}
};

const counts: CountData = {
	speciesCounts: {
		'0': { visible: 3, total: 5 },
		'1': { visible: 1, total: 2 },
		'2': { visible: 0, total: 1 },
		'8': { visible: 0, total: 0 }
	},
	colorCounts: {
		ct0: 1,
		ct1: 3,
		ct2: 2,
		ct6: 1,
		ct11: 0,
		ct15: 4
	}
};

function getLegendPanel(): HTMLElement {
	const panel = document.querySelector('[aria-labelledby="legend-title"]');
	if (!(panel instanceof HTMLElement)) {
		throw new Error('Legend panel not found');
	}
	return panel;
}

function getCloseButton(): HTMLButtonElement {
	const button = document.querySelector(
		'[aria-labelledby="legend-title"] [aria-label="Legende schließen"]'
	);
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error('Legend close button not found');
	}
	return button;
}

function getSpeciesCheckbox(value: string): HTMLInputElement {
	const checkbox = document.querySelector(`.species-checkbox[value="${value}"]`);
	if (!(checkbox instanceof HTMLInputElement)) {
		throw new Error(`Species checkbox ${value} not found`);
	}
	return checkbox;
}

function getColorCheckbox(value: string): HTMLInputElement {
	const checkbox = document.querySelector(`.color-checkbox[value="${value}"]`);
	if (!(checkbox instanceof HTMLInputElement)) {
		throw new Error(`Color checkbox ${value} not found`);
	}
	return checkbox;
}

describe('LegendPanel — Umschalter folgt der Locale', () => {
	afterEach(async () => {
		const { overwriteGetLocale, baseLocale } = await import('$lib/paraglide/runtime');
		overwriteGetLocale(() => baseLocale);
	});

	// WCAG 2.5.3 (Label in Name): Der sichtbare Text muss im zugänglichen Namen
	// stehen. Der Name kam schon aus den Messages, der Text war fest „LEGENDE" —
	// auf /en hieß der Knopf „Legend" und zeigte „LEGENDE" (axe-core 4.14:
	// label-content-name-mismatch).
	it('zeigt auf Englisch „LEGEND" und nicht das deutsche „LEGENDE"', async () => {
		const { overwriteGetLocale } = await import('$lib/paraglide/runtime');
		overwriteGetLocale(() => 'en');

		await render(LegendPanel, { translations, counts });

		const toggle = document.querySelector('button[aria-controls="legend-panel"]');
		expect(toggle?.getAttribute('aria-label')).toBe('Legend');
		expect(toggle?.textContent?.trim()).toBe('LEGEND');
	});
});

describe('LegendPanel', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
	});

	it('öffnet und schließt das Panel über die Buttons (inert im geschlossenen Zustand)', async () => {
		await render(LegendPanel, { translations, counts });

		// H5: Geschlossenes Panel ist inert — kein Element im Tab-Zyklus
		const panel = getLegendPanel();
		expect(panel.inert).toBe(true);

		await page.getByRole('button', { name: /^Legende$/i }).click();
		await vi.waitFor(() => {
			expect(panel.inert).toBe(false);
		});

		getCloseButton().click();
		await vi.waitFor(() => {
			expect(panel.inert).toBe(true);
		});
	});

	it('Toggle-Button trägt aria-expanded und aria-controls (H5)', async () => {
		await render(LegendPanel, { translations, counts });

		const toggle = document.querySelector('button[aria-controls="legend-panel"]');
		if (!(toggle instanceof HTMLButtonElement)) {
			throw new Error('Legend toggle button not found');
		}
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await page.getByRole('button', { name: /^Legende$/i }).click();
		await vi.waitFor(() => {
			expect(toggle.getAttribute('aria-expanded')).toBe('true');
		});
	});

	it('rendert Arten-, Farbgruppen- und Zählerdaten', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		// H5: Nicht-modales Seitenpanel — role="region", kein aria-modal
		const panel = getLegendPanel();
		expect(panel.getAttribute('role')).toBe('region');
		expect(panel.hasAttribute('aria-modal')).toBe(false);
		expect(panel.getAttribute('aria-labelledby')).toBe('legend-title');

		expect(document.querySelectorAll('.species-checkbox')).toHaveLength(4);
		expect(document.querySelectorAll('.color-checkbox')).toHaveLength(6);
		expect(document.body.textContent).toContain('Schweinswal');
		expect(document.body.textContent).toContain('3/5');
		expect(document.body.textContent).toContain('Totfund');
	});

	it('zeigt Gruppen-Badges aus den styleUtils-Konstanten (Kegelrobbe → Robbe)', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const sealRow = document.querySelector('[data-species-row="1"]');
		expect(sealRow?.textContent).toContain('Robbe');
	});

	it('weist Unbekannte Walart nicht als Großwal aus (M8)', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const unknownRow = document.querySelector('[data-species-row="8"]');
		expect(unknownRow?.textContent).not.toContain('Großwal');
		expect(unknownRow?.textContent).toContain('Art unbestimmt');
	});

	it('graut Arten ohne Sichtungen (0/0) aus, Checkbox bleibt bedienbar', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const unknownRow = document.querySelector('[data-species-row="8"]');
		expect(unknownRow?.querySelector('.grayscale')).not.toBeNull();
		// Art mit Sichtungen ist nicht ausgegraut
		const porpoiseRow = document.querySelector('[data-species-row="0"]');
		expect(porpoiseRow?.querySelector('.grayscale')).toBeNull();
		// Checkbox der 0/0-Art bleibt vorhanden und aktivierbar
		expect(unknownRow?.querySelector('.species-checkbox')).not.toBeNull();
	});

	it('unbekannte Tierart-IDs bekommen den neutralen grauen Ring, nicht Totfund-Schwarz', async () => {
		await render(LegendPanel, {
			translations: {
				...translations,
				speciesMap: { ...translations.speciesMap, '99': 'Zukünftige Art' }
			},
			counts
		});

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const row = document.querySelector('[data-species-row="99"]');
		const swatch = row?.querySelector('div[style*="border"]');
		// Browser normalisiert Hex zu rgb(): #767676 = rgb(118, 118, 118)
		expect(swatch?.getAttribute('style')).toContain('rgb(118, 118, 118)');
		expect(swatch?.getAttribute('style')).not.toContain('rgb(0, 0, 0)');
	});

	it('erklärt die Cluster-Farbskala', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		expect(document.body.textContent).toContain('Cluster');
		expect(document.body.textContent).toContain('je dunkler');
	});

	it('zeigt den Bearbeitungsstand-Abschnitt nicht, wenn showStatusLegend fehlt (Default: öffentliche Karte)', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		// Beweis, dass das Panel tatsächlich gerendert hat — sonst wäre die
		// Abwesenheit unten trivial wahr, weil gar nichts gerendert wurde.
		expect(document.body.textContent).toContain('Cluster');
		// Die Bearbeitungsstand-Überschrift ist das einzige <h3> im Panel
		// (siehe Test unten) — seine Abwesenheit ist damit ein präziserer
		// Beweis als eine Textsuche, die auch durch Umformulierung träfe.
		expect(document.querySelector('h3')).toBeNull();
		expect(document.body.textContent).not.toContain('Bearbeitungsstand');
	});

	it('zeigt den Bearbeitungsstand-Abschnitt mit allen drei Zuständen, wenn showStatusLegend gesetzt ist (Admin)', async () => {
		await render(LegendPanel, { translations, counts, showStatusLegend: true });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const heading = document.querySelector('h3');
		expect(heading?.textContent).toContain('Bearbeitungsstand');
		// „Freigegeben" fehlte bis Task 9 ganz — zwei von drei Zuständen waren
		// benannt, der dritte blieb Inferenz.
		expect(document.body.textContent).toContain('Freigegeben');
		expect(document.body.textContent).toContain('Offen');
		expect(document.body.textContent).toContain('Abgelehnt');
	});

	/**
	 * Task 9: Jeder andere Kanal im Panel (Artring, Totfund-Ring, Cluster-Skala)
	 * zeigt ein gerendertes Beispiel — der Bearbeitungsstand stand in reiner
	 * Prosa („Gestrichelt: …"). Das Muster muss aus derselben Quelle kommen wie
	 * der Marker, sonst beschreibt die Legende etwas anderes als die Karte.
	 */
	it('rendert je Zustand ein Kreis-Beispiel mit dem echten Strichmuster', async () => {
		await render(LegendPanel, { translations, counts, showStatusLegend: true });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const circles = Array.from(document.querySelectorAll('[data-status-swatch] circle'));
		expect(circles).toHaveLength(3);

		const dashes = circles.map((c) => c.getAttribute('stroke-dasharray'));
		// freigegeben durchgezogen, offen [6, 4], abgelehnt [2, 5] (styleUtils)
		expect(dashes[0]).toBeNull();
		expect(dashes[1]).toBe('6 4');
		expect(dashes[2]).toBe('2 5');
		expect(circles[2]?.getAttribute('stroke-linecap')).toBe('round');

		// Dekoration: die Bedeutung steht als Text daneben
		document
			.querySelectorAll('[data-status-swatch]')
			.forEach((svg) => expect(svg.getAttribute('aria-hidden')).toBe('true'));
	});

	it('bietet einen Seezeichen-Toggle (OpenSeaMap), Default an (M3)', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const checkbox = document.querySelector('.seamark-checkbox');
		if (!(checkbox instanceof HTMLInputElement)) {
			throw new Error('Seamark checkbox not found');
		}
		expect(checkbox.checked).toBe(true);
		expect(document.body.textContent).toContain('Seezeichen');
	});

	it('meldet das Ausblenden der Seezeichen-Ebene über onSeamarkToggle (M3)', async () => {
		const onSeamarkToggle = vi.fn();
		await render(LegendPanel, { translations, counts, onSeamarkToggle });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const checkbox = document.querySelector('.seamark-checkbox') as HTMLInputElement;
		checkbox.checked = false;
		checkbox.dispatchEvent(new Event('change', { bubbles: true }));

		expect(onSeamarkToggle).toHaveBeenCalledWith(false);
	});

	it('meldet Species- und Farb-Toggles an den CountManager', async () => {
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const speciesCheckbox = getSpeciesCheckbox('0');
		speciesCheckbox.checked = false;
		speciesCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

		const colorCheckbox = getColorCheckbox('ct1');
		colorCheckbox.checked = false;
		colorCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

		expect(mockCountManager.setSpeciesVisibility).toHaveBeenCalledWith('0', false);
		expect(mockCountManager.setColorVisibility).toHaveBeenCalledWith('ct1', false);
	});
});

// ─── Befund H6: Legende als Bottom-Sheet (geteilte Panel-Komponente) ─────────

describe('LegendPanel als Bottom-Sheet (H6)', () => {
	afterEach(async () => {
		// Vitest-Default-Viewport wiederherstellen
		await page.viewport(414, 896);
	});

	it('offenes Panel trägt data-sheet-state="peek", der Vergrößern-Button schaltet auf expanded', async () => {
		await page.viewport(375, 667);
		await render(LegendPanel, { translations, counts });

		await page.getByRole('button', { name: /^Legende$/i }).click();

		const panel = getLegendPanel();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-sheet-state')).toBe('peek');
		});

		const expandButton = document.querySelector('#legend-panel [aria-label="Legende vergrößern"]');
		if (!(expandButton instanceof HTMLButtonElement)) {
			throw new Error('Vergrößern-Button not found');
		}

		expandButton.click();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-sheet-state')).toBe('expanded');
		});
	});
});
