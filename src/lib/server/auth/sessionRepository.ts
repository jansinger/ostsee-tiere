import { env } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { db } from '#lib/server/db/index.ts';
import { sessions } from '#lib/server/db/schema.ts';
import type { User } from '#lib/types/User.ts';
import type { Cookies } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { createSessionToken, hashSessionToken } from './sessionToken';

/**
 * Server-seitiger Session-Store (Issues #635, #634).
 *
 * Einziger Ort mit SQL auf der `sessions`-Tabelle. Das Cookie trägt nur ein opakes
 * Zufalls-Token; wer eines erfindet, findet keine Zeile. Damit ist die Fälschbarkeit
 * ausgeschlossen statt erschwert — `SESSION_SECRET` entfällt als Vertrauensgrundlage.
 */

const logger = createLogger('auth:session');

/**
 * Gleitendes Inaktivitätsfenster.
 *
 * Festgelegt auf 1 Stunde (Entscheidung 2026-07-31). Der Wert muss kürzer sein als die
 * _ID Token Expiration_ der Auth0-Application (Default 10 h) — sonst greift er nie, weil
 * `absolute_expires_at` vorher zuschlägt.
 *
 * Ausnahme seit dem Admin-Eingang-Poller (#Realtime-Notifications): `resolveSessionUser`
 * kann die Verlängerung pro Aufruf abschalten (`{ verlaengern: false }`). Sonst hebelte ein
 * offener `/admin`-Tab dieses Fenster faktisch aus — siehe `sessionTouchExemption.ts` für
 * die Pfadliste und die ausführliche Begründung.
 */
export const SESSION_IDLE_SECONDS = 60 * 60;

/**
 * Mindestabstand zwischen zwei Schreibvorgängen auf derselben Zeile.
 *
 * `handle` läuft für **jeden** Request, auch für Assets. Ein `UPDATE` pro Request wäre eine
 * andere Größenordnung als der bisherige Cookie-Header. Der Preis ist bis zu eine Minute
 * Unschärfe im Inaktivitätsfenster — vernachlässigbar gegenüber einer Stunde.
 */
export const SESSION_TOUCH_THRESHOLD_SECONDS = 60;

/**
 * Ersatzwert für die absolute Grenze, falls das Auth0-ID-Token keinen brauchbaren `exp`
 * mitbringt.
 *
 * Entspricht Auth0s Default für _ID Token Expiration_ (36000 s). Der Fall sollte nicht
 * eintreten; er still mit „unbegrenzt" zu beantworten wäre aber die schlechteste aller
 * Optionen, deshalb dieser Deckel plus Warnung im Log.
 */
export const SESSION_ABSOLUTE_FALLBACK_SECONDS = 10 * 60 * 60;

const getCookieName = (): string => env.COOKIE_NAME ?? 'auth-cookie';

/**
 * Cookie-Attribute. Unverändert gegenüber dem früheren `setAuthCookie`:
 * `SameSite=None` ist Voraussetzung für die iframe-Einbettung auf meeresmuseum.de und
 * verlangt im Browser zwingend `Secure`.
 */
const COOKIE_ATTRIBUTES = {
	httpOnly: true,
	sameSite: 'none',
	secure: true,
	path: '/'
} as const;

const cookieOptions = (maxAge: number) => ({ ...COOKIE_ATTRIBUTES, maxAge });

/**
 * Löscht das Session-Cookie.
 *
 * **Die Attribute müssen mit denen aus `cookieOptions` übereinstimmen.** SvelteKits
 * Default für `cookies.delete` ist `SameSite=Lax`; im iframe auf meeresmuseum.de — also
 * im Third-Party-Kontext — verwerfen Chrome und Safari ein solches `Set-Cookie`. Das
 * tote Cookie bliebe dann bis zum Ablauf von `maxAge` liegen und erzeugte bei jedem
 * Request einen überflüssigen SELECT und eine `security.auth_error`-Warnung.
 */
