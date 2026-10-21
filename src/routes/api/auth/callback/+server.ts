import { env } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import {
	getPKCEVerifierFromCookie,
	getToken,
	getTokenClaims,
	verifyToken
} from '#lib/server/auth/auth.ts';
import { createSession } from '#lib/server/auth/sessionRepository.ts';
import { sanitizeReturnUrl } from '#lib/server/auth/returnUrl.ts';
import type { User } from '#lib/types/index.ts';
import { error, redirect, type Cookies } from '@sveltejs/kit';

const logger = createLogger('auth:auth0');

export async function GET({ url, cookies }: { url: URL; cookies: Cookies }) {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	let returnUrl = url.searchParams.get('returnUrl') || '/';

	if (returnUrl.includes('/__data.json')) {
		returnUrl = returnUrl.replace('/__data.json', '');
	}

	const csrfState = cookies.get('csrfState');
	const pkceVerifier = getPKCEVerifierFromCookie(cookies);

	// Ein vorhandener State, der nicht passt, ist das einzige echte CSRF-Signal — nur dann
	// darf hart abgewiesen werden.
	const stateContradicts = !!csrfState && state !== csrfState;

	// Sonst ist ein fehlendes Flow-Cookie bei vorhandenem code ein abgelaufener oder
	// verbrauchter Flow, kein Angriff: Die Cookies leben 10 Minuten
	// (COOKIE_AUTHORIZE_DURATION_SECONDS), Auth0 zeigt bei nicht verifizierbaren
	// Callback-URIs wie localhost immer einen nicht abschaltbaren Consent-Screen, und der
	// PKCE-Verifier ist Single-Use — ein zweiter Callback mit demselben code (Reload,
	// Zurück-Taste, wiederhergestellter Tab) findet ihn nie wieder vor. Alle drei Fälle
	// landeten bisher auf einer 403-Sackgasse statt in einem neuen Login.
	const flowUnusable = !csrfState || !pkceVerifier;
	// Einmaliger Neustart: ohne Marker drehte ein Client, der grundsätzlich keine Cookies
	// annimmt, endlos zwischen Login und Callback.
	const alreadyRetried = url.searchParams.get('authRetry') === '1';

	if (!stateContradicts && flowUnusable && code && !alreadyRetried) {
		logger.warn(
			{ event: 'security.auth_flow_expired', returnUrl },
			'Auth callback: Flow-Cookies abgelaufen oder verbraucht — Login wird neu gestartet'
		);
		const target = new URL('/api/auth/login', url);
		target.searchParams.set('returnUrl', sanitizeReturnUrl(returnUrl));
		target.searchParams.set('authRetry', '1');
		redirect(302, `${target.pathname}${target.search}`);
	}

	if (state !== csrfState || !code || !pkceVerifier) {
		logger.warn(
			{
				event: 'security.csrf_mismatch',
				stateMatch: state === csrfState,
				hasCode: !!code,
				hasPkce: !!pkceVerifier
			},
			'Auth callback: CSRF state mismatch or missing parameters'
		);
		throw error(403, 'Invalid state');
	}

	try {
		// Token-Austausch mit Auth0
		const token = await getToken({ code, pkceVerifier });

		const authUser = (await verifyToken(token.id_token)) as User;

		const rolesClaim = `${env.API_AUDIENCE}/roles`;
		const claims = await getTokenClaims<Record<string, string[]>>(token.access_token);

		authUser.roles = claims[rolesClaim] || [];

		await createSession(cookies, authUser);
		// Fire-and-forget: audit write must not delay the redirect (login latency)
		void logAuditEvent({
			action: 'auth.login_success',
			resourceType: 'auth',
			userEmail: authUser.email
		});
		// Pfad muss mit setCsrfCookie übereinstimmen — ein delete auf '/' adressiert ein
		// anderes Cookie und ließ das echte bis zum Ablauf stehen.
		cookies.delete('csrfState', { path: '/api/auth' });
		// Open-Redirect-Schutz: nur relative Same-Origin-Pfade zulassen
		redirect(302, sanitizeReturnUrl(returnUrl));
	} catch (err) {
		// SvelteKit redirect() throws internally — re-throw without treating as error
		if (err instanceof Response || (err as { status?: number })?.status === 302) {
			throw err;
		}
		logger.warn({ event: 'security.auth_error', err }, 'Failed to get token');
		await logAuditEvent({
			action: 'auth.login_failure',
			resourceType: 'auth',
			status: 'failure'
		});
		return error(500, 'Authentication failed');
	}
}
