import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSetCsrfCookie, mockSetPKCECookie } = vi.hoisted(() => ({
	mockSetCsrfCookie: vi.fn().mockReturnValue('csrf-state'),
	mockSetPKCECookie: vi.fn().mockReturnValue('pkce-challenge')
}));

vi.mock('#lib/server/env.ts', () => ({
	env: {
		AUTH0_CLIENT_ID: 'client-id',
		AUTH0_DOMAIN: 'id.test',
		API_AUDIENCE: 'https://api.test'
	},
	publicEnv: { PUBLIC_SITE_URL: 'https://test-site.com' }
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	setCsrfCookie: mockSetCsrfCookie,
	setPKCECookie: mockSetPKCECookie
}));

import { GET } from './+server';

/** Führt GET aus und liefert die redirect_uri, die an Auth0 gesendet würde. */
async function redirectUriFor(query: string): Promise<string> {
	let thrown: unknown;
	await GET({
		url: new URL(`https://test-site.com/api/auth/login${query}`),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
	} as never).catch((e) => {
		thrown = e;
	});

	const location = (thrown as { location?: string })?.location ?? '';
	const authorizeUrl = new URL(location);
	return authorizeUrl.searchParams.get('redirect_uri') ?? '';
}

describe('GET /api/auth/login — Schleifenschutz', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSetCsrfCookie.mockReturnValue('csrf-state');
		mockSetPKCECookie.mockReturnValue('pkce-challenge');
	});

	// Der Callback setzt authRetry=1, wenn er den Login wegen fehlender Flow-Cookies
	// neu startet. Trägt die Login-Route den Marker nicht bis in die redirect_uri, sieht
	// der Callback ihn nach dem Auth0-Rücklauf nie — ein Client, der keine Cookies
	// annimmt, pendelt dann endlos zwischen Login und Callback.
	it('trägt authRetry=1 bis in die redirect_uri, damit der Callback es wiedersieht', async () => {
		const redirectUri = await redirectUriFor('?returnUrl=%2Fadmin&authRetry=1');

		expect(redirectUri).toContain('authRetry=1');
		expect(new URL(redirectUri).searchParams.get('returnUrl')).toBe('/admin');
	});

	it('hängt ohne Marker kein authRetry an', async () => {
		const redirectUri = await redirectUriFor('?returnUrl=%2Fadmin');

		expect(redirectUri).not.toContain('authRetry');
	});

	// Nur der exakte Wert '1' wird weitergereicht — sonst wäre die redirect_uri ein
	// Einfallstor für beliebige, vom Aufrufer gesteuerte Query-Parameter.
	it('reicht nur den Wert 1 weiter, keinen beliebigen Fremdwert', async () => {
		const redirectUri = await redirectUriFor('?returnUrl=%2Fadmin&authRetry=schadhaft');

		expect(redirectUri).not.toContain('authRetry');
		expect(redirectUri).not.toContain('schadhaft');
	});
});
