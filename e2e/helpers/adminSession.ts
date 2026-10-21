import type { BrowserContext } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

/**
 * adminSession.ts — ein Admin-Login für E2E-Tests, ohne Auth0 anzufassen.
 *
 * **Warum nicht über die Login-Seite:** Auth0 sagt selbst, dass
 * `/u/login/identifier` und `/u/login/password` interne Routen der
 * Universal-Login-State-Engine sind und nicht für programmatischen Zugriff
 * gedacht — das Überspringen des Identifier-Schritts wird als ungültig
 * geflaggt, weil es Account-Enumeration verhindert. Dazu kommt Bot-Detection,
 * die auf Headless-Signale anspringt. Die Login-Oberfläche gehört Auth0; sie
 * in CI zu fahren testet fremden Code und bricht, wenn Auth0 ihn ändert.
 *
 * **Was sich mit dem Session-Store geändert hat (#635):** Diese Datei signierte
 * früher ein JWT mit `SESSION_SECRET` — und war damit der laufende Beweis für
 * das Problem: Wer das Secret kannte, stellte sich eine Admin-Session für eine
 * Identität aus, die in keinem Auth0-Tenant und in keiner Datenbank existierte.
 * Genau das war der Anlass für #635.
 *
 * Jetzt schreibt sie eine Zeile in `sessions` und legt das zugehörige Token als
 * Cookie ab. Der entscheidende Unterschied: **In Produktion richtet dieser Weg
 * nichts mehr aus.** Er setzt Schreibzugriff auf die Datenbank voraus — und wer
 * den hat, braucht keine Admin-Session mehr, um Schaden anzurichten. Das ist die
 * bewusst gezogene Grenze aus §5.6 der Spec.
 *
 * **Warum ein eigener `postgres`-Client** statt `#lib/server/db/index.js`: Playwright läuft
 * als gewöhnliches Node-Programm ohne SvelteKit-Bundler — also ohne `#lib`-Alias
 * und ohne `$env/dynamic/private`. Präzedenz dafür steht in `.github/workflows/ci.yml`,
 * wo der PostGIS-Check bewusst das `postgres`-Paket statt `psql` nutzt.
 *
 * **Was dieser Weg NICHT prüft:** dass der Login funktioniert. Das ist Absicht.
 * Ein Test, der die Auth0-Oberfläche bedient, gehört nicht in die CI — wenn er
 * gebraucht wird, dann als bewusst manuell gefahrener Einzelfall.
 */

/* Playwright lädt .env nicht von sich aus. Ohne diesen Aufruf wäre
   DATABASE_POSTGRES_URL hier undefined, während der Dev-Server sie über Vite
   sehr wohl sieht — der Test liefe dann in einen Login-Redirect und die Ursache
   stünde nirgends. In CI kommt die Datei aus `cp .env.example .env` (ci.yml). */
loadEnv();

/* Die funktional einzigen Felder sind `roles` (hooks.server.ts leitet daraus
   locals.isAdmin ab, requireUserRole prüft es) und `sub` (Logging). Der Rest
   füllt src/lib/types/User.ts auf, damit die Zeile dem entspricht, was der
   echte Callback schreibt.

   `iss`/`aud`/`iat`/`exp` fehlen bewusst: Sie stammten aus unserem eigenen JWT
   und stehen seit dem Session-Store nicht mehr in `user_claims` — die absolute
   Grenze hat eine eigene Spalte. */
const ADMIN_SUB = 'e2e|design-tokens';

const ADMIN_CLAIMS = {
	name: 'E2E Design-Tokens',
	nickname: 'e2e',
	email: 'e2e@example.invalid',
	email_verified: true,
	picture: '',
	updated_at: '2026-01-01T00:00:00.000Z',
	sid: 'e2e-session'
};

/**
 * Inaktivitätsfenster der Test-Session — gespiegelt aus `SESSION_IDLE_SECONDS`
 * (`src/lib/server/auth/sessionRepository.ts`), das hier nicht importierbar ist.
 *
 * Bewusst derselbe Wert wie in Produktion und **nicht** großzügiger: Sonst prüfte der
 * E2E-Pfad ein Ablaufverhalten, das es so nicht gibt. Die Fixture kommt damit aus, weil
 * `touchSession` das Fenster bei jedem Request fortschreibt, der mehr als eine Minute
 * nach dem letzten liegt — eine Stunde echter Untätigkeit gibt es in keinem Testlauf.
 */
const IDLE_SECONDS = 60 * 60;

