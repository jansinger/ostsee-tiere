/**
 * @fileoverview Eingangsseite — Hinweis auf neu eingegangene Meldungen.
 *
 * Die Poll-Logik selbst ist im Node-Projekt geprüft
 * (`src/lib/components/admin/inboxPoller.test.ts`). Hier zählt allein die
 * Verdrahtung. Der Poller ist deshalb gemockt: Der Test kommt ohne echte Timer
 * aus und hängt an keiner Wartezeit.
 */
import { render } from 'vitest-browser-svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxPollerOptions } from '#lib/components/admin/inboxPoller.ts';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

const navigiereZuSessionEnde = vi.fn();
vi.mock('./inboxSessionEnde', () => ({ navigiereZuSessionEnde }));

const invalidateAll = vi.fn(() => Promise.resolve());
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin') }
}));

const submitVerdict = vi.fn(() => Promise.resolve(true));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict
}));

/* Der Mock hält fest, mit welchen Optionen die Seite den Poller gebaut hat —
   nur so kommt der Test an `onNeueMeldungen` heran, ohne zu warten. */
let letzteOptionen: InboxPollerOptions | null = null;
const start = vi.fn();
const stop = vi.fn();
vi.mock('#lib/components/admin/inboxPoller.ts', () => ({
	createInboxPoller: (optionen: InboxPollerOptions) => {
		letzteOptionen = optionen;
		return { start, stop };
	}
}));

// Erst nach den Mocks importieren, sonst zieht die Seite die echten Module.
const AdminInbox = (await import('./+page.svelte')).default;

/* Für die meisten Tests hier ist gleichgültig, was unter dem Hinweis steht —
   deshalb bleibt `open` per Default leer und braucht kein vollständiges
   Sichtungs-Fixture. Der Generationszähler-Test (Befund 2) braucht dagegen
   eine echte Karte, um „Freigeben" klicken zu können. */
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

function daten(maxOpenId: number, offeneIds: number[] = []): PageData {
	return {
		open: offeneIds.map(sichtung),
		openTotal: offeneIds.length,
		order: 'desc' as const,
		imagesBySighting: {},
		pendingPhotoAnnouncements: 0,
		duplicatesBySighting: {},
		reporterHistoryBySighting: {},
		maxOpenId
	} as unknown as PageData;
}

/** Wartet, bis der `$effect` der Seite den Poller gebaut hat. */
async function pollerOptionen(): Promise<InboxPollerOptions> {
	await vi.waitFor(() => expect(letzteOptionen).not.toBeNull());
	return letzteOptionen as InboxPollerOptions;
}

