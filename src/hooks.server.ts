import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/logger';
import { clearAuthCookie, setAuthCookie } from '$lib/server/auth/auth';
import { databaseCheck } from '$lib/server/middleware/databaseCheck';
import { maintenanceMode } from '$lib/server/middleware/maintenanceMode';
import { createSecurityHeadersHandler } from '$lib/server/middleware/securityHeaders';
import type { User } from '$lib/types/index';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { randomBytes } from 'crypto';
import { jwtVerify } from 'jose';

// Dynamic environment variables for Docker runtime
const COOKIE_NAME = env.COOKIE_NAME ?? 'auth-cookie';
const NODE_ENV = env.NODE_ENV ?? 'development';
const SESSION_SECRET = env.SESSION_SECRET ?? '';

const logger = createLogger('hooks:server');

// Guard: fail fast if SESSION_SECRET is missing in production
if (NODE_ENV === 'production' && !SESSION_SECRET) {
	throw new Error(
		'SESSION_SECRET environment variable is required in production. ' +
			'Set it to a strong random secret before starting the server.'
	);
}

const setAdditionalHeaders: Handle = createSecurityHeadersHandler(NODE_ENV);

/**
 * Authentication handler
 */
const authentication: Handle = async ({ event, resolve }) => {
	// Disable CSRF protection for legacy REST API endpoints (mobile app compatibility)
	if (event.url.pathname.startsWith('/rest_sichtungen')) {
		logger.debug(
			{ pathname: event.url.pathname },
			'Processing legacy API endpoint - CSRF bypass needed'
		);
		// SvelteKit's CSRF protection can be bypassed by handling in the route itself
	}

	// Generate CSP nonce
	const nonce = randomBytes(16).toString('base64');
	event.locals.cspNonce = nonce;

	// Authentication
	const cookie = event.cookies.get(COOKIE_NAME);
	const url = new URL(event.request.url);

	logger.debug({ pathname: url.pathname }, 'Authentication check');

	let user = null;
	if (cookie) {
		try {
			// Extend the cookie
			const secret = new TextEncoder().encode(SESSION_SECRET);
			const { payload } = await jwtVerify(cookie, secret);
			user = payload as unknown as User;
			logger.debug({ userSub: user?.sub }, 'Authenticated user');
			await setAuthCookie(event.cookies, user);
			// Set user in locals for access in components
			event.locals.user = user;
			// Set admin flag for easier access
			event.locals.isAdmin = user?.roles?.includes('admin') || false;
		} catch (error) {
			logger.error({ error }, 'Failed to verify cookie, deleting it');
			clearAuthCookie(event.cookies);
		}
	}

	return resolve(event);
};

/**
 * SvelteKit Handle Hook - Combines multiple middleware in sequence
 *
 * WICHTIG: CSP wird in svelte.config.js konfiguriert (Vercel-optimiert)
 * Hier werden Middleware in der richtigen Reihenfolge ausgeführt
 */
export const handle: Handle = sequence(
	databaseCheck, // First: Check database availability
	maintenanceMode, // Second: Check maintenance mode
	authentication, // Third: Handle authentication
	setAdditionalHeaders // Fourth: Set security headers
);
