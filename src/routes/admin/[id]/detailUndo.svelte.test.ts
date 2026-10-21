/**
 * @fileoverview Der nutzersichtbare Teil des Critical-Fixes (Rückweg aus der
 * Tabelle navigiert nicht mehr) war ungetestet — E2E deckt ihn nicht ab. Nach
 * dem Vorbild von `src/routes/admin/inboxUndo.svelte.test.ts`: Seite mit
 * gemocktem `$app/navigation` und gemocktem `submitVerdict` rendern, den
 * Toast-Store mocken, um an den „Rückgängig"-Callback zu kommen (der Toast
 * selbst wird an dieser Stelle nicht gerendert), und `zurueckNehmen` über den
 * echten Ablauf treiben — nicht durch direkten Aufruf einer internen Funktion.
 */
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontendSighting } from '#lib/types/index.ts';
import type { SightingQueue } from '#lib/components/admin/sightingQueue.ts';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import type { PageData } from './$types';

const goto = vi.fn(() => Promise.resolve());
const invalidateAll = vi.fn(() => Promise.resolve());
const preloadData = vi.fn(() => Promise.resolve());
const submitVerdict = vi.fn(() => Promise.resolve(true));
const toastSuccess = vi.fn();
const toastRemoveByKey = vi.fn();

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
vi.mock('#lib/stores/toastState.svelte.ts', () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccess(...args),
		info: vi.fn(),
		removeByKey: (...args: unknown[]) => toastRemoveByKey(...args)
	}
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

/** Klickt das „Freigegeben"-Segment der Status-Kontrolle. */
async function freigeben() {
	await page.getByRole('radio', { name: 'Freigegeben' }).click();
	await vi.advanceTimersByTimeAsync(0);
}

/** Ruft den zuletzt registrierten Toast-Undo-Callback auf. */
function loeseUndoAus() {
	const [, options] = toastSuccess.mock.calls.at(-1) as [
		string,
		{ action: { onClick: () => void } }
	];
	options.action.onClick();
}

