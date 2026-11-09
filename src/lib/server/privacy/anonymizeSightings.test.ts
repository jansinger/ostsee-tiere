/**
 * Ablauf des Anonymisierungs-Jobs (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, PR 4).
 *
 * Der Ablauf ist von der Datenbank getrennt (`AnonymizationPorts`), damit
 * Reihenfolge und Sperren ohne Datenbank prüfbar sind. Die SQL-Seite prüft
 * `anonymizationQueries.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HashReportersReport } from './hashReporters';
import { ReporterHashKeyMissingError } from './hashReporters';
import {
	anonymizeSightings,
	MAX_ANONYMIZE_BATCH,
	MAX_BACKFILL_ROUNDS,
	type AnonymizationPorts,
	type DueSummary
} from './anonymizeSightings';

const NOW = new Date('2026-11-09T03:15:00Z');
const ACTIVATED = new Date('2026-11-01T10:00:00Z');

function summary(total: number): DueSummary {
	return {
		total,
		newestReceivedAt: total > 0 ? new Date('2026-08-08T12:00:00Z') : null,
		byYear:
			total > 0
				? [
						{
							year: 2026,
							total,
							namesCleared: total,
							namesKept: 0,
							shipsCleared: 0,
							shipsKept: 0,
							pending: 0
						}
					]
				: []
	};
}

const doneBackfill: HashReportersReport = {
	hashed: 0,
	skipped: 0,
	remaining: 0,
	done: true,
	stalled: false,
	lastId: null,
	exhausted: true
};

/** Protokolliert jeden Port-Aufruf, um die Reihenfolge prüfen zu können. */
function fakePorts(overrides: Partial<AnonymizationPorts> = {}): {
	ports: AnonymizationPorts;
	calls: string[];
} {
	const calls: string[] = [];
	let due = 3;
	const ports: AnonymizationPorts = {
		keyConfigured: vi.fn(() => true),
		activatedAt: vi.fn(async () => ACTIVATED),
		pendingHashes: vi.fn(async () => 0),
		summarizeDue: vi.fn(async () => summary(due)),
		backfillHashes: vi.fn(async () => {
			calls.push('backfill');
			return doneBackfill;
		}),
		anonymizeBatch: vi.fn(async (limit: number) => {
			calls.push('anonymize');
			const n = Math.min(due, limit);
			due -= n;
			return n;
		}),
		recordLastRun: vi.fn(async () => {
			calls.push('recordLastRun');
		}),
		...overrides
	};
	return { ports, calls };
}

