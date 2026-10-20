import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

/**
 * filterChips.svelte.test.ts — die Verdrahtung der Chip-Zeile.
 *
 * Gegenstück zu `filterChips.test.ts`, das nur die Rechnung prüft: Hier hängt
 * die Seite dran. Der Chip muss die Tabelle tatsächlich neu laden — ein Chip,
 * der nur anzeigt, wäre die Hälfte des Befunds („nichts ist einzeln
 * entfernbar").
 *
 * Eigene Datei mit eigenem `$app/state`-Mock (URL mit zwei Filtern und
 * `page=7`), aus demselben Grund wie bei `statusFilterParam.svelte.test.ts`:
 * `vi.mock` gilt für das ganze Modul.
 */

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: {
		url: new URL(
			'https://localhost:4000/admin/sichtungen?fromDate=2026-06-01&q=delfin&verified=approved&page=7'
		)
	}
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict: vi.fn(() => Promise.resolve(true))
}));

const SichtungenSeite = (await import('./+page.svelte')).default;

function daten(rows: SightingSelect[]): PageData {
	return {
		sightings: rows,
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: { page: 7, perPage: 20, total: rows.length, totalPages: 9, maxPerPage: 100 }
	} as unknown as PageData;
}

describe('Sichtungstabelle — Chip-Zeile der aktiven Filter', () => {
	it('zeigt je gesetztem Filter einen entfernbaren Chip', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		await expect
			.element(screen.getByLabelText('Filter Sichtung von 01.06.2026 entfernen'))
			.toBeVisible();
		await expect.element(screen.getByLabelText('Filter Suche: „delfin“ entfernen')).toBeVisible();
	});

	/* Den Status zeigt der Reiter direkt darunter — ein Chip dafür wäre ein
	   zweites Bedienelement für dieselbe Aussage. */
	it('zeigt keinen Chip für den Status', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		expect(screen.container.querySelectorAll('[aria-label^="Filter Status:"]')).toHaveLength(0);
	});

	it('entfernt beim Klick genau diesen Filter und springt auf Seite 1', async () => {
		vi.mocked(goto).mockClear();
		const screen = await render(SichtungenSeite, { data: daten([]) });

		await screen.getByLabelText('Filter Suche: „delfin“ entfernen').click();

		const ziel = new URL(String(vi.mocked(goto).mock.calls.at(-1)?.[0]));
		expect(ziel.searchParams.get('q')).toBeNull();
		expect(ziel.searchParams.get('fromDate')).toBe('2026-06-01');
		expect(ziel.searchParams.get('page')).toBe('1');
	});

	/* `.first()`, seit der Leer-Zustand denselben Ausweg anbietet (`emptyList.ts`):
	   `daten([])` liefert null Zeilen, also stehen ab 2026-08-14 drei Knöpfe
	   dieses Namens im DOM — der Chip-Zeile und je einer in Kartenliste und
	   Tabelle. Dass sie gleich heißen, ist Absicht (gleiche Aktion, gleiche
	   Beschriftung); die Chip-Zeile steht im Markup vor beiden Listen. */
	it('bietet ab zwei Chips das Zurücksetzen aller Filter an', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		await expect
			.element(screen.getByRole('button', { name: 'Alle Filter zurücksetzen' }).first())
			.toBeVisible();
	});

	/* Die Chips tragen das Signal „es ist gefiltert" jetzt allein. Ein Punkt-
	   Badge an der Filter-Schaltfläche sagte dasselbe noch einmal, ohne einen
	   Filter zu benennen und ohne anklickbar zu sein. */
	it('markiert die Filter-Schaltfläche nicht zusätzlich', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		const filterKnoepfe = [...screen.container.querySelectorAll('button')].filter(
			(knopf) => knopf.textContent?.trim() === 'Filter'
		);

		// Mobil- und Desktop-Kopf stehen beide im Test-DOM (nur per CSS getrennt).
		expect(filterKnoepfe).toHaveLength(2);
		for (const knopf of filterKnoepfe) {
			expect(knopf.classList.contains('btn-primary')).toBe(false);
			expect(knopf.querySelector('.badge')).toBeNull();
		}
	});
});
