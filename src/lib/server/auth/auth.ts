import { env, publicEnv } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import type { User } from '#lib/types/index.ts';

const logger = createLogger('auth');

// Helper to get PUBLIC_SITE_URL dynamically (runtime, not build-time)
const getPublicSiteUrl = () => publicEnv.PUBLIC_SITE_URL ?? 'http://localhost:3000';

// Helper functions to get environment variables dynamically
// This allows tests to mock the values and Docker to provide runtime configuration
const getAuth0ClientId = () => env.AUTH0_CLIENT_ID ?? '';
const getAuth0ClientSecret = () => env.AUTH0_CLIENT_SECRET ?? '';
const getAuth0Domain = () => env.AUTH0_DOMAIN ?? '';
// Getrimmt, damit Leerraum drumherum (z. B. durch `openssl rand -hex 32 > datei` oder einen
// YAML-Blockskalar) nicht den Wert unterläuft, den secretGuard.ts beim Start bereits getrimmt
// geprüft hat — sonst sagt der Guard "in Ordnung" und createCipheriv wirft erst beim ersten
// Admin-Login mit "Invalid key length" (Befund 3, #635-Review).
const getEncryptionKey = () => (env.ENCRYPTION_KEY ?? '').trim();
const getJwksUrl = () => env.JWKS_URL ?? '';
// Getrimmt und in Kleinbuchstaben, analog zur Normalisierung in secretGuard.ts
// (assertProductionSecrets): Sonst kann NODE_ENV="Production" den Startup-Guard auslösen,
// während hier `getNodeEnv() === 'production'` falsch bliebe — die Cookies (setCsrfCookie,
// setPKCECookie) würden dann ohne `secure` gesetzt (Befund 1, #668-Review).
const getNodeEnv = () => (env.NODE_ENV ?? 'development').trim().toLowerCase();
import { error, redirect, type Cookies } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { decrypt, encrypt, getPKCEChallengeData } from './crypto.js';

/**
 * Server-side role checking functions
 * These should ONLY be used on the server - never in client-side code
 */

export const isUserInRole = (user: User | null | undefined, requiredRoles?: string[]): boolean => {
	// If no roles are required, any authenticated user has access
	if (!requiredRoles || requiredRoles.length === 0) {
		return !!user;
	}

	// Check if user has at least one of the required roles
	if (user && requiredRoles.length > 0) {
		return requiredRoles.some((role) => user.roles?.includes(role));
	}

	return false;
};

export const isAdminUser = (user: User | null | undefined): boolean => {
	return isUserInRole(user, ['admin']);
};

export const isSuperAdminUser = (user: User | null | undefined): boolean => {
	return isUserInRole(user, ['superadmin']);
};

/**
 * Lazy-initialized JWKS (JSON Web Key Set) für Auth0 Token-Verifizierung.
 * createRemoteJWKSet cached Keys intern.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
	if (!jwks) {
		const jwksUrl = getJwksUrl();

		if (!jwksUrl) {
			throw new Error(
				'Configuration error: JWKS_URL environment variable is not set. ' +
					'Please configure the JWKS endpoint URL for Auth0 token verification.'
			);
		}

		let url: URL;
		try {
			url = new URL(jwksUrl);
		} catch (_e) {
			throw new Error(
				`Configuration error: JWKS_URL environment variable is invalid ("${jwksUrl}"). ` +
					'It must be a valid absolute URL (e.g. "https://example.auth0.com/.well-known/jwks.json").',
				{ cause: _e }
			);
		}

		jwks = createRemoteJWKSet(url);
	}
	return jwks;
}

/**
 * Dauer der authorization code flow Cookies in Sekunden.
 * Standard: 10 Minuten (600 Sekunden)
 */
const COOKIE_AUTHORIZE_DURATION_SECONDS = 60 * 10; // 10 Minuten

