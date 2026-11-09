/**
 * Formular für Löschersuchen (Art. 17 DSGVO) in den Einstellungen.
 *
 * Erst suchen, dann löschen: Der Lösch-Knopf erscheint erst nach Treffern und
 * fragt nach. Die Adresse geht nur an den Server und wird nach dem Löschen
 * aus dem Feld entfernt.
 */
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ReporterErasurePanel from './ReporterErasurePanel.svelte';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(respond: (body: { email: string; mode?: string }) => unknown): FetchMock {
	const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body ?? '{}'));
		return { ok: true, status: 200, json: async () => respond(body) };
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

const ADDRESS = 'erika@example.invalid';

describe('ReporterErasurePanel', () => {
	it('sucht zuerst nur — ohne mode=execute', async () => {
		const fetchMock = mockFetch(() => ({
			mode: 'preview',
			matched: 3,
			alreadyAnonymized: 1,
			erased: 0
		}));
		render(ReporterErasurePanel);

		await userEvent.fill(page.getByLabelText('E-Mail-Adresse der Person'), ADDRESS);
		await page.getByRole('button', { name: 'Meldungen suchen' }).click();

		await expect
			.element(page.getByText('3 Meldungen gefunden, davon 1 bereits anonymisiert'))
			.toBeVisible();
		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(body).toEqual({ email: ADDRESS });
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/admin/reporter-erasure');
	});

	it('zeigt ohne Treffer keinen Lösch-Knopf', async () => {
		mockFetch(() => ({ mode: 'preview', matched: 0, alreadyAnonymized: 0, erased: 0 }));
		render(ReporterErasurePanel);

		await userEvent.fill(page.getByLabelText('E-Mail-Adresse der Person'), ADDRESS);
		await page.getByRole('button', { name: 'Meldungen suchen' }).click();

		await expect.element(page.getByText('Keine Meldungen zu dieser Adresse')).toBeVisible();
		expect(page.getByRole('button', { name: 'Löschen', exact: true }).elements()).toHaveLength(0);
	});

	it('löscht erst nach Rückfrage und leert danach das Feld', async () => {
		const fetchMock = mockFetch((body) =>
			body.mode === 'execute'
				? { mode: 'execute', matched: 3, alreadyAnonymized: 1, erased: 3 }
				: { mode: 'preview', matched: 3, alreadyAnonymized: 1, erased: 0 }
		);
		render(ReporterErasurePanel);
		const input = page.getByLabelText('E-Mail-Adresse der Person');

		await userEvent.fill(input, ADDRESS);
		await page.getByRole('button', { name: 'Meldungen suchen' }).click();
		await page.getByRole('button', { name: 'Löschen', exact: true }).click();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await page.getByRole('button', { name: 'Endgültig löschen' }).click();

		await expect
			.element(page.getByText('3 Meldungen anonymisiert, Verknüpfung entfernt'))
			.toBeVisible();
		const executeBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
		expect(executeBody).toEqual({ email: ADDRESS, mode: 'execute' });
		await expect.element(input).toHaveValue('');
	});

	it('verwirft das Suchergebnis, sobald die Adresse geändert wird', async () => {
		// Sonst löschte „Löschen" die Meldungen der neuen Adresse auf Grundlage
		// der Trefferzahl der alten.
		mockFetch(() => ({ mode: 'preview', matched: 3, alreadyAnonymized: 0, erased: 0 }));
		render(ReporterErasurePanel);
		const input = page.getByLabelText('E-Mail-Adresse der Person');

		await userEvent.fill(input, ADDRESS);
		await page.getByRole('button', { name: 'Meldungen suchen' }).click();
		await expect.element(page.getByRole('button', { name: 'Löschen', exact: true })).toBeVisible();

		await userEvent.fill(input, 'max@example.invalid');

		expect(page.getByRole('button', { name: 'Löschen', exact: true }).elements()).toHaveLength(0);
	});
});
