import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

/**
 * filterPanelPlacement.svelte.test.ts — Filter-Panel an seinen Auslöser
 * gerückt (UX-Anforderung 2026-08).
 *
 * Vorher stand das Panel hinter Suche, Ansichten und Chip-Zeile — wer „Filter"
 * per Tastatur öffnete, tabbte durch drei fremde Bereiche, bevor er im Panel
 * landete, und beide Auslöser hatten keinen ARIA-Zustand (nur Farbe). Geprüft
 * wird hier:
 *  - beide Auslöser tragen `aria-expanded` synchron zum Panel-Zustand,
 *  - beide tragen `aria-controls` auf dieselbe, existierende Panel-`id`,
 *  - das Panel steht im DOM VOR der Freitextsuche,
 *  - die Chip-Zeile bleibt unmittelbar vor den Statusreitern, auch bei
 *    offenem Panel (kein Panel dazwischengeschoben).
 *
 * Eigene Datei statt Erweiterung von `searchParam.svelte.test.ts`: Diese
 * Datei rendert die volle Seite und prüft reine DOM-Reihenfolge/ARIA, kein
 * Such-Verhalten — dieselbe Trennung wie zwischen `filterChips.test.ts`
 * (reine Rechnung) und `filterChips.svelte.test.ts` (DOM).
 */

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen?q=m%C3%BCller') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict: vi.fn(() => Promise.resolve(true))
}));

const SichtungenSeite = (await import('./+page.svelte')).default;

function daten(rows: SightingSelect[] = []): PageData {
	return {
		sightings: rows,
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: { page: 1, perPage: 20, total: rows.length, totalPages: 1, maxPerPage: 100 }
	} as unknown as PageData;
}

/** Vergleicht die DOM-Reihenfolge zweier Elemente. */
function stehtVor(a: Element, b: Element): boolean {
	// Bit 4 (DOCUMENT_POSITION_FOLLOWING) ist gesetzt, wenn `b` NACH `a` kommt.
	return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Sichtungstabelle — Filter-Panel-Platzierung', () => {
	it('beide Auslöser tragen aria-expanded=false und ein aria-controls, solange das Panel zu ist', async () => {
		const screen = await render(SichtungenSeite, { data: daten() });

		const ausloeser = screen.getByRole('button', { name: 'Filter', exact: true });
		await expect.element(ausloeser.first()).toHaveAttribute('aria-expanded', 'false');
		await expect.element(ausloeser.last()).toHaveAttribute('aria-expanded', 'false');

		const ersterController = ausloeser.first().element().getAttribute('aria-controls');
		const zweiterController = ausloeser.last().element().getAttribute('aria-controls');
		expect(ersterController).toBeTruthy();
		expect(ersterController).toBe(zweiterController);
	});

	it('öffnet über einen Auslöser: beide schalten auf aria-expanded=true, das Panel bekommt die referenzierte id', async () => {
		const screen = await render(SichtungenSeite, { data: daten() });

		const ausloeser = screen.getByRole('button', { name: 'Filter', exact: true });
		const controllerId = ausloeser.first().element().getAttribute('aria-controls');
		expect(controllerId).toBeTruthy();

		await ausloeser.first().click();

		await expect.element(ausloeser.first()).toHaveAttribute('aria-expanded', 'true');
		await expect.element(ausloeser.last()).toHaveAttribute('aria-expanded', 'true');

		const panel = screen.container.querySelector(`#${controllerId}`);
		expect(panel).not.toBeNull();
	});

	it('rendert das Panel im DOM vor der Freitextsuche, sobald es offen ist', async () => {
		const screen = await render(SichtungenSeite, { data: daten() });

		const ausloeser = screen.getByRole('button', { name: 'Filter', exact: true });
		const controllerId = ausloeser.first().element().getAttribute('aria-controls');
		await ausloeser.first().click();

		const panel = screen.container.querySelector(`#${controllerId}`);
		const suchfeld = screen.getByRole('searchbox', { name: /suche/i }).element();
		expect(panel).not.toBeNull();
		expect(stehtVor(panel as Element, suchfeld)).toBe(true);
	});

	it('lässt die Chip-Zeile unmittelbar vor den Statusreitern stehen, auch bei offenem Panel', async () => {
		const screen = await render(SichtungenSeite, { data: daten() });

		// `?q=müller` aus dem URL-Mock erzeugt bereits einen Chip.
		const entfernenChip = screen.getByRole('button', { name: /Filter Suche.*entfernen/i });
		await expect.element(entfernenChip).toBeVisible();

		const ausloeser = screen.getByRole('button', { name: 'Filter', exact: true });
		await ausloeser.first().click();

		const chipZeile = entfernenChip.element().closest('div');
		const statusReiter = screen.container.querySelector('nav[aria-label="Status der Sichtungen"]');
		expect(chipZeile).not.toBeNull();
		expect(statusReiter).not.toBeNull();
		expect(stehtVor(chipZeile as Element, statusReiter as Element)).toBe(true);

		// Kein Filter-Panel zwischen Chip-Zeile und Statusreitern.
		const controllerId = ausloeser.first().element().getAttribute('aria-controls');
		const panel = screen.container.querySelector(`#${controllerId}`) as Element;
		const panelKommtVorChips = stehtVor(panel, chipZeile as Element);
		expect(panelKommtVorChips).toBe(true);
	});
});
