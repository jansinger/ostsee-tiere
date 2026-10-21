/**
 * `createVideoThumbnail()` (fileAnalysis.ts) lädt das Video über eine
 * blob:-URL. Ohne eine `media-src`-Direktive greift `default-src ['self']`,
 * und blob: steht dort nicht — der Ladefehler landet in einem leeren catch,
 * es gibt weder Thumbnail noch Meldung.
 *
 * Siehe docs/archive/VIDEO_UPLOAD_KONZEPT_2026-07-31.md, Abschnitt 1.3 c.
 *
 * WICHTIG: Dieser Test importiert `svelte.config.js` bewusst NICHT als Modul.
 * SvelteKits `Csp.Source`-Typ erwartet CSP-Schlüsselwörter ohne innere
 * Anführungszeichen (z. B. "self"), während dieses Projekt seit jeher die
 * CSP-konforme Schreibweise mit inneren Anführungszeichen verwendet (z. B.
 * "'self'") — nur so erscheint das Token korrekt im ausgelieferten Header.
 * Ein Modul-Import zieht `svelte.config.js` erstmals in das `tsc`-Programm
 * und erzeugt dadurch ~19 Typfehler über die gesamte, seit langem
 * funktionierende CSP-Konfiguration — nicht nur über media-src. Die
 * Konfiguration ist korrekt (verifiziert durch den tatsächlich ausgelieferten
 * `media-src 'self' blob: data:`-Header gegen den Dev-Server); den Typfehlern
 * auszuweichen, indem die Anführungszeichen entfernt würden, würde die CSP
 * brechen, um einem Typ zu genügen. Deshalb liest dieser Test die Datei als
 * Text und prüft die Direktive per Regex, statt sie als Modul auszuwerten.
 *
 * Dieser Test deckt NUR ab, dass die `media-src`-Zeile in der Konfiguration
 * steht und 'self', blob: und data: nennt — ein Regressionsschutz gegen
 * versehentliches Entfernen. Ob die Direktive tatsächlich wirkt (d. h. im
 * ausgelieferten Header ankommt), beweist dieser Test NICHT — das ist bereits
 * end-to-end gegen den Dev-Server verifiziert (siehe oben).
 *
 * Bitte NICHT wieder auf einen Modul-Import umstellen — das bringt die 19
 * Typfehler zurück.
 */
import { describe, expect, it } from 'vitest';
import { SVELTEKIT_OPTIONS } from '../../../../sveltekit.options.ts';

describe('CSP für Medien', () => {
	it('erlaubt blob: als Medienquelle', () => {
		// Seit SvelteKit 3 steht die CSP in `sveltekit.options.ts` (vorher svelte.config.js)
		// und Schlüsselwörter ohne eigene Anführungszeichen — Kit setzt sie im Header.
		const mediaSrc = SVELTEKIT_OPTIONS.csp.directives['media-src'];

		expect(mediaSrc, 'media-src fehlt — default-src greift und blockiert blob:').toBeDefined();
		expect(mediaSrc).toContain('self');
		expect(mediaSrc).toContain('blob:');
		expect(mediaSrc).toContain('data:');
	});
});
