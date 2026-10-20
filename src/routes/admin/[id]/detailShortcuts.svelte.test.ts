/**
 * @fileoverview Verdrahtung der Tastatur-Triage in der Sichtungs-Detailansicht.
 *
 * `adminTriageShortcuts.test.ts` prüft nur `resolveInboxShortcut` selbst —
 * dass eine Taste die richtige *Aktion* liefert. Ob `aufTaste` in
 * `+page.svelte` diese Aktion dann auch richtig **verdrahtet**, prüft das
 * nicht: Eine Regression, bei der `U` `handleStatusChange('reset')` auf der
 * gerade angezeigten Sichtung aufriefe statt `zurueckNehmen` über
 * `undoMemory`, fiele dort keinem Test auf — `resolveInboxShortcut` gäbe für
 * `u` weiterhin korrekt `'undo'` zurück, nur die Reaktion darauf wäre falsch.
 *
 * Aufbau wie `src/routes/admin/inboxShortcuts.svelte.test.ts` (Tastatur bis
 * zum Effekt) und `detailUndo.svelte.test.ts` (Advance-Sprung per `rerender`
 * nachgebildet, weil SvelteKit dieselbe Routen-Komponente wiederverwendet).
 */
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontendSighting } from '#lib/types/index.ts';
import type { SightingQueue } from '#lib/components/admin/sightingQueue.ts';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import type { PageData } from './$types';

const goto = vi.fn(() => Promise.resolve());
const invalidateAll = vi.fn(() => Promise.resolve());
const preloadData = vi.fn(() => Promise.resolve());
const submitVerdict = vi.fn(() => Promise.resolve(true));

vi.mock('$app/navigation', () => ({
	goto,
	invalidateAll,
	preloadData
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/42') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict
}));

// Erst nach den Mocks importieren, sonst zieht die Seite die echten Module.
const AdminSightingDetail = (await import('./+page.svelte')).default;

function sichtung(overrides: { id: number } & Partial<FrontendSighting>): FrontendSighting {
	return {
		species: 0,
		totalCount: 1,
		sightingDate: new Date('2026-07-30T10:00:00Z'),
		created: new Date('2026-07-30T09:00:00Z'),
		referenceId: null,
		mediaFile: null,
		mediaUpload: 0,
		mediaConsent: 0,
		entryChannel: EntryChannelEnum.APP,
		uploadedFiles: [],
		approvedAt: null,
		rejectedAt: null,
		...overrides
	} as unknown as FrontendSighting;
}

function daten(
	sighting: FrontendSighting,
	opts: { queue?: SightingQueue | null; queueFailed?: boolean } = {}
): PageData {
	return {
		sighting,
		statusLog: [],
		statusLogFailed: false,
		queue: opts.queue ?? null,
		queueFailed: opts.queueFailed ?? false,
		queueOrder: 'asc' as const,
		isSuperAdmin: false
	} as unknown as PageData;
}

describe('Detailansicht — Tastatur-Triage: Verdrahtung von U', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		goto.mockClear();
		invalidateAll.mockClear();
		submitVerdict.mockClear();
	});

	afterEach(async () => {
		vi.useRealTimers();
	});

	it('A springt zur nächsten Sichtung, U nimmt danach die ERSTE (entschiedene) zurück — nicht die jetzt angezeigte', async () => {
		const queue: SightingQueue = {
			prev: null,
			next: { id: 43, referenceId: 'REF-43' },
			position: 1,
			total: 2
		};
		const screen = await render(AdminSightingDetail, {
			data: daten(sichtung({ id: 42 }), { queue, queueFailed: false })
		});

		// A: freigeben und zur nächsten offenen Sichtung springen.
		await userEvent.keyboard('a');
		await vi.advanceTimersByTimeAsync(0);
		expect(submitVerdict).toHaveBeenCalledWith(42, 'approve');
		expect(goto).toHaveBeenCalledWith(expect.stringContaining('/admin/43'));

		/* Der Advance wechselt die Route, SvelteKit behält aber dieselbe
		   Komponente (`admin/[id]`) — `rerender` bildet genau das nach: gleiche
		   Instanz, neue `data`, jetzt für Sichtung 43. `queueFailed: true` hält
		   den Arbeitsmodus aktiv (wie nach einem echten Reload aus dem Eingang),
		   ohne dass der Test einen vollständigen zweiten Queue-Nachbarn bräuchte. */
		await screen.rerender({
			data: daten(sichtung({ id: 43 }), { queue: null, queueFailed: true })
		});

		/* Befund 5: Ohne diese Assertion beweist der Test nichts. Reicht
		   `rerender` die Props nicht durch, bleibt `sighting.id === 42`, und
		   eine Fehlfassung `handleStatusChange('reset')` (statt `zurueckNehmen`
		   über `undoMemory`) läse `sighting.id` — bei stehengebliebener 42 lieferte
		   das zufällig ebenfalls `(42, 'reset')`, und der Test unten wäre grün,
		   ohne die eigentliche Verdrahtung zu prüfen. Erst die Überschrift belegt,
		   dass Sichtung 43 tatsächlich angezeigt wird, wenn `U` gedrückt wird. */
		await expect
			.element(page.getByRole('heading', { name: 'Sichtung Details #43' }))
			.toBeInTheDocument();

		// U: nimmt die letzte Entscheidung zurück, während Sichtung 43 angezeigt wird.
		await userEvent.keyboard('u');
		await vi.advanceTimersByTimeAsync(0);

		// Der Assert, der die ganze Zusage trägt: submitVerdict lief gegen die ID
		// der ERSTEN (entschiedenen) Sichtung — nicht gegen die gerade angezeigte.
		expect(submitVerdict).toHaveBeenCalledWith(42, 'reset');
		expect(submitVerdict).not.toHaveBeenCalledWith(43, 'reset');
	});

	/* Befund 8: `hilfeSchliessen` fiel bislang auf `vorherigerFokus?.focus()`
	   zurück, ohne Ersatzziel. Ist der gemerkte Fokus `document.body` — der
	   häufigste Fall direkt nach einem `goto()` aus dem Eingang, weil der
	   Browser den Fokus dort automatisch zurücksetzt, wenn keine Seite ihn
	   explizit setzt —, ist `body.focus()` ein No-op, und der Fokus bleibt
	   auf `<body>` stehen. Der Eingang löst denselben Fall über
	   `hinweisKnopf?.focus()`; die Detailansicht hat kein Bedienelement, das
	   das Overlay öffnet (nur die Taste `?`), deshalb die Überschrift als
	   Ersatzziel. */
	it('gibt den Fokus an die Überschrift zurück, wenn kein Element ihn hatte (document.body)', async () => {
		const screen = await render(AdminSightingDetail, {
			data: daten(sichtung({ id: 42 }), { queue: null, queueFailed: true })
		});

		// Kein vorheriger Klick/Fokus auf ein Bedienelement — `document.body`
		// trägt den Fokus, wie direkt nach einem `goto()` aus dem Eingang.
		document.body.focus();

		await userEvent.keyboard('?');
		await userEvent.keyboard('{Escape}');

		const ueberschrift = screen.getByRole('heading', { name: 'Sichtung Details #42' }).element();
		await vi.waitFor(() => expect(document.activeElement).toBe(ueberschrift));
	});
});
