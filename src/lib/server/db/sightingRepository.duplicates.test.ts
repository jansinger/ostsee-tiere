/**
 * Unit Tests für countRecentDuplicateSignals in sightingRepository.ts
 *
 * Semantik:
 * - sameEmail: Anzahl Sichtungen der letzten 24 h mit derselben E-Mail (case-insensitiv)
 * - sameNotes: Anzahl Sichtungen der letzten 7 Tage mit exakt demselben Bemerkungstext
 *   (getrimmt), aber nur wenn der getrimmte Text >= 20 Zeichen hat
 * - Fail-open: DB-Fehler → { sameEmail: 0, sameNotes: 0 }, kein Throw
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { countRecentDuplicateSignals } from './sightingRepository';

// Mock-Set analog zu sightingRepository.test.ts: db + Module mit Seiteneffekten
vi.mock('#lib/server/db/index.ts', () => {
	const db: Record<string, any> = {
		insert: vi.fn(),
		update: vi.fn(),
		select: vi.fn(),
		execute: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db))
	};
	return { db };
});

vi.mock('./mapFormToSighting', () => ({
	mapFormToSighting: vi.fn()
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	isCloudStorage: vi.fn(() => false),
	getStorageProvider: vi.fn(() => ({
		getUrl: vi.fn((path: string) => `/uploads/${path}`),
		delete: vi.fn().mockResolvedValue(undefined)
	}))
}));

vi.mock('#lib/server/media/exifUtils.ts', () => ({
	isImageFile: vi.fn(),
	readImageExifData: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

const mockDb = vi.mocked(db as unknown as { select: ReturnType<typeof vi.fn> });

/**
 * Baut eine Drizzle-Chain db.select({...}).from(...).where(...) nach,
 * deren Ende als Promise auf [{ count: n }] auflöst.
 */
function selectChainResolving(countValue: number) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue([{ count: countValue }])
		})
	};
}

describe('countRecentDuplicateSignals', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('zählt E-Mail- und Notes-Duplikate aus den beiden DB-Abfragen', async () => {
		// Erste Abfrage: gleiche E-Mail (24 h) → 3, zweite: gleicher Bemerkungstext (7 Tage) → 2
		mockDb.select
			.mockReturnValueOnce(selectChainResolving(3))
			.mockReturnValueOnce(selectChainResolving(2));

		const result = await countRecentDuplicateSignals({
			email: 'Max@Example.com',
			notes: 'Ein ausreichend langer Bemerkungstext für die Duplikatprüfung'
		});

		expect(result).toEqual({ sameEmail: 3, sameNotes: 2 });
		expect(mockDb.select).toHaveBeenCalledTimes(2);
	});

	it('fragt Notes unter 20 Zeichen nicht ab und liefert sameNotes 0', async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving(3));

		const result = await countRecentDuplicateSignals({
			email: 'max@example.com',
			notes: '10 Zeichen' // getrimmt < 20 Zeichen → keine Notes-Abfrage
		});

		expect(result).toEqual({ sameEmail: 3, sameNotes: 0 });
		// Nur die E-Mail-Abfrage darf gelaufen sein
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	it('macht ohne E-Mail und Notes keine einzige DB-Abfrage', async () => {
		const result = await countRecentDuplicateSignals({
			email: undefined,
			notes: undefined
		});

		expect(result).toEqual({ sameEmail: 0, sameNotes: 0 });
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	it('ist fail-open: DB-Fehler liefert Nullwerte statt Throw', async () => {
		mockDb.select.mockImplementation(() => {
			throw new Error('DB nicht erreichbar');
		});

		await expect(
			countRecentDuplicateSignals({
				email: 'max@example.com',
				notes: 'Ein ausreichend langer Bemerkungstext für die Duplikatprüfung'
			})
		).resolves.toEqual({ sameEmail: 0, sameNotes: 0 });
	});
});
