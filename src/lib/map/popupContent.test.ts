import { afterEach, describe, expect, it } from 'vitest';
import type { MapTranslations } from './mapUtils';
import {
	createClusterInfoText,
	createClusterListContent,
	createInfoText,
	createSightingPopupContent,
	type SightingPopupProperties
} from './popupContent';

/**
 * Tests für die Popup-/Hover-Inhalte (Befund M6).
 *
 * Vorher: „Sichtung vom :" (Leerzeichen vor Doppelpunkt), redundantes
 * „Anzahl Tiere: 3 Tiere", Fahrwasser nur im Popup (nicht im Hover) und
 * durchgehend Inline-Hex-Styles am Theme vorbei.
 */

const translations: MapTranslations = {
	overview: 'Übersichtskarte',
	zoom_title: 'Zoom',
	zoom: 'Zoom',
	report_date: 'Sichtung vom',
	language: 'de',
	species: 'Tierart',
	species_legend: 'Tierart',
	position: 'Position',
	count: 'Anzahl Tiere',
	young: 'Davon Jungtiere',
	ship: 'Schiffsname',
	name: 'Name',
	area: 'Fahrwasser',
	latitude: 'Breite',
	longitude: 'Länge',
	found_dead: 'Totfund',
	speciesMap: { '0': 'Schweinswal', '1': 'Kegelrobbe' }
};

// 2026-05-12 12:00 UTC → 12.05.2026 in Europe/Berlin
const TS = Date.UTC(2026, 4, 12, 12) / 1000;

const baseProps: SightingPopupProperties = {
	ta: 0,
	ct: 3,
	ts: TS
};

describe('createSightingPopupContent', () => {
	it('rendert Datum ohne Leerzeichen-Doppelpunkt-Fehler', () => {
		const html = createSightingPopupContent(baseProps, translations);
		expect(html).not.toContain(' :');
		expect(html).toContain('Sichtung vom');
		expect(html).toContain('12.05.2026');
	});

	it('zeigt die Anzahl ohne redundantes „Tiere"-Suffix hinter dem Label', () => {
		const html = createSightingPopupContent(baseProps, translations);
		expect(html).toContain('Anzahl Tiere');
		expect(html).not.toMatch(/Anzahl Tiere:<\/strong>\s*3\s*Tiere/);
	});

	it('zeigt das Fahrwasser mit Label, wenn vorhanden', () => {
		const html = createSightingPopupContent({ ...baseProps, waterway: 'Kadetrinne' }, translations);
		expect(html).toContain('Fahrwasser');
		expect(html).toContain('Kadetrinne');
	});

	it('nutzt CSS-Klassen statt Inline-Styles', () => {
		const html = createSightingPopupContent(
			{
				...baseProps,
				jt: 1,
				tf: true,
				waterway: 'Kadetrinne',
				name: 'Muster',
				shipname: 'MS Test'
			},
			translations
		);
		expect(html).not.toContain('style=');
	});

	it('sanitisiert eingebettetes Markup aus Nutzdaten', () => {
		const html = createSightingPopupContent(
			{ ...baseProps, waterway: '<script>alert(1)</script>Rinne' },
			translations
		);
		expect(html).not.toContain('<script>');
		expect(html).toContain('Rinne');
	});

	/**
	 * Task 9: Der Ring codiert den Bearbeitungsstand — ohne Text im Popup ist
	 * ein gestrichelter Ring nicht verifizierbar. Für Nicht-Admins ist `st`
	 * immer `'approved'`; deshalb trägt genau dieser Zustand keine Zeile, und
	 * die öffentliche Karte bleibt unverändert.
	 */
	describe('Bearbeitungsstand (Task 9)', () => {
		it('zeigt „Offen" als Zeile, wenn st offen ist', () => {
			const html = createSightingPopupContent({ ...baseProps, st: 'open' }, translations);
			expect(html).toContain('Bearbeitungsstand');
			expect(html).toContain('Offen');
		});

		it('zeigt „Abgelehnt" als Zeile, wenn st abgelehnt ist', () => {
			const html = createSightingPopupContent({ ...baseProps, st: 'rejected' }, translations);
			expect(html).toContain('Bearbeitungsstand');
			expect(html).toContain('Abgelehnt');
		});

		it('zeigt keine Statuszeile für freigegebene Sichtungen (öffentliche Karte)', () => {
			const approved = createSightingPopupContent({ ...baseProps, st: 'approved' }, translations);
			const ohne = createSightingPopupContent(baseProps, translations);
			expect(approved).not.toContain('Bearbeitungsstand');
			expect(ohne).not.toContain('Bearbeitungsstand');
			// Gegenprobe: derselbe Aufruf mit anderem Status trägt die Zeile sehr wohl
			expect(createSightingPopupContent({ ...baseProps, st: 'open' }, translations)).toContain(
				'Bearbeitungsstand'
			);
		});

		it('nutzt die Badge-Klasse aus sightingStatus statt eigener Farben', () => {
			const html = createSightingPopupContent({ ...baseProps, st: 'rejected' }, translations);
			expect(html).toContain('badge-neutral');
			expect(html).not.toContain('style=');
		});
	});

	/**
	 * M10-Befund: `formatSightingDate` (intern in `popupContent.ts`) läuft seit
	 * der Umstellung auf `resolveDisplayLocale(getLocale())` statt hartcodiertem
	 * `'de-DE'` — bewiesen wird das über den tatsächlichen Datumstrenner (`.`
	 * gegen `/`), nicht nur über die Existenz eines Datums. Muster wie
	 * `dateUtils.test.ts`/`listViewUtils.test.ts`.
	 */
	describe('Locale-Umschaltung (resolveDisplayLocale)', () => {
		afterEach(async () => {
			// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
			// eingebauten Reset — auf den echten Default zurückschalten, damit
			// andere Tests im selben Prozess nicht die englische Locale erben.
			const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => baseLocale);
		});

		it('formatiert das Datum deutsch, wenn die aktive Locale de ist', async () => {
			const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => 'de');

			const html = createSightingPopupContent(baseProps, translations);

			expect(html).toContain('12.05.2026');
		});

		it('formatiert das Datum britisch, wenn die aktive Locale en ist', async () => {
			const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => 'en');

			const html = createSightingPopupContent(baseProps, translations);

			expect(html).toContain('12/05/2026');
		});
	});
});

