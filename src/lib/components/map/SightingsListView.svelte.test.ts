import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import SightingsListView from './SightingsListView.svelte';
import type { SightingListEntry } from '#lib/map/listViewUtils.ts';

/**
 * Tests für SightingsListView (Befund K3): der Vertrag der barrierefreien
 * Tabellen-Alternative zur Sichtungskarte — echte Tabellen-Semantik,
 * Totfund-/Fahrwasser-Darstellung und Leerzustand mit role="status".
 */

// 2025-06-15T12:00:00Z bzw. 2025-06-20T12:00:00Z — mittags UTC gegen Zeitzonen-Kipper
const TS_JUNE_15 = Date.UTC(2025, 5, 15, 12, 0, 0) / 1000;
const TS_JUNE_20 = Date.UTC(2025, 5, 20, 12, 0, 0) / 1000;

const ENTRIES: SightingListEntry[] = [
	{
		id: 2,
		ts: TS_JUNE_20,
		speciesName: 'Kegelrobbe',
		count: 3,
		juveniles: 1,
		isDead: false,
		waterway: 'Kieler Förde',
		status: 'approved'
	},
	{
		id: 1,
		ts: TS_JUNE_15,
		speciesName: 'Schweinswal',
		count: 1,
		juveniles: 0,
		isDead: true,
		waterway: null,
		status: 'open'
	}
];

function getTable(): HTMLTableElement {
	const table = document.querySelector('table');
	if (!(table instanceof HTMLTableElement)) {
		throw new Error('Tabelle nicht gefunden');
	}
	return table;
}

function getBodyRows(): HTMLTableRowElement[] {
	return Array.from(getTable().querySelectorAll<HTMLTableRowElement>('tbody tr'));
}

describe('SightingsListView', () => {
	it('rendert Tabelle mit korrekten Spaltenüberschriften', async () => {
		await render(SightingsListView, { entries: ENTRIES, year: 2025 });

		for (const heading of ['Datum', 'Tierart', 'Anzahl', 'Totfund', 'Fahrwasser']) {
			await expect.element(page.getByRole('columnheader', { name: heading })).toBeInTheDocument();
		}

		// Alle Header sind echte <th scope="col"> im <thead>
		const headers = getTable().querySelectorAll('thead th[scope="col"]');
		expect(headers.length).toBe(5);
	});

	it('rendert eine Zeile pro Eintrag mit Artname, Anzahl und Datum', async () => {
		await render(SightingsListView, { entries: ENTRIES, year: 2025 });

		const rows = getBodyRows();
		expect(rows.length).toBe(2);

		const firstRowText = rows[0]?.textContent ?? '';
		expect(firstRowText).toContain('Kegelrobbe');
		expect(firstRowText).toContain('3');
		expect(firstRowText).toMatch(/20\.0?6\.2025/);

		const secondRowText = rows[1]?.textContent ?? '';
		expect(secondRowText).toContain('Schweinswal');
		expect(secondRowText).toContain('1');
		expect(secondRowText).toMatch(/15\.0?6\.2025/);
	});

	it('zeigt Totfund als Ja bzw. Nein an', async () => {
		await render(SightingsListView, { entries: ENTRIES, year: 2025 });

		const rows = getBodyRows();
		// Kegelrobbe (isDead=false) → Nein, Schweinswal (isDead=true) → Ja
		expect(rows[0]?.textContent).toMatch(/Nein/);
		expect(rows[1]?.textContent).toMatch(/Ja/);
	});

	it('zeigt einen Gedankenstrich wenn kein Fahrwasser vorhanden ist', async () => {
		await render(SightingsListView, { entries: ENTRIES, year: 2025 });

		const rows = getBodyRows();
		// Schweinswal-Eintrag hat waterway=null
		expect(rows[1]?.textContent).toContain('–');
		// Kegelrobbe-Eintrag zeigt das Fahrwasser
		expect(rows[0]?.textContent).toContain('Kieler Förde');
	});

	it('zeigt bei leerer Liste keinen Tabellen-Torso sondern einen Status-Hinweis', async () => {
		await render(SightingsListView, { entries: [], year: 2025 });

		expect(document.querySelector('table')).toBeNull();

		const status = page.getByRole('status');
		await expect.element(status).toBeInTheDocument();
		expect(document.querySelector('[role="status"]')?.textContent).toContain('Keine Sichtungen');
	});

	it('nennt Jahr und Anzahl der Einträge in der caption', async () => {
		await render(SightingsListView, { entries: ENTRIES, year: 2025 });

		const caption = getTable().querySelector('caption');
		expect(caption).not.toBeNull();
		expect(caption?.textContent).toContain('2025');
		expect(caption?.textContent).toMatch(/2\s*Einträge/);
	});

	describe('Bearbeitungsstand-Spalte (showStatus)', () => {
		it('zeigt ohne showStatus keine Bearbeitungsstand-Spalte', async () => {
			await render(SightingsListView, { entries: ENTRIES, year: 2025 });

			expect(page.getByRole('columnheader', { name: 'Bearbeitungsstand' }).elements().length).toBe(
				0
			);
			const headers = getTable().querySelectorAll('thead th[scope="col"]');
			expect(headers.length).toBe(5);
		});

		it('zeigt mit showStatus eine Bearbeitungsstand-Spalte mit dem Status je Zeile', async () => {
			await render(SightingsListView, { entries: ENTRIES, year: 2025, showStatus: true });

			await expect
				.element(page.getByRole('columnheader', { name: 'Bearbeitungsstand' }))
				.toBeInTheDocument();
			const headers = getTable().querySelectorAll('thead th[scope="col"]');
			expect(headers.length).toBe(6);

			const rows = getBodyRows();
			// Kegelrobbe-Eintrag ist approved, Schweinswal-Eintrag ist open
			expect(rows[0]?.textContent).toContain('Freigegeben');
			expect(rows[1]?.textContent).toContain('Offen');
		});
	});
});