/**
 * Absolute Grenze, die in Produktion der `exp` des Auth0-ID-Tokens setzt.
 *
 * Hier großzügig gewählt, damit ein langsamer CI-Lauf nicht mitten in der Suite gegen sie
 * läuft. Sie ist die einzige Grenze, die `touchSession` nicht verschieben kann — deshalb
 * muss der Puffer hier sitzen und nicht im Inaktivitätsfenster.
 */
const ABSOLUTE_HOURS = 12;

/**
 * Legt ein gültiges Admin-Session-Cookie in den Browser-Context.
 *
 * Muss vor dem ersten `page.goto()` auf eine geschützte Route laufen.
 *
 * `roles` ist überschreibbar, weil einzelne Bedienelemente `superadmin`
 * verlangen (die Mail-Aktion in `/admin`, siehe admin-detail-actions.spec.ts).
 * Der Default bleibt `['admin']` — die Rolle, in der der Admin-Bereich täglich
 * benutzt wird, und damit die richtige Grundannahme für jeden anderen Spec.
 */
export async function seedAdminSession(
	context: BrowserContext,
	baseURL: string,
	roles: string[] = ['admin']
): Promise<void> {
	const databaseUrl = process.env.DATABASE_POSTGRES_URL;
	if (!databaseUrl) {
		throw new Error(
			'DATABASE_POSTGRES_URL fehlt — ohne Datenbank kann keine Session-Zeile angelegt werden. ' +
				'Lokal steht sie in .env, in CI entsteht sie aus .env.example (ci.yml, Schritt „Setup environment").'
		);
	}

	const token = randomBytes(32).toString('base64url');
	const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
	const now = Date.now();
	const expiresAt = new Date(now + IDLE_SECONDS * 1000);
	const absoluteExpiresAt = new Date(now + ABSOLUTE_HOURS * 60 * 60 * 1000);

	const sql = postgres(databaseUrl, { max: 1 });
	try {
		/* Alte Zeilen derselben Testidentität wegräumen, aber nur abgelaufene/widerrufene —
		   nicht unconditional. `fullyParallel: true` ruft diese Funktion für dieselbe
		   ADMIN_SUB aus mehreren Workern gleichzeitig auf (design-tokens.spec.ts hat vier
		   auth-Routen mit je drei Tests); ein unconditional DELETE hier löschte die gerade
		   erst eingefügte, noch gültige Zeile eines parallel laufenden Tests, dessen
		   nachfolgender page.goto() dann auf einen Login-Redirect lief statt auf die Seite,
		   die der Scan messen sollte — sichtbar als flaky Design-Token-Verstoß auf
		   wechselnden Admin-Routen. Dieselbe Bedingung wie in sessionRepository.ts
		   createSession() (dort revoked_at, expires_at, absolute_expires_at): mehrere
		   gültige Sessions pro sub sind kein Sonderfall, sondern der Normalzustand, weil
		   resolveSessionUser ausschließlich über token_hash sucht. */
		await sql`
			DELETE FROM sessions
			WHERE sub = ${ADMIN_SUB}
				AND (revoked_at IS NOT NULL OR expires_at < NOW() OR absolute_expires_at < NOW())
		`;

		await sql`
			INSERT INTO sessions (token_hash, sub, roles, user_claims, expires_at, absolute_expires_at)
			VALUES (
				${tokenHash},
				${ADMIN_SUB},
				${sql.array(roles)},
				${sql.json(ADMIN_CLAIMS)},
				${expiresAt},
				${absoluteExpiresAt}
			)
		`;
	} finally {
		// Sonst hält der offene Pool den Playwright-Prozess am Leben.
		await sql.end({ timeout: 5 });
	}

	/* sameSite bewusst 'Lax' statt des 'None', das die App produziert.
	   'None' verlangt im Browser zwingend das Secure-Flag, und der CI-Dev-Server
	   läuft über plain http (vite.config.ci.ts lässt basicSsl weg). Entscheidend ist
	   allein das Schema — Host und Port stehen hier bewusst nicht, sie kommen aus
	   playwright.config.ts und sind über VITE_DEV_PORT verschiebbar. 'Lax' entkoppelt
	   das Fixture von dieser Frage und reicht vollständig aus: Die Attribute steuern
	   nur, WANN der Browser den Cookie mitsendet, und die Tests navigieren
	   ausschließlich direkt auf die eigene Origin. Der Server liest nur den Wert.

	   Dass die App selbst 'None' braucht, ist eine Anforderung der
	   iframe-Einbettung auf meeresmuseum.de und wird hier nicht mitgetestet. */
	await context.addCookies([
		{
			name: process.env.COOKIE_NAME ?? 'auth-cookie',
			value: token,
			url: baseURL,
			httpOnly: true,
			secure: new URL(baseURL).protocol === 'https:',
			sameSite: 'Lax'
		}
	]);
}
