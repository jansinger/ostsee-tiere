/**
 * @fileoverview M1 — `firstSighting`/`lastSighting` in der Top-Observers-Abfrage
 * müssen den Kalendertag in deutscher Ortszeit liefern, nicht den naiven
 * UTC-Tag.
 *
 * Bug: `MIN(${sightings.created})::date` castet die naive UTC-Spalte direkt zu
 * `date` — das ist der UTC-Kalendertag. Eine Sichtung um 00:30 Berliner Zeit
 * (23:30 UTC am Vortag) würde als „gestern" gezählt, obwohl dieselbe Datei
 * 60 Zeilen darüber (`recentActivity`) korrekt `berlinCalendarDate` verwendet.
 *
 * Testansatz: wie `statisticsApprovalScope.test.ts` — ein aufzeichnender
 * `db.select`-Mock erfasst die Spalten-Definitionen jedes `select({...})`-Laufs;
 * der SQL-Text der `firstSighting`/`lastSighting`-Spalten wird über den echten
 * `PgDialect` kompiliert und mit dem erwarteten Berlin-Ausdruck verglichen.
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import { gte, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { sightings } from '#lib/server/db/schema.ts';
import { berlinCalendarDate } from '#lib/server/db/sqlTimeZone.ts';
import { openOnly } from '#lib/server/db/approvalFilter.ts';
import { EARLIEST_PLAUSIBLE_SIGHTING_DATE } from '#lib/server/db/sightingRepository.ts';

const dialect = new PgDialect();
const toSqlText = (expression: SQLWrapper): string => dialect.sqlToQuery(expression.getSQL()).sql;

/** Alle Spalten-Objekte, die je an `db.select({...})` übergeben wurden. */
let recordedSelectColumns: Array<Record<string, unknown>> = [];

/** Alle Prädikate, die je an `.where(...)` übergeben wurden. */
let recordedWhereClauses: SQLWrapper[] = [];

/**
 * Spalten und Prädikat **derselben** Abfrage, als Paar.
 *
 * Die beiden Listen darüber verlieren diese Zuordnung — für die Jahresauswahl
 * ist sie aber der Kern der Aussage: Die Kopfzahlen müssen das gewählte Jahr
 * tragen, die Jahrestrends gerade nicht (sie sind der Kontext der Auswahl).
 */
let recordedQueries: Array<{ columns: Record<string, unknown>; where?: SQLWrapper }> = [];

/**
 * Minimaler, aufzeichnender Drizzle-Query-Builder.
 *
 * Deckt jede Verkettung ab, die `load()` in `+page.server.ts` verwendet
 * (`from`, `innerJoin`, `where`, `groupBy`, `orderBy`, `having`, `limit`) und
 * löst beim `await` auf eine leere Ergebnisliste auf — die Werte selbst sind
 * für diesen Test irrelevant, nur die Spalten-Definitionen zählen.
 */
function createRecordingBuilder(eintrag: { columns: Record<string, unknown>; where?: SQLWrapper }) {
	const builder = {
		from: () => builder,
		innerJoin: () => builder,
		where: (predicate?: SQLWrapper) => {
			if (predicate) {
				recordedWhereClauses.push(predicate);
				eintrag.where = predicate;
			}
			return builder;
		},
		groupBy: () => builder,
		orderBy: () => builder,
		having: () => builder,
		limit: () => builder,
		then: (
			resolve: (rows: Array<Record<string, unknown>>) => unknown,
			reject?: (error: unknown) => unknown
		) => Promise.resolve([]).then(resolve, reject)
	};
	return builder;
}

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: (columns?: Record<string, unknown>) => {
			if (columns) recordedSelectColumns.push(columns);
			const eintrag = { columns: columns ?? {} };
			recordedQueries.push(eintrag);
			return createRecordingBuilder(eintrag);
		}
	}
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { load } = await import('./+page.server');

/**
 * Ruft `load()` mit einer echten URL auf.
 *
 * Der Loader liest die Jahresauswahl aus `url.searchParams`; ein leeres
 * Event-Objekt (wie vor der Jahresauswahl) würde daran scheitern.
 */
