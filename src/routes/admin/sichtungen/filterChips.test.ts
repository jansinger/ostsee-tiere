import { describe, expect, it } from 'vitest';
import { DEAD_FINDING_PRESENTATION } from '#lib/components/admin/deadFinding.ts';
import { SIGHTING_STATUS_PRESENTATION } from '#lib/components/admin/sightingStatus.ts';
import { getEntryChannelOptions } from '#lib/report/formOptions/entryChannel.ts';
import { BALTIC_SEA_STATUS_PRESENTATION } from '#lib/utils/geo/balticSeaStatus.ts';
import type { FilterParams } from './activeFilters';
import { AUFNAHME_LABEL, MELDEART_LABEL } from '#lib/components/admin/filterLabels.ts';
import { buildFilterChips, removeFilterParam } from './filterChips';

/**
 * filterChips.test.ts — was gefiltert ist, muss sichtbar und einzeln
 * entfernbar sein.
 *
 * Bei geschlossenem Panel zeigte nur ein Punkt-Badge, *dass* gefiltert wird.
 * Welcher Filter greift, stand nirgends, und zurücknehmen ließ sich nur alles
 * auf einmal.
 *
 * Die Beschriftungen kommen ausnahmslos aus den Quellen, die auch das Panel
 * benutzt — deshalb prüfen die Fälle unten gegen diese Quellen und nicht gegen
 * abgetippte Wörter: Ein Test mit eigenem Wortlaut wäre selbst die zweite
 * Beschriftungsquelle, die es hier zu vermeiden gilt.
 */

const LEER: FilterParams = {
	fromDate: '',
	toDate: '',
	verified: '',
	entryChannel: '',
	mediaUpload: '',
	balticSea: '',
	deadFinding: '',
	q: ''
};

/** Ein Filter gesetzt, alle anderen leer. */
function nur(param: keyof FilterParams, wert: string): FilterParams {
	return { ...LEER, [param]: wert };
}

