import { render } from 'vitest-browser-svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

/**
 * Leer-Zustand und Fehlerfläche von `/admin/sichtungen`.
 *
 * **Warum an der Seite und nicht an den beiden Listen-Komponenten:** Die
 * Aussage, die hier zählt, entsteht erst aus dem Zusammenspiel — der Wortlaut
 * kommt aus `emptyList.ts`, ob gefiltert ist aus der URL, und der Fehlschlag aus
 * dem Rückgabewert der Aktion. Ein Test an `SichtungenTable.svelte` allein
 * bemerkt nicht, wenn die Seite aufhört, `hasActiveFilters` zu setzen; das ist
 * dieselbe Lehre wie bei `hasError`/`isValid` in `FieldRenderer`
 * (`design-system.md`, „Ein Prop, das die Komponente nicht annimmt, fällt still
 * weg").
 *
 * Beide Listen stehen gleichzeitig im DOM (nur per CSS getrennt, und die
 * Client-Testumgebung lädt kein `app.css`) — jede Meldung erscheint deshalb
 * zweimal. Geprüft wird die Anzahl, nicht ein einzelner Treffer: Stünde der
 * Block nur in einer der beiden Darstellungen, wäre genau die andere blind.
 */

const invalidateAll = vi.fn(() => Promise.resolve());
const goto = vi.fn(() => Promise.resolve());
const submitVerdict = vi.fn(() => Promise.resolve(true));

vi.mock('$app/navigation', () => ({ goto, invalidateAll }));

/* Die URL ist hier die Eingabe des Tests: Aus ihr liest die Seite, ob gefiltert
   ist — `pageUrl` wird pro Test gesetzt, bevor gerendert wird. */
let pageUrl = new URL('https://localhost:4000/admin/sichtungen');
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return pageUrl;
		}
	}
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({ submitVerdict }));

const SichtungenSeite = (await import('./+page.svelte')).default;

function sichtung(overrides: Partial<SightingSelect> = {}): SightingSelect {
	return {
		id: 1,
		created: new Date('2026-08-01T10:00:00Z'),
		sightingDate: new Date('2026-07-30T08:00:00Z'),
		species: 0,
		totalCount: 1,
		juvenileCount: 0,
		isDead: 0,
		verified: 0,
		approvedAt: null,
		rejectedAt: null,
		inBalticSea: 1,
		inBalticSeaGeo: 1,
		...overrides
	} as unknown as SightingSelect;
}

function daten(rows: SightingSelect[]): PageData {
	return {
		sightings: rows,
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: {
			page: 1,
			perPage: 20,
			total: rows.length,
			totalPages: rows.length === 0 ? 0 : 1,
			maxPerPage: 100
		}
	} as unknown as PageData;
}

describe('Sichtungstabelle — Leer-Zustand', () => {
	beforeEach(async () => {
		submitVerdict.mockClear();
		invalidateAll.mockClear();
		goto.mockClear();
		pageUrl = new URL('https://localhost:4000/admin/sichtungen');
	});

	it('sagt ohne aktiven Filter, dass noch nichts erfasst ist — ohne Ausweg', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		await expect
			.element(screen.getByText('Noch keine Sichtungen erfasst').first())
			.toBeInTheDocument();
		/* Kein Zurücksetzen-Knopf: Es gibt nichts zurückzusetzen, und eine
		   Schaltfläche ohne Wirkung gehört nicht hin (Button-Hierarchie). */
		expect(await screen.getByRole('button', { name: 'Alle Filter zurücksetzen' }).all()).toEqual(
			[]
		);
	});

	it('steht in beiden Darstellungen — Kartenliste und Tabelle', async () => {
		const screen = await render(SichtungenSeite, { data: daten([]) });

		expect(await screen.getByText('Noch keine Sichtungen erfasst').all()).toHaveLength(2);
	});

	it('nennt bei aktivem Filter den Filter als Ursache und bietet das Zurücksetzen an', async () => {
		pageUrl = new URL('https://localhost:4000/admin/sichtungen?q=orca');
		const screen = await render(SichtungenSeite, { data: daten([]) });

		await expect
			.element(screen.getByText('Keine Sichtung passt zu den aktiven Filtern').first())
			.toBeInTheDocument();
		/* Genau zwei — je einer in Kartenliste und Tabelle. Die Chip-Zeile bietet
		   ihren eigenen Zurücksetzen-Knopf erst ab zwei Chips an, `?q=` ist einer;
		   ein dritter Treffer hieße also, dass sich hier etwas verschoben hat. */
		const zuruecksetzen = screen.getByRole('button', { name: 'Alle Filter zurücksetzen' });
		expect(await zuruecksetzen.all()).toHaveLength(2);

		await zuruecksetzen.first().click();
		expect(goto).toHaveBeenCalled();
	});

	/* Der Statusreiter ist ein Filter wie jeder andere — `buildFilterChips` wird
	   für diese Frage bewusst OHNE `skipVerified` aufgerufen. „Abgelehnt ohne
	   Treffer" ist nicht „noch keine Sichtungen erfasst". */
	it('zählt auch den Statusreiter als Filter', async () => {
		pageUrl = new URL('https://localhost:4000/admin/sichtungen?verified=rejected');
		const screen = await render(SichtungenSeite, { data: daten([]) });

		await expect
			.element(screen.getByText('Keine Sichtung passt zu den aktiven Filtern').first())
			.toBeInTheDocument();
	});

	it('zeigt gar keinen Leer-Zustand, solange Zeilen da sind', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung()]) });

		expect(await screen.getByText('Noch keine Sichtungen erfasst').all()).toEqual([]);
		expect(await screen.getByText('Keine Sichtung passt zu den aktiven Filtern').all()).toEqual([]);
	});
});

describe('Sichtungstabelle — Fehlerfläche statt Toast', () => {
	beforeEach(async () => {
		submitVerdict.mockClear();
		invalidateAll.mockClear();
		goto.mockClear();
		pageUrl = new URL('https://localhost:4000/admin/sichtungen');
	});

	it('stellt einen gescheiterten Statuswechsel stehend dar, mit Wiederholung', async () => {
		submitVerdict.mockResolvedValueOnce(false);
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 7 })]) });

		await screen
			.getByRole('table')
			.getByRole('radio', { name: /Freigegeben/ })
			.click();

		await expect.element(screen.getByText(/wurde nicht gespeichert/).first()).toBeInTheDocument();

		/* Die Wiederholung ruft genau den gescheiterten Aufruf erneut auf. Beim
		   zweiten Mal liefert der Mock wieder `true` — die Fläche verschwindet. */
		await screen.getByRole('button', { name: 'Erneut versuchen' }).click();
		expect(submitVerdict).toHaveBeenCalledTimes(2);
		expect(submitVerdict).toHaveBeenLastCalledWith(7, 'approve', { silent: true });
		expect(await screen.getByText(/wurde nicht gespeichert/).all()).toEqual([]);
	});

	it('zeigt nach einem erfolgreichen Wechsel keine Fehlerfläche', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 7 })]) });

		await screen
			.getByRole('table')
			.getByRole('radio', { name: /Freigegeben/ })
			.click();

		expect(await screen.getByText(/wurde nicht gespeichert/).all()).toEqual([]);
	});
});
