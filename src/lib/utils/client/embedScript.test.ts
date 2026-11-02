/**
 * `static/embed.js` und die Anleitung für das Meeresmuseum
 * (`docs/IFRAME_EINBETTUNG.md`) zeigen denselben Code an zwei Stellen: einmal
 * als Datei, einmal zum Hineinkopieren (Variante B). Kopien laufen
 * auseinander — dieser Test hält sie gleich.
 *
 * Außerdem: Inline eingefügt beendet jedes schließende Script-Tag im Code das
 * Script-Element an genau dieser Stelle, auch innerhalb eines Kommentars. Die
 * erste Fassung von `embed.js` trug eines im Kopfkommentar
 * (`e2e/iframe-embedding.spec.ts` → „Inline-Variante" war deshalb rot).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const embedJs = readFileSync('static/embed.js', 'utf8');
const guide = readFileSync('docs/IFRAME_EINBETTUNG.md', 'utf8');

/** Inhalt des ersten ```html-Blocks, der ein Inline-Script enthält. */
function inlineCodeFromGuide(): string | undefined {
	const blocks = [...guide.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
	const inline = blocks.find((block) => /<script>\n/.test(block));
	const code = inline?.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
	// Prettier rückt Skriptinhalt im HTML-Block um eine Ebene ein.
	return code?.replace(/^\t/gm, '');
}

describe('embed.js', () => {
	it('enthält kein Script-Tag — sonst bricht die Inline-Variante', () => {
		expect(embedJs.toLowerCase()).not.toMatch(/<\/?script/);
	});

	it('nennt die Produktionsadresse als Rückfall für die Inline-Variante', () => {
		expect(embedJs).toContain("var APP_ORIGIN = 'https://ostsee-tiere.de';");
	});
});

describe('docs/IFRAME_EINBETTUNG.md', () => {
	it('zeigt in Variante B genau den Code aus static/embed.js', () => {
		const inline = inlineCodeFromGuide();
		expect(inline, 'kein ```html-Block mit Inline-<script> gefunden').toBeDefined();
		expect(inline!.trim()).toBe(embedJs.trim());
	});

	it('bindet in Variante A die ausgelieferte Datei ein', () => {
		expect(guide).toContain('<script src="https://ostsee-tiere.de/embed.js" defer></script>');
	});
});
