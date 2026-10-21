import { env } from '#lib/server/env.ts';
import { LOCALE_COOKIE } from '#lib/i18n/localeCookie.ts';
import { zielFuerStartseite } from '#lib/i18n/startseitenWeiterleitung.ts';
import { createLogger } from '#lib/logger.server.ts';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { resolveSessionUser } from '#lib/server/auth/sessionRepository.ts';
import { verlaengertSession } from '#lib/server/auth/sessionTouchExemption.ts';
import { assertProductionSecrets } from '#lib/server/config/secretGuard.ts';
import { closeDb } from '#lib/server/db/index.ts';
import { databaseCheck } from '#lib/server/middleware/databaseCheck.ts';
import { maintenanceMode } from '#lib/server/middleware/maintenanceMode.ts';
import { noindexEnglishPages } from '#lib/server/middleware/noindexEnglishPages.ts';
import { createSecurityHeadersHandler } from '#lib/server/middleware/securityHeaders.ts';
import { warnIfBodySizeLimitTooLow } from '#lib/server/startup/bodySizeLimit.ts';
import { formatStartupBanner, getBuildInfo } from '#lib/server/startup/versionInfo.ts';
import { buildErrorLogEntry, caughtErrorOutcome } from '#lib/server/utils/errorChain.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { ServerConfigService } from '#lib/services/configService.ts';
import { sequence, type Handle, type HandleServerError } from '@sveltejs/kit/hooks';
import { randomUUID } from 'crypto';

// Dynamic environment variables for Docker runtime
const NODE_ENV = env.NODE_ENV ?? 'development';
const ENCRYPTION_KEY = env.ENCRYPTION_KEY ?? '';

const logger = createLogger('hooks:server');

// gitSha/buildDate kommen aus den Docker-Build-Args VCS_REF/BUILD_DATE (siehe Dockerfile)
// und existieren nur im Container-Image. Ein lokaler `npm run dev` hat sie nicht —
// formatStartupBanner zeigt das dann bewusst als "unknown", statt eine falsche
// Versionsangabe vorzutäuschen.
const buildInfo = getBuildInfo();
logger.info({ ...buildInfo, nodeEnv: NODE_ENV }, formatStartupBanner(buildInfo, NODE_ENV));

// Guard: Der Server startet in Produktion nicht mit einem fehlenden oder unbrauchbaren
// ENCRYPTION_KEY. Die Prüflogik steht in secretGuard.ts, damit sie testbar ist —
// hooks.server.ts liegt ausserhalb von src/lib/** und wird von den Server-Tests nicht erfasst.
// SESSION_SECRET wird seit dem Session-Store (#635) nicht mehr verwendet und deshalb auch
// nicht mehr geprüft.
assertProductionSecrets({ NODE_ENV, ENCRYPTION_KEY });

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

	// Hinweis: Es wird bewusst KEIN CSP-Nonce erzeugt. Das CSP in svelte.config.js
	// nutzt 'unsafe-inline' (für die Scalar-API-Doku), daher hätte ein Nonce keine
	// Schutzwirkung. Um keine falsche Sicherheit vorzutäuschen, wurde der frühere
	// (nirgends verwendete) Nonce-Code entfernt.

	// Authentication
	const url = new URL(event.request.url);

	logger.debug({ pathname: url.pathname }, 'Authentication check');

	/* Die Ableitung Cookie -> Benutzer steht bewusst in sessionRepository.ts und nicht hier:
	   Der Modul-Scope dieser Datei (Startup-Guards, sequence()) macht sie sonst untestbar,
	   und genau diese Ableitung ist der Punkt, an dem #635 bewiesen wird. */
	// `verlaengertSession` hält die einzige Ausnahmeliste (aktuell: der Admin-Inbox-Poll)
	// fest — siehe sessionTouchExemption.ts für die Begründung.
	const session = await resolveSessionUser(event.cookies, {
		verlaengern: verlaengertSession(url.pathname)
	});
	if (session) {
		logger.debug({ userSub: session.user.sub }, 'Authenticated user');
		event.locals.user = session.user;
		event.locals.isAdmin = session.user.roles?.includes('admin') || false;
		// Grundlage für die Ablauf-Ankündigung aus #634 (siehe +layout.server.ts)
		event.locals.sessionExpiresAt = session.expiresAt;
	}

	return resolve(event);
};

