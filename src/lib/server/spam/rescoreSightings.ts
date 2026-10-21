/**
 * Nachträgliche Spam-Bewertung bestehender Sichtungen (Backfill).
 *
 * Die Logik liegt hier und nicht im Endpunkt, damit sie testbar bleibt und
 * `src/tools/rescore-spam.ts` (lokal/Dev) dieselbe Rechnung benutzt wie der
 * Admin-Endpunkt (deployte Umgebungen, wo kein Zugang zur DB von außen
 * besteht: dmm gibt den DB-Port nicht frei, hawking hat
 * `allowtcpforwarding no`).
 *
 * Was der Backfill NICHT kann: Signale, die nur zum Meldezeitpunkt existieren
 * — Formular-Token und Duplikat-Fenster („letzte 24 h"). Nachträgliche Scores
 * fallen deshalb systematisch milder aus als die einer echten Einreichung.
 * Das ist gewollt: ein `submission: { tokenStatus: 'missing' }` wäre für
 * Altbestand ein erfundener Malus.
 */
import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { count, eq, isNull } from 'drizzle-orm';
import { detectSpamIndicators } from './spamDetector';

const logger = createLogger('spam:rescore');

/** Obergrenze je Lauf. Hält die Antwortzeit im Rahmen (MX-Lookups!). */
export const MAX_RESCORE_BATCH = 1000;
const DEFAULT_RESCORE_BATCH = 200;

export interface RescoreReport {
	/** Zeilen, die in diesem Lauf einen Score bekommen haben. */
	scored: number;
	/** Zeilen mit fehlgeschlagener Prüfung — bleiben NULL, siehe saveSighting. */
	skippedFailed: number;
	/** Höchste bearbeitete ID (für Fortschritts-Anzeige im Log). */
	lastId: number | null;
	/** Noch unbewertete Zeilen NACH diesem Lauf. */
	remaining: number;
	/** true, wenn der Aufrufer aufhören soll — Menge geleert ODER kein Fortschritt. */
	done: boolean;
	/**
	 * true, wenn ein voller Batch gar nichts geschrieben hat. Dann bleibt
	 * `remaining` unverändert stehen und weitere Aufrufe würden dieselben
	 * Zeilen laden — der Aufrufer muss aufhören und ins Log schauen.
	 */
	stalled: boolean;
	/** Score → Anzahl, für einen schnellen Blick auf die Verteilung. */
	distribution: Record<string, number>;
}

export interface RescoreOptions {
	/** Zeilen je Lauf, geklemmt auf MAX_RESCORE_BATCH. */
	limit?: number | undefined;
}

/**
 * Bewertet einen Batch bislang unbewerteter Sichtungen und schreibt
 * `spam_score`/`spam_indicators`.
 *
 * Idempotent: Es werden ausschließlich Zeilen mit `spam_score IS NULL`
 * geladen — ein abgebrochener Lauf macht beim nächsten Aufruf dort weiter.
 */
export async function rescoreSightings(options: RescoreOptions): Promise<RescoreReport> {
	const requested = options.limit ?? DEFAULT_RESCORE_BATCH;
	const limit = Math.min(
		Math.max(Math.floor(requested) || DEFAULT_RESCORE_BATCH, 1),
		MAX_RESCORE_BATCH
	);

	const rows = await db
		.select({
			id: sightings.id,
			notes: sightings.notes,
			firstName: sightings.firstName,
			lastName: sightings.lastName,
			email: sightings.email,
			waterway: sightings.waterway,
			seaMark: sightings.seaMark,
			species: sightings.species,
			latitude: sightings.latitude,
			longitude: sightings.longitude,
			inBalticSeaGeo: sightings.inBalticSeaGeo
		})
		.from(sightings)
		.where(isNull(sightings.spamScore))
		.orderBy(sightings.id)
		.limit(limit);

	let scored = 0;
	let skippedFailed = 0;
	let lastId: number | null = null;
	const distribution: Record<string, number> = {};

	for (const row of rows) {
		lastId = row.id;

		const result = await detectSpamIndicators({
			notes: row.notes,
			firstName: row.firstName,
			lastName: row.lastName,
			email: row.email,
			waterway: row.waterway,
			seaMark: row.seaMark,
			species: row.species,
			latitude: row.latitude != null ? Number(row.latitude) : null,
			longitude: row.longitude != null ? Number(row.longitude) : null,
			inBalticSeaGeo: row.inBalticSeaGeo
		});

		if (result.failed) {
			skippedFailed++;
			continue;
		}

		await db
			.update(sightings)
			.set({ spamScore: result.score, spamIndicators: result.indicators })
			.where(eq(sightings.id, row.id));

		scored++;
		const key = String(result.score);
		distribution[key] = (distribution[key] ?? 0) + 1;
	}

	const [remainingRow] = await db
		.select({ count: count() })
		.from(sightings)
		.where(isNull(sightings.spamScore));
	const remaining = Number(remainingRow?.count ?? 0);

	// Zwei Abbruchgründe, und beide werden gebraucht:
	//
	// 1. Weniger Zeilen als das Limit — die Menge ist leer. `remaining === 0`
	//    taugt dafür nicht: Zeilen mit fehlgeschlagener Prüfung bleiben NULL
	//    und würden `remaining` nie auf 0 fallen lassen.
	// 2. Ein voller Batch, der nichts geschrieben hat. Dann sind genau die
	//    geladenen Zeilen alle gescheitert, der nächste Aufruf lädt dieselben
	//    wieder, und (1) allein liefe endlos weiter.
	const stalled = rows.length > 0 && scored === 0;
	const done = rows.length < limit || stalled;

	if (stalled) {
		logger.error(
			{ skippedFailed, lastId, remaining },
			'Spam-Rescore kommt nicht voran — ganzer Batch fehlgeschlagen, Lauf beendet'
		);
	}

	logger.info(
		{ scored, skippedFailed, lastId, remaining, done, stalled },
		'Spam-Rescore-Batch abgeschlossen'
	);

	return { scored, skippedFailed, lastId, remaining, done, stalled, distribution };
}
