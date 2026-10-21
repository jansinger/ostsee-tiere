import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import type { UploadedFileInfo } from '#lib/types/index.ts';
import MediaThumbnail from './MediaThumbnail.svelte';

/**
 * Bis PR #819 stand hier ein CSS-Lademuster: ein Streifen-Gradient auf dem
 * `img`, das bis zum Laden sichtbar sein sollte. Es hat nie etwas gezeigt — die
 * Gegenregel `.media-thumbnail img[src] { background: none !important }` im
 * selben Block hob es auf, und `src` steht im Markup als Literal, greift also ab
 * dem ersten Paint. Entfernt wurde damit totes CSS, aber auch die Absicht.
 *
 * Diese Datei hält die Zusage fest, die das alte Muster nicht eingehalten hat:
 * Der Ladezustand ist vor dem Laden sichtbar und danach weg — und zwar an einem
 * eigenen Element, das ein `onload`-Handler abschaltet, nicht über einen
 * CSS-Selektor, dessen Wirksamkeit man dem Stylesheet nicht ansieht.
 *
 * Zum Aufbau: `/api/media/...` beantwortet im Testbrowser niemand, das Bild läuft
 * dort also von selbst in einen Fehler. Die Übergänge werden trotzdem als
 * Ereignisse ausgelöst statt abgewartet — sonst hinge die Aussage jedes Tests
 * daran, was der Vite-Server zufällig auf eine unbekannte URL antwortet, und ein
 * grüner Lauf bewiese nicht, welcher der beiden Pfade die Anzeige abgeräumt hat.
 */
function bildDatei(overrides: Partial<UploadedFileInfo> = {}): UploadedFileInfo {
	return {
		uid: 'test-uid',
		filePath: '2026/08/foto.jpg',
		originalName: 'foto.jpg',
		mimeType: 'image/jpeg',
		size: 1024,
		url: '/uploads/2026/08/foto.jpg',
		...overrides
	};
}

function skeleton(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[data-testid="media-thumbnail-skeleton"]');
}

function bild(): HTMLImageElement {
	const element = document.querySelector<HTMLImageElement>('.media-thumbnail img');
	if (!element) throw new Error('Vorschaubild nicht im DOM');
	return element;
}

describe('MediaThumbnail — Ladezustand', () => {
	it('zeigt vor dem Laden eine Ladeanzeige', async () => {
		await render(MediaThumbnail, { file: bildDatei() });

		expect(skeleton()).not.toBeNull();
	});

	it('nimmt die Ladeanzeige weg, sobald das Bild geladen ist', async () => {
		await render(MediaThumbnail, { file: bildDatei() });

		bild().dispatchEvent(new Event('load'));
		// `tick()` und nicht `expect.poll`: Ein Poll liefe hier auch dann grün,
		// wenn erst der Fehlerpfad die Anzeige abräumt. Der Microtask flusht die
		// Zustandsänderung, bevor irgendein Netzwerk-Ereignis drankommt.
		await tick();

		expect(skeleton()).toBeNull();
	});

	it('behält die Ladeanzeige, solange der Fallback noch läuft', async () => {
		// `onerror` schaltet einmalig auf `file.url` um — das ist ein weiterer
		// Ladeversuch, kein Ende des Ladens.
		await render(MediaThumbnail, { file: bildDatei() });

		bild().dispatchEvent(new Event('error'));
		await tick();

		expect(bild().src).toContain('fallback=true');
		expect(skeleton()).not.toBeNull();
	});

	it('beendet die Ladeanzeige, wenn auch der Fallback fehlschlägt', async () => {
		// Sonst bliebe ein Dauer-Skeleton über einem kaputten Bild stehen: `load`
		// kommt nie, und der zweite `onerror` findet `fallback=true` bereits vor.
		await render(MediaThumbnail, { file: bildDatei() });

		bild().dispatchEvent(new Event('error'));
		await tick();
		bild().dispatchEvent(new Event('error'));
		await tick();

		expect(skeleton()).toBeNull();
	});

	it('beendet die Ladeanzeige sofort, wenn es keine Fallback-URL gibt', async () => {
		// `url` ist im Schema optional. Ohne die Prüfung baute der Handler daraus
		// `undefined?fallback=true` — eine Anfrage, die niemand beantworten kann,
		// nur damit ihr Fehlschlag die Anzeige abräumt.
		await render(MediaThumbnail, { file: bildDatei({ url: undefined }) });
		const vorher = bild().src;

		bild().dispatchEvent(new Event('error'));
		await tick();

		expect(bild().src).toBe(vorher);
		expect(skeleton()).toBeNull();
	});

	it('setzt keine Ladeanzeige an Nicht-Bild-Kacheln', async () => {
		// Der Video-Zweig lädt wegen `preload="none"` bewusst nichts, der
		// Datei-Zweig zeigt nur ein Icon — beide haben nichts zu überbrücken.
		await render(MediaThumbnail, {
			file: bildDatei({ mimeType: 'video/mp4', originalName: 'clip.mp4' })
		});

		expect(skeleton()).toBeNull();
	});
});