/**
 * Löst die Locale serverseitig auf und ersetzt `%lang%` im ausgelieferten HTML.
 *
 * Ohne diesen Schritt gibt es keine serverseitig bekannte Sprache — SSR rendert
 * dann in der Standardsprache, während der Client umschaltet, und der
 * Platzhalter bliebe wörtlich im Dokument stehen.
 *
 * Steht bewusst NACH der Auth-Prüfung: Die hängt an `event.url.pathname`, und
 * dieser Pfad darf ihr nicht verschoben unter den Händen weggezogen werden. Die
 * Definition steht deshalb absichtlich direkt vor `sequence(...)` — unmittelbar
 * bei der Stelle, die ihre tatsächliche Ausführungsreihenfolge festlegt, statt
 * weiter oben in Lesereihenfolge vor `authentication` und damit im Widerspruch
 * zu genau dieser Aussage.
 *
 * `replaceAll` statt `replace`: Heute kommt `%lang%` genau einmal im Dokument
 * vor, aber ein künftiges zweites Vorkommen (z. B. `og:locale`, `hreflang`)
 * bliebe mit `replace` stillschweigend unersetzt im ausgelieferten HTML stehen.
 */
const handleParaglide: Handle = ({ event, resolve }) =>
	// Kein `event.request = request` mehr, wie es Paraglides Vorlage noch zeigt: Seit
	// SvelteKit 3 ist `event.request` readonly. Die Zuweisung trug hier ohnehin nichts —
	// sie ersetzte nur `request.url` durch die Fassung ohne Sprachpräfix, und das liest
	// kein Code: Das Routing macht `reroute` (src/hooks.ts), Seiten und Endpunkte
	// arbeiten mit `event.url`.
	paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replaceAll('%lang%', locale)
		});
	});

/**
 * Einmalige Sprachweiterleitung auf der Startseite (Task 5).
 *
 * Muss VOR `handleParaglide` greifen: Paraglide löst dort die Locale bereits
 * anhand von URL/Cookie auf, und diese Weiterleitung soll genau dieser
 * Auflösung zuvorkommen, nicht ihr hinterherlaufen.
 *
 * Steht bewusst NACH `authentication`: Die Auth-Prüfung hängt an
 * `event.url.pathname`, das diese Funktion nicht verändert — sie erzeugt bei
 * Treffer nur eine eigene 302-Antwort und läuft `resolve(event)` gar nicht
 * erst durch. Vor `authentication` einzuhängen, brächte keinen Vorteil (die
 * Antwort ändert sich nicht) und würde die im Kommentar dort festgehaltene
 * Reihenfolge unnötig aufbrechen.
 *
 * Nur lesende Methoden (`GET`/`HEAD`) werden umgeleitet: Ein 302 auf
 * `POST`/`PUT`/... degradiert die Methode beim Redirect-Follow zu `GET`
 * (RFC 7231) — für `/` gibt es zwar aktuell keine schreibenden Requests,
 * aber die Einschränkung kostet nichts und verhindert, dass ein künftiger
 * POST auf `/` still seine Methode verliert. Diese Begründung trägt für
 * `HEAD` NICHT — `HEAD` ist sicher und idempotent. `HEAD` gehört trotzdem
 * dazu, weil SvelteKit es als vollwertige Seiten-Methode behandelt
 * (`respond.js`: `page_methods`/`allowed_page_methods` enthalten beide
 * `HEAD`) und RFC 9110 §9.3.2 für `HEAD` dieselbe Antwort wie für `GET`
 * verlangt, nur ohne Body. Monitoring und Crawler nutzen `HEAD` gerade
 * deshalb — ein `HEAD /` mit englischem Header muss dieselbe 302 bekommen
 * wie das entsprechende `GET`.
 */
