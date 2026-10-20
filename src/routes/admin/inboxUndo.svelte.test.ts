import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

const invalidateAll = vi.fn(() => Promise.resolve());
const submitVerdict = vi.fn(() => Promise.resolve(true));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict
}));

// Erst nach den Mocks importieren, sonst zieht die Seite die echten Module.
const AdminInbox = (await import('./+page.svelte')).default;

function sichtung(id: number): SightingSelect {
	return {
		id,
		created: new Date('2026-08-01T10:00:00Z'),
		sightingDate: new Date('2026-07-30T08:00:00Z'),
		species: 0,
		totalCount: 1,
		juvenileCount: 0,
		isDead: 0,
		email: `melder${id}@example.com`,
		firstName: 'Kim',
		lastName: 'Muster',
		spamScore: null,
		inBalticSea: 1,
		inBalticSeaGeo: 1
	} as unknown as SightingSelect;
}

/* `PageData` enthält auch die Layout-Daten (user, isAdmin, …). Die Seite liest
   davon nichts, deshalb der Cast statt eines vollständigen Fixtures. */
function daten(ids: number[]): PageData {
	return {
		open: ids.map(sichtung),
		openTotal: ids.length,
		order: 'asc' as const,
		imagesBySighting: {},
		pendingPhotoAnnouncements: 0,
		/* Baseline des Neue-Meldungen-Pollers. `0` heißt: Es gibt nichts Neues.
		   Der Poller fragt beim Start noch nicht, sondern erst nach 60 s — in
		   der Laufzeit dieser Tests also nie. */
		maxOpenId: 0,
		/* Ohne dieses Feld wirft die Seite beim Rendern: Der Cast auf `PageData`
		   unterdrückt die Typprüfung, die den fehlenden Loader-Schlüssel sonst
		   gemeldet hätte. Ein neues Feld im Loader gehört deshalb hierher. */
		duplicatesBySighting: {},
		reporterHistoryBySighting: {}
	} as unknown as PageData;
}

describe('Eingangsseite — Undo-Fenster', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		invalidateAll.mockClear();
		submitVerdict.mockClear();
	});

	afterEach(async () => {
		vi.useRealTimers();
	});

	it('zeigt nach dem Freigeben eine Undo-Zeile und blendet sie nach 8 s aus', async () => {
		const screen = await render(AdminInbox, { data: daten([1]) });

		await screen.getByRole('button', { name: 'Freigeben' }).click();
		await vi.advanceTimersByTimeAsync(0);
		expect(submitVerdict).toHaveBeenCalledWith(1, 'approve');
		await expect.element(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(8000);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
		expect(screen.container.textContent).not.toContain('Rückgängig');
	});

	it('ein ablaufendes Fenster kappt das noch laufende Fenster einer anderen Sichtung nicht', async () => {
		const screen = await render(AdminInbox, { data: daten([1, 2]) });

		// A freigeben …
		await screen.getByRole('button', { name: 'Freigeben' }).first().click();
		await vi.advanceTimersByTimeAsync(0);
		// … 3 s später B.
		await vi.advanceTimersByTimeAsync(3000);
		await screen.getByRole('button', { name: 'Freigeben' }).first().click();
		await vi.advanceTimersByTimeAsync(0);

		// t = 8 s: A läuft ab. B hat noch 3 s — es darf noch nicht neu geladen werden.
		await vi.advanceTimersByTimeAsync(5000);
		expect(invalidateAll).not.toHaveBeenCalled();
		await expect.element(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument();

		// t = 11 s: auch B ist abgelaufen — jetzt genau ein Reload.
		await vi.advanceTimersByTimeAsync(3000);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('Rückgängig sendet reset und stellt die Karte zurück', async () => {
		const screen = await render(AdminInbox, { data: daten([7]) });

		await screen.getByRole('button', { name: 'Freigeben' }).click();
		await vi.advanceTimersByTimeAsync(0);
		await screen.getByRole('button', { name: 'Rückgängig' }).click();
		await vi.advanceTimersByTimeAsync(0);

		expect(submitVerdict).toHaveBeenCalledWith(7, 'reset');
		await expect.element(screen.getByRole('button', { name: 'Freigeben' })).toBeInTheDocument();

		// Der Timer der zurückgenommenen Aktion darf nicht mehr feuern.
		await vi.advanceTimersByTimeAsync(10000);
		expect(invalidateAll).not.toHaveBeenCalled();
	});
});