describe('createClusterListContent', () => {
	it('listet Einträge ohne Inline-Styles und mit Datum', () => {
		const html = createClusterListContent(
			[baseProps, { ...baseProps, ta: 1, ct: 1, tf: true }],
			translations
		);
		expect(html).toContain('2 Sichtungen an diesem Ort');
		expect(html).toContain('12.05.2026');
		expect(html).not.toContain('style=');
		expect(html).toContain('cluster-list-item');
	});

	/**
	 * Task 9: In der Clusterliste ist der Ring gar nicht mehr sichtbar — ohne
	 * Wort im Eintrag ist der Bearbeitungsstand dort vollständig verloren.
	 */
	it('zeigt den Bearbeitungsstand offener und abgelehnter Einträge', () => {
		const html = createClusterListContent(
			[
				{ ...baseProps, st: 'open' },
				{ ...baseProps, ta: 1, st: 'rejected' }
			],
			translations
		);
		expect(html).toContain('Offen');
		expect(html).toContain('Abgelehnt');
		expect(html).toContain('badge-warning');
		expect(html).toContain('badge-neutral');
	});

	it('lässt freigegebene Einträge unverändert (öffentliche Karte)', () => {
		const html = createClusterListContent(
			[{ ...baseProps, st: 'approved' }, baseProps],
			translations
		);
		expect(html).not.toContain('badge');
		// Gegenprobe: mit einem offenen Eintrag entsteht das Badge sehr wohl
		expect(createClusterListContent([{ ...baseProps, st: 'open' }], translations)).toContain(
			'badge'
		);
	});

	it('nennt den Bearbeitungsstand auch im aria-label des Eintrags', () => {
		const html = createClusterListContent([{ ...baseProps, st: 'open' }], translations);
		expect(html).toMatch(/aria-label="[^"]*Offen[^"]*"/);
	});
});

describe('createInfoText (Hover)', () => {
	it('trennt Label und Datum mit Leerzeichen', () => {
		const html = createInfoText(baseProps, translations);
		expect(html).toContain('Sichtung vom 12.05.2026');
	});

	it('zeigt das Fahrwasser konsistent auch im Hover-Info', () => {
		const html = createInfoText({ ...baseProps, waterway: 'Kadetrinne' }, translations);
		expect(html).toContain('Fahrwasser: Kadetrinne');
	});
});

describe('createClusterInfoText (Hover)', () => {
	it('fasst die häufigsten Arten zusammen', () => {
		const html = createClusterInfoText(
			[baseProps, baseProps, { ...baseProps, ta: 1 }],
			translations
		);
		expect(html).toContain('3 Sichtungen');
		expect(html).toContain('Schweinswal: 2');
		expect(html).toContain('Kegelrobbe: 1');
	});
});