/**
 * Verifiziert ein JWT-Token von Auth0.
 *
 * Diese Funktion überprüft die Signatur des Tokens gegen den öffentlichen
 * Schlüssel von Auth0's JWKS-Endpoint. Sie stellt sicher, dass:
 * - Das Token von Auth0 ausgestellt wurde
 * - Das Token nicht manipuliert wurde
 * - Das Token noch gültig ist (nicht abgelaufen)
 *
 * @template T - Der erwartete Typ des decodierten Token-Payloads
 * @param token - Das zu verifizierende JWT-Token
 * @returns Ein Promise mit dem verifizierten und decodierten Token-Payload
 * @throws Wirft einen Fehler wenn die Verifizierung fehlschlägt
 */
export async function verifyToken<T>(token: string): Promise<T> {
	const { payload } = await jwtVerify(token, getJWKS(), {
		issuer: `https://${getAuth0Domain()}/`,
		audience: getAuth0ClientId(),
		algorithms: ['RS256']
	});
	return payload as T;
}

/**
 * Extrahiert die Claims aus einem JWT-Token ohne Verifizierung.
 *
 * WICHTIG: Diese Funktion verifiziert NICHT die Signatur des Tokens!
 * Sie sollte nur verwendet werden, wenn die Token-Verifizierung bereits
 * an anderer Stelle erfolgt ist oder wenn nur die Claims-Struktur
 * benötigt wird (z.B. um Rollen aus dem Access Token zu extrahieren).
 *
 * @template T - Der erwartete Typ der Token-Claims
 * @param token - Das JWT-Token, aus dem die Claims extrahiert werden sollen
 * @returns Die decodierten Claims oder null wenn kein Token vorhanden
 *
 * @example
 * ```typescript
 * const claims = await getTokenClaims<{ roles: string[] }>(accessToken);
 * const userRoles = claims?.roles || [];
 * ```
 */
export async function getTokenClaims<T>(token: string): Promise<T> {
	if (!token) {
		return <T>null;
	}

	try {
		return <T>decodeJwt(token);
	} catch {
		// If the token is malformed or cannot be decoded, treat it as absent
		return <T>null;
	}
}

/**
 * Tauscht einen Authorization Code gegen Access und ID Tokens.
 *
 * Diese Funktion implementiert den Token-Exchange-Schritt des OAuth 2.0
 * Authorization Code Flow mit PKCE. Sie sendet den Authorization Code
 * zusammen mit dem PKCE Verifier an Auth0's Token-Endpoint und erhält
 * im Gegenzug die Tokens.
 *
 * Der Flow:
 * 1. User wird zu Auth0 redirected mit PKCE Challenge
 * 2. Nach erfolgreicher Authentifizierung redirected Auth0 zurück mit Code
 * 3. Diese Funktion tauscht Code + Verifier gegen Tokens
 *
 * @param params - Objekt mit Authorization Code und PKCE Verifier
 * @param params.code - Der Authorization Code von Auth0
 * @param params.pkceVerifier - Der ursprüngliche PKCE Verifier (muss zum Challenge passen)
 * @returns Token-Response von Auth0 mit access_token, id_token, etc.
 *
 * @example
 * ```typescript
 * const tokens = await getToken({
 *   code: 'abc123...',
 *   pkceVerifier: 'stored_verifier_from_cookie'
 * });
 * console.log('Access Token:', tokens.access_token);
 * console.log('ID Token:', tokens.id_token);
 * ```
 */
export async function getToken({ code, pkceVerifier }: { code: string; pkceVerifier: string }) {
	const resp = await fetch(`https://${getAuth0Domain()}/oauth/token`, {
		method: 'POST',
		body: JSON.stringify({
			code,
			client_id: getAuth0ClientId(),
			client_secret: getAuth0ClientSecret(),
			redirect_uri: `${getPublicSiteUrl()}/api/auth/callback`,
			grant_type: 'authorization_code',
			code_verifier: pkceVerifier
		}),
		headers: {
			'Content-Type': 'application/json'
		}
	});
	return await resp.json();
}

