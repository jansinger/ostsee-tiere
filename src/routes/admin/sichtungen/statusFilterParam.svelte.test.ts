import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

/**
 * statusFilterParam.svelte.test.ts — Befund 8 (Review Task 5).
 *
 * Der Server versteht `?verified=1`/`?verified=0` weiterhin als Alias für
 * `approved`/`open` (siehe `sightingStatusFilter.ts`). Das `<select>` im
 * Filter-Panel kennt aber nur die drei neuen Werte — ohne Normalisierung beim
 * Initialisieren des Zustands kam die Liste gefiltert zurück, während das
 * Feld selbst leer stand: ein altes Lesezeichen mit `?verified=1` zeigte eine
 * gefilterte Tabelle neben einem Filter-Feld auf „Alle".
 *
 * Eigene Datei statt eines weiteren Falls in `statusColumn.svelte.test.ts`:
 * `$app/state` wird dort mit einer festen URL ohne Query-Parameter gemockt,
 * und der Mock gilt für die ganze Datei (`vi.mock` hebt sich vor die Imports).
 * Ein Test mit einer anderen URL braucht deshalb sein eigenes Modul.
 */

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen?verified=1') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict: vi.fn(() => Promise.resolve(true))
}));

const SichtungenSeite = (await import('./+page.svelte')).default;

function daten(rows: SightingSelect[]): PageData {
	return {
		sightings: rows,
		/* Die Statusreiter über der Tabelle lesen diese Zahlen; ohne sie liefe
		   die Seite hier gar nicht erst durch. */
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: { page: 1, perPage: 20, total: rows.length, totalPages: 1, maxPerPage: 100 }
	} as unknown as PageData;
}

describe('Sichtungstabelle — Statusfilter aus der URL', () => {
	it('zeigt den Legacy-Alias `verified=1` im Filter-Feld als „Freigegeben", nicht leer', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		// Filter-Panel ist standardmäßig zu — Mobile- UND Desktop-Button stehen
		// im Test-DOM (nur per CSS `hidden`/`block` getrennt, Tailwind ist in der
		// Client-Testumgebung nicht geladen), `.first()` genügt für beide.
		await screen.getByRole('button', { name: 'Filter' }).first().click();

		const select = screen.container.querySelector<HTMLSelectElement>('#verified');
		if (!select) throw new Error('Status-Select nicht gefunden');
		await expect.element(select).toHaveValue('approved');
	});
});
