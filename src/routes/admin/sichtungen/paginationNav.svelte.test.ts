/**
 * @fileoverview Die Seiten-Navigation — zugängliche Namen und der Leerfall.
 *
 * **Befund 1 (Review zu PR #811).** Die vier Schaltflächen tragen als
 * Beschriftung nur ein Zeichen — `«`, `‹`, `›`, `»` — und daneben ein `title`.
 * Nach den Accessible-Name-Regeln gewinnt der **Inhalt** eines Buttons gegen
 * sein `title`: Der zugängliche Name war damit „«", und der `title` erreicht
 * ohnehin nur das Zeigegerät.
 *
 * **Befund 2 (der ursprüngliche Leerfall).** Bei null Treffern ist
 * `totalPages` gleich 0, und die Sperre prüfte `page === totalPages`, also
 * `1 === 0` — „Nächste"/„Letzte" blieben auf einer leeren Trefferliste
 * bedienbar. Die Rechnung dahinter prüft `paginationControls.test.ts` als
 * reine Funktion; hier zählt, dass die Seite sie auch tatsächlich anlegt.
 *
 * **Warum gerendert und nicht der Quelltext gescannt.** Der erste Anlauf war
 * ein Scan über `+page.svelte`, und er war aus drei Gründen die schlechtere
 * Wahl: Er musste HTML-Kommentare per Regex entfernen (der Kommentar an der
 * Seitenanzeige zitiert das Wort `<button>`), CodeQL beanstandete diese
 * Entfernung zu Recht als nicht idempotent, und vor allem misst ein Scan über
 * Attribute nicht die Eigenschaft, um die es geht: Ein `aria-label` im Markup
 * belegt noch keinen zugänglichen Namen. `getByRole('button', { name })` fragt
 * genau danach — die Regel „Inhalt schlägt title" steckt in der Abfrage selbst,
 * ein Test dagegen kann also gar nicht am Thema vorbeigehen.
 *
 * Aufbau (Mocks, `daten()`) übernommen von `statusColumn.svelte.test.ts`.
 */
import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen') }
}));

const SichtungenSeite = (await import('./+page.svelte')).default;

function sichtung(): SightingSelect {
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
		inBalticSeaGeo: 1
	} as unknown as SightingSelect;
}

function daten(pagination: Partial<PageData['pagination']>): PageData {
	return {
		sightings: [sichtung()],
		/* Die Statusreiter über der Tabelle lesen diese Zahlen; ohne sie liefe
		   die Seite hier gar nicht erst durch. */
		statusCounts: { all: 1, open: 1, approved: 0, rejected: 0 },
		pagination: { page: 1, perPage: 20, total: 1, totalPages: 1, maxPerPage: 100, ...pagination }
	} as unknown as PageData;
}

const SCHALTFLAECHEN = ['Erste Seite', 'Vorherige Seite', 'Nächste Seite', 'Letzte Seite'] as const;

describe('Seiten-Navigation', () => {
	it.each(SCHALTFLAECHEN)('„%s" ist über ihren Namen ansprechbar', async (name) => {
		const screen = await render(SichtungenSeite, { data: daten({ totalPages: 3, page: 2 }) });

		/* Über die Rolle plus Namen — genau die Abfrage, die vorher ins Leere
		   lief, weil der zugängliche Name das Zierzeichen war. */
		await expect.element(screen.getByRole('button', { name })).toBeVisible();
	});

	it('sperrt bei null Treffern beide Richtungen', async () => {
		const screen = await render(SichtungenSeite, { data: daten({ total: 0, totalPages: 0 }) });

		for (const name of SCHALTFLAECHEN) {
			await expect.element(screen.getByRole('button', { name })).toBeDisabled();
		}
	});

	it('nennt bei null Treffern „1 / 1" und nicht „1 / 0"', async () => {
		const screen = await render(SichtungenSeite, { data: daten({ total: 0, totalPages: 0 }) });

		await expect.element(screen.getByText('1 / 1')).toBeVisible();
	});

	it('gibt in der Mitte beide Richtungen frei', async () => {
		const screen = await render(SichtungenSeite, { data: daten({ totalPages: 3, page: 2 }) });

		await expect.element(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeEnabled();
		await expect.element(screen.getByRole('button', { name: 'Nächste Seite' })).toBeEnabled();
	});

	/* Die Seitenanzeige war ein `<button>` ohne `onclick`. Als `<span>` darf sie
	   nicht mehr als Schaltfläche auftauchen — sonst behauptet die Leiste eine
	   Bedienbarkeit, die es nicht gibt (Button-Hierarchie). */
	it('bietet die Seitenanzeige nicht als Schaltfläche an', async () => {
		const screen = await render(SichtungenSeite, { data: daten({ totalPages: 3, page: 2 }) });

		expect(screen.getByRole('button', { name: '2 / 3' }).elements()).toHaveLength(0);
	});
});
