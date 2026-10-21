import { render } from 'vitest-browser-svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

const invalidateAll = vi.fn(() => Promise.resolve());
/* Signatur mitgeführt, damit `mockImplementation((id) => …)` in den Teilfehler-
   Tests typgeprüft bleibt — ein `vi.fn(() => …)` nähme dort keine Argumente an. */
const submitVerdict = vi.fn((_id: number, _verdict: string) => Promise.resolve(true));

vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()), invalidateAll }));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({ submitVerdict }));

const SichtungenSeite = (await import('./+page.svelte')).default;
const { toast } = await import('#lib/stores/toastState.svelte.ts');

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

function daten(rows: SightingSelect[]): PageData {
	return {
		sightings: rows,
		/* Die Statusreiter über der Tabelle lesen diese Zahlen; ohne sie liefe
		   die Seite hier gar nicht erst durch. */
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: { page: 1, perPage: 20, total: rows.length, totalPages: 1, maxPerPage: 100 }
	} as unknown as PageData;
}

/* Nur die Tabelle: Die Auswahl-Checkboxen gibt es bewusst allein in der
   Desktop-Tabelle, die Mobilkarten bleiben unverändert (Spec U5). */
function zeilenCheckboxen(container: HTMLElement): HTMLInputElement[] {
	return [...container.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];
}

/** Einzelne Zeilen-Checkbox — kapselt den Indexzugriff, den `noUncheckedIndexedAccess` sonst als `| undefined` führt. */
function zeilenCheckbox(container: HTMLElement, index: number): HTMLInputElement {
	const checkbox = zeilenCheckboxen(container)[index];
	if (!checkbox) throw new Error(`Keine Zeilen-Checkbox an Position ${index}`);
	return checkbox;
}

function kopfCheckbox(container: HTMLElement): HTMLInputElement {
	return container.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
}

/** Der einzige erwartete Toast — der Punkt der Zusammenfassung ist ja, dass es genau einer ist. */
function einzigerToast() {
	expect(toast.current).toHaveLength(1);
	const eintrag = toast.current[0];
	if (!eintrag) throw new Error('Kein Toast vorhanden');
	return eintrag;
}

describe('Sichtungstabelle — Bulk-Aktionen', () => {
	beforeEach(async () => {
		submitVerdict.mockClear();
		invalidateAll.mockClear();
		toast.clear();
	});

	it('zeigt die Aktionsleiste erst bei einer Auswahl', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 1 })]) });

		expect(screen.container.textContent).not.toContain('ausgewählt');

		await zeilenCheckbox(screen.container, 0).click();

		await expect.element(screen.getByText('1 ausgewählt')).toBeVisible();
	});

	it('wählt mit der Kopf-Checkbox alle Zeilen der Seite', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 1 }), sichtung({ id: 2 }), sichtung({ id: 3 })])
		});

		await kopfCheckbox(screen.container).click();

		await expect.element(screen.getByText('3 ausgewählt')).toBeVisible();
		expect(zeilenCheckboxen(screen.container).every((c) => c.checked)).toBe(true);
	});

	it('zeigt die Kopf-Checkbox bei Teilauswahl als indeterminate', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 1 }), sichtung({ id: 2 })])
		});

		await zeilenCheckbox(screen.container, 0).click();

		const kopf = kopfCheckbox(screen.container);
		expect(kopf.indeterminate).toBe(true);
		expect(kopf.checked).toBe(false);
	});

	it('schickt „Freigeben" für jede gewählte Zeile über submitVerdict', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 4 }), sichtung({ id: 5 })])
		});

		await kopfCheckbox(screen.container).click();
		await screen.getByRole('button', { name: 'Freigeben' }).click();

		await vi.waitFor(() => expect(submitVerdict).toHaveBeenCalledTimes(2));
		/* `silent: true` gehört zur Zusicherung und ist kein Beiwerk: Ohne die
		   Option käme ein Fehler-Toast pro Zeile statt der einen Zusammenfassung. */
		expect(submitVerdict.mock.calls).toEqual([
			[4, 'approve', { silent: true }],
			[5, 'approve', { silent: true }]
		]);
	});

	it('leert die Auswahl nach der Ausführung', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 6 })]) });

		await zeilenCheckbox(screen.container, 0).click();
		await screen.getByRole('button', { name: 'Ablehnen' }).click();

		await vi.waitFor(() => expect(screen.container.textContent).not.toContain('ausgewählt'));
	});

	it('hebt die Auswahl über „Auswahl aufheben" auf, ohne zu senden', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 9 })]) });

		await zeilenCheckbox(screen.container, 0).click();
		await screen.getByRole('button', { name: 'Auswahl aufheben' }).click();

		expect(submitVerdict).not.toHaveBeenCalled();
		expect(screen.container.textContent).not.toContain('ausgewählt');
	});

	it('fasst das Ergebnis in genau einem Toast mit Rückgängig zusammen', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 20 }), sichtung({ id: 21 })])
		});

		await kopfCheckbox(screen.container).click();
		await screen.getByRole('button', { name: 'Freigeben' }).click();

		await vi.waitFor(() => expect(toast.current).toHaveLength(1));
		const eintrag = einzigerToast();
		expect(eintrag.message).toBe('2 Sichtungen freigegeben');
		expect(eintrag.action?.label).toBe('Rückgängig');
	});

	it('schickt beim Rückgängig ein reset für die erfolgreichen IDs', async () => {
		submitVerdict.mockImplementation((id: number) => Promise.resolve(id !== 31));
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 30 }), sichtung({ id: 31 })])
		});

		await kopfCheckbox(screen.container).click();
		await screen.getByRole('button', { name: 'Freigeben' }).click();
		await vi.waitFor(() => expect(toast.current).toHaveLength(1));

		submitVerdict.mockClear();
		submitVerdict.mockImplementation(() => Promise.resolve(true));
		einzigerToast().action?.onClick();

		await vi.waitFor(() => expect(submitVerdict).toHaveBeenCalledTimes(1));
		expect(submitVerdict).toHaveBeenCalledWith(30, 'reset', { silent: true });
	});

	/* Kein Cross-Page-Gedächtnis: Überlebte die Auswahl den Seitenwechsel, wirkte
	   „Freigeben" auf Zeilen, die gerade niemand sieht. */
	it('leert die Auswahl beim Wechsel auf eine andere Seite', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 1 }), sichtung({ id: 2 })])
		});

		await kopfCheckbox(screen.container).click();
		await expect.element(screen.getByText('2 ausgewählt')).toBeVisible();

		await screen.rerender({ data: daten([sichtung({ id: 40 }), sichtung({ id: 41 })]) });

		await vi.waitFor(() => expect(screen.container.textContent).not.toContain('ausgewählt'));
	});

	/* Die Checkbox-Spalte ist fest wie die Totfund-Markerspalte: Sie darf im
	   „Spalten"-Dropdown nicht abschaltbar sein, sonst ist die Bulk-Funktion je
	   nach gespeicherter Spaltenwahl unerreichbar. */
	it('bietet die Auswahlspalte nicht im Spalten-Dropdown an', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ id: 1 })]) });

		const dropdown = screen.container.querySelector('.dropdown-content') as HTMLElement;
		expect(dropdown.textContent).not.toContain('Auswahl');
	});
});
