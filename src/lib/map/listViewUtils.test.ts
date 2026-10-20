import { afterEach, describe, expect, it } from 'vitest';
import {
	formatEntryDate,
	isSightingVisible,
	toListEntries,
	type ListFilterState,
	type SightingListProperties
} from '#lib/map/listViewUtils.ts';

/**
 * Tests für die Listenansicht-Utilities der Sichtungskarte (Befund K3):
 * definieren den Vertrag von Sichtbarkeit, Mapping und Sortierung der
 * barrierefreien Tabellen-Alternative.
 *
 * Sichtbarkeitslogik ist identisch zur Kartenlogik in styleUtils/countManager:
 * versteckt wenn hiddenSpecies[ta], hiddenColors[farbgruppe] oder
 * ts*1000 außerhalb timeFilter (Grenzen inklusiv sichtbar).
 */

function makeProps(overrides: Partial<SightingListProperties> = {}): SightingListProperties {
	return {
		id: 1,
		ts: 1_750_000_000, // 2025-06-15T14:26:40Z
		ta: 0,
		ct: 1,
		...overrides
	};
}

function makeFilters(overrides: Partial<ListFilterState> = {}): ListFilterState {
	return {
		hiddenSpecies: {},
		hiddenColors: {},
		timeFilter: { lower: 0, upper: Number.MAX_SAFE_INTEGER },
		...overrides
	};
}

const SPECIES_MAP: Record<string, string> = {
	'0': 'Schweinswal',
	'1': 'Kegelrobbe',
	'2': 'Seehund'
};

describe('isSightingVisible', () => {
	it('ist sichtbar ohne aktive Filter', () => {
		expect(isSightingVisible(makeProps(), makeFilters())).toBe(true);
	});

	it('ist versteckt wenn die Tierart in hiddenSpecies steht', () => {
		const filters = makeFilters({ hiddenSpecies: { '0': true } });

		expect(isSightingVisible(makeProps({ ta: 0 }), filters)).toBe(false);
	});

	it('bleibt sichtbar wenn eine andere Tierart versteckt ist', () => {
		const filters = makeFilters({ hiddenSpecies: { '1': true } });

		expect(isSightingVisible(makeProps({ ta: 0 }), filters)).toBe(true);
	});

	it('ist versteckt wenn die Farbgruppe ct0 (Totfund) versteckt ist', () => {
		const filters = makeFilters({ hiddenColors: { ct0: true } });

		expect(isSightingVisible(makeProps({ tf: true }), filters)).toBe(false);
	});

	it('ist versteckt wenn die Farbgruppe ct2 versteckt ist und ct=3', () => {
		const filters = makeFilters({ hiddenColors: { ct2: true } });

		expect(isSightingVisible(makeProps({ ct: 3 }), filters)).toBe(false);
	});

	it('bleibt sichtbar wenn eine nicht zutreffende Farbgruppe versteckt ist', () => {
		const filters = makeFilters({ hiddenColors: { ct2: true } });

		// ct=1 gehört zur Gruppe ct1, nicht ct2
		expect(isSightingVisible(makeProps({ ct: 1 }), filters)).toBe(true);
	});

	it('ist versteckt wenn der Zeitstempel vor dem Zeitfilter liegt', () => {
		const ts = 1_750_000_000;
		const filters = makeFilters({
			timeFilter: { lower: (ts + 1) * 1000, upper: (ts + 100) * 1000 }
		});

		expect(isSightingVisible(makeProps({ ts }), filters)).toBe(false);
	});

	it('ist versteckt wenn der Zeitstempel nach dem Zeitfilter liegt', () => {
		const ts = 1_750_000_000;
		const filters = makeFilters({
			timeFilter: { lower: (ts - 100) * 1000, upper: (ts - 1) * 1000 }
		});

		expect(isSightingVisible(makeProps({ ts }), filters)).toBe(false);
	});

	it('ist sichtbar wenn der Zeitstempel exakt auf der unteren Grenze liegt', () => {
		const ts = 1_750_000_000;
		const filters = makeFilters({
			timeFilter: { lower: ts * 1000, upper: (ts + 100) * 1000 }
		});

		expect(isSightingVisible(makeProps({ ts }), filters)).toBe(true);
	});

	it('ist sichtbar wenn der Zeitstempel exakt auf der oberen Grenze liegt', () => {
		const ts = 1_750_000_000;
		const filters = makeFilters({
			timeFilter: { lower: (ts - 100) * 1000, upper: ts * 1000 }
		});

		expect(isSightingVisible(makeProps({ ts }), filters)).toBe(true);
	});
});

