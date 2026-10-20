import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockLogAuditEvent,
	mockGetToken,
	mockVerifyToken,
	mockGetTokenClaims,
	mockCreateSession,
	mockGetPKCEVerifier,
	mockLoggerWarn
} = vi.hoisted(() => ({
	mockLogAuditEvent: vi.fn().mockResolvedValue(undefined),
	mockGetToken: vi.fn(),
	mockVerifyToken: vi.fn(),
	mockGetTokenClaims: vi.fn(),
	mockCreateSession: vi.fn().mockResolvedValue(undefined),
	mockGetPKCEVerifier: vi.fn().mockReturnValue('pkce-verifier'),
	mockLoggerWarn: vi.fn()
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: mockLogAuditEvent
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: mockLoggerWarn, error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: mockLoggerWarn, error: vi.fn() })
}));

vi.mock('#lib/server/env.ts', () => ({
	env: { API_AUDIENCE: 'https://api.test', COOKIE_NAME: 'auth-cookie' }
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	getPKCEVerifierFromCookie: mockGetPKCEVerifier,
	getToken: mockGetToken,
	getTokenClaims: mockGetTokenClaims,
	verifyToken: mockVerifyToken
}));

/* Seit dem Session-Store legt der Callback eine Zeile an, statt ein JWT zu signieren (#635). */
vi.mock('#lib/server/auth/sessionRepository.ts', () => ({
	createSession: mockCreateSession
}));

import { GET } from './+server';
import { sanitizeReturnUrl } from '#lib/server/auth/returnUrl.ts';

function makeCookies() {
	return {
		get: vi.fn().mockImplementation((name: string) => {
			if (name === 'csrfState') return 'valid-csrf';
			return undefined;
		}),
		delete: vi.fn()
	};
}

describe('GET /api/auth/callback — Audit Logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetPKCEVerifier.mockReturnValue('pkce-verifier');
	});

	it('loggt auth.login_success bei erfolgreichem Login', async () => {
		mockGetToken.mockResolvedValue({ id_token: 'id-tok', access_token: 'access-tok' });
		mockVerifyToken.mockResolvedValue({ email: 'user@test.com', sub: 'auth0|123' });
		mockGetTokenClaims.mockResolvedValue({ 'https://api.test/roles': ['admin'] });

		await GET({
			url: new URL('http://localhost/api/auth/callback?code=auth-code&state=valid-csrf'),
			cookies: makeCookies()
		} as never).catch(() => {});

		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'auth.login_success',
				resourceType: 'auth',
				userEmail: 'user@test.com'
			})
		);
	});

	it('loggt auth.login_failure bei fehlgeschlagenem Token-Tausch', async () => {
		mockGetToken.mockRejectedValue(new Error('invalid_grant'));

		await GET({
			url: new URL('http://localhost/api/auth/callback?code=bad-code&state=valid-csrf'),
			cookies: makeCookies()
		} as never).catch(() => {});

		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'auth.login_failure',
				resourceType: 'auth',
				status: 'failure'
			})
		);
	});

	it('loggt KEIN auth.login_failure bei erfolgreichem Login (redirect wird nicht als Fehler behandelt)', async () => {
		mockGetToken.mockResolvedValue({ id_token: 'id-tok', access_token: 'access-tok' });
		mockVerifyToken.mockResolvedValue({ email: 'user@test.com', sub: 'auth0|123' });
		mockGetTokenClaims.mockResolvedValue({ 'https://api.test/roles': ['admin'] });

		await GET({
			url: new URL('http://localhost/api/auth/callback?code=auth-code&state=valid-csrf'),
			cookies: makeCookies()
		} as never).catch(() => {});

		const loginFailureCalls = mockLogAuditEvent.mock.calls.filter(
			(call) => call[0]?.action === 'auth.login_failure'
		);
		expect(loginFailureCalls).toHaveLength(0);
	});

	it('normalisiert eine externe returnUrl auf / (Open-Redirect-Schutz)', async () => {
		mockGetToken.mockResolvedValue({ id_token: 'id-tok', access_token: 'access-tok' });
		mockVerifyToken.mockResolvedValue({ email: 'user@test.com', sub: 'auth0|123' });
		mockGetTokenClaims.mockResolvedValue({ 'https://api.test/roles': ['admin'] });

		let thrown: unknown;
		await GET({
			url: new URL(
				'http://localhost/api/auth/callback?code=auth-code&state=valid-csrf&returnUrl=https://evil.com'
			),
			cookies: makeCookies()
		} as never).catch((e) => {
			thrown = e;
		});

		expect((thrown as { status?: number; location?: string })?.status).toBe(302);
		expect((thrown as { location?: string })?.location).toBe('/');
	});

	it('lässt einen legitimen relativen Pfad durch (/admin)', async () => {
		mockGetToken.mockResolvedValue({ id_token: 'id-tok', access_token: 'access-tok' });
		mockVerifyToken.mockResolvedValue({ email: 'user@test.com', sub: 'auth0|123' });
		mockGetTokenClaims.mockResolvedValue({ 'https://api.test/roles': ['admin'] });

		let thrown: unknown;
		await GET({
			url: new URL(
				'http://localhost/api/auth/callback?code=auth-code&state=valid-csrf&returnUrl=/admin'
			),
			cookies: makeCookies()
		} as never).catch((e) => {
			thrown = e;
		});

		expect((thrown as { location?: string })?.location).toBe('/admin');
	});

	it('loggt security.csrf_mismatch warn bei ungültigem State', async () => {
		const cookiesWithMismatch = {
			get: vi.fn().mockImplementation((name: string) => {
				if (name === 'csrfState') return 'expected-csrf';
				return undefined;
			}),
			delete: vi.fn()
		};

		await GET({
			url: new URL('http://localhost/api/auth/callback?code=auth-code&state=wrong-csrf'),
			cookies: cookiesWithMismatch
		} as never).catch(() => {});

		expect(mockLoggerWarn).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'security.csrf_mismatch' }),
			expect.any(String)
		);
	});

	it('löscht csrfState unter dem Pfad, unter dem es gesetzt wurde (/api/auth)', async () => {
		mockGetToken.mockResolvedValue({ id_token: 'id-tok', access_token: 'access-tok' });
		mockVerifyToken.mockResolvedValue({ email: 'user@test.com', sub: 'auth0|123' });
		mockGetTokenClaims.mockResolvedValue({ 'https://api.test/roles': ['admin'] });

		const cookies = makeCookies();
		await GET({
			url: new URL('http://localhost/api/auth/callback?code=auth-code&state=valid-csrf'),
			cookies
		} as never).catch(() => {});

		// Gesetzt wird das Cookie in setCsrfCookie mit path: '/api/auth'. Ein delete mit
		// path: '/' adressiert ein anderes Cookie und lässt das echte 10 Minuten stehen.
		expect(cookies.delete).toHaveBeenCalledWith('csrfState', { path: '/api/auth' });
	});
});

