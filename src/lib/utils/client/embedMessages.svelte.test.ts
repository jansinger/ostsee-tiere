/**
 * Nachrichten an die einbettende Seite (meeresmuseum.de, Typo3).
 *
 * Der iframe stand fest auf 3350px, weil eine fremde Seite die Höhe eines
 * Cross-Origin-iframes nicht auslesen kann. Die App meldet sie deshalb selbst
 * per `postMessage`; ein kleines Skript auf der Museumsseite setzt sie
 * (Snippet in `docs/IFRAME_EINBETTUNG.md`).
 *
 * Browser-Projekt (`.svelte.test.ts`), weil `ResizeObserver` und echtes Layout
 * gebraucht werden. Das Fenster wird als Attrappe übergeben — der Testlauf
 * selbst ist nicht eingebettet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	EMBED_HEIGHT_MESSAGE,
	EMBED_HEIGHT_REQUEST,
	EMBED_SCROLL_MESSAGE,
	requestParentScroll,
	startHeightReporting,
	type EmbedWindow
} from './embedMessages';

type FakeWindow = EmbedWindow & EventTarget & { parent: { postMessage: ReturnType<typeof vi.fn> } };

/** Fenster-Attrappe: eingebettet heißt `top !== self`. Ein EventTarget, damit Nachrichten ankommen. */
function fakeWindow(embedded: boolean): FakeWindow {
	const parent = { postMessage: vi.fn() };
	const self = Object.assign(new EventTarget(), { parent, scrollY: 0 }) as unknown as FakeWindow;
	(self as { top: unknown }).top = embedded ? {} : self;
	return self;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	cleanups.splice(0).forEach((fn) => fn());
	document.body.replaceChildren();
});

function box(height: number): HTMLDivElement {
	const el = document.createElement('div');
	el.style.height = `${height}px`;
	document.body.appendChild(el);
	return el;
}

