import { env, publicEnv } from '#lib/server/env.ts';
import { setCsrfCookie, setPKCECookie } from '#lib/server/auth/auth.ts';
import { redirect, type Cookies } from '@sveltejs/kit';

export async function GET({ url, cookies }: { url: URL; cookies: Cookies }) {
	const csrfState = setCsrfCookie(cookies);
	const returnUrl = encodeURIComponent(url.searchParams.get('returnUrl') || '/');
	const challenge = setPKCECookie(cookies);
	const publicSiteUrl = publicEnv.PUBLIC_SITE_URL ?? 'http://localhost:3000';
	// Der Callback setzt diesen Marker, wenn er den Login wegen fehlender Flow-Cookies
	// neu gestartet hat. Er muss bis in die redirect_uri wandern, sonst sieht der Callback
	// ihn nach dem Auth0-Rücklauf nie wieder und ein Client, der keine Cookies annimmt,
	// pendelt endlos zwischen Login und Callback. Nur der exakte Wert '1' wird
	// weitergereicht — sonst wäre die redirect_uri über die Query fremdsteuerbar.
	const authRetry = url.searchParams.get('authRetry') === '1' ? '&authRetry=1' : '';
	const query = {
		scope: 'openid profile email',
		response_type: 'code',
		client_id: env.AUTH0_CLIENT_ID ?? '',
		redirect_uri: `${publicSiteUrl}/api/auth/callback?returnUrl=${returnUrl}${authRetry}`,
		state: csrfState,
		audience: env.API_AUDIENCE ?? '',
		code_challenge: challenge,
		code_challenge_method: 'S256'
	};

	throw redirect(
		302,
		`https://${env.AUTH0_DOMAIN}/authorize?${new URLSearchParams(query).toString()}`,
		{ external: true }
	);
}
