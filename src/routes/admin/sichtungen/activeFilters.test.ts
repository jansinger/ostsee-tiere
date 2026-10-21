import type { SightingStatusFilter } from '#lib/components/admin/sightingStatusFilter.ts';
import { MEDIA_UPLOAD_ANNOUNCED_MISSING } from '#lib/utils/media/photoAnnouncement.ts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { readFilterParams, type FilterParams } from './activeFilters';

/**
 * activeFilters.test.ts — Filterzustand kommt aus der URL, nicht aus dem Panel.
 *
 * Vorher las `currentFilters` in `+page.svelte` nur `q` aus der URL und die
 * übrigen sieben Filter aus den Feld-States des Panels. Wer ein Datum wählte,
 * nicht „Anwenden" klickte und dann exportierte, exportierte eine Menge, die
 * die Tabelle nie gezeigt hat; die Filter-Schaltfläche leuchtete schon beim
 * Tippen. Beide Ableitungen hängen deshalb an diesen zwei Funktionen.
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

/* Eine Typ-Zusicherung und kein Laufzeittest: Dass `verified` nur Statuswerte
   trägt, rechnet `readFilterParams` zwar heute schon aus, zugesichert war es
   aber nicht — der Typ stand auf `string`. Die Statusreiter mussten den Wert
   deshalb per `as` in ihre Domäne zwingen, und eine Erweiterung von
   `normalizeStatusParam` hätte dort still einen Wert eingeschleust, zu dem kein
   Reiter passt: kein Reiter mehr mit `aria-current`, kein Compile-Fehler
   irgendwo. Geprüft wird das von `npm run type-check`/`npm run check`, nicht vom
   Testlauf — `expectTypeOf` erzeugt zur Laufzeit keine Assertion. */
describe('FilterParams', () => {
	it('führt den Statusfilter in der Domäne von `normalizeStatusParam`', () => {
		expectTypeOf<FilterParams>().toMatchObjectType<{ verified: SightingStatusFilter | '' }>();
	});
});

describe('readFilterParams', () => {
	it('liefert für jeden fehlenden Parameter einen leeren String', () => {
		expect(readFilterParams(new URLSearchParams())).toEqual(LEER);
	});

	/* Die Werte sind bewusst die, die tatsächlich vorkommen können:
	   `mediaUpload` kennt `1`/`0`/`announced_missing`, `balticSea` die drei
	   Schlüssel aus `BALTIC_SEA_STATUS_PRESENTATION`, `deadFinding` nur `1`/`0`
	   (`deadFindingFilter.ts`). Eine Fixture mit erfundenen Werten liest sich
	   wie eine Zusicherung, dass die Tabelle danach filtert — sie tut es nicht,
	   der Server verwirft sie stillschweigend. */
	it('liest alle acht Parameter aus der URL', () => {
		const params = new URLSearchParams({
			fromDate: '2026-01-01',
			toDate: '2026-01-31',
			verified: 'rejected',
			entryChannel: '1',
			mediaUpload: MEDIA_UPLOAD_ANNOUNCED_MISSING,
			balticSea: 'outside',
			deadFinding: '1',
			q: 'müller'
		});

		expect(readFilterParams(params)).toEqual({
			fromDate: '2026-01-01',
			toDate: '2026-01-31',
			verified: 'rejected',
			entryChannel: '1',
			mediaUpload: MEDIA_UPLOAD_ANNOUNCED_MISSING,
			balticSea: 'outside',
			deadFinding: '1',
			q: 'müller'
		});
	});

	/* `all` ist das Sentinel des Panel-`<select>` für „egal" und steht in der URL
	   normalerweise nie — ein altes Lesezeichen oder ein vor dem Umbau
	   gespeichertes Preset kann es aber tragen. Der Loader behandelt es korrekt
	   als „kein Filter" (`entryChannel !== 'all'`); ohne diese Normalisierung
	   hielten Chip-Zeile und Export-Dialog es für einen aktiven Filter und
	   zeigten „Kanal: all" über einer ungefilterten Tabelle. */
	it('normalisiert das UI-Sentinel `entryChannel=all` zu „nicht gesetzt"', () => {
		expect(readFilterParams(new URLSearchParams({ entryChannel: 'all' }))).toEqual(LEER);
	});

	it('ignoriert Parameter, die nicht zum Filterzustand gehören', () => {
		const params = new URLSearchParams({ page: '7', sort: 'created', perPage: '50' });

		expect(readFilterParams(params)).toEqual(LEER);
	});

	/* Statuswerte über `toEqual` gegen ein Objektliteral geprüft, nicht über den
	   Property-Zugriff: `verifiedReadScan.test.ts` verbietet `.verified` außerhalb
	   der zwei dort namentlich ausgenommenen Empfänger. */
	it.each([
		// Exakt die Zuordnung aus `sightingStatusFilter.ts`: `1` meinte „geprüft"
		// und heißt heute `approved`, `0` meinte „nicht geprüft" und heißt `open`.
		['1', 'approved'],
		['0', 'open'],
		// Die drei kanonischen Werte bleiben unverändert.
		['open', 'open'],
		['approved', 'approved'],
		['rejected', 'rejected'],
		/* Ein unbekannter Wert wird verworfen statt durchgereicht:
		   `normalizeStatusParam` liefert dafür `undefined`, und als Filterwert wäre
		   das ein Zustand, den weder Server noch `<select>` kennen. */
		['vielleicht', '']
	])('normalisiert den Statusparameter %s zu %s', (roh, erwartet) => {
		expect(readFilterParams(new URLSearchParams({ verified: roh }))).toEqual({
			...LEER,
			verified: erwartet
		});
	});
});
