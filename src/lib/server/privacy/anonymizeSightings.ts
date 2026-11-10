/**
 * @fileoverview Anonymisiert Kontaktdaten 3 Monate nach Eingang.
 *
 * Weisung des Landesdatenschutzbeauftragten MV; Konzept und Entscheidungen in
 * docs/ANONYMISIERUNG_KONZEPT.md, Umsetzung in
 * docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md (PR 4). Was geleert wird, steht in
 * `anonymizationPatch.ts`, wann, in `anonymizationQueries.ts`.
 *
 * Ein Lauf mit `mode: 'execute'`:
 *
 * 1. bricht ohne `REPORTER_HASH_KEY` ab, bevor er etwas ändert;
 * 2. führt ohne Freischaltung nur die Vorschau aus (`skipped: 'not_activated'`);
 * 3. holt fehlende Melder-Hashes nach — eine geleerte Adresse ohne Hash wäre
 *    für immer von den übrigen Meldungen der Person getrennt. Wird der
 *    Backfill nicht fertig, wird nichts geleert;
 * 4. leert höchstens `limit` fällige Meldungen;
 * 5. hält den Lauf in `app_config` fest (`privacy.anonymization.lastRun`).
 *
 * Vorgabe ist die Vorschau. Sie ändert nichts, auch nicht den letzten Lauf.
 * Der Ablauf kennt die Datenbank nur über `AnonymizationPorts`.
 */
import type { HashReportersReport } from './hashReporters';
import { ReporterHashKeyMissingError } from './hashReporters';
import type {
	AnonymizationLastRun,
	AnonymizationSkipReason,
	AnonymizationTrigger
} from './anonymizationState';

export const DEFAULT_ANONYMIZE_BATCH = 500;
export const MAX_ANONYMIZE_BATCH = 2000;
/** Höchstens so viele Backfill-Stapel je Lauf (zu je 2.000 Zeilen). */
export const MAX_BACKFILL_ROUNDS = 20;

export interface DueYear {
	year: number;
	total: number;
	/** Name vorhanden, keine Namens-Einwilligung → wird geleert */
	namesCleared: number;
	/** Name vorhanden, mit Namens-Einwilligung → bleibt */
	namesKept: number;
	shipsCleared: number;
	shipsKept: number;
	/** davon offen: weder freigegeben noch abgelehnt (wie der Eingang) */
	open: number;
	/** davon abgelehnt */
	rejected: number;
}

export interface DueSummary {
	total: number;
	/** Eingang der jüngsten fälligen Meldung — die tatsächliche Grenze */
	newestReceivedAt: Date | null;
	byYear: DueYear[];
}

export interface AnonymizationPorts {
	keyConfigured(): boolean;
	activatedAt(): Promise<Date | null>;
	/** Zeilen mit Adresse, ohne Hash, nicht anonymisiert */
	pendingHashes(): Promise<number>;
	summarizeDue(): Promise<DueSummary>;
	/** Ein Backfill-Stapel hinter `afterId` (`null` = von vorn). */
	backfillHashes(afterId: number | null): Promise<HashReportersReport>;
	/** Leert bis zu `limit` fällige Meldungen; liefert die Anzahl. */
	anonymizeBatch(limit: number, now: Date): Promise<number>;
	recordLastRun(run: AnonymizationLastRun): Promise<void>;
}

export interface AnonymizeOptions {
	mode?: 'preview' | 'execute';
	limit?: number | undefined;
	now: Date;
	trigger?: AnonymizationTrigger;
	ports: AnonymizationPorts;
}

export interface AnonymizationReport {
	mode: 'preview' | 'execute';
	/** `true` nur, wenn tatsächlich geleert werden durfte */
	executed: boolean;
	skipped: AnonymizationSkipReason | null;
	keyConfigured: boolean;
	activatedAt: string | null;
	/** Fällig vor diesem Lauf */
	due: number;
	newestDueReceivedAt: string | null;
	byYear: DueYear[];
	pendingHashes: number;
	hashed: number;
	anonymized: number;
	/** Fällig nach diesem Lauf */
	remaining: number;
	/** `false` heißt: noch einmal aufrufen */
	done: boolean;
}

function clampLimit(requested: number | undefined): number {
	const value = Math.floor(requested ?? DEFAULT_ANONYMIZE_BATCH) || DEFAULT_ANONYMIZE_BATCH;
	return Math.min(Math.max(value, 1), MAX_ANONYMIZE_BATCH);
}

export async function anonymizeSightings(options: AnonymizeOptions): Promise<AnonymizationReport> {
	const { ports, now } = options;
	const mode = options.mode ?? 'preview';
	const limit = clampLimit(options.limit);
	const keyConfigured = ports.keyConfigured();

	if (mode === 'execute' && !keyConfigured) throw new ReporterHashKeyMissingError();

	const activatedAt = await ports.activatedAt();
	const before = await ports.summarizeDue();
	const pendingHashes = await ports.pendingHashes();

	const report: AnonymizationReport = {
		mode,
		executed: false,
		skipped: null,
		keyConfigured,
		activatedAt: activatedAt?.toISOString() ?? null,
		due: before.total,
		newestDueReceivedAt: before.newestReceivedAt?.toISOString() ?? null,
		byYear: before.byYear,
		pendingHashes,
		hashed: 0,
		anonymized: 0,
		remaining: before.total,
		done: true
	};

	if (mode === 'preview') return report;

	const finish = async (patch: Partial<AnonymizationReport>): Promise<AnonymizationReport> => {
		Object.assign(report, patch);
		await ports.recordLastRun({
			at: now.toISOString(),
			trigger: options.trigger ?? 'session',
			skipped: report.skipped,
			hashed: report.hashed,
			anonymized: report.anonymized,
			remaining: report.remaining
		});
		return report;
	};

	if (!activatedAt) return finish({ skipped: 'not_activated' });

	// Über den Cursor, nicht von vorn: Ein voller Stapel unhashbarer Adressen
	// (`stalled`) beweist nichts über die Zeilen dahinter. Fertig ist der
	// Backfill erst, wenn hinter dem Cursor nichts mehr kommt (Review PR #1011).
	let backfillDone = false;
	let afterId: number | null = null;
	for (let round = 0; round < MAX_BACKFILL_ROUNDS && !backfillDone; round++) {
		const backfill = await ports.backfillHashes(afterId);
		report.hashed += backfill.hashed;
		afterId = backfill.lastId;
		backfillDone = backfill.exhausted;
	}
	if (!backfillDone) return finish({ skipped: 'hash_backfill_incomplete', done: false });

	const anonymized = await ports.anonymizeBatch(limit, now);
	const after = await ports.summarizeDue();
	// Fertig heißt: nichts mehr fällig — oder kein Fortschritt möglich. Ein
	// kurzer Stapel allein genügt nicht: `FOR UPDATE SKIP LOCKED` lässt gerade
	// bearbeitete Zeilen aus. Ohne Fortschritt aufhören, damit kein Aufrufer
	// endlos läuft; `remaining` zeigt dann, was liegen blieb (Review PR #1011).
	return finish({
		executed: true,
		anonymized,
		remaining: after.total,
		done: after.total === 0 || anonymized === 0
	});
}
