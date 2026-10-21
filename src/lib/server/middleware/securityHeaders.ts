import type { Handle } from '@sveltejs/kit/hooks';

export function createSecurityHeadersHandler(nodeEnv: string): Handle {
	return async ({ event, resolve }) => {
		const response = await resolve(event);

		// Security Headers (CSP is configured in svelte.config.js)
		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=*');
		response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

		// Cross-Origin headers
		response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
		response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

		// HSTS for production (HTTPS only)
		if (event.url.protocol === 'https:') {
			response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
		}

		// Development-specific CORS headers
		if (nodeEnv === 'development') {
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			response.headers.set('Access-Control-Allow-Credentials', 'true');
		}

		// Hinweis: Der Session-Cookie wird direkt in auth.ts mit SameSite=None; Secure
		// gesetzt (nötig für die iframe-Einbettung auf meeresmuseum.de). Ein nachträglicher
		// Header-Rewrite ist daher nicht mehr erforderlich.

		return response;
	};
}
