/**
 * @fileoverview Nachrichten an die einbettende Seite (iframe auf meeresmuseum.de)
 *
 * Eine fremde Seite kann weder die Höhe eines Cross-Origin-iframes auslesen
 * noch erfährt sie, wohin die App scrollen möchte. Beides meldet die App deshalb
 * per `postMessage`; das Gegenstück auf der Museumsseite steht in
 * `docs/IFRAME_EINBETTUNG.md`. Ohne dieses Skript passiert nichts — der iframe
 * behält dann seine feste Höhe aus dem Einbettungscode.
 *
 * `targetOrigin` ist `'*'`: Die Nachrichten enthalten nur eine Pixelzahl, und
 * die Elternseite ist von hier aus nicht verlässlich bestimmbar. Die
 * Herkunftsprüfung macht der Empfänger (`event.origin`).
 */

export const EMBED_HEIGHT_MESSAGE = 'ostsee-tiere:height';
export const EMBED_SCROLL_MESSAGE = 'ostsee-tiere:scroll';
/** Von der Elternseite: „Höhe bitte noch einmal melden" (siehe `static/embed.js`). */
export const EMBED_HEIGHT_REQUEST = 'ostsee-tiere:request-height';

/** Der Ausschnitt von `window`, den dieses Modul braucht — für Tests ersetzbar. */
export type EmbedWindow = Pick<
	Window,
	'parent' | 'top' | 'scrollY' | 'addEventListener' | 'removeEventListener'
>;

function isEmbedded(win: EmbedWindow): boolean {
	return win.top !== (win as unknown);
}

function postToParent(win: EmbedWindow, message: object): void {
	if (!isEmbedded(win)) return;
	win.parent.postMessage(message, '*');
}

/**
 * Meldet die Höhe von `element` an die Elternseite — sofort und bei jeder
 * Änderung. Gemessen wird bis zur Unterkante des Elements im Dokument, damit
 * ein Abstand darüber mitzählt.
 *
 * Fragt die Elternseite nach (`EMBED_HEIGHT_REQUEST`), kommt die Höhe erneut —
 * ihr Skript kann später laden als die erste Meldung. Die Herkunft der Anfrage
 * wird nicht geprüft: Sie löst nur eine Höhenangabe an `parent` aus.
 *
 * @returns Funktion zum Beenden der Beobachtung
 */
export function startHeightReporting(element: HTMLElement, win: EmbedWindow = window): () => void {
	if (!isEmbedded(win)) return () => {};

	let lastHeight = -1;
	const report = (): void => {
		const height = Math.ceil(element.getBoundingClientRect().bottom + win.scrollY);
		if (height === lastHeight) return;
		lastHeight = height;
		postToParent(win, { type: EMBED_HEIGHT_MESSAGE, height });
	};

	const onMessage = (event: MessageEvent): void => {
		if (event.data?.type !== EMBED_HEIGHT_REQUEST) return;
		lastHeight = -1;
		report();
	};

	const observer = new ResizeObserver(report);
	observer.observe(element);
	win.addEventListener('message', onMessage);
	return () => {
		observer.disconnect();
		win.removeEventListener('message', onMessage);
	};
}

/**
 * Bittet die Elternseite, so zu scrollen, dass die Position `top` (in Pixeln
 * ab Oberkante des iframe-Dokuments) oben im Fenster steht. Nötig, sobald der
 * iframe so hoch ist wie sein Inhalt: Dann scrollt nicht mehr die App, sondern
 * die Museumsseite, und `window.scrollTo` in der App bewirkt nichts.
 */
export function requestParentScroll(top: number, win: EmbedWindow = window): void {
	postToParent(win, { type: EMBED_SCROLL_MESSAGE, top: Math.max(0, Math.round(top)) });
}