describe('toListEntries', () => {
	it('filtert unsichtbare Sichtungen heraus', () => {
		const propsList = [
			makeProps({ id: 1, ta: 0 }),
			makeProps({ id: 2, ta: 1 }) // wird über hiddenSpecies ausgeblendet
		];
		const filters = makeFilters({ hiddenSpecies: { '1': true } });

		const entries = toListEntries(propsList, filters, SPECIES_MAP);

		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toBe(1);
	});

	it('sortiert absteigend nach Zeitstempel (neueste zuerst)', () => {
		const propsList = [
			makeProps({ id: 1, ts: 1_750_000_000 }),
			makeProps({ id: 2, ts: 1_750_100_000 }),
			makeProps({ id: 3, ts: 1_749_900_000 })
		];

		const entries = toListEntries(propsList, makeFilters(), SPECIES_MAP);

		expect(entries.map((e) => e.id)).toEqual([2, 1, 3]);
	});

	it('mappt alle Felder korrekt auf den Listeneintrag', () => {
		const propsList = [
			makeProps({
				id: 42,
				ts: 1_750_000_000,
				ta: 1,
				ct: 4,
				jt: 2,
				tf: true,
				waterway: 'Kieler Förde'
			})
		];

		const entries = toListEntries(propsList, makeFilters(), SPECIES_MAP);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			id: 42,
			ts: 1_750_000_000,
			speciesName: 'Kegelrobbe',
			count: 4,
			juveniles: 2,
			isDead: true,
			waterway: 'Kieler Förde',
			status: 'approved'
		});
	});

	it('nutzt den Fallback-Artnamen bei unbekannter Tierart-ID', () => {
		const propsList = [makeProps({ ta: 99 })];

		const entries = toListEntries(propsList, makeFilters(), SPECIES_MAP);

		expect(entries[0]?.speciesName).toBe('Unbekannte Art (99)');
	});

	it('setzt Defaults für optionale Felder (juveniles 0, isDead false, waterway null)', () => {
		const propsList = [makeProps({ id: 7 })]; // jt, tf, waterway fehlen

		const entries = toListEntries(propsList, makeFilters(), SPECIES_MAP);

		expect(entries[0]?.juveniles).toBe(0);
		expect(entries[0]?.isDead).toBe(false);
		expect(entries[0]?.waterway).toBeNull();
	});

	it('behandelt einen leeren Fahrwasser-String wie fehlend (null)', () => {
		// Die API liefert bei fehlendem Fahrwasser teils '' statt undefined —
		// die Tabelle soll dann den Gedankenstrich zeigen, keine leere Zelle.
		const propsList = [makeProps({ waterway: '' })];

		const entries = toListEntries(propsList, makeFilters(), SPECIES_MAP);

		expect(entries[0]?.waterway).toBeNull();
	});

	it('gibt ein leeres Array zurück wenn alle Sichtungen versteckt sind', () => {
		const propsList = [makeProps({ ta: 0 }), makeProps({ ta: 0 })];
		const filters = makeFilters({ hiddenSpecies: { '0': true } });

		expect(toListEntries(propsList, filters, SPECIES_MAP)).toEqual([]);
	});
});

describe('toListEntries — Bearbeitungszustand', () => {
	const filters = {
		hiddenSpecies: {},
		hiddenColors: {},
		timeFilter: { lower: 0, upper: Number.MAX_SAFE_INTEGER }
	};

	it('übernimmt den Status aus den Feature-Properties', () => {
		const entries = toListEntries(
			[{ id: 1, ts: 1_750_000_000, ta: 1, ct: 1, st: 'open' }],
			filters,
			{ '1': 'Schweinswal' }
		);
		expect(entries[0]?.status).toBe('open');
	});

	it('nimmt ohne Statusangabe approved an', () => {
		const entries = toListEntries([{ id: 1, ts: 1_750_000_000, ta: 1, ct: 1 }], filters, {
			'1': 'Schweinswal'
		});
		expect(entries[0]?.status).toBe('approved');
	});
});

describe('formatEntryDate', () => {
	it('formatiert Unix-Sekunden als deutsches Datum in Europe/Berlin', () => {
		// 2025-06-15T12:00:00Z — mittags UTC, damit kein Tageswechsel durch die Zeitzone kippt
		const ts = Date.UTC(2025, 5, 15, 12, 0, 0) / 1000;

		// de-DE mit timeZone Europe/Berlin → "15.6.2025" (toLocaleDateString-Default)
		expect(formatEntryDate(ts)).toMatch(/^15\.0?6\.2025$/);
	});

	it('formatiert einen Jahreswechsel-Zeitstempel korrekt in lokaler Zeit', () => {
		// 2024-12-31T23:30:00Z ist in Europe/Berlin bereits der 1.1.2025
		const ts = Date.UTC(2024, 11, 31, 23, 30, 0) / 1000;

		expect(formatEntryDate(ts)).toMatch(/^1\.0?1\.2025$/);
	});

	describe('Locale-Umschaltung (resolveDisplayLocale)', () => {
		afterEach(async () => {
			// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
			// eingebauten Reset — auf den echten Default zurückschalten, damit
			// andere Tests im selben Prozess nicht die englische Locale erben.
			const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => baseLocale);
		});

		it('formatiert deutsch (TT.MM.JJJJ), wenn die aktive Locale de ist', async () => {
			const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => 'de');
			const ts = Date.UTC(2025, 5, 15, 12, 0, 0) / 1000;

			expect(formatEntryDate(ts)).toMatch(/^15\.0?6\.2025$/);
		});

		it('formatiert britisch (TT/MM/JJJJ), wenn die aktive Locale en ist', async () => {
			const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
			overwriteGetLocale(() => 'en');
			const ts = Date.UTC(2025, 5, 15, 12, 0, 0) / 1000;

			expect(formatEntryDate(ts)).toBe('15/06/2025');
		});
	});
});
