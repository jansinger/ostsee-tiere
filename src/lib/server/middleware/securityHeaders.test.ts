import type { Handle } from '@sveltejs/kit/hooks';
import { describe, it, expect } from 'vitest';
import { createSecurityHeadersHandler } from '#lib/server/middleware/securityHeaders.ts';

function createMockEvent(overrides: { protocol?: string; cookies?: string } = {}) {
	return {
		url: { protocol: overrides.protocol ?? 'https:' },
		request: new Request('https://localhost/'),
		locals: {},
		cookies: {},
		params: {},
		route: { id: '/' },
		isDataRequest: false,
		isSubRequest: false,
		platform: undefined
	};
}

function createMockResponse(headers: Record<string, string> = {}): Response {
	const h = new Headers(headers);
	return new Response(null, { headers: h });
}

async function runHandler(
	nodeEnv: string,
	eventOverrides: { protocol?: string; cookies?: string } = {},
	responseHeaders: Record<string, string> = {}
): Promise<Response> {
	const handler = createSecurityHeadersHandler(nodeEnv);
	const event = createMockEvent(eventOverrides);
	const resolve = async () => createMockResponse(responseHeaders);
	return handler({
		event: event as Parameters<Handle>[0]['event'],
		resolve: resolve as Parameters<Handle>[0]['resolve']
	});
}

describe('securityHeaders', () => {
	it('sets X-Content-Type-Options', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('sets Referrer-Policy', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('sets Permissions-Policy', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('Permissions-Policy')).toBe(
			'camera=(), microphone=(), geolocation=*'
		);
	});

	it('sets X-Permitted-Cross-Domain-Policies', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('X-Permitted-Cross-Domain-Policies')).toBe('none');
	});

	it('sets Cross-Origin-Opener-Policy to same-origin-allow-popups', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
	});

	it('sets Cross-Origin-Resource-Policy to cross-origin', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
	});

	it('does NOT set Cross-Origin-Embedder-Policy', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
	});

	it('sets HSTS for HTTPS', async () => {
		const response = await runHandler('production', { protocol: 'https:' });
		expect(response.headers.get('Strict-Transport-Security')).toBe(
			'max-age=31536000; includeSubDomains'
		);
	});

	it('does not set HSTS for HTTP', async () => {
		const response = await runHandler('production', { protocol: 'http:' });
		expect(response.headers.get('Strict-Transport-Security')).toBeNull();
	});

	it('sets CORS headers in development mode', async () => {
		const response = await runHandler('development');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
			'GET, POST, PUT, DELETE, OPTIONS'
		);
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
			'Content-Type, Authorization'
		);
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
	});

	it('does not set CORS headers in production', async () => {
		const response = await runHandler('production');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});

	it('leaves Set-Cookie headers unveraendert (kein SameSite-Rewrite mehr)', async () => {
		// Der Session-Cookie wird jetzt direkt in auth.ts mit SameSite=None; Secure gesetzt.
		// Die Middleware darf Set-Cookie-Header nicht mehr umschreiben.
		const response = await runHandler(
			'production',
			{},
			{ 'Set-Cookie': 'auth-cookie=abc; SameSite=None; Secure' }
		);
		expect(response.headers.get('Set-Cookie')).toBe('auth-cookie=abc; SameSite=None; Secure');
	});
});
