import type { Handle } from '@sveltejs/kit/hooks';
import { error } from '@sveltejs/kit';
import { env } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { isDatabaseAvailable, testDatabaseConnection } from '#lib/server/db/index.ts';

const logger = createLogger('databaseCheck');

/**
 * Check if database check should be skipped (for CI/E2E tests without database).
 * Set SKIP_DB_CHECK=true in environment to skip.
 */
function shouldSkipDbCheck(): boolean {
	const skipDbCheck = env.SKIP_DB_CHECK ?? process.env.SKIP_DB_CHECK;
	return skipDbCheck === 'true' || skipDbCheck === '1';
}

// Cache the database status to avoid checking on every request
let lastCheckTime = 0;
let lastCheckResult = false;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Paths that should work without database access.
 * These are only technical/static pages - user-facing pages need the database
 * to function properly (form submission, map data, image upload).
 */
const DB_OPTIONAL_PATHS = [
	'/health',
	'/api/health',
	'/db-unavailable',
	'/maintenance',
	'/_app',
	'/favicon',
	'/.well-known'
];

/**
 * Paths that REQUIRE database access.
 * If DB is unavailable, these will show a 503 error.
 */
const DB_REQUIRED_PATHS = [
	'/admin',
	'/api/upload',
	'/api/sightings',
	'/api/map/sightings',
	'/sichtungen'
];

/**
 * Check if the current path strictly requires database access.
 * Uses a whitelist approach: only specified paths require DB.
 */
function requiresDatabase(pathname: string): boolean {
	// First check if it's explicitly optional
	if (DB_OPTIONAL_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
		return false;
	}

	// Then check if it's explicitly required
	if (DB_REQUIRED_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
		return true;
	}

	// For API endpoints not in the optional list, require DB
	if (pathname.startsWith('/api/')) {
		return true;
	}

	// Default: don't require DB (let page handle errors gracefully)
	return false;
}

/**
 * Check database availability with caching
 */
async function checkDatabaseAvailability(): Promise<boolean> {
	const now = Date.now();

	// Use cached result if still valid
	if (now - lastCheckTime < CHECK_INTERVAL) {
		return lastCheckResult;
	}

	// First check if DB is configured
	if (!isDatabaseAvailable()) {
		lastCheckTime = now;
		lastCheckResult = false;
		return false;
	}

	// Then test actual connectivity
	try {
		const isConnected = await testDatabaseConnection();
		lastCheckTime = now;
		lastCheckResult = isConnected;
		return isConnected;
	} catch (err) {
		logger.error({ error: err }, 'Database connection test failed');
		lastCheckTime = now;
		lastCheckResult = false;
		return false;
	}
}

/**
 * Reset the database check cache (useful for testing or after config changes)
 */
export function resetDatabaseCheckCache(): void {
	lastCheckTime = 0;
	lastCheckResult = false;
}

/**
 * Database availability middleware
 *
 * Checks if the database is available and redirects to an error page if not.
 * This prevents confusing errors in the UI when the database is down.
 *
 * Can be disabled by setting SKIP_DB_CHECK=true (useful for CI/E2E tests).
 */
export const databaseCheck: Handle = async ({ event, resolve }) => {
	// Skip all database checks if explicitly disabled (for CI/E2E tests)
	if (shouldSkipDbCheck()) {
		return resolve(event);
	}

	const pathname = event.url.pathname;

	// Skip check for paths that don't require database
	if (!requiresDatabase(pathname)) {
		return resolve(event);
	}

	// Check database availability
	const isAvailable = await checkDatabaseAvailability();

	if (!isAvailable) {
		logger.warn({ pathname }, 'Database unavailable, returning error');

		// For API requests, return JSON error
		if (pathname.startsWith('/api/')) {
			throw error(503, 'Datenbank nicht verfügbar. Bitte versuchen Sie es später erneut.');
		}

		// For page requests, redirect to error page
		// Use error() instead of redirect to show the error properly
		throw error(503, 'Die Datenbank ist nicht erreichbar. Bitte versuchen Sie es später erneut.');
	}

	return resolve(event);
};
