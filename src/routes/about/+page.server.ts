import { version } from '../../../package.json';
import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { approvedOnly } from '#lib/server/db/approvalFilter.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { berlinDatePart } from '#lib/server/db/sqlTimeZone.ts';
import { and, count, countDistinct, isNotNull, ne, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const logger = createLogger('about:page');

export const load: PageServerLoad = async () => {
	try {
		// Öffentliche Seite: nur freigegebene Sichtungen. Der Filter kommt aus dem
		// gemeinsamen Helper, damit About-Seite, /api/statistics und die Karte
		// nachweislich dieselbe Grundmenge zählen.
		const [totalResult] = await db.select({ count: count() }).from(sightings).where(approvedOnly());

		const [observersResult] = await db
			.select({ count: countDistinct(sightings.email) })
			.from(sightings)
			.where(and(approvedOnly(), isNotNull(sightings.email), ne(sightings.email, '')));

		// Jahr der ältesten freigegebenen Sichtung. Stand bis 2026-07-30 als „2011"
		// fest im Template — eine Zahl ohne Quelle, die zu keinem Datum passte: die
		// älteste Sichtung datiert auf 2009-07-19, der erste Datensatz wurde 2012
		// angelegt, und 2011 enthält lediglich 15 Einträge. Abgeleitet statt behauptet
		// bleibt die Angabe außerdem richtig, wenn Altdaten nachgeliefert werden.
		//
		// Das Jahr wird in **deutscher Ortszeit** aus der Datenbank geholt, nicht per
		// `new Date(...).getFullYear()` aus dem Ergebnis: `sichtungsdatum` hält seit der
		// UTC-Migration echte Zeitpunkte, und die Prozess-Zeitzone ist im Container
		// `TZ=UTC`. Eine Sichtung am 01.01. um 00:30 Ortszeit steht als 31.12. 23:30 UTC
		// in der Spalte — JS-seitig gerechnet käme das Vorjahr heraus, und /about würde
		// ein Jahr früher beginnen als das Jahresdiagramm der Admin-Statistik, das über
		// `berlinDatePart` gruppiert.
		const [earliestResult] = await db
			.select({
				earliestYear: sql<number | null>`MIN(${berlinDatePart('year', sightings.sightingDate)})`
			})
			.from(sightings)
			.where(and(approvedOnly(), isNotNull(sightings.sightingDate)));

		const earliestSightingYear =
			earliestResult?.earliestYear != null ? Number(earliestResult.earliestYear) : null;

		return {
			version,
			totalSightings: totalResult?.count != null ? Number(totalResult.count) : null,
			totalObservers: observersResult?.count != null ? Number(observersResult.count) : null,
			earliestSightingYear
		};
	} catch (err) {
		logger.error({ err }, 'Fehler beim Laden der About-Statistiken');
		return {
			version,
			totalSightings: null,
			totalObservers: null,
			earliestSightingYear: null
		};
	}
};