const clearCookie = (cookies: Cookies): void => cookies.delete(getCookieName(), COOKIE_ATTRIBUTES);

/** Restlaufzeit-Angaben, die `hooks.server.ts` an `locals` weiterreicht. */
export interface ResolvedSession {
	user: User;
	expiresAt: Date;
	absoluteExpiresAt: Date;
}

const earliest = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

/** Cookie-Lebensdauer in Sekunden, passend zur tatsächlichen Gültigkeit der Zeile. */
const cookieMaxAge = (expiresAt: Date, now: Date): number =>
	Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 1000));

/**
 * Leitet die nicht verlängerbare Grenze aus dem Auth0-ID-Token ab.
 *
 * `user.exp` ist der `exp` des ID-Tokens und stammt aus der Application-Einstellung
 * _ID Token Expiration_ — **nicht** aus Auth0s Session-Konfiguration auf Tenant-Ebene.
 * Die steht in keinem Token und wäre nur über die Management API lesbar, die bewusst
 * nicht angebunden ist.
 */
function deriveAbsoluteExpiry(user: User, now: Date): Date {
	const expMs = typeof user.exp === 'number' ? user.exp * 1000 : Number.NaN;

	if (!Number.isFinite(expMs) || expMs <= now.getTime()) {
		logger.warn(
			{ sub: user.sub, exp: user.exp },
			'ID-Token ohne brauchbaren exp — absolute Grenze auf Auth0-Default gesetzt'
		);
		return new Date(now.getTime() + SESSION_ABSOLUTE_FALLBACK_SECONDS * 1000);
	}
	return new Date(expMs);
}

/**
 * Legt eine neue Session an und setzt das Cookie.
 *
 * Ein vom Client mitgebrachter Wert wird nie übernommen — jeder Login erzeugt ein frisches
 * Token (OWASP: Neuvergabe bei Anmeldung, Schutz gegen Session Fixation).
 *
 * Wirft bei Schreibfehlern: Ein Login ohne Zeile in der Tabelle wäre eine Session, die es
 * nicht gibt. Der Aufrufer im Callback beantwortet das mit 500.
 */
export async function createSession(cookies: Cookies, user: User): Promise<void> {
	const now = new Date();
	const absoluteExpiresAt = deriveAbsoluteExpiry(user, now);
	const expiresAt = earliest(
		new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000),
		absoluteExpiresAt
	);

	/* Aufräumen ohne Cron: abgelaufene und widerrufene Zeilen desselben Benutzers fallen
	   beim nächsten Login weg. Personenbezogene Daten in user_claims werden damit gelöscht
	   und nicht archiviert (DSGVO). */
	await db
		.delete(sessions)
		.where(
			and(
				eq(sessions.sub, user.sub),
				or(
					isNotNull(sessions.revokedAt),
					lt(sessions.expiresAt, now),
					lt(sessions.absoluteExpiresAt, now)
				)
			)
		);

	const token = createSessionToken();

	/* roles, sub und die Token-Metadaten bekommen eigene Spalten bzw. entfallen: iss/aud/
	   iat/exp stammten aus unserem eigenen JWT und haben in der Identität nichts verloren. */
	const { roles, sub, iss: _iss, aud: _aud, iat: _iat, exp: _exp, ...userClaims } = user;

	await db.insert(sessions).values({
		tokenHash: hashSessionToken(token),
		sub,
		roles: roles ?? [],
		userClaims,
		expiresAt,
		absoluteExpiresAt,
		lastSeenAt: now,
		createdAt: now
	});

	/* Erst nach erfolgreichem Insert: sonst trüge der Client ein Cookie ohne Gegenstück.
	   maxAge folgt `expiresAt` und damit auch der absoluten Grenze — ein Cookie, das die
	   Zeile überlebt, ist genau das Auseinanderlaufen, das #634 ausgelöst hat. */
	cookies.set(getCookieName(), token, cookieOptions(cookieMaxAge(expiresAt, now)));
}

