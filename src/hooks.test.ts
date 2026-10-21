import type { Reroute } from '@sveltejs/kit/hooks';
import { describe, expect, it } from 'vitest';
import { reroute } from './hooks';

/**
 * Reihenfolge der drei Schritte, nicht ihre Einzelteile — die sind in
 * `languagePrefix.test.ts` und bei Paraglide geprüft. Hier geht es darum, dass
 * der Legacy-Vertrag vor der Lokalisierung greift: `/en/rest_sichtungen` muss
 * die deutsche Route treffen, nicht eine englische Oberfläche.
 *
 * `fetch` gehört zum Reroute-Event, wird hier aber nicht gebraucht: Die Regel
 * ist eine reine Pfad-Umschreibung ohne Netzzugriff. Ein Aufruf wäre ein Fehler
 * und soll sich als solcher zeigen.
 */
const fetchStub: typeof fetch = () => {
	throw new Error('reroute darf nicht fetchen');
};

const pfadNach = (url: string): string | undefined => {
	const event: Parameters<Reroute>[0] = {
		url: new URL(url, 'https://example.test'),
		fetch: fetchStub
	};
	const ergebnis = reroute(event);
	return typeof ergebnis === 'string' ? ergebnis : undefined;
};

describe('reroute', () => {
	it('schneidet das Legacy-Präfix ab und trifft die deutsche Route', () => {
		expect(pfadNach('/en/rest_sichtungen/antworten.json')).toBe('/rest_sichtungen/antworten.json');
	});

	it('schreibt ausgeschlossene Pfade nicht um', () => {
		expect(pfadNach('/en/api/sightings')).toBeUndefined();
		expect(pfadNach('/en/admin/sichtungen')).toBeUndefined();
	});

	it('lokalisiert eine Seitenroute', () => {
		expect(pfadNach('/en/map')).toBe('/map');
	});

	it('lässt einen präfixlosen Pfad unverändert', () => {
		expect(pfadNach('/map')).toBe('/map');
	});

	it('schreibt /de/ nicht um — Deutsch ist präfixlos', () => {
		// Ohne ausdrückliche Ablehnung räumt deLocalizeUrl das Präfix ab und
		// liefert die deutsche Seite unter einer zweiten URL aus.
		expect(pfadNach('/de/sichtungen')).toBeUndefined();
		expect(pfadNach('/de')).toBeUndefined();
	});

	it('behandelt /en/sichtungen/showreports.json als Legacy-Pfad', () => {
		// Nur eine Verhaltensprobe für den Legacy-Endpunkt selbst, KEIN Beleg für
		// die Reihenfolge der Schritte: istAusgeschlossen('/sichtungen/showreports.json')
		// ist ohnehin false, und deLocalizeUrl liefert unabhängig davon, ob Schritt 1
		// vorher lief, denselben Pfad. Ein vollständig entfernter Schritt 1 ließe
		// diesen Test unverändert grün. Die tatsächlichen Reihenfolge-Wächter sind
		// die beiden /de/-Fälle unten, die echte Divergenz zwischen den Schritten
		// erzeugen.
		expect(pfadNach('/en/sichtungen/showreports.json')).toBe('/sichtungen/showreports.json');
	});

	/**
	 * Reihenfolge-Wächter: Diese beiden Fälle sind die einzigen mit echter
	 * Divergenz zwischen den Schritten. Legacy-Präfix muss vor der /de/-Ablehnung
	 * laufen — sonst griffe die /de/-Ablehnung zuerst und lieferte `undefined`
	 * (404) statt der deutschen Legacy-Antwort, für alle vier Legacy-Pfade unter
	 * `/de/`. Mit einem live angebundenen iOS-Client wäre das der teuerste
	 * denkbare Regress. Mit RED belegt (siehe Task-3-Bericht): eine über
	 * `stripLegacyLanguagePrefix` geschobene /de/-Zeile lässt genau diese beiden
	 * Fälle fehlschlagen.
	 */
	it('schneidet /de/ vor einem Legacy-Pfad ab, statt ihn per /de/-Ablehnung zu blockieren', () => {
		expect(pfadNach('/de/rest_sichtungen/antworten.json')).toBe('/rest_sichtungen/antworten.json');
	});

	it('schneidet /de/ vor dem showreports-Legacy-Pfad ab', () => {
		expect(pfadNach('/de/sichtungen/showreports.json')).toBe('/sichtungen/showreports.json');
	});

	it('lehnt /de/ case-insensitiv ab, analog zu Paraglides toLocale()', () => {
		// toLocale() in runtime.js vergleicht per toLowerCase() — ein rein
		// kleingeschriebener Regex ließe /DE/... und /De/... durch und
		// deLocalizeUrl würde sie zu einer zweiten URL für dieselbe deutsche
		// Seite entlokalisieren.
		expect(pfadNach('/DE/sichtungen')).toBeUndefined();
		expect(pfadNach('/De/map')).toBeUndefined();
	});

	it('liefert für /EN/rest_sichtungen weiterhin 404 (unverändert ggü. bisher)', () => {
		// Groß geschriebenes /EN/ trifft nicht stripLegacyLanguagePrefix (das ist
		// case-sensitiv und bleibt es), wird also über deLocalizeUrl entlokalisiert
		// (case-insensitiv wie toLocale) und dann von istAusgeschlossen blockiert.
		expect(pfadNach('/EN/rest_sichtungen')).toBeUndefined();
	});
});
