/**
 * @fileoverview Datenbankseite des Anonymisierungs-Jobs.
 *
 * Fälligkeit (docs/ANONYMISIERUNG_KONZEPT.md, 5.1):
 * `created + 3 Monate − 1 Tag <= jetzt (UTC)`, vorwärts vom Eingang gerechnet.
 * Dieselbe Rechnung für die Anzeige steht in
 * `#lib/utils/privacy/anonymizationCutoff.ts`.
 *
 * Geleert wird je Stapel in einer Transaktion. Die Zeilen werden mit
 * `FOR UPDATE SKIP LOCKED` geholt: Zwei gleichzeitige Läufe (Cron und Klick im
 * Panel) teilen sich die Arbeit, statt sich gegenseitig zu blockieren.
 */
import { and, count, inArray, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { ANONYMIZE_AFTER_MONTHS } from '#lib/constants/reporterDataRetention.ts';
import { openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { berlinDatePart } from '#lib/server/db/sqlTimeZone.ts';
import { getReporterHashKey } from '#lib/server/privacy/reporterHash.ts';
import { buildAnonymizationPatch, groupByConsents } from './anonymizationPatch';
import type { AnonymizationPorts, DueSummary } from './anonymizeSightings';
import { hashReporters, MAX_HASH_BATCH, pendingHashRows } from './hashReporters';
import { getActivatedAt, recordLastRun } from './anonymizationState';

/** Ganzzahlige Konstante — als Literal eingebettet, damit der Ausdruck lesbar bleibt. */
const RETENTION = sql.raw(`INTERVAL '${Math.trunc(ANONYMIZE_AFTER_MONTHS)} months'`);

/** Fällig und noch nicht anonymisiert. Kennt den Prüfstatus bewusst nicht. */
export function dueForAnonymization(): SQL {
	return and(
		isNull(sightings.anonymizedAt),
		sql`${sightings.created} + ${RETENTION} - INTERVAL '1 day' <= (NOW() AT TIME ZONE 'UTC')`
	) as SQL;
}

/**
 * Über der Frist: Eingang vor mehr als 3 Monaten, noch nicht anonymisiert.
 *
 * Ohne den Tag Puffer aus `dueForAnonymization` — der Job leert einen Tag vor
 * der Frist, die Überwachung schlägt an, wenn die Frist selbst verletzt ist.
 */
export function overdueForAnonymization(): SQL {
	return and(
		isNull(sightings.anonymizedAt),
		sql`${sightings.created} + ${RETENTION} <= (NOW() AT TIME ZONE 'UTC')`
	) as SQL;
}

/**
 * Eingang der jüngsten fälligen Meldung, dekodiert wie die Spalte selbst.
 *
 * Ein rohes `sql<Date>` bekäme vom Treiber den Text ohne Zonenangabe, und
 * `new Date()` läse ihn als Ortszeit — unter TZ=Europe/Berlin um bis zu zwei
 * Stunden verschoben (Review PR #1011). `mapWith` hängt den UTC-Decoder der
 * Spalte an.
 */
export function newestCreated(): SQL<Date | null> {
	return sql<Date | null>`MAX(${sightings.created})`.mapWith(sightings.created);
}

const hasText = (column: SQLWrapper): SQL => sql`${column} ~ '[^[:space:]]'`;

/**
 * Status der fälligen Meldungen, wie der Eingang ihn sieht: offen heißt weder
 * freigegeben noch abgelehnt (`openOnly`). `pendingOnly()` zählte abgelehnte
 * mit — die Vorschau auf Production meldete 536 „ungeprüfte" Meldungen bei
 * leerem Eingang.
 */
export function dueStatusFilters(): { open: SQL; rejected: SQL } {
	return { open: openOnly(), rejected: rejectedOnly() };
}

async function summarizeDue(): Promise<DueSummary> {
	const status = dueStatusFilters();
	const year = sql<number>`${berlinDatePart('year', sightings.created)}::integer`;
	const hasName = sql`(${hasText(sightings.firstName)} OR ${hasText(sightings.lastName)})`;
	const hasShip = sql`(${hasText(sightings.shipName)} OR ${hasText(sightings.homePort)})`;
	const nameGiven = sql`${sightings.nameConsent} = 1`;
	const shipGiven = sql`${sightings.shipNameConsent} = 1`;

	const rows = await db
		.select({
			year,
			total: sql<number>`COUNT(*)::integer`,
			namesCleared: sql<number>`COUNT(*) FILTER (WHERE ${hasName} AND NOT (${nameGiven}))::integer`,
			namesKept: sql<number>`COUNT(*) FILTER (WHERE ${hasName} AND ${nameGiven})::integer`,
			shipsCleared: sql<number>`COUNT(*) FILTER (WHERE ${hasShip} AND NOT (${shipGiven}))::integer`,
			shipsKept: sql<number>`COUNT(*) FILTER (WHERE ${hasShip} AND ${shipGiven})::integer`,
			open: sql<number>`COUNT(*) FILTER (WHERE ${status.open})::integer`,
			rejected: sql<number>`COUNT(*) FILTER (WHERE ${status.rejected})::integer`,
			newest: newestCreated()
		})
		.from(sightings)
		.where(dueForAnonymization())
		.groupBy(year)
		.orderBy(year);

	let newest: Date | null = null;
	for (const row of rows) {
		const value = row.newest;
		if (value && (!newest || value > newest)) newest = value;
	}

	return {
		total: rows.reduce((sum, row) => sum + Number(row.total), 0),
		newestReceivedAt: newest,
		byYear: rows.map(({ newest: _newest, ...row }) => ({
			year: Number(row.year),
			total: Number(row.total),
			namesCleared: Number(row.namesCleared),
			namesKept: Number(row.namesKept),
			shipsCleared: Number(row.shipsCleared),
			shipsKept: Number(row.shipsKept),
			open: Number(row.open),
			rejected: Number(row.rejected)
		}))
	};
}

async function anonymizeBatch(limit: number, now: Date): Promise<number> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({
				id: sightings.id,
				nameConsent: sightings.nameConsent,
				shipNameConsent: sightings.shipNameConsent
			})
			.from(sightings)
			.where(dueForAnonymization())
			.orderBy(sightings.id)
			.limit(limit)
			.for('update', { skipLocked: true });

		let anonymized = 0;
		for (const group of groupByConsents(rows)) {
			const written = await tx
				.update(sightings)
				.set(buildAnonymizationPatch(group.consents, now))
				.where(and(inArray(sightings.id, group.ids), dueForAnonymization()))
				.returning({ id: sightings.id });
			anonymized += written.length;
		}
		return anonymized;
	});
}

async function pendingHashes(): Promise<number> {
	const [row] = await db.select({ count: count() }).from(sightings).where(pendingHashRows());
	return Number(row?.count ?? 0);
}

/** Die echten Ports gegen die Datenbank. */
export function createAnonymizationPorts(): AnonymizationPorts {
	return {
		keyConfigured: () => getReporterHashKey() !== null,
		activatedAt: getActivatedAt,
		pendingHashes,
		summarizeDue,
		backfillHashes: (afterId) => hashReporters({ limit: MAX_HASH_BATCH, afterId }),
		anonymizeBatch,
		recordLastRun
	};
}