const ladeSeite = async (suche = '') => {
	const daten = await load({
		url: new URL(`https://localhost/admin/statistics${suche}`)
	} as unknown as Parameters<typeof load>[0]);

	// `PageServerLoad` lässt formal auch `void` zu; dieser Loader liefert in jedem
	// Pfad ein Objekt oder wirft.
	return daten as Exclude<typeof daten, void>;
};

describe('admin/statistics load() — Top-Observers Datumsspalten (M1)', () => {
	it('berechnet firstSighting/lastSighting in Berlin-Ortszeit statt UTC-Tag', async () => {
		recordedSelectColumns = [];

		await ladeSeite();

		const topObserversColumns = recordedSelectColumns.find(
			(columns) => 'firstSighting' in columns && 'lastSighting' in columns
		);
		expect(
			topObserversColumns,
			'Top-Observers-Query mit firstSighting/lastSighting wurde nicht gefunden'
		).toBeDefined();

		const firstSightingSql = toSqlText(topObserversColumns!.firstSighting as SQL);
		const lastSightingSql = toSqlText(topObserversColumns!.lastSighting as SQL);

		const expectedFirst = toSqlText(berlinCalendarDate(sql`MIN(${sightings.created})`));
		const expectedLast = toSqlText(berlinCalendarDate(sql`MAX(${sightings.created})`));

		expect(firstSightingSql).toBe(expectedFirst);
		expect(lastSightingSql).toBe(expectedLast);

		// Der naive UTC-Cast darf nicht mehr vorkommen.
		expect(firstSightingSql).not.toContain('::date');
		expect(lastSightingSql).not.toContain('::date');
		expect(firstSightingSql).toContain('Europe/Berlin');
		expect(lastSightingSql).toContain('Europe/Berlin');
	});
});

/**
 * Vorgabe 3 aus `src/lib/server/db/approvalFilter.ts`: „Eine Statistikzahl ohne
 * erkennbaren Freigabebezug soll es nicht geben."
 *
 * Bis 2026-07-30 galt das nur für die Kopfzahlen. Arten-, Jahres-, Monats-,
 * Nutzer-, Schiffs-, Beobachter- und Qualitätsabfragen filterten stattdessen auf
 * `geprueft = 1`, `recentActivity` filterte überhaupt nicht. Die Seite mischte
 * damit zwei Grundmengen: Kopfzeile 19.262 (freigegeben), Abschnitte darunter
 * 19.253 (geprüft) — und `recentActivity` die vollen 19.880 inklusive offener
 * Meldungen.
 *
 * Der Test prüft die Struktur, nicht Zahlen: **jede** Abfrage muss sich auf
 * `freigegeben_am` beziehen, und keine darf mehr über `geprueft` filtern.
 */
