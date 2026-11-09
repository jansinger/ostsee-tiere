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
	/** In diesem Lauf tatsächlich gehashte Zeilen */
	hashed: number;
	/**
	 * Geladene Zeilen, deren Adresse nach der Normalisierung leer ist (etwa nur
	 * ein Tab oder ein geschütztes Leerzeichen). Sie bekommen keinen Hash und
	 * bleiben in `remaining`.
	 */
	skipped: number;
	/** Danach noch offene Zeilen */
	remaining: number;
	/** `false` heißt: noch einmal aufrufen */
	done: boolean;
	/**
	 * Ein Batch, in dem jede geladene Zeile übersprungen wurde (`skipped`). Ein
	 * weiterer Aufruf läse dieselben Zeilen wieder — `done` ist dann gesetzt,
	 * damit kein Aufrufer endlos läuft.
	 */
	stalled: boolean;
}

export interface HashReportersOptions {
	/** Zeilen je Lauf, geklemmt auf `MAX_HASH_BATCH` */
	limit?: number | undefined;
}

/**
 * Zeilen mit Adresse, ohne Hash, nicht anonymisiert.
 *
 * Die Leerprüfung ist ein Regex statt `trim(email) <> ''`: PostgreSQLs `trim`
 * entfernt nur Leerzeichen, `normalizeReporterKey` dagegen jeden Weißraum.
 * Eine Adresse aus einem Tab wäre sonst ausgewählt worden, ohne je einen Hash
 * zu bekommen (Review PR #1007). Ganz deckungsgleich sind die beiden
 * Zeichenklassen nicht — was trotzdem durchrutscht, fängt `skipped`/`stalled`.
 */
function pendingRows(): SQL {
	return and(
		isNull(sightings.reporterHash),
		isNull(sightings.anonymizedAt),
		isNotNull(sightings.email),
		sql`${sightings.email} ~ '[^[:space:]]'`
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

	let hashed = 0;
	let skipped = 0;

	for (const row of rows) {
		const identity = reporterIdentityFor(row.email, key);
		if (!identity.reporterHash) {
			skipped++;
			continue;
		}

		// Nur schreiben, wenn die Zeile seit dem Lesen unverändert ist. Ändert ein
		// Admin dazwischen die Adresse, hat `updateSighting` schon den neuen Hash
		// gesetzt — ihn mit dem der alten Adresse zu überschreiben, hängte die
		// Meldung an die falsche Person (Review PR #1007).
		const written = await db
			.update(sightings)
			.set(identity)
			.where(and(eq(sightings.id, row.id), pendingRows(), eq(sightings.email, row.email ?? '')))
			.returning({ id: sightings.id });
		hashed += written.length;
	}

	const [remainingRow] = await db.select({ count: count() }).from(sightings).where(pendingRows());

	// Festgefahren ist ein Batch nur, wenn KEINE geladene Zeile einen Hash
	// bekommen kann. Kommen Updates leer zurück, weil ein paralleler Lauf oder
	// ein Admin die Zeilen schon gehasht hat, sind sie nicht mehr offen, und der
	// nächste Batch hat neue — `hashed === 0` allein wäre dann ein Abbruch mitten
	// im Backfill (Review PR #1008).
	const stalled = rows.length > 0 && skipped === rows.length;
	return {
		hashed,
		skipped,
		remaining: Number(remainingRow?.count ?? 0),
		done: rows.length < limit || stalled,
		stalled
	};
}
