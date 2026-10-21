import { describe, expect, it } from 'vitest';
import {
	buildFilterUrlState,
	dayOfYearFromIsoDate,
	isFullYearRange,
	isoDateFromTimestamp,
	parseMapFilterParams,
	serializeMapFilterParams,
	STATUS_PATTERN,
	type MapFilterUrlState
} from '#lib/map/urlFilterState.ts';
import { SIGHTING_STATUS_ORDER } from '#lib/components/admin/sightingStatus.ts';

/**
 * Tests für den URL-Query-Param-Sync der Sichtungskarten-Filter
 * (Befund M4/N6 aus docs/archive/UX_REVIEW_SICHTUNGSKARTE_2026-07-28.md).
 *
 * Vertrag: Query-Params `year`, `q`, `from`, `to`, `hs`, `hc`.
 * Ungültige Werte werden feldweise ignoriert; Default-Werte werden
 * beim Serialisieren weggelassen. Alle Zeitstempel sind lokale Zeit
 * (die Slider/der Controller arbeiten in der Browser-Zeitzone).
 */

/** Baut URLSearchParams aus einem Record — kompakter als Query-Strings im Test. */
function params(entries: Record<string, string>): URLSearchParams {
	return new URLSearchParams(entries);
}

describe('parseMapFilterParams', () => {
	it('gibt leeren Zustand für leere Params zurück', () => {
		expect(parseMapFilterParams(new URLSearchParams())).toEqual({});
	});

	describe('year', () => {
		it('liest gültiges Jahr als Zahl', () => {
			expect(parseMapFilterParams(params({ year: '2025' }))).toEqual({ year: 2025 });
		});

		it('akzeptiert die Bereichsgrenzen 2000 und 2100', () => {
			expect(parseMapFilterParams(params({ year: '2000' }))).toEqual({ year: 2000 });
			expect(parseMapFilterParams(params({ year: '2100' }))).toEqual({ year: 2100 });
		});

		it('ignoriert nicht-numerisches Jahr', () => {
			expect(parseMapFilterParams(params({ year: 'abc' }))).toEqual({});
		});

		it('ignoriert Jahr unterhalb des Bereichs', () => {
			expect(parseMapFilterParams(params({ year: '1899' }))).toEqual({});
		});

		it('ignoriert Jahr oberhalb des Bereichs', () => {
			expect(parseMapFilterParams(params({ year: '99999' }))).toEqual({});
		});
	});

	describe('q', () => {
		it('liest Suchbegriff getrimmt', () => {
			expect(parseMapFilterParams(params({ q: '  Schweinswal  ' }))).toEqual({
				query: 'Schweinswal'
			});
		});

		it('ignoriert leeren Suchbegriff', () => {
			expect(parseMapFilterParams(params({ q: '' }))).toEqual({});
		});

		it('ignoriert Suchbegriff aus nur Whitespace', () => {
			expect(parseMapFilterParams(params({ q: '   ' }))).toEqual({});
		});
	});

	describe('from/to', () => {
		it('liest gültige ISO-Daten', () => {
			expect(parseMapFilterParams(params({ from: '2025-03-01', to: '2025-09-30' }))).toEqual({
				from: '2025-03-01',
				to: '2025-09-30'
			});
		});

		it('akzeptiert from ohne to', () => {
			expect(parseMapFilterParams(params({ from: '2025-03-01' }))).toEqual({
				from: '2025-03-01'
			});
		});

		it('akzeptiert to ohne from', () => {
			expect(parseMapFilterParams(params({ to: '2025-09-30' }))).toEqual({ to: '2025-09-30' });
		});

		it('ignoriert unmögliches Kalenderdatum (2025-02-30)', () => {
			expect(parseMapFilterParams(params({ from: '2025-02-30' }))).toEqual({});
		});

		it('ignoriert ungültigen Monat (2025-13-01)', () => {
			expect(parseMapFilterParams(params({ to: '2025-13-01' }))).toEqual({});
		});

		it('ignoriert Werte im falschen Format', () => {
			expect(parseMapFilterParams(params({ from: 'kein-datum' }))).toEqual({});
		});

		it('ignoriert ungültiges from unabhängig von gültigem to', () => {
			expect(parseMapFilterParams(params({ from: 'kein-datum', to: '2025-09-30' }))).toEqual({
				to: '2025-09-30'
			});
		});
	});

	describe('hs (ausgeblendete Arten)', () => {
		it('splittet kommaseparierte Arten-IDs', () => {
			expect(parseMapFilterParams(params({ hs: '0,2,5' }))).toEqual({
				hiddenSpecies: ['0', '2', '5']
			});
		});

		it('behält nur rein numerische Einträge', () => {
			expect(parseMapFilterParams(params({ hs: '1,abc,2,ct3' }))).toEqual({
				hiddenSpecies: ['1', '2']
			});
		});

		it('entfernt Duplikate', () => {
			expect(parseMapFilterParams(params({ hs: '1,2,1' }))).toEqual({
				hiddenSpecies: ['1', '2']
			});
		});

		it('trimmt Whitespace um Einträge (handbearbeitete URLs)', () => {
			expect(parseMapFilterParams(params({ hs: '1, 2 ,3' }))).toEqual({
				hiddenSpecies: ['1', '2', '3']
			});
		});

		it('ignoriert hs wenn kein gültiger Eintrag übrig bleibt', () => {
			expect(parseMapFilterParams(params({ hs: 'abc,,x' }))).toEqual({});
		});
	});

	describe('hc (ausgeblendete Farbgruppen)', () => {
		it('splittet kommaseparierte Farbgruppen-Keys', () => {
			expect(parseMapFilterParams(params({ hc: 'ct0,ct1' }))).toEqual({
				hiddenColors: ['ct0', 'ct1']
			});
		});

		it('behält nur Einträge im Muster ct<Zahl>', () => {
			expect(parseMapFilterParams(params({ hc: 'ct0,foo,3,ct12' }))).toEqual({
				hiddenColors: ['ct0', 'ct12']
			});
		});

		it('entfernt Duplikate', () => {
			expect(parseMapFilterParams(params({ hc: 'ct1,ct1,ct2' }))).toEqual({
				hiddenColors: ['ct1', 'ct2']
			});
		});

		it('trimmt Whitespace um Einträge (handbearbeitete URLs)', () => {
			expect(parseMapFilterParams(params({ hc: ' ct0 , ct1' }))).toEqual({
				hiddenColors: ['ct0', 'ct1']
			});
		});

		it('ignoriert hc wenn kein gültiger Eintrag übrig bleibt', () => {
			expect(parseMapFilterParams(params({ hc: 'foo,bar' }))).toEqual({});
		});
	});

	it('ignoriert ungültige Felder einzeln und behält gültige', () => {
		const result = parseMapFilterParams(
			params({ year: 'abc', q: 'Robbe', from: '2025-02-30', hs: '3', hc: 'nope' })
		);

		expect(result).toEqual({ query: 'Robbe', hiddenSpecies: ['3'] });
	});
});