describe('admin/statistics load() — einheitliche Grundmenge', () => {
	it('bezieht jede Abfrage auf den Freigabestatus und keine mehr auf geprueft', async () => {
		recordedWhereClauses = [];

		await ladeSeite();

		expect(
			recordedWhereClauses.length,
			'keine WHERE-Klauseln aufgezeichnet — Mock greift nicht mehr'
		).toBeGreaterThan(5);

		const ohneFreigabebezug: string[] = [];
		const mitGeprueft: string[] = [];

		for (const clause of recordedWhereClauses) {
			const text = toSqlText(clause);
			if (!text.includes('freigegeben_am')) ohneFreigabebezug.push(text);
			if (text.includes('geprueft')) mitGeprueft.push(text);
		}

		expect(
			ohneFreigabebezug,
			`Abfrage(n) ohne Freigabebezug:\n${ohneFreigabebezug.join('\n')}`
		).toEqual([]);
		expect(mitGeprueft, `Abfrage(n) filtern noch auf geprueft:\n${mitGeprueft.join('\n')}`).toEqual(
			[]
		);
	});

	it('fährt die Kopfzahlen getrennt für freigegeben und offen', async () => {
		recordedWhereClauses = [];

		await ladeSeite();

		const texte = recordedWhereClauses.map(toSqlText);

		// `loadBasicStats` läuft zweimal — einmal je Grundmenge. Eine vermischte
		// Summe über beide soll strukturell unmöglich bleiben (Vorgabe 2).
		expect(texte.some((t) => /freigegeben_am"? is not null/i.test(t))).toBe(true);
		expect(texte.some((t) => /freigegeben_am"? is null/i.test(t))).toBe(true);
	});
});

/**
 * „Noch offen" muss auf dieser Seite dasselbe heißen wie im Eingang (`/admin`).
 *
 * Bug: Die zweite Kopfzahl lief über `pendingOnly()` (`freigegeben_am IS NULL`)
 * und zählte damit die **abgelehnten** Sichtungen mit, während die Beschriftung
 * an drei Stellen „noch offen" bzw. „noch nicht freigegeben" sagte. Der Eingang
 * zählt seit der Rejection-Triage (#793/#794/#797) über `openOnly()` — gemessen
 * am Produktionsstand ergab das 663 hier gegen 657 dort, die Differenz waren
 * genau die 6 Abgelehnten. Abgelehnt ist erledigt, nicht offen.
 *
 * Der Test vergleicht gegen `openOnly()` selbst statt gegen abgetipptes SQL:
 * Eine nachgebaute Zeichenkette wäre eine zweite Quelle neben dem Prädikat.
 */
describe('admin/statistics load() — „noch offen" schließt Abgelehnte aus', () => {
	it('zählt die offene Kopfzahl über openOnly() statt über pendingOnly()', async () => {
		recordedWhereClauses = [];

		await ladeSeite();

		const texte = recordedWhereClauses.map(toSqlText);
		// „Nicht freigegeben" **und nicht** die Abgelehnten-Kopfzahl: Die zählt
		// abgelehnte Meldungen absichtlich und nennt sie auch so. Ausgeschlossen
		// wird sie über das positive `abgelehnt_am IS NOT NULL` — eine Abfrage mit
		// dieser Bedingung kann keine Zahl über „noch offen" sein. Ein
		// versehentliches `pendingOnly()` trägt sie gerade nicht und fällt der
		// Prüfung unten weiterhin zum Opfer.
		const offeneAbfragen = texte.filter(
			(t) => /freigegeben_am"? is null/i.test(t) && !/abgelehnt_am"? is not null/i.test(t)
		);

		expect(
			offeneAbfragen.length,
			'keine Abfrage auf die nicht freigegebene Menge gefunden'
		).toBeGreaterThan(0);

		// Verglichen wird auf **Enthaltensein**, nicht auf Gleichheit: Seit der
		// Jahresauswahl (B5) tragen Abfragen zusätzliche Bedingungen, die Grundmenge
		// steckt dann als Teilausdruck darin. Die Aussage bleibt dieselbe — wo
		// „nicht freigegeben" steht, muss „nicht abgelehnt" danebenstehen, sonst
		// ist es `pendingOnly()` und zählt die Abgelehnten mit.
		const erwartet = toSqlText(openOnly());
		const kern = erwartet.replace(/^\(|\)$/g, '');
		for (const text of offeneAbfragen) {
			expect(text, `Abfrage zählt Abgelehnte als „noch offen" mit:\n${text}`).toContain(kern);
		}
	});
});

/**
 * B5 — Jahresauswahl über den URL-Parameter `jahr`.
 *
 * Die Auswahl muss **alle** Auswertungen der Seite tragen, sonst stünde eine
 * Jahreszahl über Zahlen, die einen anderen Zeitraum meinen. Genau zwei
 * Abfragen sind davon ausgenommen, und beide aus demselben Grund: Sie bilden
 * den Kontext, aus dem heraus gewählt wird.
 *
 * - **Jahrestrends** (`year`/`sightings`): Auf ein Jahr gefiltert bliebe ein
 *   einzelner Balken übrig — ein Trend über ein Jahr ist kein Trend.
 * - **Auswahlliste** (`availableYears`): Sie muss die Jahre nennen, die es
 *   gibt, nicht das gerade gewählte. Wäre sie gefiltert, ließe sich die
 *   Auswahl nach dem ersten Wechsel nicht mehr verlassen.
 */
describe('admin/statistics load() — Jahresauswahl', () => {
	/** Der Jahresfilter ist die einzige Stelle, an der EXTRACT in ein WHERE gerät. */
	const hatJahresfilter = (eintrag: { where?: SQLWrapper }): boolean =>
		eintrag.where !== undefined && /extract\(year/i.test(toSqlText(eintrag.where));

	const abfrageMit = (spalte: string) =>
		recordedQueries.find((eintrag) => spalte in eintrag.columns);

	it('lässt ohne Parameter jede Abfrage über alle Jahre laufen', async () => {
		recordedQueries = [];

		const daten = await ladeSeite();

		expect(daten.selectedYear).toBeNull();
		expect(recordedQueries.filter(hatJahresfilter)).toEqual([]);
	});

	it('legt das gewählte Jahr auf die Kopfzahlen beider Grundmengen', async () => {
		recordedQueries = [];

		const daten = await ladeSeite('?jahr=2020');

		expect(daten.selectedYear).toBe(2020);

		const kopfzahlen = recordedQueries.filter((eintrag) => 'totalSightings' in eintrag.columns);
		expect(kopfzahlen.length, 'beide Grundmengen müssen einzeln laufen').toBe(2);
		for (const abfrage of kopfzahlen) {
			expect(hatJahresfilter(abfrage), 'Kopfzahl ohne Jahresfilter').toBe(true);
		}
	});

	it('legt das gewählte Jahr auch auf Arten-, Monats- und Qualitätsabfragen', async () => {
		recordedQueries = [];

		await ladeSeite('?jahr=2020');

		for (const spalte of [
			'species',
			'month',
			'channel',
			'rejectedSightings',
			'uniqueUsers',
			'uniqueShips',
			'email'
		]) {
			const abfrage = abfrageMit(spalte);
			expect(abfrage, `Abfrage mit Spalte „${spalte}" nicht gefunden`).toBeDefined();
			expect(hatJahresfilter(abfrage!), `Abfrage „${spalte}" ignoriert die Jahresauswahl`).toBe(
				true
			);
		}
	});

	it('lässt die Jahrestrends als Kontext über alle Jahre laufen', async () => {
		recordedQueries = [];

		await ladeSeite('?jahr=2020');

		const jahrestrend = recordedQueries.find(
			(eintrag) => 'year' in eintrag.columns && 'sightings' in eintrag.columns
		);
		expect(jahrestrend, 'Jahrestrend-Abfrage nicht gefunden').toBeDefined();
		expect(hatJahresfilter(jahrestrend!), 'Jahrestrend auf ein Jahr eingedampft').toBe(false);
	});

	it('lässt den Eingang der letzten 30 Tage unabhängig von der Jahresauswahl', async () => {
		recordedQueries = [];

		await ladeSeite('?jahr=2020');

		const eingang = recordedQueries.find(
			(eintrag) => 'date' in eintrag.columns && 'count' in eintrag.columns
		);
		expect(eingang, 'Eingangs-Abfrage nicht gefunden').toBeDefined();
		expect(hatJahresfilter(eingang!), 'Eingang trägt die Jahresauswahl').toBe(false);
	});

	it('fällt bei einem unplausiblen Jahr auf „Alle Jahre" zurück', async () => {
		recordedQueries = [];

		const daten = await ladeSeite('?jahr=1970');

		expect(daten.selectedYear).toBeNull();
		expect(recordedQueries.filter(hatJahresfilter)).toEqual([]);
	});

	it('liefert die auswählbaren Jahre mit — getrennt erhoben, nie vermischt gezählt', async () => {
		recordedQueries = [];

		const daten = await ladeSeite();

		expect(Array.isArray(daten.availableYears)).toBe(true);

		// Die Jahresliste entsteht aus beiden Grundmengen, damit ein Jahr, in dem
		// bisher nur offene Meldungen liegen, wählbar ist. Vermischt wird dabei
		// nichts: Die Abfragen liefern Jahreszahlen, keine Zählwerte (Vorgabe 2).
		const jahresListen = recordedQueries.filter(
			(eintrag) => 'year' in eintrag.columns && !('sightings' in eintrag.columns)
		);
		expect(jahresListen.length, 'Jahresliste je Grundmenge erwartet').toBe(2);
		for (const abfrage of jahresListen) {
			expect(abfrage.where, 'Jahresliste ohne Freigabebezug').toBeDefined();
			expect(toSqlText(abfrage.where!)).toContain('freigegeben_am');
		}
	});
});

/**
 * Die dritte Kopfzahl: abgelehnt.
 *
 * Sie steht neben „freigegeben" und „noch offen" und wird mit keiner der beiden
 * summiert (Vorgabe 2 aus `approvalFilter.ts`). Zusammen bilden die drei eine
 * **Zerlegung** des Bestands — und genau deshalb läuft sie nicht über
 * `rejectedOnly()` allein, sondern über „nicht freigegeben UND abgelehnt":
 *
 * - Ohne den Freigabeteil wäre eine Zeile mit beiden Stempeln in zwei Kopfzahlen
 *   gleichzeitig gezählt. Im Bestand gibt es sie nicht (gemessen 2026-08-10: 0),
 *   aber die Datenbank verbietet sie nicht — und die Kopfzeile behauptet mit drei
 *   Zahlen nebeneinander implizit, dass sie sich nicht überlappen.
 * - `rejectedOnly()` allein trägt zudem kein `freigegeben_am` im SQL und wäre
 *   damit die erste Zahl dieser Seite ohne erkennbaren Freigabebezug (Vorgabe 3).
 */
describe('admin/statistics load() — Kopfzahl „abgelehnt"', () => {
	it('zählt die Abgelehnten getrennt und überschneidungsfrei', async () => {
		recordedQueries = [];

		const daten = await ladeSeite();

		const abgelehnt = recordedQueries.find((eintrag) => 'rejectedSightings' in eintrag.columns);
		expect(abgelehnt, 'Abfrage der abgelehnten Kopfzahl nicht gefunden').toBeDefined();

		expect(abgelehnt!.where, 'Kopfzahl ohne Grundmenge').toBeDefined();

		const text = toSqlText(abgelehnt!.where!);
		expect(text, 'Kopfzahl ohne Freigabebezug').toMatch(/freigegeben_am"? is null/i);
		expect(text, 'Kopfzahl ohne Ablehnungsbezug').toMatch(/abgelehnt_am"? is not null/i);

		expect(daten.basicStats.rejected).toBeDefined();
	});

	it('führt sie nicht mit den beiden anderen Kopfzahlen zusammen', async () => {
		recordedQueries = [];

		await ladeSeite();

		// `loadBasicStats` bleibt bei zwei Läufen; die dritte Zahl ist eine eigene,
		// schmale Abfrage. Eine gemeinsame mit CASE-Aggregaten könnte summiert
		// werden — getrennte Läufe können es strukturell nicht.
		const kopfzahlen = recordedQueries.filter((eintrag) => 'totalSightings' in eintrag.columns);
		expect(kopfzahlen.length).toBe(2);
		for (const abfrage of kopfzahlen) {
			expect(toSqlText(abfrage.where!)).not.toMatch(/abgelehnt_am"? is not null/i);
		}
	});
});

/**
 * Meldekanal-Auswertung (`eingangskanal`).
 *
 * Sie zählt dieselbe Grundmenge wie Artenverteilung und Saisonalität —
 * freigegeben, mit Jahresauswahl. Das ist keine Formalie: Die Kanäle verteilen
 * sich sehr ungleich (Web und App tragen zusammen über 90 %), eine still
 * beigemischte offene Meldung verschiebt den Anteil eines kleinen Kanals wie Fax
 * (14 Zeilen im Gesamtbestand) sofort sichtbar.
 *
 * **Kein Epoch-Ausschluss**, denn dies ist keine Kalenderauswertung: Die 280
 * Platzhalter-Zeilen sind allesamt offen (siehe unten) und damit ohnehin nicht
 * in der Grundmenge — ein Datumsfilter hier wäre eine Bedingung ohne Wirkung
 * und ohne Begründung.
 */
describe('admin/statistics load() — Meldekanal', () => {
	it('zählt die Kanäle über die freigegebene Menge', async () => {
		recordedQueries = [];

		await ladeSeite();

		const kanaele = recordedQueries.find((eintrag) => 'channel' in eintrag.columns);
		expect(kanaele, 'Meldekanal-Abfrage nicht gefunden').toBeDefined();
		expect(kanaele!.where, 'Meldekanal-Abfrage ohne Grundmenge').toBeDefined();
		expect(toSqlText(kanaele!.where!)).toMatch(/freigegeben_am"? is not null/i);
	});

	it('liefert je Kanal Anzahl und Anteil', async () => {
		recordedQueries = [];

		await ladeSeite();

		const kanaele = recordedQueries.find((eintrag) => 'channel' in eintrag.columns);
		expect(kanaele, 'Meldekanal-Abfrage nicht gefunden').toBeDefined();
		expect(Object.keys(kanaele!.columns).sort()).toEqual(['channel', 'count', 'percentage']);
	});
});

/**
 * Der Epoch-Ausschluss gehört an die Kalenderauswertungen — und an sonst nichts.
 *
 * In `sichtungen` liegen 280 Zeilen auf dem Platzhalter 1970-01-01. Gemessen am
 * 2026-08-08 auf der Entwicklungs-DB sind davon **0 freigegeben und alle 280
 * offen**. Daraus folgt beides:
 *
 * - Für die freigegebene Seite gibt es keine Divergenz zwischen Kopfzahl und
 *   Jahres-/Monatsverteilung — die Menge, um die sie sich unterscheiden könnten,
 *   ist leer.
 * - Die Kopfzahl „noch offen" **darf** ihn nicht tragen: Sie muss dieselbe Menge
 *   zählen wie der Eingang auf `/admin` (`openOnly()`, ohne Datumsgrenze). Mit
 *   Ausschluss stünden hier 377 gegen 657 dort — exakt die Klasse Divergenz, die
 *   #800 beseitigt hat, nur um 280 statt um 6 Zeilen.
 */
describe('admin/statistics load() — Epoch-Ausschluss nur in den Kalenderauswertungen', () => {
	const epochGrenze = toSqlText(gte(sightings.sightingDate, EARLIEST_PLAUSIBLE_SIGHTING_DATE));

	it('hält die Kopfzahlen deckungsgleich mit dem Eingang', async () => {
		recordedQueries = [];

		await ladeSeite();

		const kopfzahlen = recordedQueries.filter((eintrag) => 'totalSightings' in eintrag.columns);
		expect(kopfzahlen.length).toBe(2);
		for (const abfrage of kopfzahlen) {
			expect(
				toSqlText(abfrage.where!),
				'Kopfzahl grenzt das Datum ein und weicht damit vom Eingang ab'
			).not.toContain(epochGrenze);
		}
	});

	it('hält die Epoch-Platzhalter aus Jahres- und Monatsverteilung heraus', async () => {
		recordedQueries = [];

		await ladeSeite();

		const kalender = recordedQueries.filter(
			(eintrag) => 'year' in eintrag.columns || 'month' in eintrag.columns
		);
		expect(kalender.length, 'Kalenderauswertungen nicht gefunden').toBeGreaterThanOrEqual(3);
		for (const abfrage of kalender) {
			expect(toSqlText(abfrage.where!), 'Kalenderauswertung ohne Epoch-Ausschluss').toContain(
				epochGrenze
			);
		}
	});
});