export interface ResolveSessionUserOptions {
	/**
	 * `false` überspringt `touchSession` — die Zeile bleibt mit ihrem bisherigen
	 * `expires_at` stehen, obwohl sie gültig ist. Für Pfade gedacht, deren Aufruf-Takt
	 * zufällig die Touch-Schwelle trifft (siehe `sessionTouchExemption.ts`); ohne diese
	 * Ausnahme verlängert ein solcher Pfad die Session bei praktisch jedem Aufruf.
	 *
	 * Die Ablaufprüfung selbst wird davon NICHT berührt: Eine bereits abgelaufene oder
	 * widerrufene Zeile wird unabhängig von dieser Option gelöscht und liefert `null`.
	 *
	 * Default `true` — Fortschreiben ist der Normalfall.
	 */
	verlaengern?: boolean;
}

/**
 * Löst das Session-Cookie in einen Benutzer auf — der einzige Weg von Cookie zu Identität.
 *
 * Bewusst als eigene, aufrufbare Funktion statt inline in `hooks.server.ts`: Der Modul-Scope
 * dort (Startup-Guards, `sequence()`) ist nicht testbar, und genau diese Ableitung ist der
 * Punkt, an dem #635 bewiesen wird.
 */
export async function resolveSessionUser(
	cookies: Cookies,
	options: ResolveSessionUserOptions = {}
): Promise<ResolvedSession | null> {
	const token = cookies.get(getCookieName());
	if (!token) {
		return null;
	}

	const [row] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.tokenHash, hashSessionToken(token)))
		.limit(1);

	if (!row) {
		/* Deckt Alt-JWTs nach dem Deploy genauso ab wie Fälschungsversuche: Ein selbst
		   signiertes Token ist hier schlicht ein unbekannter String. */
		logger.warn({ event: 'security.auth_error' }, 'Session-Cookie ohne passende Zeile');
		clearCookie(cookies);
		return null;
	}

	const now = new Date();
	if (row.revokedAt !== null || row.expiresAt <= now || row.absoluteExpiresAt <= now) {
		logger.warn(
			{ event: 'security.auth_error', sub: row.sub, revoked: row.revokedAt !== null },
			'Session abgelaufen oder widerrufen'
		);
		await deleteSessionRow(row.id);
		clearCookie(cookies);
		return null;
	}

	const expiresAt =
		options.verlaengern === false ? row.expiresAt : await touchSession(row, token, cookies, now);

	return {
		user: {
			...(row.userClaims as Omit<User, 'sub' | 'roles'>),
			sub: row.sub,
			roles: row.roles ?? []
		},
		expiresAt,
		absoluteExpiresAt: row.absoluteExpiresAt
	};
}

/**
 * Schreibt das Inaktivitätsfenster fort — aber nur, wenn seit dem letzten Mal genug Zeit
 * vergangen ist.
 *
 * @returns die (ggf. neue) gültige `expires_at`
 */
async function touchSession(
	row: { id: number; lastSeenAt: Date; expiresAt: Date; absoluteExpiresAt: Date },
	token: string,
	cookies: Cookies,
	now: Date
): Promise<Date> {
	const ageSeconds = (now.getTime() - row.lastSeenAt.getTime()) / 1000;
	if (ageSeconds < SESSION_TOUCH_THRESHOLD_SECONDS) {
		return row.expiresAt;
	}

	const expiresAt = earliest(
		new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000),
		row.absoluteExpiresAt
	);

	try {
		await db.update(sessions).set({ expiresAt, lastSeenAt: now }).where(eq(sessions.id, row.id));
	} catch (err) {
		/* Ein fehlgeschlagenes Fortschreiben darf keinen Request abbrechen. Die Session läuft
		   dann eben zum ursprünglichen Zeitpunkt ab. */
		logger.error({ err, sessionId: row.id }, 'touch_session_failed');
		return row.expiresAt;
	}

	/* Cookie mitziehen: Liefen Cookie- und Zeilen-Lebensdauer auseinander, wäre genau das
	   der Mechanismus hinter #634 — nur in der anderen Richtung. */
	cookies.set(getCookieName(), token, cookieOptions(cookieMaxAge(expiresAt, now)));
	return expiresAt;
}