describe('serializeMapFilterParams', () => {
	it('gibt leeren String für leeren Zustand zurück', () => {
		expect(serializeMapFilterParams({})).toBe('');
	});

	it('serialisiert einzelne Felder', () => {
		expect(serializeMapFilterParams({ year: 2024 })).toBe('year=2024');
		expect(serializeMapFilterParams({ query: 'Robbe' })).toBe('q=Robbe');
		expect(serializeMapFilterParams({ from: '2025-03-01' })).toBe('from=2025-03-01');
	});

	it('hat kein führendes Fragezeichen', () => {
		expect(serializeMapFilterParams({ year: 2024 })).not.toMatch(/^\?/);
	});

	it('hält die Feld-Reihenfolge year, q, from, to, hs, hc ein', () => {
		const result = serializeMapFilterParams({
			hiddenColors: ['ct0'],
			hiddenSpecies: ['1'],
			to: '2025-09-30',
			from: '2025-03-01',
			query: 'Wal',
			year: 2024
		});

		const keys = [...new URLSearchParams(result).keys()];
		expect(keys).toEqual(['year', 'q', 'from', 'to', 'hs', 'hc']);
	});

	it('serialisiert Arrays kommasepariert als ein Param', () => {
		const result = serializeMapFilterParams({
			hiddenSpecies: ['0', '2', '5'],
			hiddenColors: ['ct0', 'ct1']
		});

		// Komma darf URL-encodiert sein (%2C) — deshalb Roundtrip statt String-Vergleich
		const parsed = new URLSearchParams(result);
		expect(parsed.get('hs')).toBe('0,2,5');
		expect(parsed.get('hc')).toBe('ct0,ct1');
	});

	it('lässt nicht gesetzte Felder weg', () => {
		const result = serializeMapFilterParams({ year: 2024, hiddenSpecies: ['1'] });

		const parsed = new URLSearchParams(result);
		expect(parsed.has('q')).toBe(false);
		expect(parsed.has('from')).toBe(false);
		expect(parsed.has('to')).toBe(false);
		expect(parsed.has('hc')).toBe(false);
	});

	it('roundtrip: parse(serialize(state)) ergibt den Zustand zurück', () => {
		const state: MapFilterUrlState = {
			year: 2024,
			query: 'Kegelrobbe Rügen',
			from: '2024-03-01',
			to: '2024-10-15',
			hiddenSpecies: ['0', '3'],
			hiddenColors: ['ct1', 'ct2']
		};

		const roundtripped = parseMapFilterParams(new URLSearchParams(serializeMapFilterParams(state)));

		expect(roundtripped).toEqual(state);
	});
});