/*
 * getAuthUser, setAuthCookie und clearAuthCookie sind mit dem Session-Store entfallen
 * (Issue #635). Cookie und Identität hängen jetzt ausschließlich an
 * `#lib/server/auth/sessionRepository.js` — createSession, resolveSessionUser,
 * destroySession.
 *
 * `getAuthUser` wurde gelöscht statt umgebaut, weil es genau das anbot, was hier
 * gefährlich ist: einen zweiten Weg von Cookie zu Benutzer. Ein künftiger Aufruf wäre
 * eine stille Lücke.
 *
 * Der JWKS-Teil dieser Datei (verifyToken, PKCE, CSRF-State) bleibt unverändert — er
 * prüft Auth0s Token und hat mit unserer Session nichts zu tun.
 */

/**
 * Überprüft ob ein Benutzer angemeldet ist und die erforderlichen Rollen hat.
 *
 * Diese Utility-Funktion wird in +page.server.ts und +server.ts Dateien
 * verwendet, um Routen zu schützen. Sie prüft:
 * 1. Ob der Benutzer angemeldet ist (redirect zu Login wenn nicht)
 * 2. Ob der Benutzer die erforderlichen Rollen hat (403 Fehler wenn nicht)
 *
 * @param url - Die aktuelle URL (für Return-URL nach Login)
 * @param user - Der aktuelle Benutzer oder null/undefined
 * @param requiredRoles - Optional: Array von erforderlichen Rollen
 * @throws Redirect zu Login wenn nicht angemeldet
 * @throws 403 Fehler wenn Rollen nicht vorhanden
 *
 * @example
 * ```typescript
 * // In +page.server.ts für Admin-Bereich
 * export async function load({ url, cookies }) {
 *   const user = getAuthUser(cookies);
 *   requireUserRole(url, user, ['admin']);
 *   // Code wird nur ausgeführt wenn User Admin ist
 *   return { adminData: await loadAdminData() };
 * }
 * ```
 */
export const requireUserRole = (
	url: URL,
	user: User | null | undefined,
	requiredRoles?: string[]
): void => {
	if (!user) {
		return redirect(302, `/api/auth/login?returnUrl=${url?.pathname}`);
	}
	if (!isUserInRole(user, requiredRoles)) {
		logger.warn(
			{
				event: 'security.auth_error',
				userSub: user?.sub,
				userRoles: user?.roles ?? [],
				requiredRoles,
				path: url?.pathname
			},
			'Forbidden: insufficient permissions'
		);
		throw error(403, 'Forbidden: Insufficient permissions');
	}
};

/**
 * Setzt einen CSRF-Schutz-Cookie für den OAuth-Flow.
 *
 * Diese Funktion generiert einen zufälligen State-Parameter, der sowohl
 * im Cookie als auch in der OAuth-Authorization-URL gespeichert wird.
 * Bei der Callback-Verarbeitung wird geprüft, ob beide übereinstimmen,
 * um CSRF-Angriffe zu verhindern.
 *
 * Der Cookie hat eine kurze Lebensdauer (1000 Sekunden = ~16 Minuten),
 * da er nur während des Auth-Flows benötigt wird.
 *
 * @param cookies - SvelteKit's Cookies-Objekt
 * @returns Der generierte CSRF-State-String für die Auth-URL
 *
 * @example
 * ```typescript
 * // Im Login-Handler
 * const csrfState = setCsrfCookie(cookies);
 * const authUrl = `https://auth0.com/authorize?state=${csrfState}&...`;
 * ```
 */
export const setCsrfCookie = (cookies: Cookies) => {
	// 256 Bit aus dem Krypto-Zufallsgenerator. Der frühere Ausdruck
	// `Math.random().toString(36).substring(7)` lieferte gemessen 3–7 base36-Zeichen
	// (~15–36 Bit) aus einem nicht-kryptografischen PRNG — unter dem OWASP-Minimum
	// von 128 Bit und damit als CSRF-State ratbar.
	const csrfState = randomBytes(32).toString('base64url');
	cookies.set('csrfState', csrfState, {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: COOKIE_AUTHORIZE_DURATION_SECONDS,
		path: '/api/auth',
		secure: getNodeEnv() === 'production'
	});
	return csrfState;
};

