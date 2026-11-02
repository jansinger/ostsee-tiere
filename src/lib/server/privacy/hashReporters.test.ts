/**
 * Backfill des Melder-Hashes für den Bestand.
 *
 * Muss laufen, solange die Adressen noch da sind — also vor dem ersten
 * Anonymisierungslauf. Danach holt derselbe Schritt Zeilen nach, die das
 * Altsystem auf dieselbe Datenbank schreibt und die deshalb ohne Hash ankommen.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'k'.repeat(32);

const { mockEnv, selectMock, updateSetCalls } = vi.hoisted(() => ({
	mockEnv: {} as { REPORTER_HASH_KEY?: string },
	selectMock: vi.fn(),
	updateSetCalls: [] as Array<Record<string, unknown>>
}));

vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: (...args: unknown[]) => selectMock(...args),
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => {
				updateSetCalls.push(values);
				return { where: vi.fn().mockResolvedValue(undefined) };
			})
		}))
	}
}));

import { computeReporterHash } from './reporterHash';
import { hashReporters, MAX_HASH_BATCH, ReporterHashKeyMissingError } from './hashReporters';

let capturedLimit: number | undefined;
let capturedWhere: SQL | undefined;

function primeDb(rows: Array<{ id: number; email: string }>, remaining: number): void {
	capturedLimit = undefined;
	capturedWhere = undefined;
	selectMock.mockReset();
	selectMock.mockImplementationOnce(() => ({
		from: () => ({
			where: (condition: SQL) => {
				capturedWhere = condition;
				return {
					orderBy: () => ({
						limit: (n: number) => {
							capturedLimit = n;
							return Promise.resolve(rows);
						}
					})
				};
			}
		})
	}));
	selectMock.mockImplementationOnce(() => ({
		from: () => ({ where: () => Promise.resolve([{ count: remaining }]) })
	}));
}

describe('hashReporters', () => {
	beforeEach(() => {
		mockEnv.REPORTER_HASH_KEY = KEY;
		updateSetCalls.length = 0;
	});

	it('bricht ohne Schlüssel ab, bevor es irgendetwas liest oder schreibt', async () => {
		delete mockEnv.REPORTER_HASH_KEY;
		selectMock.mockReset();

		await expect(hashReporters({})).rejects.toBeInstanceOf(ReporterHashKeyMissingError);

		expect(selectMock).not.toHaveBeenCalled();
		expect(updateSetCalls).toEqual([]);
	});

	it('schreibt Hash und Intern-Kennzeichen je Zeile', async () => {
		primeDb(
			[
				{ id: 1, email: 'Erika@example.invalid' },
				{ id: 2, email: 'team@meeresmuseum.de' }
			],
			0
		);

		const report = await hashReporters({});

		expect(updateSetCalls).toEqual([
			{ reporterHash: computeReporterHash('erika@example.invalid', KEY), reporterInternal: false },
			{ reporterHash: computeReporterHash('team@meeresmuseum.de', KEY), reporterInternal: true }
		]);
		expect(report).toEqual({ hashed: 2, remaining: 0, done: true });
	});

	it('wählt nur Zeilen mit Adresse, ohne Hash und nicht anonymisiert', async () => {
		primeDb([], 0);

		await hashReporters({});

		const { sql: text } = new PgDialect().sqlToQuery(capturedWhere as SQL);
		expect(text).toContain('"melder_hash" is null');
		expect(text).toContain('"anonymisiert_am" is null');
		expect(text).toContain('"email" is not null');
		expect(text).toMatch(/trim\("sichtungen"\."email"\) <> ''/);
	});

	it('ist nicht fertig, solange ein voller Batch zurückkam', async () => {
		primeDb(
			[
				{ id: 1, email: 'a@example.invalid' },
				{ id: 2, email: 'b@example.invalid' }
			],
			5
		);

		const report = await hashReporters({ limit: 2 });

		expect(report).toEqual({ hashed: 2, remaining: 5, done: false });
	});

	it('klemmt das Limit auf das Maximum', async () => {
		primeDb([], 0);

		await hashReporters({ limit: MAX_HASH_BATCH * 10 });

		expect(capturedLimit).toBe(MAX_HASH_BATCH);
	});
});