/**
 * Der abgelaufene Flow ist kein Angriff, sondern der Normalfall: Auth0 zeigt bei
 * localhost-Callbacks immer einen Consent-Screen (nicht abschaltbar), und die
 * Flow-Cookies leben nur 10 Minuten. Wer dort zu lange braucht — oder den
 * Callback-Tab wiederherstellt — landete bisher auf einer 403-Sackgasse.
 */
describe('GET /api/auth/callback — abgelaufener oder verbrauchter Flow', () => {
	const noFlowCookies = () => ({
		get: vi.fn().mockReturnValue(undefined),
		delete: vi.fn()
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetPKCEVerifier.mockReturnValue(null);
	});

	it('startet den Login neu, wenn beide Flow-Cookies fehlen', async () => {
		let thrown: unknown;
		await GET({
			url: new URL('http://localhost/api/auth/callback?returnUrl=/admin&code=auth-code&state=x'),
			cookies: noFlowCookies()
		} as never).catch((e) => {
			thrown = e;
		});

		const r = thrown as { status?: number; location?: string };
		expect(r?.status).toBe(302);
		expect(r?.location).toBe('/api/auth/login?returnUrl=%2Fadmin&authRetry=1');
	});

	it('meldet den abgelaufenen Flow als eigenes Event, nicht als csrf_mismatch', async () => {
		await GET({
			url: new URL('http://localhost/api/auth/callback?returnUrl=/admin&code=auth-code&state=x'),
			cookies: noFlowCookies()
		} as never).catch(() => {});

		expect(mockLoggerWarn).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'security.auth_flow_expired' }),
			expect.any(String)
		);
		const csrfCalls = mockLoggerWarn.mock.calls.filter(
			(call) => (call[0] as { event?: string })?.event === 'security.csrf_mismatch'
		);
		expect(csrfCalls).toHaveLength(0);
	});

	it('dreht keine Endlosschleife: nach einem Neustart wird abgebrochen', async () => {
		let thrown: unknown;
		await GET({
			url: new URL(
				'http://localhost/api/auth/callback?returnUrl=/admin&code=auth-code&state=x&authRetry=1'
			),
			cookies: noFlowCookies()
		} as never).catch((e) => {
			thrown = e;
		});

		expect((thrown as { status?: number })?.status).toBe(403);
	});

	it('bleibt bei vorhandenem, aber abweichendem State bei 403 (echter CSRF-Verdacht)', async () => {
		mockGetPKCEVerifier.mockReturnValue('pkce-verifier');

		let thrown: unknown;
		await GET({
			url: new URL('http://localhost/api/auth/callback?returnUrl=/admin&code=auth-code&state=böse'),
			cookies: {
				get: vi.fn().mockImplementation((n: string) => (n === 'csrfState' ? 'echt' : undefined)),
				delete: vi.fn()
			}
		} as never).catch((e) => {
			thrown = e;
		});

		expect((thrown as { status?: number })?.status).toBe(403);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'security.csrf_mismatch' }),
			expect.any(String)
		);
	});

	// Der PKCE-Verifier wird beim Lesen gelöscht (Single-Use), csrfState überlebt bis zum
	// Ablauf. Ein zweiter Callback mit demselben code — Reload, Zurück-Taste, doppelt
	// zugestellter Request — trifft deshalb auf „State passt, Verifier weg". Das ist ein
	// verbrauchter Flow, kein Angriff.
	it('startet neu, wenn nur der PKCE-Verifier verbraucht ist und der State noch passt', async () => {
		let thrown: unknown;
		await GET({
			url: new URL('http://localhost/api/auth/callback?returnUrl=/admin&code=auth-code&state=echt'),
			cookies: {
				get: vi.fn().mockImplementation((n: string) => (n === 'csrfState' ? 'echt' : undefined)),
				delete: vi.fn()
			}
		} as never).catch((e) => {
			thrown = e;
		});

		const r = thrown as { status?: number; location?: string };
		expect(r?.status).toBe(302);
		expect(r?.location).toBe('/api/auth/login?returnUrl=%2Fadmin&authRetry=1');
	});

	it('startet nicht neu, wenn der code fehlt (kein Auth0-Rücklauf)', async () => {
		let thrown: unknown;
		await GET({
			url: new URL('http://localhost/api/auth/callback?returnUrl=/admin'),
			cookies: noFlowCookies()
		} as never).catch((e) => {
			thrown = e;
		});

		expect((thrown as { status?: number })?.status).toBe(403);
	});
});

