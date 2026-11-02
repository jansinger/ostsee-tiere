import { render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import FilterPanel from './FilterPanel.svelte';
// H6: Das Browser-Test-Setup lädt src/app.css nicht — für die Layout-Assertions
// (Bottom-Sheet-Geometrie, md:hidden, Touch-Targets) müssen die Tailwind-Styles
// aber wirken. Der Import gilt dateiweit und ändert an den bestehenden
// (rein DOM-/Fokus-basierten) Tests nichts.
import '../../../../app.css';

const YEARS = [2023, 2024, 2025];

function getFilterPanel(): HTMLElement {
	const panel = document.querySelector('#filter-panel');
	if (!(panel instanceof HTMLElement)) {
		throw new Error('Filter panel not found');
	}
	return panel;
}

function getToggleButton(): HTMLButtonElement {
	const button = document.querySelector('button[aria-controls="filter-panel"]');
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error('Filter toggle button not found');
	}
	return button;
}

function getCloseButton(): HTMLButtonElement {
	const button = document.querySelector('#filter-panel [aria-label="Filter schließen"]');
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error('Filter close button not found');
	}
	return button;
}

function getYearSelect(): HTMLSelectElement {
	const select = document.querySelector('#year-select');
	if (!(select instanceof HTMLSelectElement)) {
		throw new Error('Year select not found');
	}
	return select;
}

function getSearchInput(): HTMLInputElement {
	const input = document.querySelector('#filter-input');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error('Search input not found');
	}
	return input;
}

function getSlider(id: string): HTMLInputElement {
	const slider = document.querySelector(`#${id}`);
	if (!(slider instanceof HTMLInputElement)) {
		throw new Error(`Slider ${id} not found`);
	}
	return slider;
}

describe('FilterPanel', () => {
	it('öffnet und schließt das Panel über die Buttons (inert im geschlossenen Zustand)', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		const panel = getFilterPanel();

		// H5: Geschlossenes Panel ist inert — kein Element im Tab-Zyklus
		expect(panel.inert).toBe(true);

		await page.getByRole('button', { name: /^Filter$/i }).click();
		await vi.waitFor(() => {
			expect(panel.inert).toBe(false);
		});

		getCloseButton().click();
		await vi.waitFor(() => {
			expect(panel.inert).toBe(true);
		});
	});

	it('Toggle-Button trägt aria-expanded und aria-controls (H5)', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		const toggle = getToggleButton();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await page.getByRole('button', { name: /^Filter$/i }).click();
		await vi.waitFor(() => {
			expect(toggle.getAttribute('aria-expanded')).toBe('true');
		});
	});

	it('Elemente im geschlossenen Panel sind nicht fokussierbar (WCAG 4.1.2)', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		const yearSelect = getYearSelect();
		yearSelect.focus();
		expect(document.activeElement).not.toBe(yearSelect);
	});

	it('beim Öffnen wandert der Fokus auf die Panel-Überschrift, beim Schließen zurück zum Toggle', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await page.getByRole('button', { name: /^Filter$/i }).click();
		const heading = document.querySelector('#filter-title');
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(heading);
		});

		await page.getByRole('button', { name: 'Filter schließen' }).click();
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(getToggleButton());
		});
	});

	it('behält Suchtext beim Schließen und erneuten Öffnen', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await page.getByRole('button', { name: /^Filter$/i }).click();
		const searchInput = getSearchInput();
		searchInput.value = 'Seehund';
		searchInput.dispatchEvent(new Event('input', { bubbles: true }));

		getCloseButton().click();
		await page.getByRole('button', { name: /^Filter$/i }).click();

		await vi.waitFor(() => {
			expect(getSearchInput().value).toBe('Seehund');
		});
	});

	it('zeigt Jahresoptionen und korrekte ARIA-Attribute (region statt dialog)', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await page.getByRole('button', { name: /^Filter$/i }).click();

		// H5: Nicht-modales Seitenpanel — role="region", kein aria-modal
		const panel = getFilterPanel();
		expect(panel.getAttribute('role')).toBe('region');
		expect(panel.hasAttribute('aria-modal')).toBe(false);
		expect(panel.getAttribute('aria-labelledby')).toBe('filter-title');

		const options = getYearSelect().querySelectorAll('option');
		expect(options.length).toBe(3);
	});

	// N4: Die years-Prop kommt bereits absteigend sortiert aus deriveSelectableYears —
	// das Dropdown übernimmt die Reihenfolge unverändert (neuestes Jahr zuerst).
	it('rendert die Jahresoptionen in Prop-Reihenfolge (absteigend, neuestes zuerst)', async () => {
		await render(FilterPanel, { years: [2026, 2025, 2008], defaultYear: 2025 });

		await page.getByRole('button', { name: /^Filter$/i }).click();

		const options = Array.from(getYearSelect().querySelectorAll('option'));
		expect(options.map((option) => option.value)).toEqual(['2026', '2025', '2008']);
	});

	it('passt Slider-Maximum bei Schaltjahr an', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await page.getByRole('button', { name: /^Filter$/i }).click();
		const yearSelect = getYearSelect();
		yearSelect.value = '2024';
		yearSelect.dispatchEvent(new Event('change', { bubbles: true }));

		await vi.waitFor(() => {
			expect(getSlider('time-range-start').getAttribute('max')).toBe('365');
			expect(getSlider('time-range-end').getAttribute('max')).toBe('365');
		});
	});

	// M10: Datums-Eingabefelder als gleichwertige Alternative zum Dual-Slider —
	// ihre min/max-Klemmung folgt dem gewählten Jahr.
	it('klemmt die Datums-Eingabefelder auf das gewählte Jahr', async () => {
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await page.getByRole('button', { name: /^Filter$/i }).click();

		expect(getSlider('time-date-start').min).toBe('2025-01-01');
		expect(getSlider('time-date-end').max).toBe('2025-12-31');

		const yearSelect = getYearSelect();
		yearSelect.value = '2024';
		yearSelect.dispatchEvent(new Event('change', { bubbles: true }));

		await vi.waitFor(() => {
			expect(getSlider('time-date-start').min).toBe('2024-01-01');
			expect(getSlider('time-date-end').max).toBe('2024-12-31');
		});
	});
});