describe('Detailansicht — Rückgängig', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		goto.mockReset();
		goto.mockImplementation(() => Promise.resolve());
		invalidateAll.mockClear();
		submitVerdict.mockReset();
		submitVerdict.mockImplementation(() => Promise.resolve(true));
		toastSuccess.mockClear();
		toastRemoveByKey.mockClear();
	});

	afterEach(async () => {
		vi.useRealTimers();
	});

	it('aus der Tabelle geöffnet (kein Warteschlangen-Modus): Undo ruft submitVerdict mit der entschiedenen ID auf und navigiert nicht', async () => {
		await render(AdminSightingDetail, { data: daten(sichtung({ id: 42 })) });

		await freigeben();
		expect(submitVerdict).toHaveBeenCalledWith(42, 'approve');

		loeseUndoAus();
		await vi.advanceTimersByTimeAsync(0);

		expect(submitVerdict).toHaveBeenCalledWith(42, 'reset');
		expect(goto).not.toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalled();
	});

	it('im Warteschlangen-Modus nach einem Advance: Undo führt zur entschiedenen Sichtung zurück und lässt die vorgesprungene Sichtung unangetastet', async () => {
		const queue: SightingQueue = {
			prev: null,
			next: { id: 43, referenceId: 'REF-43' },
			position: 1,
			total: 2
		};
		const screen = await render(AdminSightingDetail, {
			data: daten(sichtung({ id: 42 }), { queue, queueFailed: false })
		});

		await freigeben();
		expect(submitVerdict).toHaveBeenCalledWith(42, 'approve');
		// Advance zur nächsten offenen Sichtung.
		expect(goto).toHaveBeenCalledWith(expect.stringContaining('/admin/43'));

		/* Dieselbe Route (`/admin/[id]`) — SvelteKit behält die Komponente beim
		   bloßen Wechsel des Parameters, `letzteEntscheidung` (State) überlebt
		   den Sprung. `rerender` bildet genau das nach: gleiche Instanz, neue
		   `data`. Ohne diesen Schritt könnte ein Bug, der `sighting.id` statt der
		   gemerkten ID verwendet, hier nicht auffallen — die angezeigte Sichtung
		   wäre sonst die ganze Zeit über dieselbe wie die entschiedene. */
		await screen.rerender({
			data: daten(sichtung({ id: 43 }), { queue: null, queueFailed: false })
		});

		loeseUndoAus();
		await vi.advanceTimersByTimeAsync(0);

		// Der Verdict geht an die entschiedene Sichtung (42) — nicht an die
		// vorgesprungene (43), die gerade angezeigt wird.
		expect(submitVerdict).toHaveBeenCalledWith(42, 'reset');
		expect(submitVerdict).not.toHaveBeenCalledWith(43, 'reset');
		// Und die Navigation führt zurück zur entschiedenen Sichtung.
		expect(goto).toHaveBeenLastCalledWith(expect.stringContaining('/admin/42'));
	});

	/* Befund 2: `vergiss(id)` lief bislang VOR dem `submitVerdict`-Request.
	   Scheiterte der Request (Netzwerkfehler, 5xx), war die Erinnerung schon
	   weg, obwohl nichts zurückgesetzt wurde — der weiterhin sichtbare
	   „Rückgängig"-Knopf war danach tot. Der Fix verschiebt `vergiss(id)` in
	   den Erfolgszweig: Ein gescheiterter Versuch lässt die Erinnerung stehen,
	   ein zweiter Versuch kann es erneut probieren. */
	it('ein gescheiterter Undo-Request räumt die Erinnerung nicht — ein zweiter Versuch geht noch', async () => {
		await render(AdminSightingDetail, { data: daten(sichtung({ id: 42 })) });

		await freigeben();
		expect(submitVerdict).toHaveBeenCalledWith(42, 'approve');
		invalidateAll.mockClear();

		// Erster Versuch scheitert.
		submitVerdict.mockImplementationOnce(() => Promise.resolve(false));
		loeseUndoAus();
		await vi.advanceTimersByTimeAsync(0);

		expect(submitVerdict).toHaveBeenLastCalledWith(42, 'reset');
		// Kein Erfolg → keine Navigation/Neuladen.
		expect(invalidateAll).not.toHaveBeenCalled();
		/* Fix-Runde 2: `toast.removeByKey` lief zuvor VOR dem `submitVerdict`-
		   Aufruf, unabhängig vom Ausgang. Scheitert der Request, bleibt der
		   Toast mit dem einzigen sichtbaren „Rückgängig"-Knopf jetzt stehen —
		   ohne ihn ginge ein zweiter Versuch nur noch über die Taste `U`. */
		expect(toastRemoveByKey).not.toHaveBeenCalled();

		// Zweiter Versuch, diesmal erfolgreich — die Erinnerung war noch da,
		// sonst fände `zurueckNehmen` hier `undoMemory.current === null` und
		// der zweite `submitVerdict('reset')`-Aufruf bliebe aus.
		loeseUndoAus();
		await vi.advanceTimersByTimeAsync(0);

		expect(submitVerdict).toHaveBeenLastCalledWith(42, 'reset');
		expect(invalidateAll).toHaveBeenCalled();
		// Erst nach dem erfolgreichen zweiten Versuch darf der Toast weg sein.
		expect(toastRemoveByKey).toHaveBeenCalledWith('sighting-verdict-undo');
	});

	/* Befund 3: `statusBusy` bleibt im Advance-Pfad während des `await
	   goto(...)` aktiv gesperrt. Die Taste `U` entfernte den Toast bisher VOR
	   der `statusBusy`-Prüfung in `zurueckNehmen` — ein Tastendruck in diesem
	   Fenster hätte den Toast (die einzige sichtbare Undo-Möglichkeit)
	   unwiederbringlich gelöscht, ohne dass der Undo selbst durchging. Der Fix
	   entfernt den Toast erst INNERHALB von `zurueckNehmen`, nachdem der
	   Wächter bereits grünes Licht gegeben hat — ein blockierter Versuch lässt
	   Toast und Erinnerung deshalb unangetastet, ein späterer Versuch geht
	   noch. */
	it('U während eines laufenden Advance verliert weder Toast noch Erinnerung — ein späterer Versuch geht noch', async () => {
		const queue: SightingQueue = {
			prev: null,
			next: { id: 43, referenceId: 'REF-43' },
			position: 1,
			total: 2
		};
		let freigebenGoto: () => void = () => {};
		goto.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					freigebenGoto = resolve;
				})
		);

		await render(AdminSightingDetail, {
			data: daten(sichtung({ id: 42 }), { queue, queueFailed: false })
		});

		// Freigeben startet den Advance-Pfad; das `goto()` hängt absichtlich —
		// `statusBusy` bleibt dadurch aktiv gesperrt.
		await page.getByRole('radio', { name: 'Freigegeben' }).click();
		await vi.advanceTimersByTimeAsync(0);
		expect(submitVerdict).toHaveBeenCalledWith(42, 'approve');

		// U drücken, während `statusBusy` noch gesperrt ist.
		await userEvent.keyboard('u');
		await vi.advanceTimersByTimeAsync(0);

		// Blockiert — kein zweiter `submitVerdict`-Aufruf, und (das ist der
		// eigentliche Befund) der Toast wurde NICHT entfernt: Ein späterer
		// Versuch muss noch funktionieren.
		expect(submitVerdict).not.toHaveBeenCalledWith(42, 'reset');
		expect(toastRemoveByKey).not.toHaveBeenCalled();

		// Das hängende `goto()` löst auf, `statusBusy` wird wieder frei.
		freigebenGoto();
		await vi.advanceTimersByTimeAsync(0);

		// Jetzt geht der Undo noch — Toast und Erinnerung waren nicht verloren.
		loeseUndoAus();
		await vi.advanceTimersByTimeAsync(0);
		expect(submitVerdict).toHaveBeenCalledWith(42, 'reset');
	});
});
