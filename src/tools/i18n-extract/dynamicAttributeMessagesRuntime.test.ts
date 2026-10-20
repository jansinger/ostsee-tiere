/**
 * Laufzeit-Nachweis für die mechanisierten Gruppe-2-Botschaften (Stage-2-Review
 * der 44 `dynamic-attribute`-Fundstellen, 2026-08-12): eine parametrisierte
 * ICU-Botschaft muss den richtigen, interpolierten Text liefern — nicht nur
 * im Werkzeug-Bericht (das prüfen die `collectSvelte.test.ts`-Fälle), sondern
 * kompiliert, über den echten Paraglide-Runtime-Pfad, in BEIDEN Sprachen.
 *
 * Positiv formuliert (nicht „bleibt deutsch"): jede Assertion prüft, dass der
 * erwartete, interpolierte Text ankommt — für `de` UND für `en`.
 *
 * Bis zum 2026-08-13 stand auf beiden Seiten derselbe deutsche Text: Etappe 1
 * hatte den englischen Katalog nur mechanisch befüllt. Das ist seit der
 * DeepL-Vorübersetzung nicht mehr so, und die Erwartungen sind entsprechend
 * nachgezogen. Der Zweck des Tests ändert sich dadurch nicht — geprüft wird,
 * dass die Parameter in BEIDEN Sprachen an ihren jeweils richtigen Stellen
 * landen. Genau das ist hier die Aussage: Die englischen Sätze stellen die
 * Platzhalter teils um (`{originalName} öffnen` → `Open {originalName}`), ein
 * Test nur gegen `de` würde diese Umstellung nie anfassen.
 */
import { describe, expect, it } from 'vitest';
import * as m from '#lib/paraglide/messages.js';

describe('mechanisierte dynamic-attribute-Botschaften — Laufzeit, beide Sprachen', () => {
	it('setzt einen einzelnen Parameter korrekt ein (Suchfilter {query} entfernen)', () => {
		const params = { query: 'Schweinswal' };
		expect(
			m.components_map_sightingsmapview_aria_label_suchfilter_query_entfernen(params, {
				locale: 'de'
			})
		).toBe('Suchfilter Schweinswal entfernen');
		expect(
			m.components_map_sightingsmapview_aria_label_suchfilter_query_entfernen(params, {
				locale: 'en'
			})
		).toBe('Remove the ‘Schweinswal’ search filter');
	});

	it('setzt zwei Parameter an ihren jeweils richtigen Stellen ein (Filter Jahr {year} … {apiDefaultYear})', () => {
		const params = { year: '2024', apiDefaultYear: '2026' };
		const erwartetDe = 'Filter Jahr 2024 entfernen und zum Standard-Jahr 2026 wechseln';
		const erwartetEn = 'Remove the ‘Year 2024’ filter and switch to the default ‘Year 2026’';
		expect(
			m.components_map_sightingsmapview_aria_label_filter_jahr_year_entfernen_und(params, {
				locale: 'de'
			})
		).toBe(erwartetDe);
		expect(
			m.components_map_sightingsmapview_aria_label_filter_jahr_year_entfernen_und(params, {
				locale: 'en'
			})
		).toBe(erwartetEn);
	});

	it('setzt drei Parameter aus dem naming-Kollisionsfall korrekt ein (Sichtbarkeit für {value} …)', () => {
		const params = { value: 'Schweinswal', visible: 3, total: 7 };
		const erwartetDe =
			'Sichtbarkeit für Schweinswal umschalten. Aktuell 3 von 7 Sichtungen sichtbar.';
		const erwartetEn = 'Toggle visibility for Schweinswal. Currently 3 of 7 sightings are visible.';
		expect(
			m.components_map_panel_legendpanel_aria_label_sichtbarkeit_fuer_value_umschalten_aktue(
				params,
				{
					locale: 'de'
				}
			)
		).toBe(erwartetDe);
		expect(
			m.components_map_panel_legendpanel_aria_label_sichtbarkeit_fuer_value_umschalten_aktue(
				params,
				{
					locale: 'en'
				}
			)
		).toBe(erwartetEn);
	});

	it('setzt den aus einem JS-Template-Literal mechanisierten Parameter korrekt ein ({originalName} öffnen)', () => {
		const params = { originalName: 'strand-foto.jpg' };
		expect(
			m.components_media_mediathumbnail_aria_label_originalname_oeffnen(params, { locale: 'de' })
		).toBe('strand-foto.jpg öffnen');
		expect(
			m.components_media_mediathumbnail_aria_label_originalname_oeffnen(params, { locale: 'en' })
		).toBe('Open strand-foto.jpg');
	});
});