// ─── Befund H6: Panels als Bottom-Sheet (Mobile) / 320-px-Panel (Desktop) ────

/** Vergrößern-/Verkleinern-Button im Panel-Header (H6, nur Mobile sichtbar) */
function getSheetToggleButton(): HTMLButtonElement {
	const button = document.querySelector(
		'#filter-panel [aria-label="Filter vergrößern"], #filter-panel [aria-label="Filter verkleinern"]'
	);
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error('Vergrößern-Button not found');
	}
	return button;
}

/** Griffleiste des Bottom-Sheets — seit 2026-08-14 ein echtes Bedienelement */
function getSheetHandle(): HTMLButtonElement {
	const button = document.querySelector('#filter-panel [data-testid="sheet-handle"]');
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error('Sheet handle not found');
	}
	return button;
}

async function openPanel(): Promise<void> {
	await page.getByRole('button', { name: /^Filter$/i }).click();
}

describe('FilterPanel als Bottom-Sheet (H6)', () => {
	afterEach(async () => {
		// Vitest-Default-Viewport wiederherstellen, damit Folge-Tests
		// nicht auf einem mobilen Viewport laufen
		await page.viewport(414, 896);
	});

	it('Panel trägt data-sheet-state="peek" initial, nach dem Öffnen und nach erneutem Öffnen', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		const panel = getFilterPanel();
		expect(panel.getAttribute('data-sheet-state')).toBe('peek');

		await openPanel();
		expect(panel.getAttribute('data-sheet-state')).toBe('peek');

		// Vergrößern → expanded
		getSheetToggleButton().click();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-sheet-state')).toBe('expanded');
		});

		// Schließen und erneut öffnen → wieder peek
		getCloseButton().click();
		await vi.waitFor(() => {
			expect(panel.inert).toBe(true);
		});
		await openPanel();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-sheet-state')).toBe('peek');
		});
	});

	it('Vergrößern-Button wechselt aria-label und aria-expanded mit dem Sheet-Zustand', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await openPanel();

		const button = getSheetToggleButton();
		expect(button.getAttribute('aria-label')).toBe('Filter vergrößern');
		expect(button.getAttribute('aria-expanded')).toBe('false');

		button.click();
		await vi.waitFor(() => {
			expect(getSheetToggleButton().getAttribute('aria-label')).toBe('Filter verkleinern');
			expect(getSheetToggleButton().getAttribute('aria-expanded')).toBe('true');
		});
	});

	it('Vergrößern-Button ist auf Desktop-Viewports per CSS versteckt (md:hidden)', async () => {
		await page.viewport(1024, 768);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await openPanel();

		// Im DOM vorhanden, aber ≥768px nicht sichtbar
		const button = getSheetToggleButton();
		expect(getComputedStyle(button).display).toBe('none');
		expect(button.offsetParent).toBeNull();
	});

	it('Mobile: offenes Panel liegt als Bottom-Sheet unten über die volle Breite (peek 30–60%)', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await openPanel();

		// transition-transform (300ms) abwarten — Geometrie erst nach der Animation stabil
		await vi.waitFor(
			() => {
				const rect = getFilterPanel().getBoundingClientRect();
				expect(rect.left).toBe(0);
				expect(rect.width).toBe(window.innerWidth);
				expect(Math.abs(rect.bottom - window.innerHeight)).toBeLessThanOrEqual(2);
				expect(rect.height).toBeGreaterThanOrEqual(window.innerHeight * 0.3);
				expect(rect.height).toBeLessThanOrEqual(window.innerHeight * 0.6);
			},
			{ timeout: 2000 }
		);
	});

	it('Mobile: expanded-Sheet nimmt mehr als 70% der Viewport-Höhe ein', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await openPanel();
		getSheetToggleButton().click();

		await vi.waitFor(
			() => {
				const rect = getFilterPanel().getBoundingClientRect();
				expect(rect.height).toBeGreaterThan(window.innerHeight * 0.7);
				expect(Math.abs(rect.bottom - window.innerHeight)).toBeLessThanOrEqual(2);
			},
			{ timeout: 2000 }
		);
	});

	it('Desktop: offenes Panel ist 320px breit und ragt nicht unten aus dem Viewport', async () => {
		await page.viewport(1024, 768);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await openPanel();

		await vi.waitFor(
			() => {
				const rect = getFilterPanel().getBoundingClientRect();
				expect(rect.width).toBe(320);
				expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
			},
			{ timeout: 2000 }
		);
	});

	// Die Breite folgt seit 2026-11 der Zeigerart, nicht der Viewport-Breite
	// (--map-control-min, tokens.css): 44px, sobald ein Touch-Zeiger da ist,
	// sonst 32px. Den Touch-Fall prüft e2e/map-embed.spec.ts mit `hasTouch` —
	// Vitest im Browser kann keinen groben Zeiger emulieren.
	it('Toggle-Button ist so breit wie --map-control-min', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		const probe = document.createElement('div');
		probe.style.width = 'var(--map-control-min)';
		document.body.append(probe);
		const tokenWidth = probe.getBoundingClientRect().width;
		probe.remove();

		expect(tokenWidth).toBeGreaterThanOrEqual(32);
		expect(getToggleButton().getBoundingClientRect().width).toBe(tokenWidth);
	});

	it('Toggle-Button folgt im Feldmodus der größeren Trefferfläche (56px)', async () => {
		await page.viewport(375, 667);
		document.documentElement.dataset.density = 'field';
		try {
			await render(FilterPanel, { years: YEARS, defaultYear: 2025 });
			expect(getToggleButton().getBoundingClientRect().width).toBeGreaterThanOrEqual(56);
		} finally {
			delete document.documentElement.dataset.density;
		}
	});

	it('Griff schaltet Peek/Expanded', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });

		await openPanel();

		const panel = getFilterPanel();

		getSheetHandle().click();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-sheet-state')).toBe('expanded');
		});

		getSheetHandle().click();
		await vi.waitFor(() => {
			expect(panel.getAttribute('data-sheet-state')).toBe('peek');
		});
	});

	it('Griff bleibt für AT unsichtbar — der Chevron daneben trägt Name und Zustand', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });
		await openPanel();

		// Zwei Schaltflächen mit identischem Namen direkt nebeneinander wären
		// Doppelung, keine Redundanz — der Griff ist reines Zeigegerät-Ziel.
		const handle = getSheetHandle();
		expect(handle.getAttribute('aria-hidden')).toBe('true');
		expect(handle.tabIndex).toBe(-1);
		expect(handle.getAttribute('aria-label')).toBeNull();

		expect(getSheetToggleButton().getAttribute('aria-expanded')).toBe('false');
	});

	it('Griff hält das 44px-Touch-Target und ist ab md ausgeblendet', async () => {
		await page.viewport(375, 667);
		await render(FilterPanel, { years: YEARS, defaultYear: 2025 });
		await openPanel();

		expect(getSheetHandle().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

		await page.viewport(1024, 768);
		await vi.waitFor(() => {
			expect(getComputedStyle(getSheetHandle()).display).toBe('none');
		});
	});
});

