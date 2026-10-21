import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

/**
 * activeFilters.svelte.test.ts — der Puffer im Panel ist noch kein Filter.
 *
 * Gegenstück zu `activeFilters.test.ts`, das die reine Ableitung aus der URL
 * prüft: Hier hängt die Verdrahtung dran. Ein ins Panel getipptes Datum, das
 * nicht angewendet wurde, ist kein aktiver Filter — die Tabelle darunter zeigt
 * weiterhin die ungefilterte Menge, und derselbe Wert ging vorher auch in den
 * Export.
 *
 * Geprüft wird das seit WP3 an der Chip-Zeile: Sie ist die Anzeige, die „es
 * ist gefiltert" trägt. Vorher stand hier das Punkt-Badge an der
 * Filter-Schaltfläche — es ist mit den Chips entfallen, und die Zusicherung
 * darüber wäre seitdem grün, ohne noch etwas zu belegen.
 *
 * Eigene Datei mit eigenem `$app/state`-Mock (URL ohne Filterparameter), aus
 * demselben Grund wie bei `statusFilterParam.svelte.test.ts`: `vi.mock` gilt
 * für das ganze Modul.
 */

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen') }
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

describe('Sichtungstabelle — aktive Filter kommen aus der URL', () => {
	it('zeigt keinen Filter-Chip, solange ein Datum nur getippt ist', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		// Filter-Panel ist standardmäßig zu — Mobile- UND Desktop-Button stehen im
		// Test-DOM (nur per CSS getrennt), `.first()` genügt für beide.
		await screen.getByRole('button', { name: 'Filter' }).first().click();

		await screen.getByLabelText('Sichtung von').fill('2026-01-01');
		await expect.element(screen.getByLabelText('Sichtung von')).toHaveValue('2026-01-01');

		/* Über das Suffix und nicht über „Filter …": Das Panel steht in diesem
		   Test offen, und sein Schließen-Knopf heißt „Filter ausblenden". */
		expect(screen.container.querySelectorAll('[aria-label$=" entfernen"]')).toHaveLength(0);
	});
});