const handleStartseitenSprache: Handle = async ({ event, resolve }) => {
	const istLesend = event.request.method === 'GET' || event.request.method === 'HEAD';
	const ziel = istLesend
		? zielFuerStartseite(
				event.url.pathname,
				event.url.search,
				event.request.headers.get('accept-language'),
				event.cookies.get(LOCALE_COOKIE) ?? null
			)
		: null;
	// `Vary` gehört AUF die Weiterleitung, nicht nur auf die normale Antwort:
	// Die 302 ist die inhaltsverhandelte Antwort. Ohne den Header cacht ein
	// Zwischenspeicher sie für alle Sprachen. `Cookie` gehört mit in die Liste:
	// dieselbe URL mit demselben Accept-Language liefert je nach
	// PARAGLIDE_LOCALE-Cookie eine 302 oder eine 200 — ohne `Cookie` im `Vary`
	// bekäme ein cookielosen englischer Besucher die für einen Cookie-Nutzer
	// gecachte deutsche Antwort.
	if (ziel) {
		return new Response(null, {
			status: 302,
			headers: { location: ziel, vary: 'Accept-Language, Cookie' }
		});
	}

	const antwort = await resolve(event);
	// Nur diese eine Route variiert nach Header — alle übrigen Pfade bleiben
	// voll cachebar. `append` statt `set`: innere Handler (z. B. CORS) setzen
	// bereits eigene `Vary`-Werte (`Origin`, `Sec-Fetch-Dest`); `set` hätte sie
	// überschrieben statt ergänzt.
	if (event.url.pathname === '/') {
		antwort.headers.append('Vary', 'Accept-Language');
		antwort.headers.append('Vary', 'Cookie');
	}
	return antwort;
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
	setAdditionalHeaders, // Fourth: Set security headers
	// Fünfter Platz, direkt neben `setAdditionalHeaders`: Beide setzen nur
	// Antwort-Header über `resolve(event)` und lesen dafür ausschließlich
	// `event.url.pathname` — dieselbe Grundlage, an der auch `authentication`
	// und `handleStartseitenSprache` hängen, und die bis hierher unverändert
	// ist (`reroute` fasst `event.url` nicht an, und die spätere
	// Locale-Auflösung in `handleParaglide` setzt nur `event.request` neu).
	// Der Riegel muss NICHT nach `handleStartseitenSprache` stehen: Eine 302
	// von dort betrifft nur `/` (siehe deren Kommentar), nie `/en/...` — ein
	// Redirect-Response bekäme den Header ohnehin harmlos mit. Er ist
	// vorübergehend (Etappe 0 der Mehrsprachigkeit, siehe
	// `noindexEnglishPages.ts` für die vollständige Begründung und die
	// Entfernungsbedingung).
	noindexEnglishPages,
	handleStartseitenSprache, // Sechstes: einmalige Sprachweiterleitung auf "/"
	handleParaglide // Siebtes: Resolve locale and fill %lang% placeholder
);

