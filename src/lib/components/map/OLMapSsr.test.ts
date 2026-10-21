import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import * as m from '#lib/paraglide/messages.js';
import OLMap from './OLMap.svelte';

/**
 * WARUM SERVERSEITIG GEPRÜFT WIRD
 *
 * Der Ladehinweis soll ab dem ERSTEN Bild dastehen — nicht erst, wenn
 * JavaScript geladen und hydriert hat. Weil `loading` mit `true` startet, steht
 * er im SSR-Markup; genau das hält dieser Test fest.
 *
 * Im Browser ließe sich dieselbe Aussage nur als Wettlauf prüfen: „Ist der
 * Hinweis unmittelbar nach dem Rendern noch da?" trifft nur zu, solange der
 * OpenLayers-Chunk langsam genug lädt. Ist er einmal im Modul-Cache — weil ein
 * Nachbartest ihn schon geholt hat, die Reihenfolge sich ändert oder ein Test
 * wiederholt wird —, ist die Karte womöglich schon fertig, und der Test fiele
 * ohne echten Fehler um. Serverseitig gibt es diesen Wettlauf nicht: Dort läuft
 * der `$effect` überhaupt nicht.
 */
/** Das öffnende `<div …>`-Tag des Ladehinweises aus dem SSR-Markup. */
function ladehinweisTag(body: string): string | null {
	return body.match(/<div[^>]*data-testid="map-loading"[^>]*>/)?.[0] ?? null;
}

describe('OLMap — Ladehinweis steht schon im SSR-Markup', () => {
	it('rendert den Ladehinweis ohne jedes JavaScript', () => {
		const { body } = render(OLMap, { props: { latitude: 54.5, longitude: 13.5 } });

		expect(body).toContain('data-testid="map-loading"');

		// Die Rolle am Ladehinweis SELBST prüfen, nicht irgendwo im Dokument:
		// Der Hinweis-Alert unter der Karte trägt ebenfalls `role="status"`, ein
		// freies `toContain('role="status"')` wäre also auch dann grün, wenn der
		// Ladehinweis seine Rolle verliert.
		expect(ladehinweisTag(body), 'öffnendes Tag des Ladehinweises').not.toBeNull();
		expect(ladehinweisTag(body)).toContain('role="status"');
	});

	/**
	 * Gegen die Meldung selbst geprüft, nicht gegen einen Wortlaut im Test: Der
	 * Text ist übersetzbar, ein Literal hier wäre eine zweite Quelle daneben.
	 * Ein rein visueller Spinner ohne Text bestünde diesen Test nicht.
	 */
	it('trägt im Ladehinweis den übersetzten Text', () => {
		const { body } = render(OLMap, { props: { latitude: 54.5, longitude: 13.5 } });

		const meldung = m.components_map_olmap_text_karte_wird_geladen();
		expect(meldung.trim()).not.toBe('');
		expect(body).toContain(meldung);
	});

	/**
	 * Gegenprobe: Der Fehlerzustand darf NICHT vorab mitgerendert werden — sonst
	 * sähe jeder Melder kurz eine Fehlermeldung, bevor die Karte kommt.
	 */
	it('rendert den Fehlerzustand nicht vorsorglich mit', () => {
		const { body } = render(OLMap, { props: { latitude: 54.5, longitude: 13.5 } });

		expect(body).not.toContain('data-testid="map-load-error"');
	});

	/**
	 * Das `tabindex="0"` am Ziel-Element hat schon einmal Pan und Wheel-Zoom bis
	 * zum ersten Klick gebrochen; die Begründung, warum es trotzdem dort steht,
	 * hängt als Kommentar im Markup. Beim Einbau des Ladezustands wurde genau
	 * dieses Element angefasst.
	 */
	it('behält tabindex und Rolle am Kartencontainer', () => {
		const { body } = render(OLMap, { props: { latitude: 54.5, longitude: 13.5 } });

		expect(body).toContain('tabindex="0"');
		expect(body).toContain('role="application"');
	});
});
