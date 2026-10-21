import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn().mockReturnValue({
		warn: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('./spamDetector', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] })
}));

// Drizzle-Chain-Mock: der erste select() liefert die Zeilen-Abfrage
// (from→where→orderBy→limit), der zweite die Rest-Zählung (from→where→Promise).
const selectMock = vi.fn();
const updateSetCalls: Array<Record<string, unknown>> = [];
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: (...args: unknown[]) => selectMock(...args),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
				updateSetCalls.push(values);
				return { where: vi.fn().mockResolvedValue(undefined) };
			})
		})
	}
}));

import { rescoreSightings } from './rescoreSightings';
import { detectSpamIndicators } from './spamDetector';

const mockDetect = vi.mocked(detectSpamIndicators);

let capturedLimit: number | undefined;

function primeDb(rows: Array<Record<string, unknown>>, remainingCount: number): void {
	capturedLimit = undefined;
	selectMock.mockReset();
	// 1. Aufruf: Zeilen-Abfrage
	selectMock.mockImplementationOnce(() => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({
					limit: (n: number) => {
						capturedLimit = n;
						return Promise.resolve(rows);
					}
				})
			})
		})
	}));
	// 2. Aufruf: Rest-Zählung
	selectMock.mockImplementationOnce(() => ({
		from: () => ({
			where: () => Promise.resolve([{ count: remainingCount }])
		})
	}));
}

function buildRow(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id,
		notes: null,
		firstName: 'Max',
		lastName: 'Muster',
		email: 'max@example.com',
		waterway: null,
		seaMark: null,
		species: 0,
		latitude: '54.5',
		longitude: '12.0',
		inBalticSeaGeo: 1,
		...overrides
	};
}

describe('rescoreSightings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateSetCalls.length = 0;
		mockDetect.mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] });
	});

	it('bewertet Zeilen, schreibt Score und Indikatoren und zählt die Verteilung', async () => {
		primeDb([buildRow(1), buildRow(2)], 5);
		mockDetect
			.mockResolvedValueOnce({ score: 0, isHighRisk: false, indicators: [] })
			.mockResolvedValueOnce({ score: 7, isHighRisk: true, indicators: ['Testindikator'] });

		const report = await rescoreSightings({ limit: 10 });

		expect(report.scored).toBe(2);
		expect(report.lastId).toBe(2);
		expect(report.remaining).toBe(5);
		expect(report.distribution).toEqual({ '0': 1, '7': 1 });
		expect(updateSetCalls).toEqual([
			{ spamScore: 0, spamIndicators: [] },
			{ spamScore: 7, spamIndicators: ['Testindikator'] }
		]);
	});

	it('überspringt fehlgeschlagene Prüfungen ohne zu schreiben (NULL bleibt NULL)', async () => {
		primeDb([buildRow(1)], 0);
		mockDetect.mockResolvedValueOnce({
			score: 0,
			isHighRisk: true,
			indicators: ['Spam-Prüfung fehlgeschlagen'],
			failed: true
		});

		const report = await rescoreSightings({});

		expect(report.scored).toBe(0);
		expect(report.skippedFailed).toBe(1);
		expect(updateSetCalls).toHaveLength(0);
	});

	it('meldet done=true, wenn weniger Zeilen kamen als das Limit', async () => {
		primeDb([buildRow(1)], 0);
		const report = await rescoreSightings({ limit: 10 });
		expect(report.done).toBe(true);
	});

	it('meldet done=false bei voller Batch-Größe', async () => {
		primeDb([buildRow(1), buildRow(2)], 3);
		const report = await rescoreSightings({ limit: 2 });
		expect(report.done).toBe(false);
	});

	it('bricht ab, wenn ein voller Batch gar nichts schreibt (sonst Endlosschleife)', async () => {
		// Scheitert die Prüfung für JEDE Zeile eines vollen Batches, bleibt
		// spam_score NULL — derselbe Batch käme beim nächsten Lauf erneut, und
		// `done` aus der Batch-Größe bliebe für immer false.
		primeDb([buildRow(1), buildRow(2)], 2);
		mockDetect.mockResolvedValue({
			score: 0,
			isHighRisk: true,
			indicators: ['Spam-Prüfung fehlgeschlagen'],
			failed: true
		});

		const report = await rescoreSightings({ limit: 2 });

		expect(report.scored).toBe(0);
		expect(report.skippedFailed).toBe(2);
		expect(report.stalled).toBe(true);
		expect(report.done).toBe(true);
	});

	it('läuft weiter, solange ein voller Batch wenigstens eine Zeile schreibt', async () => {
		primeDb([buildRow(1), buildRow(2)], 5);
		mockDetect
			.mockResolvedValueOnce({
				score: 0,
				isHighRisk: true,
				indicators: ['Spam-Prüfung fehlgeschlagen'],
				failed: true
			})
			.mockResolvedValueOnce({ score: 3, isHighRisk: false, indicators: [] });

		const report = await rescoreSightings({ limit: 2 });

		expect(report.stalled).toBe(false);
		expect(report.done).toBe(false);
	});

	it('meldet auf leerer Menge kein stalled', async () => {
		primeDb([], 0);

		const report = await rescoreSightings({ limit: 10 });

		expect(report.stalled).toBe(false);
		expect(report.done).toBe(true);
	});

	it('klemmt das Limit auf höchstens 1000', async () => {
		primeDb([], 0);
		await rescoreSightings({ limit: 99999 });
		expect(capturedLimit).toBe(1000);
	});

	it('übergibt dem Detektor die konvertierten Koordinaten und das ostsee_geo-Flag', async () => {
		primeDb([buildRow(1, { latitude: '54.5', longitude: '12.0', inBalticSeaGeo: 2 })], 0);

		await rescoreSightings({});

		expect(mockDetect).toHaveBeenCalledWith(
			expect.objectContaining({ latitude: 54.5, longitude: 12.0, inBalticSeaGeo: 2 })
		);
		// Kein Submission-Kontext beim Backfill — 'missing' wäre ein falscher Malus.
		expect(mockDetect.mock.calls[0]?.[0]?.submission).toBeUndefined();
	});
});
