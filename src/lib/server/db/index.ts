import { env } from '#lib/server/env.ts';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { TIMESTAMP_AS_TEXT } from './postgresTypes';
import * as schema from './schema';

// Error message constant for consistency
const DB_NOT_CONFIGURED_ERROR =
	'Database is not configured. Set DATABASE_POSTGRES_URL environment variable.';

// Track database connection state
let _realDb: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;
let _initError: string | null = null;

/**
 * Gets the database URL from environment variables.
 * Uses SvelteKit's environment (`env` from `#lib/server/env.ts`, declared in `src/env.ts`)
 * to properly load .env values during development.
 * Falls back to process.env for non-SvelteKit contexts (scripts, tools).
 */
function getDatabaseUrl(): string | undefined {
	return env.DATABASE_POSTGRES_URL ?? process.env.DATABASE_POSTGRES_URL;
}

/**
 * Lazy initialization of database connection.
 * Since postgres.js creates connections lazily, this function completes synchronously.
 * The actual database connection will be established when the first query is executed.
 */
function initializeDb(): void {
	// If already initialized (success or failure), return immediately
	if (_realDb !== null || _initError !== null) {
		return;
	}

	try {
		const databaseUrl = getDatabaseUrl();
		if (!databaseUrl) {
			_initError = DB_NOT_CONFIGURED_ERROR;
			return;
		}

		// postgres() returns immediately - actual connection is lazy
		// Pool-/Timeout-Optionen für den Single-Container-Docker-Betrieb:
		// - max: Verbindungspool-Obergrenze (eine Instanz, kein Fan-out nötig)
		// - idle_timeout: Leerlaufverbindungen nach 20s schließen
		// - connect_timeout: Verbindungsaufbau nach 10s abbrechen
		const client = postgres(databaseUrl, {
			max: 10,
			idle_timeout: 20,
			connect_timeout: 10,
			// Zeitstempel ohne Zeitzone als Text übernehmen, damit Drizzle sie als
			// UTC auslegt statt als Ortszeit des Prozesses — Begründung und
			// Messwerte in `postgresTypes.ts`, abgesichert durch
			// `timestampParsing.test.ts`.
			types: { timestampAsText: TIMESTAMP_AS_TEXT }
		});
		_client = client;
		_realDb = drizzle(client, { schema });
	} catch (error) {
		_initError = error instanceof Error ? error.message : String(error);
	}
}

/**
 * Ensures database is initialized before use.
 * Called by all public APIs that need database access.
 */
function ensureInitialized(): void {
	if (_realDb === null && _initError === null) {
		initializeDb();
	}
}

// Create a proxy that lazily initializes the database connection on first access
// This allows TypeScript to treat db as non-null while still handling missing DB gracefully
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
	get(_target, prop) {
		// Initialize database on first access if not already done
		ensureInitialized();

		// Check if initialization succeeded
		if (!_realDb) {
			const errorMsg = _initError
				? `Database connection failed: ${_initError}`
				: DB_NOT_CONFIGURED_ERROR;
			throw new Error(errorMsg);
		}

		// Return the actual property/method from the initialized database
		const value = _realDb[prop as keyof typeof _realDb];
		if (typeof value === 'function') {
			return value.bind(_realDb);
		}
		return value;
	}
});

// Helper function to check if database is available (for graceful degradation)
export function isDatabaseAvailable(): boolean {
	ensureInitialized();
	return _realDb !== null;
}

// Helper function to get db with proper error if not available
export function getDb(): PostgresJsDatabase<typeof schema> {
	ensureInitialized();

	if (!_realDb) {
		const errorMsg = _initError
			? `Database connection failed: ${_initError}`
			: DB_NOT_CONFIGURED_ERROR;
		throw new Error(errorMsg);
	}
	return _realDb;
}

// Helper function to get the initialization error message
export function getDatabaseError(): string | null {
	ensureInitialized();
	return _initError;
}

/**
 * Test if the database connection is actually working.
 * This performs a real query to verify connectivity.
 * Results are cached to avoid excessive connection attempts.
 */
let _lastConnectionTest: { time: number; result: boolean } | null = null;
const CONNECTION_TEST_CACHE_MS = 10000; // Cache result for 10 seconds

export async function testDatabaseConnection(): Promise<boolean> {
	// Check cache first
	if (_lastConnectionTest && Date.now() - _lastConnectionTest.time < CONNECTION_TEST_CACHE_MS) {
		return _lastConnectionTest.result;
	}

	// If DB is not configured, return false immediately
	if (!isDatabaseAvailable()) {
		_lastConnectionTest = { time: Date.now(), result: false };
		return false;
	}

	try {
		// Perform a simple query to test connectivity
		const { sql } = await import('drizzle-orm');
		await db.execute(sql`SELECT 1`);
		_lastConnectionTest = { time: Date.now(), result: true };
		return true;
	} catch {
		_lastConnectionTest = { time: Date.now(), result: false };
		return false;
	}
}

/**
 * Reset the connection test cache (useful for testing or reconnection attempts)
 */
export function resetConnectionTestCache(): void {
	_lastConnectionTest = null;
}

/**
 * Schließt die postgres.js-Verbindung sauber (für Graceful Shutdown).
 *
 * Idempotent: mehrfache Aufrufe sind unschädlich. Wird beim Empfang von
 * SIGTERM/SIGINT (z.B. `docker stop`) aufgerufen, damit offene Verbindungen
 * kontrolliert beendet werden statt hart abzubrechen.
 */
export async function closeDb(): Promise<void> {
	if (!_client) {
		return;
	}

	const client = _client;
	// Referenzen sofort zurücksetzen, damit parallele Aufrufe nicht doppelt schließen
	_client = null;
	_realDb = null;
	_lastConnectionTest = null;

	await client.end({ timeout: 5 });
}