/**
 * Zentraler Error-Hook für unerwartete (nicht abgefangene) Server-Fehler.
 *
 * Loggt den Fehler strukturiert über Pino (inkl. Stack, Pfad, Status und einer
 * korrelierbaren errorId) und gibt dem Client nur eine generische Meldung zurück,
 * damit keine internen Details (Stacktraces, DB-Fehler) nach außen gelangen.
 *
 * `causes` ist bei Datenbankfehlern das entscheidende Feld: Drizzle/postgres-js setzen
 * als `message` immer nur "Failed query: <SQL>", die eigentliche Ursache
 * (Verbindungsabbruch, `too many connections`, Timeout) steht ausschließlich in
 * `error.cause`. Ohne dieses Feld ist ein Ausfall aus dem Log nicht rekonstruierbar.
 *
 * Der gesamte Eintrag — Stufe, Meldung und Felder — kommt aus `buildErrorLogEntry`.
 * Ihn hier von Hand zusammenzusetzen hiesse, die Redigierung an genau den Feldern
 * vorbeizuführen, die Drizzles Parameterblock tragen. Die Logik steht in
 * `errorChain.ts`, damit sie testbar ist; `hooks.server.ts` liegt ausserhalb von
 * `src/lib/**` und wird von den Server-Tests nicht erfasst.
 *
 * Die Client-Antwort ist bewusst für jeden Status dieselbe generische Meldung: Was der
 * Nutzer sieht, ist die Fehlerseite; die Unterscheidung 404/500 gehört ins Log, nicht
 * in eine zweite Textvariante.
 */
export const handleError: HandleServerError = (caught) => {
	// SvelteKit 3 meldet auch bewusst geworfene `error(4xx, '…')` hier an; deren Meldung
	// muss unverändert beim Client ankommen (Begründung an `caughtErrorOutcome`).
	const outcome = caughtErrorOutcome(caught);
	if (outcome === null) return;

	const { error, event } = caught;
	const { status, message } = outcome;
	const errorId = randomUUID();

	const entry = buildErrorLogEntry({
		error,
		errorId,
		status,
		message,
		pathname: event.url.pathname,
		method: event.request.method,
		// getClientAddress() wirft, wenn ADDRESS_HEADER gesetzt, der Header aber nicht da ist —
		// im Error-Hook wäre das ein Fehler beim Loggen eines Fehlers. getClientIp fängt das ab.
		clientIp: getClientIp(event.getClientAddress, event.request),
		userAgent: event.request.headers.get('user-agent'),
		referer: event.request.headers.get('referer')
	});

	logger[entry.level](entry.fields, entry.msg);

	return {
		message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
		errorId
	};
};

/**
 * Graceful Shutdown: schließt die DB-Verbindung sauber bei SIGTERM/SIGINT
 * (z.B. `docker stop`). Idempotent — ein bereits laufender Shutdown wird nicht
 * doppelt ausgeführt. Das Dockerfile nutzt `dumb-init`, daher kommen die Signale
 * korrekt am Node-Prozess an.
 */
let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;

	logger.info({ signal }, 'Graceful shutdown initiiert');

	try {
		await closeDb();
		logger.info({ signal }, 'Datenbankverbindung geschlossen');
	} catch (error) {
		logger.error(
			{ signal, error: error instanceof Error ? error.message : String(error) },
			'Fehler beim Schließen der Datenbankverbindung'
		);
	} finally {
		process.exit(0);
	}
}

if (typeof process !== 'undefined' && NODE_ENV !== 'test') {
	process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
	process.once('SIGINT', () => void gracefulShutdown('SIGINT'));
}

// Einmalige Prüfung beim Start: Die Plattformgrenze für Request-Bodies muss
// über der konfigurierten Upload-Grenze liegen, sonst bricht ein zu großer
// Upload ab, bevor die Route ihre eigene Fehlermeldung erzeugen kann.
//
// Bewusst ohne await und mit eigenem catch: Ohne erreichbare Datenbank soll
// der Serverstart nicht scheitern — die Warnung ist ein Hinweis, keine
// Betriebsvoraussetzung.
void (async () => {
	try {
		const uploadConfig = await ServerConfigService.getUploadConfig();
		const maxUploadBytes = Math.max(
			uploadConfig.maxFileSizeBytes,
			uploadConfig.maxVideoFileSizeBytes
		);
		const warning = warnIfBodySizeLimitTooLow(env.BODY_SIZE_LIMIT, maxUploadBytes);
		if (warning) {
			logger.warn({ action: 'body_size_limit_too_low' }, warning);
		}
	} catch (error) {
		logger.debug({ error }, 'Body size limit check skipped — configuration unavailable');
	}
})();
