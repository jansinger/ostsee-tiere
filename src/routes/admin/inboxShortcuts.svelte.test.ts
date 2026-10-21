import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';

/**
 * @fileoverview Tastatur-Triage des Eingangs (Spec B1) — die Strecke von der
 * echten Taste bis zum Fokus und zum Verdict.
 *
 * Die Tastenzuordnung selbst prüft `adminTriageShortcuts.test.ts` im Node-Runner.
 * Hier geht es um das, was nur ein Browser zeigt: Wer hat den Fokus, wandert er
 * nach einer Entscheidung weiter, und öffnet „?" das Overlay.
 */

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
		duplicatesBySighting: {},
		reporterHistoryBySighting: {}
	} as unknown as PageData;
}

/** Die Position der fokussierten Karte — `null`, wenn keine den Fokus hat. */
function fokussierteKarte(): string | null {
	return (
		document.activeElement?.closest('[data-inbox-index]')?.getAttribute('data-inbox-index') ?? null
	);
}

describe('Eingangsseite — Tastatur-Triage', () => {
	beforeEach(async () => {
		invalidateAll.mockClear();
		submitVerdict.mockClear();
	});

	it('fokussiert mit J vorwärts und mit K zurück', async () => {
		await render(AdminInbox, { data: daten([1, 2, 3]) });

		await userEvent.keyboard('j');
		expect(fokussierteKarte()).toBe('0');

		await userEvent.keyboard('j');
		expect(fokussierteKarte()).toBe('1');

		await userEvent.keyboard('k');
		expect(fokussierteKarte()).toBe('0');

		// Am oberen Ende bleibt der Fokus stehen, statt umzulaufen.
		await userEvent.keyboard('k');
		expect(fokussierteKarte()).toBe('0');
	});

	it('gibt die fokussierte Karte mit A frei und rückt den Fokus nach', async () => {
		const screen = await render(AdminInbox, { data: daten([11, 12]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('a');

		expect(submitVerdict).toHaveBeenCalledWith(11, 'approve');
		await expect.element(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument();
		/* Die bearbeitete Karte bleibt als Undo-Zeile stehen — der Fokus darf dort
		   nicht kleben bleiben, sonst tut das nächste A nichts. */
		await vi.waitFor(() => expect(fokussierteKarte()).toBe('1'));
	});

	it('lehnt die fokussierte Karte mit R ab', async () => {
		await render(AdminInbox, { data: daten([21, 22]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('j');
		await userEvent.keyboard('r');

		expect(submitVerdict).toHaveBeenCalledWith(22, 'reject');
	});

	it('nimmt die letzte Entscheidung mit U zurück', async () => {
		const screen = await render(AdminInbox, { data: daten([31, 32]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('a');
		await expect.element(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument();

		await userEvent.keyboard('u');

		await vi.waitFor(() => expect(submitVerdict).toHaveBeenCalledWith(31, 'reset'));
	});

	it('tut bei A nichts, solange keine Karte fokussiert ist', async () => {
		await render(AdminInbox, { data: daten([41]) });

		await userEvent.keyboard('a');

		expect(submitVerdict).not.toHaveBeenCalled();
	});

	it('entscheidet über die Karte, die den Fokus sichtbar hat', async () => {
		/* Ohne diese Kopplung entschied A über eine Karte, die niemand sieht: Der
		   Ring folgt dem DOM-Fokus, die gemerkte Position folgte nur J und K. Wer
		   nach einem J per Tab oder Klick in eine andere Karte wandert und dann A
		   drückt, gibt sonst die erste frei. */
		const screen = await render(AdminInbox, { data: daten([81, 82]) });

		await userEvent.keyboard('j');
		const zweiteFreigabe = screen.getByRole('button', { name: 'Freigeben' }).elements()[1];
		(zweiteFreigabe as HTMLElement).focus();

		await userEvent.keyboard('a');

		expect(submitVerdict).toHaveBeenCalledWith(82, 'approve');
	});

	it('entscheidet nichts, wenn der Fokus die Liste verlassen hat', async () => {
		const screen = await render(AdminInbox, { data: daten([91]) });

		await userEvent.keyboard('j');
		/* Der Sortier-Umschalter steht außerhalb der Liste — er ist der kürzeste
		   echte Weg aus ihr heraus. `document.body.focus()` taugt dafür nicht: Der
		   Body ist nicht fokussierbar, der Fokus bliebe auf der Karte, und der Test
		   prüfte am Ende nichts. */
		(screen.getByRole('button', { name: /zuerst/ }).element() as HTMLElement).focus();

		await userEvent.keyboard('a');

		expect(submitVerdict).not.toHaveBeenCalled();
	});

	it('blendet die Übersicht mit einem zweiten ? wieder aus', async () => {
		const screen = await render(AdminInbox, { data: daten([101]) });

		await userEvent.keyboard('?');
		const overlay = screen.getByRole('dialog', { name: /Tastaturkürzel/ });
		await expect.element(overlay).toBeInTheDocument();

		await userEvent.keyboard('?');
		await expect.element(overlay).not.toBeInTheDocument();
	});

	it('gibt den Fokus nach dem Schließen an die Karte zurück', async () => {
		await render(AdminInbox, { data: daten([111, 112]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('j');
		await userEvent.keyboard('?');
		await userEvent.keyboard('{Escape}');

		await vi.waitFor(() => expect(fokussierteKarte()).toBe('1'));
	});

	it('gibt den Fokus auch beim Schließen per Schaltfläche zurück', async () => {
		/* Der Knopf und der Hintergrund laufen über `onClose` und nicht über den
		   Escape-Zweig — genau dort wird der Fokus-Rückweg leicht vergessen. Ohne
		   ihn bliebe die gemerkte Position gesetzt, während keine Karte den Fokus
		   sichtbar trägt: A und R wirkten dann wieder auf eine unsichtbare Karte. */
		const screen = await render(AdminInbox, { data: daten([121, 122]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('j');
		await userEvent.keyboard('?');
		await screen.getByRole('button', { name: 'Schließen', exact: true }).click();

		await vi.waitFor(() => expect(fokussierteKarte()).toBe('1'));
	});

	it('gibt den Fokus beim Klick auf den Hintergrund zurück', async () => {
		const screen = await render(AdminInbox, { data: daten([131]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('?');
		await screen.getByRole('button', { name: /Tastaturkürzel schließen/ }).click();

		await vi.waitFor(() => expect(fokussierteKarte()).toBe('0'));
	});

	it('gibt den Fokus an den Hinweis-Knopf, wenn keine Karte ihn hatte', async () => {
		/* Geöffnet wird hier per Taste und nicht per Klick auf den Hinweis-Knopf:
		   Nach einem Klick trägt der Knopf den Fokus schon, und Chromium stellt ihn
		   beim Entfernen des Dialogs von selbst wieder her — der Test wäre auch ohne
		   den Rückweg im Code grün. Über die Taste gibt es kein solches Vorher, und
		   ohne den Rückweg landet der Fokus auf `<body>`.

		   Verglichen wird das **Element** und nicht sein `textContent`: Fällt der
		   Fokus auf `<body>`, enthält deren Textinhalt den ganzen Seitentext und
		   damit auch „alle Kürzel" — eine Text-Assertion wäre hier immer grün. */
		const screen = await render(AdminInbox, { data: daten([141]) });
		const knopf = screen.getByRole('button', { name: /alle Kürzel/ }).element();

		await userEvent.keyboard('?');
		await userEvent.keyboard('{Escape}');

		await vi.waitFor(() => expect(document.activeElement).toBe(knopf));
	});

	it('macht die Shortcuts ohne Overlay entdeckbar', async () => {
		const screen = await render(AdminInbox, { data: daten([51]) });

		await expect.element(screen.getByText(/Tastatur/)).toBeInTheDocument();
	});

	it('öffnet mit ? die Übersicht und schließt sie mit Escape', async () => {
		const screen = await render(AdminInbox, { data: daten([61]) });

		await userEvent.keyboard('?');
		const overlay = screen.getByRole('dialog', { name: /Tastaturkürzel/ });
		await expect.element(overlay).toBeInTheDocument();
		await expect.element(screen.getByText('Nächste Meldung')).toBeInTheDocument();

		await userEvent.keyboard('{Escape}');
		await expect.element(overlay).not.toBeInTheDocument();
	});

	it('entscheidet nichts, während die Übersicht offen ist', async () => {
		await render(AdminInbox, { data: daten([71]) });

		await userEvent.keyboard('j');
		await userEvent.keyboard('?');
		await userEvent.keyboard('a');

		expect(submitVerdict).not.toHaveBeenCalled();
	});
});
