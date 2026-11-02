/**
 * Welche Seiten im iframe mit ihrem Inhalt wachsen — und welche das Fenster
 * füllen.
 *
 * Bug (PR #994, CI-Shard `map`): Die automatische Höhe hob `min-h-dvh` an der
 * App-Hülle überall auf. `/map` bezieht seine Höhe aber genau daraus
 * (`flex-1 min-h-0`); eingebettet fiel die Karte auf Höhe 0
 * (`e2e/map-pan-zoom.spec.ts` → „Sichtungskarte im iframe").
 */
import { describe, expect, it } from 'vitest';
import { growsWithContent } from './embedHeightMode';

describe('growsWithContent', () => {
	it('lässt das Meldeformular mit seinem Inhalt wachsen', () => {
		expect(growsWithContent('/')).toBe(true);
	});

	it('lässt die Karte das Fenster füllen', () => {
		expect(growsWithContent('/map')).toBe(false);
	});

	it('lässt Fehlerseiten ohne Route mit ihrem Inhalt wachsen', () => {
		// Bei einer unbekannten URL ist `page.route.id` null; die Fehlerseite trug
		// `min-h-screen` und hätte den iframe sonst endlos vergrößert.
		expect(growsWithContent(null)).toBe(true);
	});
});
