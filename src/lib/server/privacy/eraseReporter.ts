/**
 * @fileoverview Löschersuchen (Art. 17 DSGVO) über eine genannte Adresse.
 *
 * Die Anwendung hasht die genannte Adresse selbst und findet damit alle
 * Meldungen der Person — auch die längst anonymisierten. Die Treffer werden
 * **sofort** anonymisiert und verlieren den Melder-Hash. Die Meldungen
 * bleiben, die Verknüpfung ist weg. Anders als im täglichen Lauf werden Name
 * und Schiff auch bei Einwilligung geleert (`ERASURE_CONSENTS`).
 *
 * Nur den Hash zu leeren reichte nicht: Solange die Adresse noch da ist,
 * rechnet `hashReporters` ihn beim nächsten Lauf neu aus. Anonymisierte Zeilen
 * nimmt der Backfill aus (`pendingHashRows`), und genau dazu werden die
 * Treffer hier (docs/ANONYMISIERUNG_KONZEPT.md, 6.2).
 *
 * Gefunden wird über den Hash und zusätzlich über die noch vorhandene Adresse
 * — Letzteres für Zeilen, die das Altsystem geschrieben hat und die noch auf
 * den Backfill warten.
 *
 * Vorgabe ist die Vorschau. Die genannte Adresse wird weder geloggt noch
 * gespeichert.
 */
import { inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { buildAnonymizationPatch, type AnonymizationConsents } from './anonymizationPatch';
import { ReporterHashKeyMissingError } from './hashReporters';
import { computeReporterHash, getReporterHashKey } from './reporterHash';
import { normalizeReporterKey } from './reporterKey';

/**
 * Beim Löschersuchen gilt keine Einwilligung mehr: Wer die Löschung verlangt,
 * zieht damit auch die Einwilligung zur Nennung von Name und Schiff zurück
 * (Art. 7 Abs. 3, Art. 17 Abs. 1 lit. b DSGVO; Entscheidung 2026-11-09). Der
 * tägliche Lauf behält beides bei Einwilligung — die Abweichung gilt nur hier.
 */
const ERASURE_CONSENTS: AnonymizationConsents = { nameConsent: 0, shipNameConsent: 0 };

export class InvalidErasureAddressError extends Error {
	constructor() {
		super('Keine verwertbare Adresse angegeben');
		this.name = 'InvalidErasureAddressError';
	}
}

export interface ErasureReport {
	mode: 'preview' | 'execute';
	/** Meldungen dieser Person */
	matched: number;
	/** davon schon vorher anonymisiert */
	alreadyAnonymized: number;
	/** in diesem Aufruf bearbeitet */
	erased: number;
}

export interface EraseReporterOptions {
	email: string;
	mode?: 'preview' | 'execute';
	now: Date;
}

function matchesReporter(hash: string, normalized: string): SQL {
	return or(
		sql`${sightings.reporterHash} = ${hash}`,
		// Nicht `btrim`: Das entfernt nur Leerzeichen, `normalizeReporterKey`
		// auch Tabs und Zeilenumbrüche (Review PR #1011).
		sql`lower(regexp_replace(${sightings.email}, '^[[:space:]]+|[[:space:]]+$', '', 'g')) = ${normalized}`
	) as SQL;
}

export async function eraseReporter(options: EraseReporterOptions): Promise<ErasureReport> {
	const key = getReporterHashKey();
	if (!key) throw new ReporterHashKeyMissingError();

	const normalized = normalizeReporterKey(options.email);
	const hash = computeReporterHash(normalized, key);
	if (!normalized || !hash) throw new InvalidErasureAddressError();

	const match = matchesReporter(hash, normalized);
	const mode = options.mode ?? 'preview';

	if (mode === 'preview') {
		const [row] = await db
			.select({
				matched: sql<number>`COUNT(*)::integer`,
				alreadyAnonymized: sql<number>`COUNT(${sightings.anonymizedAt})::integer`
			})
			.from(sightings)
			.where(match);
		return {
			mode,
			matched: Number(row?.matched ?? 0),
			alreadyAnonymized: Number(row?.alreadyAnonymized ?? 0),
			erased: 0
		};
	}

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: sightings.id, anonymizedAt: sightings.anonymizedAt })
			.from(sightings)
			.where(match)
			.for('update');

		if (rows.length === 0) return { mode, matched: 0, alreadyAnonymized: 0, erased: 0 };

		const written = await tx
			.update(sightings)
			.set({
				...buildAnonymizationPatch(ERASURE_CONSENTS, options.now),
				// Wer schon anonymisiert war, behält das ursprüngliche Datum.
				// `sql.param` mit der Spalte als Encoder: Ein rohes `Date` im
				// Template nimmt der Treiber nicht an (am echten PostgreSQL gefunden).
				anonymizedAt: sql`COALESCE(${sightings.anonymizedAt}, ${sql.param(options.now, sightings.anonymizedAt)})`,
				reporterHash: null,
				// Die Rücknahme der Einwilligung festhalten. Sonst ließe die Sperre
				// beim Bearbeiten Name und Schiff weiter zu, und ein veraltetes
				// Speichern brächte sie zurück (Review PR #1011). Die Nachweise der
				// ursprünglichen Einwilligung (`*ConsentAt`, `*ConsentVersion`)
				// bleiben stehen.
				nameConsent: 0,
				shipNameConsent: 0
			})
			.where(
				inArray(
					sightings.id,
					rows.map((row) => row.id)
				)
			)
			.returning({ id: sightings.id });
		const erased = written.length;

		return {
			mode,
			matched: rows.length,
			alreadyAnonymized: rows.filter((row) => row.anonymizedAt != null).length,
			erased
		};
	});
}
