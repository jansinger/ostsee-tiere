import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import {
	approvedOnly,
	openOnly,
	pendingOnly,
	rejectedOnly
} from '#lib/server/db/approvalFilter.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { EARLIEST_PLAUSIBLE_SIGHTING_DATE } from '#lib/server/db/sightingRepository.ts';
import { berlinCalendarDate, berlinDatePart } from '#lib/server/db/sqlTimeZone.ts';
import { and, eq, gte, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { YEAR_PARAM, parseYearParam, plausibleYearRange } from './yearFilter';

const logger = createLogger('admin:statistics:page');

/**
 * Kennzahlen eines Freigabestatus — nie über beide Status summiert.
 *
 * `verifiedSightings` ist hier 2026-07-30 entfallen. Die Kennzahl zählte
 * innerhalb der freigegebenen Menge noch einmal `geprueft = 1` und war damit
 * tautologisch (gemessen 19.253 von 19.262 = 99,95 %). Sie widersprach außerdem
 * der Invariante des Projekts: eine Sichtung ist ungeprüft **oder** geprüft, und
 * geprüft heißt veröffentlicht (siehe CLAUDE.md und `.claude/rules/api.md`) — ein
 * eigener „verifiziert"-Anteil innerhalb der Veröffentlichten suggeriert eine
 * Qualitätsdimension, die es nach diesem Modell nicht gibt. Die 9 Zeilen, die
 * tatsächlich abweichen (`freigegeben_am` gesetzt, `geprueft = 0`), sind
 * Inkonsistenzen aus dem Altsystem und gehören in eine Datenprüfung, nicht in
 * eine Übersichtskennzahl.
 */
export interface AdminBasicStats {
	totalSightings: number;
	avgGroupSize: number;
	maxGroupSize: number;
	deadAnimals: number;
	withMedia: number;
}

const EMPTY_BASIC_STATS: AdminBasicStats = {
	totalSightings: 0,
	avgGroupSize: 0,
	maxGroupSize: 0,
	deadAnimals: 0,
	withMedia: 0
};

/**
 * Basis-Kennzahlen für **eine** Grundmenge
 *
 * Vorgabe des Meeresmuseums: Nicht freigegebene Sichtungen dürfen in der
 * Admin-Statistik vorkommen, aber niemals mit freigegebenen zu einer Zahl
 * verschmelzen. Zwei getrennte Läufe statt einer Abfrage über die ganze
 * Tabelle machen eine vermischte Summe strukturell unmöglich.
 *
 * Die Grundmenge kommt als fertiges Prädikat herein statt als Scope-Name: Diese
 * Seite fährt seit 2026-08-08 `approvedOnly()` gegen `openOnly()` und damit
 * keine der beiden Hälften von `approvalFilter()` (Begründung an der
 * Aufrufstelle in `load()`).
 */
async function loadBasicStats(grundmenge: SQL): Promise<AdminBasicStats> {
	const [row] = await db
		.select({
			totalSightings: sql<number>`COUNT(*)::integer`,
			avgGroupSize: sql<number>`COALESCE(AVG(${sightings.totalCount})::numeric, 0)`,
			maxGroupSize: sql<number>`COALESCE(MAX(${sightings.totalCount})::integer, 0)`,
			deadAnimals: sql<number>`COUNT(CASE WHEN ${sightings.isDead} = 1 THEN 1 END)::integer`,
			withMedia: sql<number>`COUNT(CASE WHEN ${sightings.mediaUpload} != 0 THEN 1 END)::integer`
		})
		.from(sightings)
		.where(grundmenge);

	return row ?? EMPTY_BASIC_STATS;
}

/**
 * Die abgelehnte Grundmenge: **nicht freigegeben und abgelehnt**.
 *
 * `rejectedOnly()` allein täte es nicht. Die Kopfzeile stellt drei Zahlen
 * nebeneinander und behauptet damit eine Zerlegung — freigegeben, offen,
 * abgelehnt. Trüge eine Zeile beide Stempel, stünde sie in zweien davon. Im
 * Bestand gibt es das nicht (gemessen am 2026-08-10: 0 Zeilen), die Datenbank
 * verbietet es aber nicht, und der Freigabeteil kostet nichts. Nebeneffekt, der
 * ebenso gewollt ist: Die Abfrage trägt damit einen erkennbaren Freigabebezug
 * (Vorgabe 3 in `approvalFilter.ts`) — als einzige Kennzahl der Seite hätte sie
 * ihn sonst nicht.
 */
const rejectedNotApproved = (): SQL => and(pendingOnly(), rejectedOnly()) as SQL;

/**
 * Zählt eine Grundmenge — mehr braucht die dritte Kopfzahl nicht.
 *
 * Bewusst nicht `loadBasicStats`: Gruppengröße, Totfunde und Medienanteil der
 * abgelehnten Meldungen sind Kennzahlen ohne Abnehmer, und die Anzeige würde sie
 * nirgends zeigen. Und bewusst eine **eigene** Abfrage statt CASE-Aggregaten
 * neben den anderen beiden: Getrennte Läufe können strukturell nicht zu einer
 * Summe verschmelzen (Vorgabe 2).
 */
async function loadRejectedCount(grundmenge: SQL): Promise<number> {
	const [row] = await db
		.select({ rejectedSightings: sql<number>`COUNT(*)::integer` })
		.from(sightings)
		.where(grundmenge);

	return row?.rejectedSightings ?? 0;
}

/**
 * Sichtungen eines Kalenderjahres in deutscher Ortszeit.
 *
 * Dieselbe Auslegung wie die Gruppierung darunter: `sichtungsdatum` hält seit
 * der UTC-Migration echte Zeitpunkte, eine Sichtung am 01.01. um 00:30 Ortszeit
 * steht darin als 31.12. 23:30 UTC und gehört trotzdem ins neue Jahr.
 */
const jahresfilter = (jahr: number): SQL =>
	eq(berlinDatePart('year', sightings.sightingDate), jahr);

/**
 * Datensätze mit plausiblem Sichtungsdatum.
 *
 * 280 Zeilen des Altbestands liegen auf dem Epoch-Platzhalter (1970-01-01) —
 * fehlerhafte Importe, die der Jahresauswahl ein Jahr 1970 unterschöben, das es
 * fachlich nie gab (`statisticsEpochExclusion.test.ts`).
 *
 * **Bewusst nur an den Kalenderauswertungen** (Jahres-, Monatsverteilung,
 * Jahresliste) und nicht an den Kopfzahlen. Das sieht nach einer Inkonsistenz
 * aus, ist aber die einzig richtige Aufteilung — gemessen am 2026-08-08 sind von
 * den 280 Zeilen **0 freigegeben und alle 280 offen**:
 *
 * - Auf der freigegebenen Seite gibt es deshalb gar keine Divergenz zwischen
 *   Kopfzahl und Verteilung; die Menge, um die sie abweichen könnten, ist leer.
 * - Die Kopfzahl „noch offen" muss dieselbe Menge zählen wie der Eingang auf
 *   `/admin`, und der filtert `openOnly()` ohne Datumsgrenze. Mit Ausschluss
 *   stünden hier 377 gegen 657 dort — dieselbe Klasse Divergenz, die #800
 *   beseitigt hat, nur um 280 statt um 6 Zeilen.
 *
 * Festgehalten in `page.server.test.ts` („Epoch-Ausschluss nur in den
 * Kalenderauswertungen") in beide Richtungen.
 */
const plausiblesDatum = (): SQL => gte(sightings.sightingDate, EARLIEST_PLAUSIBLE_SIGHTING_DATE);

/**
 * Die Jahre, in denen eine Grundmenge überhaupt Sichtungen hat.
 *
 * Läuft je Grundmenge einmal — nicht, weil hier etwas vermischt werden könnte
 * (das Ergebnis sind Jahreszahlen, keine Zählwerte), sondern weil eine Abfrage
 * über die ganze Tabelle keinen Freigabebezug hätte; Vorgabe 3 aus
 * `approvalFilter.ts` gilt ausnahmslos.
 */
async function loadYears(grundmenge: SQL): Promise<number[]> {
	const rows = await db
		.select({
			year: sql<number>`${berlinDatePart('year', sightings.sightingDate)}::integer`
		})
		.from(sightings)
		.where(and(grundmenge, isNotNull(sightings.sightingDate), plausiblesDatum()))
		.groupBy(berlinDatePart('year', sightings.sightingDate));

	return rows.map((row) => Number(row.year)).filter((jahr) => Number.isFinite(jahr));
}

export const load: PageServerLoad = async ({ url }) => {
	try {
		// Jahresauswahl. `null` heißt „Alle Jahre" und ist der Ausgangszustand;
		// jeder unplausible Parameter fällt ebenfalls darauf zurück (yearFilter.ts).
		const selectedYear = parseYearParam(
			url.searchParams.get(YEAR_PARAM),
			plausibleYearRange(new Date())
		);

		/**
		 * Legt die Jahresauswahl auf eine Grundmenge.
		 *
		 * Ohne Auswahl bleibt das Prädikat **unverändert** und wird nicht in ein
		 * einelementiges `and()` gewickelt: Die Grundmengen sind an anderer Stelle
		 * zeichengenau gegen `openOnly()` bzw. `approvedOnly()` festgehalten, und
		 * eine zusätzliche Klammerebene bräche diesen Vergleich ohne fachlichen
		 * Grund.
		 */
		const mitJahr = (grundmenge: SQL): SQL =>
			selectedYear === null ? grundmenge : (and(grundmenge, jahresfilter(selectedYear)) as SQL);
		// Basis-Kennzahlen getrennt nach Grundmenge: freigegeben und offen.
		//
		// Die zweite Menge lief bis 2026-08-08 über `pendingOnly()` („nicht
		// freigegeben") und zählte damit die abgelehnten Sichtungen mit, obwohl die
		// Anzeige sie an jeder Stelle „noch offen" nennt. Der Eingang (`/admin`)
		// zählt seit der Rejection-Triage über `openOnly()` — beide Seiten wichen
		// dadurch sichtbar voneinander ab (gemessen 663 hier gegen 657 dort, die
		// Differenz waren die 6 Abgelehnten). Abgelehnt ist erledigt, nicht offen.
		//
		// `approvalFilter()` bleibt davon unberührt: Sein `'pending'` meint weiter
		// „nicht freigegeben" und ist die Gegenmenge der öffentlichen Statistik
		// (`getSightingStatistics`) — dort wäre der Ausschluss der Abgelehnten
		// falsch, weil er eine dritte Menge neben freigegeben/nicht freigegeben
		// aufmachte. Deshalb ändert sich hier die Aufrufstelle und nicht das
		// gemeinsame Prädikat.
		const [approvedStats, openStats, rejectedCount] = await Promise.all([
			loadBasicStats(mitJahr(approvedOnly())),
			loadBasicStats(mitJahr(openOnly())),
			loadRejectedCount(mitJahr(rejectedNotApproved()))
		]);
		const basicStats = { approved: approvedStats, open: openStats, rejected: rejectedCount };

		// Species distribution
		const speciesStats = await db
			.select({
				species: sightings.species,
				count: sql<number>`COUNT(*)::integer`,
				percentage: sql<number>`ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()), 2)::numeric`,
				avgGroupSize: sql<number>`AVG(${sightings.totalCount})::numeric`,
				deadCount: sql<number>`COUNT(CASE WHEN ${sightings.isDead} = 1 THEN 1 END)::integer`,
				deadPercentage: sql<number>`ROUND(COUNT(CASE WHEN ${sightings.isDead} = 1 THEN 1 END) * 100.0 / COUNT(*), 2)::numeric`
			})
			.from(sightings)
			.where(mitJahr(approvedOnly()))
			.groupBy(sightings.species)
			.orderBy(sql`COUNT(*) DESC`);

		// Meldekanal (`eingangskanal`) — über welchen Weg die Meldung hereinkam.
		//
		// Dieselbe Grundmenge wie die Artenverteilung darüber: freigegeben, mit
		// Jahresauswahl. Bewusst **ohne** `plausiblesDatum()` — das ist keine
		// Kalenderauswertung, und die 280 Epoch-Platzhalter sind ohnehin sämtlich
		// offen (Herleitung am Docblock von `plausiblesDatum`). Ein Datumsfilter
		// wäre hier eine Bedingung ohne Wirkung.
		//
		// Die Zuordnung Zahl → Bezeichnung bleibt in `entryChannel.ts` und wird
		// erst in der Anzeige aufgelöst: Sie ist dieselbe wie in Formular,
		// Tabelle und E-Mail-Versand, und eine zweite Liste hier liefe ihr davon.
		const channelStats = await db
			.select({
				channel: sightings.entryChannel,
				count: sql<number>`COUNT(*)::integer`,
				percentage: sql<number>`ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()), 2)::numeric`
			})
			.from(sightings)
			.where(mitJahr(approvedOnly()))
			.groupBy(sightings.entryChannel)
			.orderBy(sql`COUNT(*) DESC`);

		// Jahr und Monat in deutscher Ortszeit gruppieren: `sichtungsdatum` hält
		// seit der UTC-Migration echte Zeitpunkte. Eine Sichtung am 01.01. um 00:30
		// Ortszeit steht darin als 31.12. 23:30 UTC und gehört trotzdem ins neue Jahr.
		// Yearly trends (excluding obvious data errors)
		const yearlyStats = await db
			.select({
				year: sql<number>`${berlinDatePart('year', sightings.sightingDate)}`,
				sightings: sql<number>`COUNT(*)`
			})
			.from(sightings)
			// Bewusst OHNE `mitJahr`: Die Jahrestrends sind der Kontext, aus dem
			// heraus ein Jahr gewählt wird. Auf das gewählte Jahr gefiltert bliebe
			// ein einzelner Balken übrig — ein Trend über ein Jahr ist keiner. Das
			// gewählte Jahr wird im Diagramm stattdessen hervorgehoben.
			.where(and(isNotNull(sightings.sightingDate), approvedOnly(), plausiblesDatum()))
			.groupBy(berlinDatePart('year', sightings.sightingDate))
			.orderBy(berlinDatePart('year', sightings.sightingDate));

		// Monthly distribution (last 10 years)
		const monthlyStats = await db
			.select({
				month: sql<number>`${berlinDatePart('month', sightings.sightingDate)}`,
				sightings: sql<number>`COUNT(*)`
			})
			.from(sightings)
			.where(
				mitJahr(and(isNotNull(sightings.sightingDate), approvedOnly(), plausiblesDatum()) as SQL)
			)
			.groupBy(berlinDatePart('month', sightings.sightingDate))
			.orderBy(berlinDatePart('month', sightings.sightingDate));

		// Recent activity (last 30 days)
		const recentActivity = await db
			.select({
				date: sql<string>`${berlinCalendarDate(sightings.created)}`,
				count: sql<number>`COUNT(*)`
			})
			.from(sightings)
			// `created` ist naives timestamp mit UTC-Inhalt. Der Vergleich gegen das
			// timestamptz von NOW() würde sonst über die DB-Session-Zeitzone gecastet,
			// die die Anwendung nirgends pinnt.
			//
			// N3 (bewusst so belassen): Die Fenstergrenze ist ein UTC-Instant, die
			// Gruppierung darunter aber Berlin-Kalendertage (`berlinCalendarDate`).
			// Das verschiebt höchstens den ältesten der 30 angezeigten Tage um bis zu
			// 2 h (Sommerzeit) — kein Tag *innerhalb* des Fensters bekommt dadurch
			// falsche Werte, nur der Rand zeigt ggf. 29 statt 30 volle Tage. Eine
			// exakte Berlin-Mitternacht-Grenze bräuchte mehrere verkettete
			// `AT TIME ZONE`-Hops (Berlin-Tag → Instant → UTC-naiv), die sich ohne
			// Postgres-Semantiktest (siehe sqlTimeZone.test.ts-Lücke im Review) nicht
			// zuverlässig verifizieren lassen — das Risiko eines neuen, unbemerkten
			// Zeitzonenfehlers wiegt hier schwerer als der kosmetische Rand-Tag einer
			// „letzte 30 Tage"-Trendanzeige.
			// Freigabebezug wie überall sonst auf dieser Seite: vorher war dies die
			// einzige Abfrage ohne Filter und zählte damit als Einzige die gesamte
			// Tabelle inklusive noch offener Meldungen (Vorgabe 3 in approvalFilter.ts).
			//
			// Dritte Ausnahme von der Jahresauswahl, und zwar aus dem umgekehrten
			// Grund wie die beiden anderen: Dieser Abschnitt bringt seinen Zeitraum
			// bereits mit. Mit Jahresauswahl entstünde der Schnitt aus „in den
			// letzten 30 Tagen eingegangen" und „Sichtungsdatum im Jahr X" — für
			// jedes vergangene Jahr leer, und die Überschrift läse sich als „die
			// letzten 30 Tage des Jahres X", was etwas ganz anderes wäre.
			.where(
				and(
					approvedOnly(),
					sql`${sightings.created} >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'`
				)
			)
			.groupBy(berlinCalendarDate(sightings.created))
			.orderBy(sql`${berlinCalendarDate(sightings.created)} DESC`)
			.limit(30);

		// User engagement statistics - simple version
		const [userCount] = await db
			.select({
				uniqueUsers: sql<number>`COUNT(DISTINCT email)::integer`
			})
			.from(sightings)
			.where(mitJahr(and(sql`email IS NOT NULL AND email != ''`, approvedOnly()) as SQL));

		// Repeat users count - safe subquery approach
		const repeatUsers = await db
			.select({
				email: sql<string>`email`,
				count: sql<number>`COUNT(*)::integer`
			})
			.from(sightings)
			.where(mitJahr(and(sql`email IS NOT NULL AND email != ''`, approvedOnly()) as SQL))
			.groupBy(sql`email`)
			.having(sql`COUNT(*) > 1`);

		const userStats = {
			uniqueUsers: userCount?.uniqueUsers || 0,
			repeatUsers: repeatUsers.length,
			repeatUserPercentage:
				(userCount?.uniqueUsers || 0) > 0
					? (repeatUsers.length / (userCount?.uniqueUsers || 1)) * 100
					: 0
		};

		// Ship name statistics - safe version
		const [shipCount] = await db
			.select({
				uniqueShips: sql<number>`COUNT(DISTINCT schiffsname)::integer`,
				totalWithShipName: sql<number>`COUNT(*)::integer`
			})
			.from(sightings)
			.where(
				mitJahr(and(sql`schiffsname IS NOT NULL AND schiffsname != ''`, approvedOnly()) as SQL)
			);

		const shipStats = [
			{
				uniqueShips: shipCount?.uniqueShips || 0,
				totalWithShipName: shipCount?.totalWithShipName || 0
			}
		];

		// Top observers - admin view with email addresses
		const topObservers = await db
			.select({
				email: sightings.email,
				sightingCount: sql<number>`COUNT(*)::integer`,
				// Berlin-Kalendertag statt naivem UTC-Cast (M1) — sonst rutscht eine
				// Sichtung um 00:30 Ortszeit auf den UTC-Vortag.
				firstSighting: sql<string>`${berlinCalendarDate(sql`MIN(${sightings.created})`)}`,
				lastSighting: sql<string>`${berlinCalendarDate(sql`MAX(${sightings.created})`)}`,
				avgGroupSize: sql<number>`AVG(${sightings.totalCount})::numeric`
			})
			.from(sightings)
			.where(
				mitJahr(
					and(
						sql`${sightings.email} IS NOT NULL AND ${sightings.email} != '' AND ${sightings.email} NOT LIKE '%@meeresmuseum.de'`,
						approvedOnly()
					) as SQL
				)
			)
			.groupBy(sightings.email)
			.having(sql`COUNT(*) > 1`)
			.orderBy(sql`COUNT(*) DESC`)
			.limit(10);

		// Data quality statistics - step-by-step safe approach
		const [totalVerified] = await db
			.select({ total: sql<number>`COUNT(*)` })
			.from(sightings)
			.where(mitJahr(approvedOnly()));

		const [coordVerified] = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(sightings)
			.where(
				mitJahr(
					and(approvedOnly(), isNotNull(sightings.latitude), isNotNull(sightings.longitude)) as SQL
				)
			);

		const [behaviorVerified] = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(sightings)
			.where(
				mitJahr(
					and(approvedOnly(), isNotNull(sightings.behavior), ne(sightings.behavior, 0)) as SQL
				)
			);

		const qualityStats = [
			{
				withCoordinates: Number(coordVerified?.count) || 0,
				withBehavior: Number(behaviorVerified?.count) || 0,
				total: Number(totalVerified?.total) || 0
			}
		];

		// Die frühere `geographicStats`-Abfrage ist hier ersatzlos entfallen.
		//
		// Sie wurde bei jedem Seitenaufruf über die gesamte Tabelle ausgeführt, aber
		// von `+page.svelte` nie gerendert — reine Last ohne Abnehmer. Ihre Logik war
		// zudem doppelt falsch: gezählt wurde die Spalte `ostsee_geo` (die grobe
		// Bounding Box) unter dem Feldnamen `inBalticSea`, und das mit `= 1`, während
		// der überwiegende Teil der Altdaten den Wert `2` trägt (Stand 2026-07-30:
		// 15.070 von 19.253 geprüften Zeilen).
		//
		// Eine wiederbelebte Kennzahl zählt `ostsee` (das Polygon) und geht über
		// `getBalticSeaStatus()` aus `#lib/utils/geo/balticSeaStatus.ts` — dieselbe
		// Funktion, an der Übersicht, Detailansicht und Benachrichtigungs-Mail
		// hängen. Sie muss außerdem die vier Zustände abbilden statt zweier: ohne
		// Koordinaten ist auch `ostsee = 1` keine Aussage.

		// Auswählbare Jahre. Die Vereinigung beider Grundmengen hält ein Jahr
		// wählbar, in dem bisher nur offene Meldungen liegen — sonst wäre der
		// Eingang eines frischen Jahres über die Statistik nicht erreichbar.
		// Absteigend sortiert: Das jüngste Jahr ist das gesuchte.
		const [approvedYears, openYears] = await Promise.all([
			loadYears(approvedOnly()),
			loadYears(openOnly())
		]);
		const availableYears = [...new Set([...approvedYears, ...openYears])].sort((a, b) => b - a);

		return {
			selectedYear,
			availableYears,
			basicStats,
			speciesStats,
			channelStats,
			yearlyStats,
			monthlyStats,
			recentActivity,
			userStats,
			shipStats: shipStats[0] || { uniqueShips: 0, totalWithShipName: 0 },
			topObservers,
			qualityStats: qualityStats[0] || {
				withCoordinates: 0,
				withDate: 0,
				withBehavior: 0,
				withMedia: 0,
				total: 0
			}
		};
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Error loading statistics'
		);
		throw error;
	}
};