describe('anonymizeSightings', () => {
	beforeEach(() => vi.clearAllMocks());

	describe('Vorschau', () => {
		it('ist der Standard und ändert nichts', async () => {
			const { ports, calls } = fakePorts();

			const report = await anonymizeSightings({ now: NOW, ports });

			expect(report).toMatchObject({
				mode: 'preview',
				executed: false,
				skipped: null,
				due: 3,
				anonymized: 0,
				remaining: 3
			});
			expect(calls).toEqual([]);
		});

		it('läuft auch ohne Schlüssel und meldet ihn als fehlend', async () => {
			const { ports, calls } = fakePorts({ keyConfigured: () => false });

			const report = await anonymizeSightings({ now: NOW, ports });

			expect(report.keyConfigured).toBe(false);
			expect(calls).toEqual([]);
		});

		it('liefert die Aufschlüsselung je Jahr und die offenen Hashes', async () => {
			const { ports } = fakePorts({ pendingHashes: async () => 7 });

			const report = await anonymizeSightings({ now: NOW, ports });

			expect(report.byYear).toEqual(summary(3).byYear);
			expect(report.newestDueReceivedAt).toBe('2026-08-08T12:00:00.000Z');
			expect(report.pendingHashes).toBe(7);
		});
	});

	describe('Ausführen', () => {
		it('bricht ohne Schlüssel ab, bevor es irgendetwas ändert', async () => {
			const { ports, calls } = fakePorts({ keyConfigured: () => false });

			await expect(anonymizeSightings({ mode: 'execute', now: NOW, ports })).rejects.toBeInstanceOf(
				ReporterHashKeyMissingError
			);
			expect(calls).toEqual([]);
		});

		it('führt ohne Freischaltung nur die Vorschau aus', async () => {
			const { ports, calls } = fakePorts({ activatedAt: async () => null });

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(report).toMatchObject({
				mode: 'execute',
				executed: false,
				skipped: 'not_activated',
				anonymized: 0,
				remaining: 3
			});
			// Der Lauf wird festgehalten — die Überwachung soll sehen, dass der
			// Cron läuft, auch wenn er noch nichts darf.
			expect(calls).toEqual(['recordLastRun']);
		});

		it('holt Hashes nach, bevor es leert', async () => {
			const { ports, calls } = fakePorts();

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(calls).toEqual(['backfill', 'anonymize', 'recordLastRun']);
			expect(report).toMatchObject({ executed: true, skipped: null, anonymized: 3, remaining: 0 });
		});

		it('wiederholt den Backfill hinter dem Cursor, bis er ausgeschöpft ist', async () => {
			const backfillHashes = vi
				.fn<AnonymizationPorts['backfillHashes']>()
				.mockResolvedValueOnce({
					...doneBackfill,
					hashed: 2000,
					remaining: 5,
					done: false,
					lastId: 2000,
					exhausted: false
				})
				.mockResolvedValueOnce({ ...doneBackfill, hashed: 5, lastId: 2005 });
			const { ports } = fakePorts({ backfillHashes });

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(backfillHashes.mock.calls).toEqual([[null], [2000]]);
			expect(report.hashed).toBe(2005);
			expect(report.executed).toBe(true);
		});

		it('leert nichts, solange der Backfill nicht ausgeschöpft ist', async () => {
			// Sonst verlöre eine Meldung mit Adresse, aber ohne Hash, ihre
			// Verknüpfung zur Person für immer.
			let cursor = 0;
			const backfillHashes = vi.fn(async () => ({
				...doneBackfill,
				hashed: 2000,
				remaining: 99,
				done: false,
				lastId: (cursor += 2000),
				exhausted: false
			}));
			const { ports, calls } = fakePorts({ backfillHashes });

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(backfillHashes).toHaveBeenCalledTimes(MAX_BACKFILL_ROUNDS);
			expect(report).toMatchObject({
				executed: false,
				skipped: 'hash_backfill_incomplete',
				anonymized: 0
			});
			expect(calls).not.toContain('anonymize');
			expect(calls.at(-1)).toBe('recordLastRun');
		});

		it('läuft hinter einem festgefahrenen Stapel weiter (Review PR #1011)', async () => {
			// Ein voller Stapel unhashbarer Adressen beweist nichts über die Zeilen
			// dahinter. `stalled` darf den Backfill nicht beenden.
			const backfillHashes = vi
				.fn<AnonymizationPorts['backfillHashes']>()
				.mockResolvedValueOnce({
					...doneBackfill,
					skipped: 2000,
					remaining: 2001,
					done: true,
					stalled: true,
					lastId: 2000,
					exhausted: false
				})
				.mockResolvedValueOnce({ ...doneBackfill, hashed: 1, remaining: 2000, lastId: 2001 });
			const { ports } = fakePorts({ backfillHashes });

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(backfillHashes.mock.calls).toEqual([[null], [2000]]);
			expect(report).toMatchObject({ executed: true, hashed: 1 });
		});

		it('klemmt das Limit auf das Maximum', async () => {
			const { ports } = fakePorts();

			await anonymizeSightings({ mode: 'execute', now: NOW, ports, limit: 10 ** 9 });

			expect(ports.anonymizeBatch).toHaveBeenCalledWith(MAX_ANONYMIZE_BATCH, NOW);
		});

		it('ist nicht fertig, solange ein voller Stapel geleert wurde und noch etwas fällig ist', async () => {
			const { ports } = fakePorts();

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports, limit: 2 });

			expect(report).toMatchObject({ anonymized: 2, remaining: 1, done: false });
		});

		it('ist nicht fertig, wenn gesperrte Zeilen fällig geblieben sind (Review PR #1011)', async () => {
			// FOR UPDATE SKIP LOCKED: Ein kurzer Stapel heißt nicht, dass nichts
			// mehr fällig ist.
			let due = 2;
			const { ports } = fakePorts({
				summarizeDue: vi.fn(async () => summary(due)),
				anonymizeBatch: vi.fn(async () => {
					due -= 1;
					return 1;
				})
			});

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports, limit: 500 });

			expect(report).toMatchObject({ anonymized: 1, remaining: 1, done: false });
		});

		it('hört auf, wenn kein Fortschritt möglich ist, und lässt `remaining` stehen', async () => {
			const { ports } = fakePorts({ anonymizeBatch: vi.fn(async () => 0) });

			const report = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(report).toMatchObject({ anonymized: 0, remaining: 3, done: true });
		});

		it('ein zweiter Lauf ändert nichts', async () => {
			const { ports } = fakePorts();
			await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			const second = await anonymizeSightings({ mode: 'execute', now: NOW, ports });

			expect(second).toMatchObject({ anonymized: 0, remaining: 0, done: true });
		});

		it('hält Zeitpunkt, Ergebnis und Auslöser als letzten Lauf fest', async () => {
			const { ports } = fakePorts();

			await anonymizeSightings({ mode: 'execute', now: NOW, ports, trigger: 'token' });

			expect(ports.recordLastRun).toHaveBeenCalledWith({
				at: NOW.toISOString(),
				trigger: 'token',
				skipped: null,
				hashed: 0,
				anonymized: 3,
				remaining: 0
			});
		});
	});
});
