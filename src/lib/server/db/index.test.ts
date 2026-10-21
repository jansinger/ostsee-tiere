/**
 * Unit Tests für den Lazy-Init-Proxy in `src/lib/server/db/index.ts`.
 *
 * Das Modul hält Singleton-State auf Modulebene (`_realDb`, `_client`,
 * `_initError`, `_lastConnectionTest`). Damit Tests sich nicht gegenseitig
 * beeinflussen, wird das Modul in jedem Test frisch geladen: `vi.resetModules()`
 * gefolgt von einem dynamischen `await import('./index')`. Die `vi.mock`-Fabriken
 * für `postgres`, `drizzle-orm/postgres-js` und `$env/dynamic/private` bleiben
 * über `vi.resetModules()` hinweg registriert (nur der Modul-Cache wird
 * geleert) — über `vi.hoisted()` referenzierte Mock-Funktionen lassen sich
 * daher pro Test neu konfigurieren, ohne die Registrierung zu verlieren.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPostgres, mockDrizzle, envState } = vi.hoisted(() => {
	return {
		mockPostgres: vi.fn(),
		mockDrizzle: vi.fn(),
		envState: {} as Record<string, string | undefined>
	};
});

vi.mock('postgres', () => ({ default: mockPostgres }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: mockDrizzle }));
vi.mock('#lib/server/env.ts', () => ({ env: envState }));

function createMockClient(end: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined)) {
	return { end };
}

function createMockDb(execute: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined)) {
	return { execute };
}

const ORIGINAL_PROCESS_ENV_URL = process.env.DATABASE_POSTGRES_URL;

describe('src/lib/server/db/index.ts', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		// Sauberer Env-Zustand: weder $env/dynamic/private noch process.env gesetzt
		for (const key of Object.keys(envState)) {
			delete envState[key];
		}
		delete process.env.DATABASE_POSTGRES_URL;

		// Default-Verhalten: postgres() liefert einen Mock-Client, drizzle() eine Mock-DB
		mockPostgres.mockImplementation(() => createMockClient());
		mockDrizzle.mockImplementation(() => createMockDb());
	});

	afterEach(() => {
		if (ORIGINAL_PROCESS_ENV_URL === undefined) {
			delete process.env.DATABASE_POSTGRES_URL;
		} else {
			process.env.DATABASE_POSTGRES_URL = ORIGINAL_PROCESS_ENV_URL;
		}
	});

	describe('_initError bei fehlender DATABASE_POSTGRES_URL', () => {
		it('getDatabaseError() liefert die DB_NOT_CONFIGURED-Meldung wenn keine URL gesetzt ist', async () => {
			const { getDatabaseError } = await import('./index');

			expect(getDatabaseError()).toBe(
				'Database is not configured. Set DATABASE_POSTGRES_URL environment variable.'
			);
			expect(mockPostgres).not.toHaveBeenCalled();
		});

		it('isDatabaseAvailable() gibt false zurück ohne postgres() aufzurufen', async () => {
			const { isDatabaseAvailable } = await import('./index');

			expect(isDatabaseAvailable()).toBe(false);
			expect(mockPostgres).not.toHaveBeenCalled();
		});

		it('getDatabaseError() liefert null wenn DATABASE_POSTGRES_URL über $env/dynamic/private gesetzt ist', async () => {
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';
			const { getDatabaseError, isDatabaseAvailable } = await import('./index');

			expect(isDatabaseAvailable()).toBe(true);
			expect(getDatabaseError()).toBeNull();
			expect(mockPostgres).toHaveBeenCalledTimes(1);
		});

		it('fällt auf process.env zurück wenn $env/dynamic/private die URL nicht liefert', async () => {
			process.env.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';
			const { isDatabaseAvailable } = await import('./index');

			expect(isDatabaseAvailable()).toBe(true);
			expect(mockPostgres).toHaveBeenCalledTimes(1);
		});
	});

	describe('closeDb()', () => {
		it('ist idempotent: mehrfacher Aufruf ohne aktive Verbindung wirft nicht und kehrt sofort zurück', async () => {
			const { closeDb } = await import('./index');

			await expect(closeDb()).resolves.toBeUndefined();
			await expect(closeDb()).resolves.toBeUndefined();
		});

		it('schließt eine aktive Verbindung über client.end()', async () => {
			const end = vi.fn().mockResolvedValue(undefined);
			mockPostgres.mockImplementation(() => createMockClient(end));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			const { isDatabaseAvailable, closeDb } = await import('./index');
			// Verbindung initialisieren, damit _client gesetzt ist
			isDatabaseAvailable();

			await closeDb();

			expect(end).toHaveBeenCalledTimes(1);
		});

		it('setzt State zurück BEVOR client.end() awaited wird — paralleler zweiter Aufruf schließt nicht doppelt', async () => {
			let resolveEnd!: () => void;
			const endPromise = new Promise<void>((resolve) => {
				resolveEnd = resolve;
			});
			const end = vi.fn().mockReturnValue(endPromise);
			mockPostgres.mockImplementation(() => createMockClient(end));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			const { isDatabaseAvailable, closeDb } = await import('./index');
			isDatabaseAvailable();

			// Erster Aufruf: client.end() wird gestartet, aber die Promise ist noch offen
			const firstClose = closeDb();

			// Zweiter, paralleler Aufruf während der erste noch auf client.end() wartet:
			// _client wurde vom ersten Aufruf bereits synchron auf null gesetzt,
			// daher darf der zweite Aufruf sofort zurückkehren, ohne end() erneut aufzurufen.
			const secondClose = closeDb();

			expect(end).toHaveBeenCalledTimes(1);

			resolveEnd();
			await Promise.all([firstClose, secondClose]);

			expect(end).toHaveBeenCalledTimes(1);
		});

		it('erlaubt einen erneuten Verbindungsaufbau nach dem Schließen', async () => {
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			const { isDatabaseAvailable, closeDb } = await import('./index');
			isDatabaseAvailable();
			await closeDb();

			// _realDb wurde auf null gesetzt, initializeDb() muss also erneut laufen
			expect(isDatabaseAvailable()).toBe(true);
			expect(mockPostgres).toHaveBeenCalledTimes(2);
		});
	});

	describe('testDatabaseConnection()', () => {
		it('gibt false zurück ohne Query-Versuch, wenn die DB nicht konfiguriert ist', async () => {
			const { testDatabaseConnection } = await import('./index');

			await expect(testDatabaseConnection()).resolves.toBe(false);
			expect(mockDrizzle).not.toHaveBeenCalled();
		});

		it('gibt true zurück wenn die Query erfolgreich ist', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			mockDrizzle.mockImplementation(() => createMockDb(execute));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			const { testDatabaseConnection } = await import('./index');

			await expect(testDatabaseConnection()).resolves.toBe(true);
			expect(execute).toHaveBeenCalledTimes(1);
		});

		it('fängt Query-Fehler ab und gibt false zurück statt zu werfen', async () => {
			const execute = vi.fn().mockRejectedValue(new Error('Verbindung abgelehnt'));
			mockDrizzle.mockImplementation(() => createMockDb(execute));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			const { testDatabaseConnection } = await import('./index');

			await expect(testDatabaseConnection()).resolves.toBe(false);
		});

		it('cached das Ergebnis für 10 Sekunden — zweiter Aufruf führt keine neue Query aus', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			mockDrizzle.mockImplementation(() => createMockDb(execute));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			vi.useFakeTimers();
			try {
				const { testDatabaseConnection } = await import('./index');

				await expect(testDatabaseConnection()).resolves.toBe(true);
				expect(execute).toHaveBeenCalledTimes(1);

				// Innerhalb der 10s-Cache-Frist: keine neue Query
				vi.advanceTimersByTime(9000);
				await expect(testDatabaseConnection()).resolves.toBe(true);
				expect(execute).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it('führt nach Ablauf der Cache-Frist eine neue Query aus', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			mockDrizzle.mockImplementation(() => createMockDb(execute));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			vi.useFakeTimers();
			try {
				const { testDatabaseConnection } = await import('./index');

				await expect(testDatabaseConnection()).resolves.toBe(true);
				expect(execute).toHaveBeenCalledTimes(1);

				// Cache-Frist überschritten (10s)
				vi.advanceTimersByTime(10001);
				await expect(testDatabaseConnection()).resolves.toBe(true);
				expect(execute).toHaveBeenCalledTimes(2);
			} finally {
				vi.useRealTimers();
			}
		});

		it('resetConnectionTestCache() invalidiert den Cache sofort', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			mockDrizzle.mockImplementation(() => createMockDb(execute));
			envState.DATABASE_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

			const { testDatabaseConnection, resetConnectionTestCache } = await import('./index');

			await expect(testDatabaseConnection()).resolves.toBe(true);
			expect(execute).toHaveBeenCalledTimes(1);

			resetConnectionTestCache();

			await expect(testDatabaseConnection()).resolves.toBe(true);
			expect(execute).toHaveBeenCalledTimes(2);
		});
	});
});