describe('sanitizeReturnUrl', () => {
	it('normalisiert externe und protokoll-relative URLs auf /', () => {
		expect(sanitizeReturnUrl('https://evil.com')).toBe('/');
		expect(sanitizeReturnUrl('//evil.com')).toBe('/');
		expect(sanitizeReturnUrl('/\\evil.com')).toBe('/');
		expect(sanitizeReturnUrl('http://evil.com/pfad')).toBe('/');
	});

	it('blockt Whitespace-Bypässe (Tab/CR/LF werden vom URL-Parser gestrippt)', () => {
		// '/\t/evil.com' würde sonst zu 'http://evil.com/' auflösen
		expect(sanitizeReturnUrl('/\t/evil.com')).toBe('/');
		expect(sanitizeReturnUrl('/\tevil.com')).toBe('/');
		expect(sanitizeReturnUrl('/\n/evil.com')).toBe('/');
		expect(sanitizeReturnUrl('/\r/evil.com')).toBe('/');
		expect(sanitizeReturnUrl('/ /evil.com')).toBe('/');
	});

	it('normalisiert leere/ungültige Werte auf /', () => {
		expect(sanitizeReturnUrl(null)).toBe('/');
		expect(sanitizeReturnUrl(undefined)).toBe('/');
		expect(sanitizeReturnUrl('')).toBe('/');
		expect(sanitizeReturnUrl('admin')).toBe('/');
	});

	it('lässt legitime relative Pfade durch', () => {
		expect(sanitizeReturnUrl('/admin')).toBe('/admin');
		expect(sanitizeReturnUrl('/map')).toBe('/map');
		expect(sanitizeReturnUrl('/')).toBe('/');
		expect(sanitizeReturnUrl('/admin/sightings?year=2024')).toBe('/admin/sightings?year=2024');
	});
});