describe('Eingangsseite — Hinweis auf neue Meldungen', () => {
	beforeEach(() => {
		letzteOptionen = null;
		invalidateAll.mockReset().mockImplementation(() => Promise.resolve());
		submitVerdict.mockReset().mockImplementation(() => Promise.resolve(true));
		start.mockClear();
		stop.mockClear();
		navigiereZuSessionEnde.mockClear();
	});

	it('startet den Poller mit der Baseline aus dem Load', async () => {
		await render(AdminInbox, { data: daten(4711) });

		const optionen = await pollerOptionen();
		expect(optionen.baseline).toBe(4711);
		expect(start).toHaveBeenCalled();
	});

	it('zeigt ohne Meldung des Pollers keinen Hinweis', async () => {
		const screen = await render(AdminInbox, { data: daten(12) });
		await pollerOptionen();

		expect(screen.container.textContent).not.toContain('Neue Meldungen im Eingang');
	});

	it('rendert die Live-Region bereits im leeren Zustand', async () => {
		// Kein Styling-Detail: Eine role="status"/aria-live="polite"-Region muss im
		// Accessibility-Tree stehen, BEVOR sich ihr Inhalt ändert — sonst kündigen
		// manche Screenreader die spätere Meldung gar nicht an. Deshalb liegt das
		// {#if neueMeldungen} im Markup INNERHALB des Containers und nicht außen
		// um ihn herum (siehe Kommentar in +page.svelte). Zöge jemand das {#if}
		// wieder nach außen, fiele der Container hier weg, bevor der Poller
		// überhaupt etwas gemeldet hat — und dieser Test schlägt fehl.
		const screen = await render(AdminInbox, { data: daten(12) });
		await pollerOptionen();

		await expect.element(screen.getByRole('status')).toBeInTheDocument();
	});

	it('zeigt den Hinweis, sobald der Poller meldet', async () => {
		const screen = await render(AdminInbox, { data: daten(12) });

		(await pollerOptionen()).onNeueMeldungen();

		await expect.element(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
		expect(screen.container.textContent).toContain('Neue Meldungen im Eingang');
	});

	it('meldet eine abgelaufene Sitzung über den Login-Weg des Eingangs, nicht über Logout', async () => {
		// Nicht der Logout-Weg (`/api/auth/logout`): Der zerstört serverseitig nichts
		// mehr (die Sitzung ist ja bereits weg), hängt aber den Auth0-SSO-Logout an —
		// alle anderen offenen Admin-Tabs würden mit abgemeldet. Der Login-Weg führt
		// oft still durch und landet zurück auf dem Eingang. Siehe inboxSessionEnde.ts.
		await render(AdminInbox, { data: daten(12) });
		(await pollerOptionen()).onSessionEnde();

		expect(navigiereZuSessionEnde).toHaveBeenCalledOnce();
	});

	it('lädt beim Klick neu und nimmt den Hinweis zurück', async () => {
		const screen = await render(AdminInbox, { data: daten(12) });
		(await pollerOptionen()).onNeueMeldungen();

		await screen.getByRole('button', { name: 'Neu laden' }).click();

		expect(invalidateAll).toHaveBeenCalledTimes(1);
		expect(screen.container.textContent).not.toContain('Neue Meldungen im Eingang');
	});

	// Befund 1: Ein fehlgeschlagener Reload legt den Poller nicht dauerhaft still —
	// der Hinweis bleibt stehen, und ein zweiter Klick ist der Wiederholungsversuch.
	it('lässt den Hinweis stehen, wenn `invalidateAll` fehlschlägt', async () => {
		invalidateAll.mockRejectedValueOnce(new Error('netzwerk kaputt'));
		const screen = await render(AdminInbox, { data: daten(12) });
		(await pollerOptionen()).onNeueMeldungen();

		await screen.getByRole('button', { name: 'Neu laden' }).click();
		// Wartet auf das Settlen der abgelehnten Promise, damit der `catch`-Zweig
		// in `neuLaden()` sicher durchgelaufen ist, bevor geprüft wird.
		await vi.waitFor(() => expect(invalidateAll).toHaveBeenCalledTimes(1));

		expect(screen.container.textContent).toContain('Neue Meldungen im Eingang.');
		await expect.element(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
	});

	// Befund 2: Ein `entscheiden()`, dessen PATCH noch fliegt, darf nach einem
	// zwischenzeitlichen `neuLaden()` keinen lokalen Zustand mehr aufbauen — sonst
	// legt sein Undo-Timer acht Sekunden später einen zweiten, unerwarteten Reload
	// für eine Karte an, die es nach dem Reload nicht mehr gibt.
	it('bricht `entscheiden()` ab, wenn `neuLaden()` währenddessen dazwischenkommt', async () => {
		let aufloesen: ((ok: boolean) => void) | undefined;
		submitVerdict.mockImplementationOnce(
			() =>
				new Promise<boolean>((resolve) => {
					aufloesen = resolve;
				})
		);

		const screen = await render(AdminInbox, { data: daten(12, [1]) });
		const optionen = await pollerOptionen();

		await screen.getByRole('button', { name: 'Freigeben' }).click();
		// Der PATCH für Sichtung #1 hängt jetzt — noch keine Antwort.

		optionen.onNeueMeldungen();
		await screen.getByRole('button', { name: 'Neu laden' }).click();
		expect(invalidateAll).toHaveBeenCalledTimes(1);

		// Jetzt erst löst der PATCH auf. Ohne den Generationszähler baute
		// `entscheiden()` hier `done`/`busy`/den Undo-Timer für eine Karte auf,
		// die der Reload bereits abgeräumt hat.
		vi.useFakeTimers();
		try {
			aufloesen?.(true);
			await vi.advanceTimersByTimeAsync(8000);
		} finally {
			vi.useRealTimers();
		}

		expect(invalidateAll).toHaveBeenCalledTimes(1);
		expect(screen.container.textContent).not.toContain('Rückgängig');
	});
});