describe('buildFilterUrlState', () => {
	function makeInput(
		overrides: Partial<Parameters<typeof buildFilterUrlState>[0]> = {}
	): Parameters<typeof buildFilterUrlState>[0] {
		return {
			year: 2025,
			defaultYear: 2025,
			searchTerm: '',
			timeFilter: {
				lower: new Date(2025, 0, 1, 0, 0, 0, 0).getTime(),
				upper: new Date(2025, 11, 31, 23, 59, 59, 0).getTime()
			},
			hiddenSpecies: {},
			hiddenColors: {},
			statuses: ['approved'],
			...overrides
		};
	}

	it('liefert leeren Zustand für Default-Werte', () => {
		expect(buildFilterUrlState(makeInput())).toEqual({});
	});

	it('setzt year nur wenn es vom Default abweicht', () => {
		expect(
			buildFilterUrlState(
				makeInput({
					year: 2024,
					timeFilter: {
						lower: new Date(2024, 0, 1, 0, 0, 0, 0).getTime(),
						upper: new Date(2024, 11, 31, 23, 59, 59, 0).getTime()
					}
				})
			)
		).toEqual({ year: 2024 });
	});

	it('lässt year beim Default-Jahr weg', () => {
		const result = buildFilterUrlState(makeInput({ year: 2025, searchTerm: 'Wal' }));

		expect(result.year).toBeUndefined();
	});

	it('setzt query nur bei nicht-leerem getrimmtem Suchbegriff', () => {
		expect(buildFilterUrlState(makeInput({ searchTerm: '  Schweinswal ' }))).toEqual({
			query: 'Schweinswal'
		});
		expect(buildFilterUrlState(makeInput({ searchTerm: '   ' }))).toEqual({});
	});

	it('lässt from/to bei vollem Jahresbereich weg', () => {
		const result = buildFilterUrlState(makeInput());

		expect(result.from).toBeUndefined();
		expect(result.to).toBeUndefined();
	});

	it('setzt from und to bei eingeschränktem Zeitfilter', () => {
		const result = buildFilterUrlState(
			makeInput({
				timeFilter: {
					lower: new Date(2025, 2, 1, 0, 0, 0, 0).getTime(),
					upper: new Date(2025, 8, 30, 23, 59, 59, 0).getTime()
				}
			})
		);

		expect(result.from).toBe('2025-03-01');
		expect(result.to).toBe('2025-09-30');
	});

	it('sortiert hiddenSpecies numerisch aufsteigend', () => {
		const result = buildFilterUrlState(
			makeInput({ hiddenSpecies: { '10': true, '2': true, '1': true } })
		);

		expect(result.hiddenSpecies).toEqual(['1', '2', '10']);
	});

	it('übernimmt nur Arten mit Wert true', () => {
		const result = buildFilterUrlState(
			makeInput({ hiddenSpecies: { '0': false, '3': true, '5': false } })
		);

		expect(result.hiddenSpecies).toEqual(['3']);
	});

	it('lässt hiddenSpecies weg wenn nichts ausgeblendet ist', () => {
		const result = buildFilterUrlState(makeInput({ hiddenSpecies: { '0': false } }));

		expect(result.hiddenSpecies).toBeUndefined();
	});

	it('sortiert hiddenColors alphabetisch', () => {
		const result = buildFilterUrlState(
			makeInput({ hiddenColors: { ct2: true, ct0: true, ct1: true } })
		);

		expect(result.hiddenColors).toEqual(['ct0', 'ct1', 'ct2']);
	});

	it('lässt hiddenColors weg wenn nichts ausgeblendet ist', () => {
		const result = buildFilterUrlState(makeInput({ hiddenColors: { ct0: false } }));

		expect(result.hiddenColors).toBeUndefined();
	});
});

