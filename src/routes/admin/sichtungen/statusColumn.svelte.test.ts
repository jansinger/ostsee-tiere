import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

const invalidateAll = vi.fn(() => Promise.resolve());
const submitVerdict = vi.fn(() => Promise.resolve(true));

vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()), invalidateAll }));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({ submitVerdict }));

const SichtungenSeite = (await import('./+page.svelte')).default;

function sichtung(overrides: Partial<SightingSelect>): SightingSelect {
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

/**
 * Abweichung vom Brief-Vorbild: Die dortige `daten()` lieferte
 * `totalCount`/`currentPage` auf oberster Ebene — die Seite liest aber
 * `data.pagination.{page,perPage,total,totalPages,maxPerPage}`
 * (`+page.server.ts`) und stürzt ohne das Objekt beim Rendern der
 * Seitenzahl-Auswahl ab, bevor die Statusspalte überhaupt geprüft wird.
 */
function daten(rows: SightingSelect[]): PageData {
	return {
		sightings: rows,
		/* Die Statusreiter über der Tabelle lesen diese Zahlen; ohne sie liefe
		   die Seite hier gar nicht erst durch. */
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: {
			page: 1,
			perPage: 20,
			total: rows.length,
			totalPages: 1,
			maxPerPage: 100
		}
	} as unknown as PageData;
}

/**
 * Die Bereiche, in denen `SightingStatusControl` für dieselbe Sichtung
 * gleichzeitig im DOM steht — Mobilkarte und Desktop-Tabelle, nur per CSS
 * (`md:hidden`/`hidden md:block`) getrennt, die Client-Testumgebung lädt kein
 * `app.css` (Tailwind hängt nur am Root-Layout). Beide tragen ein
 * `SightingStatusControl` mit identischem `aria-label` — ein
 * `getByRole('radio', {name})` ohne Scope trifft auf beide und meldet „strict
 * mode violation".
 *
 * Zuvor lief nur die Tabelle mit, die Mobilkarte blieb ungeprüft (Befund 9,
 * Review Task 5) — dabei ist sie das Layout, das bei 320–767px tatsächlich
 * bedient wird. Beide Bereiche parametrisiert, statt einen zu bevorzugen.
 */
const BEREICHE = [
	{
		name: 'Desktop-Tabelle',
		radio: (screen: Awaited<ReturnType<typeof render>>, name: string) =>
			screen.getByRole('table').getByRole('radio', { name })
	},
	{
		/* Die Mobilkarte hat kein eigenes ARIA-Landmark, das sie von der Tabelle
		   unterscheidet — anders als die Tabelle über `getByRole('table')`. Die
		   Mobilkarten-Auszeichnung steht im Markup vor der Desktop-Tabelle
		   (`+page.svelte`: „Mobile Card Layout" vor „Desktop Table Layout"), bei
		   genau einer Sichtung pro Test gibt es je Name nur zwei Treffer im
		   ganzen Dokument — `.first()` ist damit verlässlich die Mobilkarte. */
		name: 'Mobilkarte',
		radio: (screen: Awaited<ReturnType<typeof render>>, name: string) =>
			screen.getByRole('radio', { name }).first()
	}
];

describe('Sichtungstabelle — Statusspalte', () => {
	beforeEach(async () => {
		submitVerdict.mockClear();
		invalidateAll.mockClear();
	});

	for (const { name: bereichName, radio } of BEREICHE) {
		describe(`Bereich: ${bereichName}`, () => {
			it('zeigt eine abgelehnte Sichtung als „Abgelehnt", nicht als ungeprüft', async () => {
				const screen = await render(SichtungenSeite, {
					data: daten([sichtung({ rejectedAt: new Date('2026-08-02T09:00:00Z') })])
				});

				await expect.element(radio(screen, 'Abgelehnt')).toBeChecked();
			});

			/*
			 * Regression zum Bestandsbefund: 9 Zeilen tragen eine Freigabe, ohne
			 * dass die alte Spalte auf 1 steht. Der alte Toggle zeigte sie als
			 * ungeprüft, obwohl sie öffentlich sichtbar sind.
			 */
			it('zeigt eine freigegebene Sichtung als „Freigegeben", auch wenn sie als ungeprüft markiert ist', async () => {
				const screen = await render(SichtungenSeite, {
					data: daten([sichtung({ verified: 0, approvedAt: new Date('2026-08-02T09:00:00Z') })])
				});

				await expect.element(radio(screen, 'Freigegeben')).toBeChecked();
			});

			it('schickt beim Wechsel das passende Verdict', async () => {
				const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 7 })]) });

				await radio(screen, 'Freigegeben').click();
				/* `silent: true` ist Teil des Vertrags und keine Beiläufigkeit: Die
				   Seite meldet einen Fehlschlag seit 2026-08-14 als stehende Fläche mit
				   „Erneut versuchen" statt als Toast. Fiele die Option weg, käme beides
				   gleichzeitig. */
				expect(submitVerdict).toHaveBeenCalledWith(7, 'approve', { silent: true });
			});

			it('hebt eine Ablehnung über das Segment „Offen" auf', async () => {
				const screen = await render(SichtungenSeite, {
					data: daten([sichtung({ id: 8, rejectedAt: new Date('2026-08-02T09:00:00Z') })])
				});

				await radio(screen, 'Offen').click();
				expect(submitVerdict).toHaveBeenCalledWith(8, 'reset', { silent: true });
			});
		});
	}

	/* Der Knopf „Ablehnung aufheben" existierte nur, weil ein Toggle mit zwei
	   Stellungen den dritten Zustand nicht herstellen konnte. Bereichsunabhängig
	   — es gibt ihn in keinem Layout mehr, eine Parametrisierung liefe hier nur
	   auf denselben Textinhalt zweimal geprüft hinaus. */
	it('hat keinen separaten Knopf „Aufheben" mehr', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ rejectedAt: new Date('2026-08-02T09:00:00Z') })])
		});

		expect(screen.container.textContent).not.toContain('Aufheben');
	});
});
