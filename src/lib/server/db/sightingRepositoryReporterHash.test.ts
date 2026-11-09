/**
 * `saveSighting` und `updateSighting` setzen den Melder-Hash.
 *
 * Gesetzt wird er beim Eingang, nicht erst bei der Anonymisierung: Nur so
 * lässt sich eine heutige Meldung mit einer verknüpfen, deren Adresse längst
 * gelöscht ist (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 4).
 */
import { db } from '#lib/server/db/index.ts';
import { computeReporterHash } from '#lib/server/privacy/reporterHash.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSighting, updateSighting } from './sightingRepository';

const KEY = 'k'.repeat(32);

const { mockEnv, mapped } = vi.hoisted(() => ({
	mockEnv: {} as { REPORTER_HASH_KEY?: string },
	mapped: { email: 'Erika@Meeresmuseum.de ' as string | null }
}));

vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

vi.mock('#lib/server/db/index.ts', () => {
	const db: Record<string, unknown> = {
		insert: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db))
	};
	return { db };
});

vi.mock('./mapFormToSighting', () => ({
	mapFormToSighting: vi.fn(() => ({
		email: mapped.email,
		species: 1,
		sightingDate: new Date('2026-10-01T10:00:00Z'),
		created: new Date('2026-10-01T10:05:00Z')
	}))
}));

type MockDb = { insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

function captureInsert(): () => Record<string, unknown> | undefined {
	let captured: Record<string, unknown> | undefined;
	(db as unknown as MockDb).insert.mockReturnValue({
		values: vi.fn((data: Record<string, unknown>) => {
			captured = data;
			return { returning: vi.fn().mockResolvedValue([{ id: 42 }]) };
		})
	});
	return () => captured;
}

function captureUpdate(): () => Record<string, unknown> | undefined {
	let captured: Record<string, unknown> | undefined;
	(db as unknown as MockDb).update.mockReturnValue({
		set: vi.fn((data: Record<string, unknown>) => {
			captured = data;
			return {
				where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 42 }]) }))
			};
		})
	});
	return () => captured;
}

describe('Melder-Hash beim Speichern', () => {
	beforeEach(() => {
		mockEnv.REPORTER_HASH_KEY = KEY;
		mapped.email = 'Erika@Meeresmuseum.de ';
		// setSightingIdForReferenceId verknüpft Mediendateien per Update
		(db as unknown as MockDb).update.mockReturnValue({
			set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) }))
		});
	});

	it('saveSighting setzt Hash und Intern-Kennzeichen', async () => {
		const inserted = captureInsert();

		await saveSighting({} as never);

		expect(inserted()).toMatchObject({
			reporterHash: computeReporterHash('erika@meeresmuseum.de', KEY),
			reporterInternal: true
		});
	});

	it('saveSighting speichert ohne Schlüssel trotzdem — der Hash bleibt null', async () => {
		delete mockEnv.REPORTER_HASH_KEY;
		const inserted = captureInsert();

		await expect(saveSighting({} as never)).resolves.toEqual({ id: 42 });

		expect(inserted()).toMatchObject({ reporterHash: null, reporterInternal: true });
	});

	it('saveSighting setzt ohne Adresse beides auf null', async () => {
		mapped.email = null;
		const inserted = captureInsert();

		await saveSighting({} as never);

		expect(inserted()).toMatchObject({ reporterHash: null, reporterInternal: null });
	});
});

describe('Melder-Hash beim Aktualisieren', () => {
	beforeEach(() => {
		mockEnv.REPORTER_HASH_KEY = KEY;
	});

	it('berechnet den Hash aus der (geänderten) Adresse neu', async () => {
		mapped.email = 'max@example.invalid';
		const updated = captureUpdate();

		await updateSighting(42, {} as never);

		expect(updated()).toMatchObject({
			reporterHash: computeReporterHash('max@example.invalid', KEY),
			reporterInternal: false
		});
	});

	it('lässt Hash und Kennzeichen unangetastet, wenn keine Adresse übergeben wird', async () => {
		// Sonst risse eine Bearbeitung ohne Adresse die Verknüpfung auf.
		mapped.email = '';
		const updated = captureUpdate();

		await updateSighting(42, {} as never);

		expect(updated()).not.toHaveProperty('reporterHash');
		expect(updated()).not.toHaveProperty('reporterInternal');
	});
});