describe('dayOfYearFromIsoDate', () => {
	it('gibt 0 für den 1. Januar zurück', () => {
		expect(dayOfYearFromIsoDate('2025-01-01', 2025)).toBe(0);
	});

	it('gibt 364 für den 31. Dezember eines normalen Jahres zurück', () => {
		expect(dayOfYearFromIsoDate('2025-12-31', 2025)).toBe(364);
	});

	it('gibt 365 für den 31. Dezember eines Schaltjahres zurück', () => {
		expect(dayOfYearFromIsoDate('2024-12-31', 2024)).toBe(365);
	});

	it('rechnet über die DST-Grenze hinweg exakt (15. Juli → 195)', () => {
		// 31+28+31+30+31+30+14 = 195; die Sommerzeit-Umstellung Ende März
		// darf das Ergebnis nicht um einen Tag verschieben.
		expect(dayOfYearFromIsoDate('2025-07-15', 2025)).toBe(195);
	});

	it('gibt null für ein Datum aus einem anderen Jahr zurück', () => {
		expect(dayOfYearFromIsoDate('2024-06-01', 2025)).toBeNull();
	});

	it('gibt null für ein unmögliches Kalenderdatum zurück', () => {
		expect(dayOfYearFromIsoDate('2025-02-30', 2025)).toBeNull();
	});

	it('gibt null für ungültiges Format zurück', () => {
		expect(dayOfYearFromIsoDate('foo', 2025)).toBeNull();
	});
});

describe('isoDateFromTimestamp', () => {
	it('formatiert lokalen Zeitstempel als YYYY-MM-DD', () => {
		expect(isoDateFromTimestamp(new Date(2025, 6, 15).getTime())).toBe('2025-07-15');
	});

	it('polstert einstellige Monate und Tage mit Nullen', () => {
		expect(isoDateFromTimestamp(new Date(2025, 0, 5).getTime())).toBe('2025-01-05');
	});
});

