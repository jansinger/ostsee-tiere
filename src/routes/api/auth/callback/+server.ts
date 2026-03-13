import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/logger';
import {
	getPKCEVerifierFromCookie,
	getToken,
	getTokenClaims,
	setAuthCookie,
	verifyToken
} from '$lib/server/auth/auth.js';
import type { User } from '$lib/types';
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

	if (state !== csrfState || !code || !pkceVerifier) {
		throw error(403, 'Invalid state');
	}

	try {
		logger.debug({ code }, 'code');

		// Token-Austausch mit Auth0
		const token = await getToken({ code, pkceVerifier });
		logger.debug({ token }, 'token');

		const authUser = (await verifyToken(token.id_token)) as User;
		logger.debug({ authUser }, 'authUser');

		const rolesClaim = `${env.API_AUDIENCE}/roles`;
		const claims = await getTokenClaims<Record<string, string[]>>(token.access_token);
		logger.debug({ claims }, 'claims');

		authUser.roles = claims[rolesClaim] || [];

		await setAuthCookie(cookies, authUser);
		cookies.delete('csrfState', { path: '/' });
	} catch (err) {
		logger.info({ err }, 'Failed to get token');
		return error(500, `Failed to get token. Err: ${err}`);
	}
	return redirect(302, returnUrl);
}
