/**
 * Panel „Anonymisierung der Kontaktdaten" in den Einstellungen
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 5 und „Freigabe des ersten Laufs").
 *
 * - zeigt Status, letzten Lauf und — nach „Vorschau laden" — die
 *   Vorbedingungen und die Aufschlüsselung je Jahr;
 * - die Freischaltung verlangt die Eingabe der aktuellen Anzahl und steht nur
 *   Superadmins offen;
 * - nach der Freischaltung gibt es keinen Weg zurück, nur „Jetzt ausführen".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

const { invalidateAll } = vi.hoisted(() => ({ invalidateAll: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidateAll }));

import type { AnonymizationStatus } from '#lib/server/privacy/anonymizationStatus.ts';
import AnonymizationPanel from './AnonymizationPanel.svelte';

type Status = AnonymizationStatus;

const INACTIVE = {
	activatedAt: null,
	lastRun: null,
	overdue: 19873,
	unscoredSpam: 0,
	health: { level: 'inactive', reasons: [] }
} as unknown as Status;

const ACTIVE_OK = {
	activatedAt: '2026-11-10T10:00:00.000Z',
	lastRun: {
		at: '2026-11-20T03:15:00.000Z',
		trigger: 'token',
		skipped: null,
		hashed: 0,
		anonymized: 4,
		remaining: 0
	},
	overdue: 0,
	unscoredSpam: 0,
	health: { level: 'ok', reasons: [] }
} as unknown as Status;

const PREVIEW = {
	mode: 'preview',
	executed: false,
	skipped: null,
	keyConfigured: true,
	activatedAt: null,
	due: 19873,
	newestDueReceivedAt: '2026-08-08T12:00:00.000Z',
	byYear: [
		{
			year: 2025,
			total: 1200,
			namesCleared: 1000,
			namesKept: 150,
			shipsCleared: 90,
			shipsKept: 10,
			open: 3,
			rejected: 40
		}
	],
	pendingHashes: 0,
	hashed: 0,
	anonymized: 0,
	remaining: 19873,
	done: true
};

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(handler: (url: string, init?: RequestInit) => unknown): FetchMock {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const result = handler(url, init) as { status?: number; body: unknown };
		return {
			ok: (result.status ?? 200) < 400,
			status: result.status ?? 200,
			json: async () => result.body
		};
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

const calledWith = (fetchMock: FetchMock, fragment: string): boolean =>
	fetchMock.mock.calls.some((call) => String(call[0]).includes(fragment));

describe('AnonymizationPanel', () => {
	beforeEach(() => {
		invalidateAll.mockReset();
	});

	it('zeigt vor der Freischaltung „nicht freigeschaltet" und keinen letzten Lauf', async () => {
		render(AnonymizationPanel, { status: INACTIVE, isSuperAdmin: true });

		await expect.element(page.getByText('Noch nicht freigeschaltet')).toBeVisible();
		await expect.element(page.getByText('Noch kein Lauf')).toBeVisible();
	});

	it('lädt die Vorschau ohne mode=execute und zeigt Anzahl und Jahre', async () => {
		const fetchMock = mockFetch(() => ({ body: PREVIEW }));
		render(AnonymizationPanel, { status: INACTIVE, isSuperAdmin: true });

		await page.getByRole('button', { name: 'Vorschau laden' }).click();

		await expect.element(page.getByTestId('anonymization-due')).toHaveTextContent('19.873');
		await expect.element(page.getByRole('cell', { name: '2025' })).toBeVisible();
		expect(calledWith(fetchMock, '/api/admin/anonymize')).toBe(true);
		expect(calledWith(fetchMock, 'mode=execute')).toBe(false);
	});

	it('trennt offene von abgelehnten Meldungen, wie der Eingang', async () => {
		mockFetch(() => ({ body: PREVIEW }));
		render(AnonymizationPanel, { status: INACTIVE, isSuperAdmin: true });

		await page.getByRole('button', { name: 'Vorschau laden' }).click();

		await expect.element(page.getByRole('columnheader', { name: 'davon offen' })).toBeVisible();
		await expect.element(page.getByRole('columnheader', { name: 'davon abgelehnt' })).toBeVisible();
		await expect.element(page.getByRole('cell', { name: '40' })).toBeVisible();
		expect(page.getByRole('columnheader', { name: /ungeprüft/ }).elements()).toHaveLength(0);
	});

	it('zeigt die Vorbedingungen als Checkliste', async () => {
		mockFetch(() => ({ body: { ...PREVIEW, pendingHashes: 7 } }));
		render(AnonymizationPanel, {
			status: { ...INACTIVE, unscoredSpam: 12 } as Status,
			isSuperAdmin: true
		});

		await page.getByRole('button', { name: 'Vorschau laden' }).click();

		await expect.element(page.getByText('Schlüssel gesetzt')).toBeVisible();
		await expect.element(page.getByText('7 Adressen noch ohne Hash')).toBeVisible();
		await expect.element(page.getByText('12 Meldungen noch ohne Spam-Bewertung')).toBeVisible();
		// Solange eine Vorbedingung fehlt, gibt es keine Freischaltung.
		expect(page.getByRole('button', { name: 'Freischalten' }).elements()).toHaveLength(0);
	});

	it('schaltet erst frei, wenn die eingegebene Anzahl stimmt', async () => {
		const fetchMock = mockFetch((url) =>
			url.includes('/activate') ? { body: { activated: true } } : { body: PREVIEW }
		);
		render(AnonymizationPanel, { status: INACTIVE, isSuperAdmin: true });
		await page.getByRole('button', { name: 'Vorschau laden' }).click();

		const input = page.getByLabelText('Anzahl fälliger Meldungen zur Bestätigung');
		await userEvent.fill(input, '19000');
		await page.getByRole('button', { name: 'Freischalten' }).click();

		await expect.element(page.getByText('Die Anzahl stimmt nicht')).toBeVisible();
		expect(calledWith(fetchMock, '/activate')).toBe(false);

		await userEvent.fill(input, '19873');
		await page.getByRole('button', { name: 'Freischalten' }).click();

		await vi.waitFor(() => expect(calledWith(fetchMock, '/activate')).toBe(true));
		const activateCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/activate'));
		expect(JSON.parse(String(activateCall?.[1]?.body))).toEqual({ confirmedDue: 19873 });
		await vi.waitFor(() => expect(invalidateAll).toHaveBeenCalled());
	});

	it('zeigt Admins ohne Superadmin-Rolle keine Freischaltung', async () => {
		mockFetch(() => ({ body: PREVIEW }));
		render(AnonymizationPanel, { status: INACTIVE, isSuperAdmin: false });
		await page.getByRole('button', { name: 'Vorschau laden' }).click();

		await expect.element(page.getByTestId('anonymization-due')).toBeVisible();
		expect(page.getByRole('button', { name: 'Freischalten' }).elements()).toHaveLength(0);
	});

	it('bietet nach der Freischaltung keinen Weg zurück, nur „Jetzt ausführen"', async () => {
		const fetchMock = mockFetch(() => ({
			body: { ...PREVIEW, mode: 'execute', executed: true, anonymized: 4, remaining: 0 }
		}));
		render(AnonymizationPanel, { status: ACTIVE_OK, isSuperAdmin: true });

		await expect.element(page.getByText('In Betrieb')).toBeVisible();
		expect(page.getByRole('button', { name: 'Freischalten' }).elements()).toHaveLength(0);
		expect(
			page.getByRole('button', { name: /zurücknehmen|deaktivieren/i }).elements()
		).toHaveLength(0);

		await page.getByRole('button', { name: 'Jetzt ausführen' }).click();
		// Erst die Rückfrage, dann der Lauf.
		expect(calledWith(fetchMock, 'mode=execute')).toBe(false);
		await page.getByRole('button', { name: 'Anonymisieren' }).click();

		await vi.waitFor(() => expect(calledWith(fetchMock, 'mode=execute&limit=2000')).toBe(true));
	});

	it('nennt bei rotem Status die Gründe', async () => {
		render(AnonymizationPanel, {
			status: {
				...ACTIVE_OK,
				overdue: 5,
				health: { level: 'alert', reasons: ['overdue', 'stale_run'] }
			} as Status,
			isSuperAdmin: true
		});

		await expect.element(page.getByText('5 Meldungen liegen über der Frist')).toBeVisible();
		await expect
			.element(page.getByText('Der letzte Lauf liegt mehr als 48 Stunden zurück'))
			.toBeVisible();
	});

	it('meldet einen nicht ermittelbaren Status', async () => {
		render(AnonymizationPanel, { status: null, isSuperAdmin: true });

		await expect.element(page.getByText('Status nicht ermittelbar')).toBeVisible();
	});
});