describe('startHeightReporting', () => {
	it('meldet die Höhe des Elements beim Start an die Elternseite', async () => {
		const win = fakeWindow(true);
		cleanups.push(startHeightReporting(box(420), win));

		await expect
			.poll(() => win.parent.postMessage.mock.calls.at(-1))
			.toEqual([{ type: EMBED_HEIGHT_MESSAGE, height: expect.any(Number) }, '*']);
		const [message] = win.parent.postMessage.mock.calls.at(-1)!;
		expect(message.height).toBeGreaterThanOrEqual(420);
	});

	/**
	 * Anlass (2026-11-09, Museumsseite, Chromium, 1200×800): Der iframe lag bei
	 * 1159px außerhalb des Sichtfelds und blieb 6 s auf der Starthöhe 3350px; erst
	 * nach dem Hineinscrollen sprang er auf 453px. Die erste Meldung hing allein am
	 * `ResizeObserver` — vermutlich drosselt Chromium das Rendering fremder iframes
	 * außerhalb des Sichtfelds, und der Observer feuert dort nicht. Deshalb bewusst
	 * ohne `await`: Die Meldung darf nicht auf einen Rendering-Durchlauf warten.
	 */
	it('meldet die Höhe synchron beim Start, ohne auf den ResizeObserver zu warten', () => {
		const win = fakeWindow(true);
		cleanups.push(startHeightReporting(box(420), win));

		expect(win.parent.postMessage).toHaveBeenCalledTimes(1);
		const [message, targetOrigin] = win.parent.postMessage.mock.calls[0]!;
		expect(message).toEqual({ type: EMBED_HEIGHT_MESSAGE, height: expect.any(Number) });
		expect(message.height).toBeGreaterThanOrEqual(420);
		expect(targetOrigin).toBe('*');
	});

	it('der erste ResizeObserver-Lauf wiederholt die Startmeldung nicht', async () => {
		const win = fakeWindow(true);
		const el = box(300);
		cleanups.push(startHeightReporting(el, win));

		// Observer laufen in der Reihenfolge ihrer Erzeugung: Feuert dieser hier,
		// ist der von `startHeightReporting` im selben Durchlauf schon gelaufen.
		// `setTimeout` verlässt diesen Durchlauf: Liefe der Rest des Laufs in seinen
		// Mikrotasks weiter, beobachtete schon der nächste Test mitten darin ein
		// neues Element („ResizeObserver loop completed…").
		await new Promise<void>((resolve) => {
			const observer = new ResizeObserver(() => {
				observer.disconnect();
				setTimeout(resolve);
			});
			observer.observe(el);
		});

		expect(win.parent.postMessage).toHaveBeenCalledTimes(1);
	});

	it('meldet eine neue Höhe, wenn das Element wächst oder schrumpft', async () => {
		const win = fakeWindow(true);
		const el = box(300);
		cleanups.push(startHeightReporting(el, win));
		await expect.poll(() => win.parent.postMessage.mock.calls.length).toBeGreaterThan(0);

		el.style.height = '1200px';
		await expect
			.poll(() => win.parent.postMessage.mock.calls.at(-1)?.[0].height)
			.toBeGreaterThanOrEqual(1200);

		el.style.height = '200px';
		await expect.poll(() => win.parent.postMessage.mock.calls.at(-1)?.[0].height).toBeLessThan(300);
	});

	it('meldet dieselbe Höhe nicht doppelt', async () => {
		const win = fakeWindow(true);
		const el = box(300);
		cleanups.push(startHeightReporting(el, win));
		await expect.poll(() => win.parent.postMessage.mock.calls.length).toBe(1);

		el.style.width = '50%'; // Größenänderung ohne Höhenänderung
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		expect(win.parent.postMessage).toHaveBeenCalledTimes(1);
	});

	it('meldet nichts, wenn die Seite nicht eingebettet ist', async () => {
		const win = fakeWindow(false);
		cleanups.push(startHeightReporting(box(300), win));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		expect(win.parent.postMessage).not.toHaveBeenCalled();
	});

	it('meldet die Höhe erneut, wenn die Elternseite danach fragt', async () => {
		// Lädt das Skript der Museumsseite erst nach der ersten Meldung, ginge
		// sie verloren — der iframe bliebe auf seiner Starthöhe stehen.
		const win = fakeWindow(true);
		cleanups.push(startHeightReporting(box(300), win));
		await expect.poll(() => win.parent.postMessage.mock.calls.length).toBe(1);

		win.dispatchEvent(new MessageEvent('message', { data: { type: EMBED_HEIGHT_REQUEST } }));
		expect(win.parent.postMessage).toHaveBeenCalledTimes(2);
		expect(win.parent.postMessage.mock.calls[1]).toEqual(win.parent.postMessage.mock.calls[0]);
	});

	it('hört nach dem Aufräumen auf zu melden', async () => {
		const win = fakeWindow(true);
		const el = box(300);
		const stop = startHeightReporting(el, win);
		await expect.poll(() => win.parent.postMessage.mock.calls.length).toBe(1);

		stop();
		el.style.height = '900px';
		win.dispatchEvent(new MessageEvent('message', { data: { type: EMBED_HEIGHT_REQUEST } }));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		expect(win.parent.postMessage).toHaveBeenCalledTimes(1);
	});
});

describe('requestParentScroll', () => {
	it('bittet die Elternseite, zur Position im iframe zu scrollen', () => {
		const win = fakeWindow(true);
		requestParentScroll(512.4, win);
		expect(win.parent.postMessage).toHaveBeenCalledWith(
			{ type: EMBED_SCROLL_MESSAGE, top: 512 },
			'*'
		);
	});

	it('schickt nie eine negative Position', () => {
		const win = fakeWindow(true);
		requestParentScroll(-80, win);
		expect(win.parent.postMessage).toHaveBeenCalledWith(
			{ type: EMBED_SCROLL_MESSAGE, top: 0 },
			'*'
		);
	});

	it('tut nichts, wenn die Seite nicht eingebettet ist', () => {
		const win = fakeWindow(false);
		requestParentScroll(100, win);
		expect(win.parent.postMessage).not.toHaveBeenCalled();
	});
});