describe('isFullYearRange', () => {
	it('erkennt volles Jahr mit upper 23:59:59.000', () => {
		const timeFilter = {
			lower: new Date(2025, 0, 1, 0, 0, 0, 0).getTime(),
			upper: new Date(2025, 11, 31, 23, 59, 59, 0).getTime()
		};

		expect(isFullYearRange(timeFilter, 2025)).toBe(true);
	});

	it('erkennt volles Jahr mit upper 23:59:59.999', () => {
		const timeFilter = {
			lower: new Date(2025, 0, 1, 0, 0, 0, 0).getTime(),
			upper: new Date(2025, 11, 31, 23, 59, 59, 999).getTime()
		};

		expect(isFullYearRange(timeFilter, 2025)).toBe(true);
	});

	it('ist false wenn lower erst am 2. Januar beginnt', () => {
		const timeFilter = {
			lower: new Date(2025, 0, 2, 0, 0, 0, 0).getTime(),
			upper: new Date(2025, 11, 31, 23, 59, 59, 0).getTime()
		};

		expect(isFullYearRange(timeFilter, 2025)).toBe(false);
	});

	it('ist false wenn upper schon am 30. Dezember endet', () => {
		const timeFilter = {
			lower: new Date(2025, 0, 1, 0, 0, 0, 0).getTime(),
			upper: new Date(2025, 11, 30, 23, 59, 59, 0).getTime()
		};

		expect(isFullYearRange(timeFilter, 2025)).toBe(false);
	});
});

describe('Statusauswahl in der URL', () => {
	it('liest gültige Werte aus dem Parameter st', () => {
		const state = parseMapFilterParams(new URLSearchParams('st=open,rejected'));
		expect(state.statuses).toEqual(['open', 'rejected']);
	});

	it('ignoriert unbekannte Werte feldweise', () => {
		const state = parseMapFilterParams(new URLSearchParams('st=open,verified'));
		expect(state.statuses).toEqual(['open']);
	});

	it('lässt das Feld weg, wenn kein gültiger Wert übrig bleibt', () => {
		const state = parseMapFilterParams(new URLSearchParams('st=verified'));
		expect(state.statuses).toBeUndefined();
	});

	it('serialisiert die Auswahl nach st', () => {
		expect(serializeMapFilterParams({ statuses: ['open', 'approved'] })).toBe('st=open%2Capproved');
	});

	it('lässt die öffentliche Auswahl aus der URL weg', () => {
		const state = buildFilterUrlState({
			year: 2026,
			defaultYear: 2026,
			searchTerm: '',
			timeFilter: {
				lower: new Date(2026, 0, 1).getTime(),
				upper: new Date(2026, 11, 31, 23, 59, 59).getTime()
			},
			hiddenSpecies: {},
			hiddenColors: {},
			statuses: ['approved']
		});
		expect(state.statuses).toBeUndefined();
	});

	it('nimmt eine abweichende Auswahl in die URL auf', () => {
		const state = buildFilterUrlState({
			year: 2026,
			defaultYear: 2026,
			searchTerm: '',
			timeFilter: {
				lower: new Date(2026, 0, 1).getTime(),
				upper: new Date(2026, 11, 31, 23, 59, 59).getTime()
			},
			hiddenSpecies: {},
			hiddenColors: {},
			statuses: ['open', 'approved']
		});
		expect(state.statuses).toEqual(['open', 'approved']);
	});

	// T5.2 (Review-Befund): STATUS_PATTERN ist von Hand als Regex-Alternation
	// gepflegt und SIGHTING_STATUS_ORDER als Array — ein vierter Zustand dort
	// fiele hier ohne Compiler- oder Testfehler still durchs Muster. Dieser
	// Test schließt genau diese Lücke, indem er das Muster gegen die Quelle
	// der Zustände prüft statt gegen eine zweite, von Hand abgeschriebene Liste.
	it('akzeptiert jeden Bearbeitungszustand aus SIGHTING_STATUS_ORDER', () => {
		for (const status of SIGHTING_STATUS_ORDER) {
			expect(STATUS_PATTERN.test(status)).toBe(true);
		}
	});
});