describe('buildFilterChips', () => {
	it('liefert für einen leeren Filterzustand keine Chips', () => {
		expect(buildFilterChips(LEER)).toEqual([]);
	});

	it.each(Object.keys(LEER) as (keyof FilterParams)[])(
		'erzeugt für `%s` genau einen Chip',
		(param) => {
			const chips = buildFilterChips(nur(param, '1'));

			expect(chips).toHaveLength(1);
			expect(chips[0]?.param).toBe(param);
		}
	);

	it('erzeugt je gesetztem Filter einen Chip', () => {
		const chips = buildFilterChips({ ...LEER, fromDate: '2026-06-01', q: 'delfin' });

		expect(chips.map((chip) => chip.param)).toEqual(['fromDate', 'q']);
	});

	// WP4: „Von"/„Bis" nannten kein Bezugsfeld — die Tabelle zeigt zwei
	// Datumsspalten (Sichtungsdatum, Meldeeingang). Server-seitig filtert der
	// Bereich das Sichtungsdatum (`+page.server.ts` → `sightingCalendarDate`),
	// deshalb heißt der Chip jetzt „Sichtung von"/„Sichtung bis" — Wort für
	// Wort wie das Filter-Panel (+page.svelte), keine zweite
	// Beschriftungsvokabular für denselben Filter.
	it('beschriftet die Datumsgrenzen im Format der Tabelle', () => {
		expect(buildFilterChips(nur('fromDate', '2026-06-01'))[0]?.label).toBe(
			'Sichtung von 01.06.2026'
		);
		expect(buildFilterChips(nur('toDate', '2026-06-30'))[0]?.label).toBe('Sichtung bis 30.06.2026');
	});

	it('löst den Kanal über die Options-Liste des Panels auf', () => {
		const [option] = getEntryChannelOptions();

		expect(buildFilterChips(nur('entryChannel', String(option?.value)))[0]?.label).toBe(
			`Kanal: ${option?.label}`
		);
	});

	it.each(Object.entries(AUFNAHME_LABEL))(
		'beschriftet den Aufnahme-Filter %s wie die exportierte Beschriftung',
		(wert, beschriftung) => {
			expect(buildFilterChips(nur('mediaUpload', wert))[0]?.label).toBe(
				`Aufnahme: ${beschriftung}`
			);
		}
	);

	it('nimmt das Totfund-Wort aus der gemeinsamen Auszeichnung', () => {
		expect(buildFilterChips(nur('deadFinding', '1'))[0]?.label).toBe(
			`Meldeart: ${DEAD_FINDING_PRESENTATION.label}`
		);
		expect(buildFilterChips(nur('deadFinding', '0'))[0]?.label).toBe(
			`Meldeart: ${MELDEART_LABEL['0']}`
		);
	});

	it('nimmt das Ostsee-Wort aus der gemeinsamen Statusdarstellung', () => {
		expect(buildFilterChips(nur('balticSea', 'edge'))[0]?.label).toBe(
			`Ostsee: ${BALTIC_SEA_STATUS_PRESENTATION.edge.label}`
		);
	});

	it('zeigt den Suchbegriff in Anführungszeichen', () => {
		expect(buildFilterChips(nur('q', 'delfin'))[0]?.label).toBe('Suche: „delfin“');
	});

	/* Ein Wert, den keine Quelle kennt (veraltetes Lesezeichen, von Hand
	   getippte URL), darf den Chip nicht verschlucken — sonst filterte die
	   Tabelle sichtbar anders, ohne dass es etwas zum Wegklicken gäbe. */
	it('zeigt einen unbekannten Wert unverändert, statt den Chip wegzulassen', () => {
		expect(buildFilterChips(nur('entryChannel', '99'))[0]?.label).toBe('Kanal: 99');
		expect(buildFilterChips(nur('balticSea', 'atlantik'))[0]?.label).toBe('Ostsee: atlantik');
	});

	describe('Statusreiter', () => {
		it('beschriftet den Status aus der gemeinsamen Statusdarstellung', () => {
			expect(buildFilterChips(nur('verified', 'approved'))[0]?.label).toBe(
				`Status: ${SIGHTING_STATUS_PRESENTATION.approved.label}`
			);
		});

		/* Solange die Statusreiter über der Tabelle stehen, zeigt der aktive
		   Reiter den Status bereits — ein zweites Bedienelement für dieselbe
		   Aussage wäre die Sorte Doppelung, gegen die WP2 angetreten ist. */
		it('unterdrückt den Status-Chip, wenn die Reiter ihn schon zeigen', () => {
			expect(buildFilterChips(nur('verified', 'approved'), { skipVerified: true })).toEqual([]);
		});

		it('lässt die übrigen Chips dabei unangetastet', () => {
			const chips = buildFilterChips(
				{ ...LEER, verified: 'open', q: 'delfin' },
				{ skipVerified: true }
			);

			expect(chips.map((chip) => chip.param)).toEqual(['q']);
		});
	});
});

describe('removeFilterParam', () => {
	const url = () =>
		new URL('https://example.test/admin/sichtungen?fromDate=2026-06-01&q=delfin&page=7');

	it('löscht genau den übergebenen Parameter', () => {
		const neu = removeFilterParam(url(), 'q');

		expect(neu.searchParams.get('q')).toBeNull();
		expect(neu.searchParams.get('fromDate')).toBe('2026-06-01');
	});

	/* Wie bei jedem anderen Filterwechsel: Die Trefferzahl springt, und ohne
	   Rücksprung stünde man auf einer leeren Seite 7. */
	it('springt auf die erste Seite zurück', () => {
		expect(removeFilterParam(url(), 'q').searchParams.get('page')).toBe('1');
	});

	it('lässt die Ausgangs-URL unverändert', () => {
		const original = url();
		removeFilterParam(original, 'q');

		expect(original.searchParams.get('q')).toBe('delfin');
		expect(original.searchParams.get('page')).toBe('7');
	});

	it('behält Parameter, die nicht zum Filterzustand gehören', () => {
		const mitSortierung = new URL('https://example.test/admin/sichtungen?q=delfin&sort=created');

		expect(removeFilterParam(mitSortierung, 'q').searchParams.get('sort')).toBe('created');
	});
});