/** Best-effort-Aufräumen einer ungültigen Zeile; Fehler dürfen den Request nicht kippen. */
async function deleteSessionRow(id: number): Promise<void> {
	try {
		await db.delete(sessions).where(eq(sessions.id, id));
	} catch (err) {
		logger.error({ err, sessionId: id }, 'delete_session_failed');
	}
}

/**
 * Beendet die Session zum übergebenen Cookie serverseitig (Logout).
 *
 * Behebt B7: Bisher löschte der Logout nur das Cookie, das JWT blieb gültig. Jetzt ist der
 * Wert auch dann tot, wenn der Client ihn behält.
 */
export async function destroySession(cookies: Cookies): Promise<void> {
	const token = cookies.get(getCookieName());

	if (token) {
		try {
			await db
				.update(sessions)
				.set({ revokedAt: new Date() })
				.where(eq(sessions.tokenHash, hashSessionToken(token)));
		} catch (err) {
			// Der Benutzer muss trotzdem sein Cookie loswerden.
			logger.error({ err }, 'destroy_session_failed');
		}
	}

	clearCookie(cookies);
}

/**
 * Löscht abgelaufene und widerrufene Zeilen — benutzerübergreifend.
 *
 * `createSession` räumt nur Zeilen **desselben** `sub` weg. Wer sich abmeldet und nie
 * wiederkommt, hinterlässt sonst `user_claims` (Name, E-Mail, Bild) dauerhaft in der
 * Tabelle, und die Tabelle wächst monoton. Diese Funktion schließt beides und wird vom
 * bestehenden Wartungsendpunkt `/api/admin/cleanup-orphans` mitgerufen — ein eigener
 * Cron wäre eine zusätzliche bewegliche Komponente für ein Problem, das ein `DELETE` löst.
 *
 * @returns Anzahl der gelöschten Zeilen
 */
export async function deleteExpiredSessions(): Promise<number> {
	const now = new Date();
	const result = await db
		.delete(sessions)
		.where(
			or(
				isNotNull(sessions.revokedAt),
				lt(sessions.expiresAt, now),
				lt(sessions.absoluteExpiresAt, now)
			)
		);

	// postgres.js liefert `count`; der Wert ist nur fürs Protokoll, nicht für Logik.
	return (result as unknown as { count?: number }).count ?? 0;
}

/**
 * Widerruft alle noch offenen Sessions eines Auth0-Benutzers.
 *
 * Der Ersatz für „Secret wechseln" als Notausschalter — gezielt statt mit Kollateralschaden.
 * Auch das Gegenmittel, wenn eine Rolle in Auth0 entzogen wurde und sofort greifen soll:
 * Die Session-Zeile trägt nur einen Snapshot vom Login.
 */
export async function revokeAllForSub(sub: string): Promise<void> {
	await db
		.update(sessions)
		.set({ revokedAt: new Date() })
		.where(and(eq(sessions.sub, sub), isNull(sessions.revokedAt)));

	/* Der Widerruf ist eine sicherheitsrelevante Handlung und gehört ins Audit-Log —
	   `.claude/rules/security.md` führt `auth.session_revoked` in der verbindlichen
	   Event-Tabelle. logAuditEvent wirft nie und blockiert den Widerruf deshalb nicht. */
	await logAuditEvent({
		action: 'auth.session_revoked',
		resourceType: 'auth',
		details: { sub }
	});
}