describe('Statusfilter', () => {
	afterEach(async () => {
		document.body.innerHTML = '';
	});

	it('zeigt die Statusauswahl ohne Admin-Flag nicht', async () => {
		await render(FilterPanel, { years: YEARS, isOpen: true });
		expect(document.querySelector('input[type="checkbox"]')).toBeNull();
	});

	it('zeigt drei Auswahlfelder für Admins', async () => {
		await render(FilterPanel, {
			years: YEARS,
			isOpen: true,
			showStatusFilter: true,
			statuses: ['approved']
		});
		await expect.element(page.getByLabelText('Offen')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Freigegeben')).toBeChecked();
		await expect.element(page.getByLabelText('Abgelehnt')).toBeInTheDocument();
	});

	it('meldet die neue Auswahl beim Umschalten', async () => {
		const onStatusChange = vi.fn();
		await render(FilterPanel, {
			years: YEARS,
			isOpen: true,
			showStatusFilter: true,
			statuses: ['approved'],
			onStatusChange
		});
		await page.getByLabelText('Offen').click();
		expect(onStatusChange).toHaveBeenCalledWith(['open', 'approved']);
	});

	it('lässt das Abwählen des letzten Status nicht zu', async () => {
		// Eine leere Auswahl beantwortet die API mit 400 (statusFilter.ts) und
		// sähe auf der Karte wie ein Datenverlust aus.
		const onStatusChange = vi.fn();
		await render(FilterPanel, {
			years: YEARS,
			isOpen: true,
			showStatusFilter: true,
			statuses: ['approved'],
			onStatusChange
		});
		await page.getByLabelText('Freigegeben').click();
		expect(onStatusChange).not.toHaveBeenCalled();
		// Der Browser stellt die Checkbox schon um, bevor der Handler läuft —
		// bei einer abgelehnten Auswahl muss sie wieder angehakt sein, sonst
		// behauptet die Oberfläche eine Auswahl, die nie in Kraft trat.
		await expect.element(page.getByLabelText('Freigegeben')).toBeChecked();
	});

	// Finding 3 (Pre-Merge-Review): Die refuste Abwahl blieb bisher stumm — die
	// Checkbox flippt und flippt zurück, ohne dass irgendwo etwas gesagt wird.
	// Das liest sich wie ein kaputtes Bedienelement, obwohl der Nutzer die
	// Sperre auflösen kann (erst einen anderen Status anhaken).
	it('zeigt beim Abwählen des letzten Status eine Meldung im fieldset', async () => {
		await render(FilterPanel, {
			years: YEARS,
			isOpen: true,
			showStatusFilter: true,
			statuses: ['approved']
		});

		const fieldset = document.querySelector('fieldset');
		expect(fieldset?.querySelector('[role="status"]')).toBeNull();

		await page.getByLabelText('Freigegeben').click();

		const status = fieldset?.querySelector('[role="status"]');
		expect(status).not.toBeNull();
		expect(status?.getAttribute('aria-live')).toBe('polite');
		expect(status?.textContent).toContain(
			'Mindestens ein Bearbeitungsstand muss ausgewählt bleiben.'
		);
		expect(fieldset?.getAttribute('aria-describedby')).toBe(status?.id);
	});

	it('meldet nicht role="alert" für die Refusal-Meldung (kein unterbrechender Fehler)', async () => {
		await render(FilterPanel, {
			years: YEARS,
			isOpen: true,
			showStatusFilter: true,
			statuses: ['approved']
		});

		await page.getByLabelText('Freigegeben').click();

		expect(document.querySelector('fieldset [role="alert"]')).toBeNull();
	});

	it('löscht die Refusal-Meldung nach einer erfolgreichen Statusänderung', async () => {
		await render(FilterPanel, {
			years: YEARS,
			isOpen: true,
			showStatusFilter: true,
			statuses: ['approved']
		});

		await page.getByLabelText('Freigegeben').click();
		expect(document.querySelector('fieldset [role="status"]')).not.toBeNull();

		await page.getByLabelText('Offen').click();

		await vi.waitFor(() => {
			expect(document.querySelector('fieldset [role="status"]')).toBeNull();
		});
	});
});
