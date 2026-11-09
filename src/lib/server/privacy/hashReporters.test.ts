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

const { mockEnv, selectMock, updateSetCalls, updateWheres, updateReturning } = vi.hoisted(() => ({
	mockEnv: {} as { REPORTER_HASH_KEY?: string },
	selectMock: vi.fn(),
	updateSetCalls: [] as Array<Record<string, unknown>>,
	updateWheres: [] as unknown[],
	// Je Update: was `.returning()` liefert. Leer = die Zeile hat sich seit dem
	// Lesen geändert und wurde nicht geschrieben.
	updateReturning: vi.fn((): Array<{ id: number }> => [{ id: 0 }])
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
				return {
					where: vi.fn((condition: unknown) => {
						updateWheres.push(condition);
						return { returning: () => Promise.resolve(updateReturning()) };
					})
				};
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
		updateWheres.length = 0;
		updateReturning.mockReset();
		updateReturning.mockImplementation(() => [{ id: 0 }]);
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
		expect(report).toEqual({ hashed: 2, skipped: 0, remaining: 0, done: true, stalled: false });
	});

	it('wählt nur Zeilen mit Adresse, ohne Hash und nicht anonymisiert', async () => {
		primeDb([], 0);

		await hashReporters({});

		const { sql: text } = new PgDialect().sqlToQuery(capturedWhere as SQL);
		expect(text).toContain('"melder_hash" is null');
		expect(text).toContain('"anonymisiert_am" is null');
		expect(text).toContain('"email" is not null');
		// Nicht `trim(email) <> ''`: PostgreSQLs `trim` entfernt nur Leerzeichen,
		// `normalizeReporterKey` auch Tabs und Zeilenumbrüche (Review PR #1007).
		expect(text).toContain(`"sichtungen"."email" ~ '[^[:space:]]'`);
		expect(text).not.toContain('trim(');
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

		expect(report).toEqual({ hashed: 2, skipped: 0, remaining: 5, done: false, stalled: false });
	});

	it('klemmt das Limit auf das Maximum', async () => {
		primeDb([], 0);

		await hashReporters({ limit: MAX_HASH_BATCH * 10 });

		expect(capturedLimit).toBe(MAX_HASH_BATCH);
	});

	it('schreibt nur, wenn die Zeile seit dem Lesen unverändert ist', async () => {
		// Ändert ein Admin zwischen Lesen und Schreiben die Adresse, hat
		// `updateSighting` schon den neuen Hash gesetzt. Der Backfill darf ihn
		// nicht mit dem der alten Adresse überschreiben (Review PR #1007).
		primeDb([{ id: 7, email: 'alt@example.invalid' }], 0);

		await hashReporters({});

		const { sql: text, params } = new PgDialect().sqlToQuery(updateWheres[0] as SQL);
		expect(text).toContain('"melder_hash" is null');
		expect(text).toContain('"anonymisiert_am" is null');
		expect(text).toContain('"email" =');
		expect(params).toContain('alt@example.invalid');
	});

	it('zählt nur tatsächlich geschriebene Zeilen', async () => {
		primeDb(
			[
				{ id: 1, email: 'a@example.invalid' },
				{ id: 2, email: 'b@example.invalid' }
			],
			0
		);
		// Zeile 2 hat sich seit dem Lesen geändert
		updateReturning.mockImplementationOnce(() => [{ id: 1 }]).mockImplementationOnce(() => []);

		const report = await hashReporters({});

		expect(report.hashed).toBe(1);
	});

	it('überspringt Adressen, die nach der Normalisierung leer sind, ohne zu schreiben', async () => {
		primeDb(
			[
				{ id: 1, email: '\t' },
				{ id: 2, email: 'b@example.invalid' }
			],
			1
		);

		const report = await hashReporters({});

		expect(updateSetCalls).toHaveLength(1);
		expect(report).toMatchObject({ hashed: 1, skipped: 1 });
	});

	it('meldet einen Batch ohne Fortschritt als festgefahren statt endlos weiterzulaufen', async () => {
		// Ein voller Batch, in dem keine Zeile einen Hash bekommen kann: Ein
		// weiterer Aufruf läse dieselben Zeilen wieder.
		primeDb(
			[
				{ id: 1, email: '\t' },
				{ id: 2, email: '\u00a0' }
			],
			2
		);

		const report = await hashReporters({ limit: 2 });

		expect(report).toEqual({ hashed: 0, skipped: 2, remaining: 2, done: true, stalled: true });
	});

	it('hält einen Batch nicht für festgefahren, den ein paralleler Lauf schon erledigt hat', async () => {
		// Alle bedingten Updates kommen leer zurück, weil die Zeilen inzwischen
		// gehasht sind. Der nächste Batch hat dann neue Zeilen — wer hier
		// aufhört, lässt hashbare Zeilen liegen (Review PR #1008).
		primeDb(
			[
				{ id: 1, email: 'a@example.invalid' },
				{ id: 2, email: 'b@example.invalid' }
			],
			3
		);
		updateReturning.mockImplementation(() => []);

		const report = await hashReporters({ limit: 2 });

		expect(report).toEqual({ hashed: 0, skipped: 0, remaining: 3, done: false, stalled: false });
	});
});