/**
 * Generiert und speichert PKCE-Daten für den OAuth 2.0 Flow.
 *
 * PKCE (Proof Key for Code Exchange) ist eine Sicherheitserweiterung für
 * OAuth 2.0, die Man-in-the-Middle-Angriffe verhindert. Diese Funktion:
 *
 * 1. Generiert ein Verifier/Challenge-Paar
 * 2. Verschlüsselt den Verifier mit AES-256-GCM
 * 3. Speichert den verschlüsselten Verifier im Cookie
 * 4. Gibt den Challenge für die Auth-URL zurück
 *
 * Der Verifier muss geheim bleiben und wird später beim Token-Exchange
 * benötigt. Die Verschlüsselung schützt vor Cookie-Diebstahl.
 *
 * Cookie-Format: "IV:EncryptedData:AuthTag" (alle hex-encoded)
 *
 * @param cookies - SvelteKit's Cookies-Objekt
 * @returns Der PKCE Challenge (SHA256-Hash des Verifiers, base64url-encoded)
 *
 * @example
 * ```typescript
 * // Im Login-Handler
 * const challenge = setPKCECookie(cookies);
 * const authUrl = `https://auth0.com/authorize?
 *   code_challenge=${challenge}&
 *   code_challenge_method=S256&...`;
 * ```
 */
export const setPKCECookie = (cookies: Cookies) => {
	const { verifier, challenge } = getPKCEChallengeData();
	const encryptedVerifier = encrypt(verifier, Buffer.from(getEncryptionKey(), 'hex'));
	const cookieValue = `${encryptedVerifier.iv.toString('hex')}:${encryptedVerifier.encryptedData.toString('hex')}:${encryptedVerifier.tag.toString('hex')}`;
	cookies.set('extendedState', cookieValue, {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: COOKIE_AUTHORIZE_DURATION_SECONDS,
		path: '/api/auth',
		secure: getNodeEnv() === 'production'
	});
	return challenge;
};

/**
 * Holt und entschlüsselt den PKCE Verifier aus dem Cookie.
 *
 * Diese Funktion wird im OAuth-Callback verwendet, um den ursprünglichen
 * PKCE Verifier zu erhalten, der für den Token-Exchange benötigt wird.
 *
 * Sicherheitsaspekte:
 * - Cookie wird sofort nach dem Lesen gelöscht (Single-Use)
 * - Verifier ist mit AES-256-GCM verschlüsselt
 * - Entschlüsselung schlägt fehl bei Manipulation (Auth-Tag)
 *
 * @param cookies - SvelteKit's Cookies-Objekt
 * @returns Der entschlüsselte PKCE Verifier oder null bei Fehler
 *
 * @example
 * ```typescript
 * // Im OAuth-Callback-Handler
 * const pkceVerifier = getPKCEVerifierFromCookie(cookies);
 * if (!pkceVerifier) {
 *   throw error(403, 'Invalid PKCE state');
 * }
 * const tokens = await getToken({ code, pkceVerifier });
 * ```
 */
export const getPKCEVerifierFromCookie = (cookies: Cookies): string | null => {
	const cookieValue = cookies.get('extendedState');
	if (!cookieValue) {
		return null;
	}
	cookies.delete('extendedState', { path: '/api/auth' });
	const [ivHex, encryptedDataHex, tagHex] = cookieValue.split(':');
	if (!ivHex || !encryptedDataHex || !tagHex) {
		return null;
	}
	const iv = Buffer.from(ivHex, 'hex');
	const encryptedData = Buffer.from(encryptedDataHex, 'hex');
	const tag = Buffer.from(tagHex, 'hex');

	const decryptedVerifier = decrypt(encryptedData, Buffer.from(getEncryptionKey(), 'hex'), iv, tag);
	return decryptedVerifier;
};
