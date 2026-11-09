/**
 * @fileoverview Holt den Melder-Hash für Zeilen nach, die noch keinen haben.
 *
 * Zwei Anlässe, derselbe Schritt:
 *
 * 1. **Bestand** — alle Meldungen vor Einführung der Spalte. Muss laufen,
 *    solange die Adressen noch da sind, also vor dem ersten
 *    Anonymisierungslauf.
 * 2. **Laufend** — Zeilen, die das Altsystem auf dieselbe Datenbank schreibt,
 *    und Meldungen, die eingingen, während der Schlüssel fehlte. Der
 *    Anonymisierungs-Job ruft diesen Schritt vor dem Leeren auf.
 *
 * Bereits anonymisierte Zeilen sind ausgenommen: Ihre Adresse ist weg, und
 * eine später von Hand eingetragene wäre ein neuer Personenbezug.
 *
 * Gehasht wird in Node, nicht in SQL — eine einzige Implementierung, und der
 * Schlüssel steht in keiner SQL-Anweisung.
 *
 * Aufruf auf deployten Hosts über `POST /api/admin/reporter-hash` (die
 * Datenbank ist dort von außen nicht erreichbar), lokal über
 * `npm run privacy:hash-reporters`.
 */
import { and, count, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { getReporterHashKey, reporterIdentityFor } from '#lib/server/privacy/reporterHash.ts';

export const DEFAULT_HASH_BATCH = 500;
export const MAX_HASH_BATCH = 2000;

/** Ohne Schlüssel wird nichts gehasht — ein Hash ohne Schlüssel wäre wertlos. */
export class ReporterHashKeyMissingError extends Error {
	constructor() {
		super('REPORTER_HASH_KEY fehlt oder ist zu kurz');
		this.name = 'ReporterHashKeyMissingError';
	}
}

export interface HashReportersReport {
	/** In diesem Lauf gehashte Zeilen */
	hashed: number;
	/** Danach noch offene Zeilen */
	remaining: number;
	/** `false` heißt: noch einmal aufrufen */
	done: boolean;
}

export interface HashReportersOptions {
	/** Zeilen je Lauf, geklemmt auf `MAX_HASH_BATCH` */
	limit?: number | undefined;
}

function pendingRows(): SQL {
	return and(
		isNull(sightings.reporterHash),
		isNull(sightings.anonymizedAt),
		isNotNull(sightings.email),
		sql`trim(${sightings.email}) <> ''`
	) as SQL;
}

export async function hashReporters(options: HashReportersOptions): Promise<HashReportersReport> {
	const key = getReporterHashKey();
	if (!key) throw new ReporterHashKeyMissingError();

	const requested = options.limit ?? DEFAULT_HASH_BATCH;
	const limit = Math.min(Math.max(Math.floor(requested) || DEFAULT_HASH_BATCH, 1), MAX_HASH_BATCH);

	const rows = await db
		.select({ id: sightings.id, email: sightings.email })
		.from(sightings)
		.where(pendingRows())
		.orderBy(sightings.id)
		.limit(limit);

	for (const row of rows) {
		await db
			.update(sightings)
			.set(reporterIdentityFor(row.email, key))
			.where(eq(sightings.id, row.id));
	}

	const [remainingRow] = await db.select({ count: count() }).from(sightings).where(pendingRows());

	return {
		hashed: rows.length,
		remaining: Number(remainingRow?.count ?? 0),
		// Jede geladene Zeile hat eine nicht leere Adresse und bekommt damit
		// einen Hash — ein voller Batch kann also nicht ins Leere laufen.
		done: rows.length < limit
	};
}
