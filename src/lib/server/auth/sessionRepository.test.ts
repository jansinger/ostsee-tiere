import type { User } from '#lib/types/User.ts';
import type { Cookies } from '@sveltejs/kit';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWarn, mockError } = vi.hoisted(() => ({ mockWarn: vi.fn(), mockError: vi.fn() }));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: mockWarn, error: mockError })
}));

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn()
	}
}));

vi.mock('#lib/server/db/index.ts', () => ({ db: mockDb }));

const { mockAudit } = vi.hoisted(() => ({ mockAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent: mockAudit }));

vi.mock('#lib/server/env.ts', () => ({ env: { COOKIE_NAME: 'auth-cookie' } }));

import { hashSessionToken } from './sessionToken';
import {
	SESSION_IDLE_SECONDS,
	SESSION_TOUCH_THRESHOLD_SECONDS,
	createSession,
	deleteExpiredSessions,
	destroySession,
	resolveSessionUser,
	revokeAllForSub
} from './sessionRepository';

const NOW = new Date('2026-07-31T12:00:00.000Z');

/** Der Auth0-`exp` liegt in diesen Tests 10 Stunden in der Zukunft (Auth0-Default). */
const ABSOLUTE_EXP_SECONDS = Math.floor(NOW.getTime() / 1000) + 10 * 60 * 60;

const USER: User = {
	sub: 'auth0|abc123',
	name: 'Test Admin',
	nickname: 'admin',
	email: 'admin@example.invalid',
	email_verified: true,
	picture: 'https://example.invalid/p.png',
	updated_at: '2026-01-01T00:00:00.000Z',
	sid: 'auth0-sid-1',
	iss: 'https://tenant.eu.auth0.com/',
	aud: 'client-id',
	iat: Math.floor(NOW.getTime() / 1000),
	exp: ABSOLUTE_EXP_SECONDS,
	roles: ['admin']
};

/** Eine gültige Session-Zeile, wie sie `db.select()` liefern würde. */
function sessionRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		tokenHash: hashSessionToken('the-token'),
		sub: USER.sub,
		roles: ['admin'],
		userClaims: {
			name: USER.name,
			nickname: USER.nickname,
			email: USER.email,
			email_verified: USER.email_verified,
			picture: USER.picture,
			updated_at: USER.updated_at,
			sid: USER.sid
		},
		expiresAt: new Date(NOW.getTime() + SESSION_IDLE_SECONDS * 1000),
		absoluteExpiresAt: new Date(ABSOLUTE_EXP_SECONDS * 1000),
		revokedAt: null,
		createdAt: NOW,
		lastSeenAt: NOW,
		...overrides
	};
}

/** Fängt die Argumente von `db.select()...` ab und liefert die vorgegebene Zeile. */
function stubSelect(rows: unknown[]) {
	const limit = vi.fn().mockResolvedValue(rows);
	const where = vi.fn().mockReturnValue({ limit });
	const from = vi.fn().mockReturnValue({ where });
	mockDb.select.mockReturnValue({ from });
	return { from, where, limit };
}

function stubInsert() {
	const values = vi.fn().mockResolvedValue(undefined);
	mockDb.insert.mockReturnValue({ values });
	return { values };
}

function stubUpdate() {
	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn().mockReturnValue({ where });
	mockDb.update.mockReturnValue({ set });
	return { set, where };
}

function stubDelete() {
	const where = vi.fn().mockResolvedValue(undefined);
	mockDb.delete.mockReturnValue({ where });
	return { where };
}

function mockCookies() {
	return {
		get: vi.fn(),
		set: vi.fn(),
		delete: vi.fn()
	} as unknown as Cookies & {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	stubDelete();
	stubInsert();
	stubUpdate();
	stubSelect([]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createSession', () => {
	it('speichert niemals den Klartext-Token, sondern nur dessen Hash', async () => {
		const insert = stubInsert();
		const cookies = mockCookies();

		await createSession(cookies, USER);

		const cookieValue = cookies.set.mock.calls[0]![1] as string;
		const inserted = insert.values.mock.calls[0]![0] as Record<string, unknown>;

		expect(cookieValue).toBeTruthy();
		expect(inserted.tokenHash).toBe(hashSessionToken(cookieValue));
		// Der entscheidende Test: Der Klartext taucht in KEINEM eingefügten Feld auf.
		expect(JSON.stringify(inserted)).not.toContain(cookieValue);
	});

	it('setzt expires_at auf now + Inaktivitätsfenster', async () => {
		const insert = stubInsert();

		await createSession(mockCookies(), USER);

		const inserted = insert.values.mock.calls[0]![0] as { expiresAt: Date };
		expect(inserted.expiresAt.getTime()).toBe(NOW.getTime() + SESSION_IDLE_SECONDS * 1000);
	});

	it('übernimmt absolute_expires_at aus dem Auth0-exp', async () => {
		const insert = stubInsert();

		await createSession(mockCookies(), USER);

		const inserted = insert.values.mock.calls[0]![0] as { absoluteExpiresAt: Date };
		expect(inserted.absoluteExpiresAt.getTime()).toBe(ABSOLUTE_EXP_SECONDS * 1000);
	});

	it('kappt expires_at an absolute_expires_at, wenn der Token früher abläuft', async () => {
		const insert = stubInsert();
		// Auth0-Token läuft in 10 Minuten ab — kürzer als das Inaktivitätsfenster.
		const shortExp = Math.floor(NOW.getTime() / 1000) + 10 * 60;

		await createSession(mockCookies(), { ...USER, exp: shortExp });

		const inserted = insert.values.mock.calls[0]![0] as { expiresAt: Date };
		expect(inserted.expiresAt.getTime()).toBe(shortExp * 1000);
	});

	it('trennt Rollen von den übrigen Claims', async () => {
		const insert = stubInsert();

		await createSession(mockCookies(), USER);

		const inserted = insert.values.mock.calls[0]![0] as {
			roles: string[];
			userClaims: Record<string, unknown>;
			sub: string;
		};
		expect(inserted.roles).toEqual(['admin']);
		expect(inserted.sub).toBe(USER.sub);
		expect(inserted.userClaims.roles).toBeUndefined();
		expect(inserted.userClaims.email).toBe(USER.email);
	});

	it('löscht abgelaufene und widerrufene Zeilen desselben sub', async () => {
		const del = stubDelete();

		await createSession(mockCookies(), USER);

		expect(mockDb.delete).toHaveBeenCalledTimes(1);
		expect(del.where).toHaveBeenCalledTimes(1);
	});

	it('setzt das Cookie mit maxAge passend zum Inaktivitätsfenster', async () => {
		const cookies = mockCookies();

		await createSession(cookies, USER);

		const options = cookies.set.mock.calls[0]![2];
		expect(options.maxAge).toBe(SESSION_IDLE_SECONDS);
		expect(options.httpOnly).toBe(true);
		expect(options.sameSite).toBe('none');
		expect(options.secure).toBe(true);
		expect(options.path).toBe('/');
	});

	/* Regression: Das Loesch-Cookie muss dieselben Attribute tragen wie das gesetzte.
	   SvelteKits Default fuer cookies.delete ist SameSite=Lax — im iframe auf
	   meeresmuseum.de (Third-Party-Kontext) verwerfen Chrome und Safari ein solches
	   Set-Cookie, das tote Cookie bliebe bis maxAge liegen. Genau dafuer gab es im
	   geloeschten clearAuthCookie einen expliziten Kommentar. */
	it('kappt maxAge an der absoluten Grenze, wenn der Token frueher ablaeuft', async () => {
		const cookies = mockCookies();
		const shortExp = Math.floor(NOW.getTime() / 1000) + 10 * 60;

		await createSession(cookies, { ...USER, exp: shortExp });

		expect(cookies.set.mock.calls[0]![2].maxAge).toBe(10 * 60);
	});

	it('wirft, wenn das Anlegen fehlschlägt — kein stiller Fallback auf eine Session ohne Zeile', async () => {
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockRejectedValue(new Error('db down'))
		});

		await expect(createSession(mockCookies(), USER)).rejects.toThrow();
	});
});

describe('resolveSessionUser', () => {
	it('liefert null ohne Cookie und rührt die Datenbank nicht an', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue(undefined);

		expect(await resolveSessionUser(cookies)).toBeNull();
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	it('sucht über den Hash, nie über den Klartext-Token', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([sessionRow()]);

		await resolveSessionUser(cookies);

		// Der Klartext darf in keinem Where-Argument auftauchen.
		expect(JSON.stringify(mockDb.select.mock.calls)).not.toContain('the-token');
	});

	it('liefert Benutzer samt Rollen aus der Zeile', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([sessionRow()]);

		const resolved = await resolveSessionUser(cookies);

		expect(resolved?.user.sub).toBe(USER.sub);
		expect(resolved?.user.email).toBe(USER.email);
		expect(resolved?.user.roles).toEqual(['admin']);
	});

	it('liefert null bei unbekanntem Cookie und löscht es', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('unbekannt');
		stubSelect([]);

		expect(await resolveSessionUser(cookies)).toBeNull();
		expect(cookies.delete).toHaveBeenCalled();
	});

	/* Regression: Ohne SameSite=None + Secure verwirft der Browser das Loesch-Cookie im
	   iframe auf meeresmuseum.de — das tote Cookie bliebe bis maxAge liegen und erzeugte
	   bei jedem Request einen SELECT und eine security.auth_error-Warnung. */
	it('löscht das Cookie mit denselben Attributen, mit denen es gesetzt wurde', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('unbekannt');
		stubSelect([]);

		await resolveSessionUser(cookies);

		const options = cookies.delete.mock.calls[0]![1];
		expect(options.path).toBe('/');
		expect(options.httpOnly).toBe(true);
		expect(options.sameSite).toBe('none');
		expect(options.secure).toBe(true);
	});

	it('ergibt für ein selbst signiertes HS256-JWT keinen Benutzer (Regression #635)', async () => {
		// Die Umkehrung des alten e2e-Fixtures: ein perfekt signiertes Admin-Token.
		const forged = await new SignJWT({ sub: 'e2e|design-tokens', roles: ['admin'] })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.sign(new TextEncoder().encode('your-secret-key-here-min-32-chars'));

		const cookies = mockCookies();
		cookies.get.mockReturnValue(forged);
		stubSelect([]); // Kein Hash dieses Tokens steht in der Tabelle.

		expect(await resolveSessionUser(cookies)).toBeNull();
		expect(cookies.delete).toHaveBeenCalled();
	});

	it('liefert null bei widerrufener Zeile und löscht sie (Regression B7)', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([sessionRow({ revokedAt: new Date(NOW.getTime() - 1000) })]);
		const del = stubDelete();

		expect(await resolveSessionUser(cookies)).toBeNull();
		expect(cookies.delete).toHaveBeenCalled();
		expect(del.where).toHaveBeenCalled();
	});

	it('liefert null bei abgelaufenem expires_at (Regression #634)', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([sessionRow({ expiresAt: new Date(NOW.getTime() - 1000) })]);

		expect(await resolveSessionUser(cookies)).toBeNull();
		expect(cookies.delete).toHaveBeenCalled();
	});

	it('liefert null bei abgelaufenem absolute_expires_at, auch wenn expires_at noch läuft', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([
			sessionRow({
				expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
				absoluteExpiresAt: new Date(NOW.getTime() - 1000)
			})
		]);

		expect(await resolveSessionUser(cookies)).toBeNull();
	});
});

describe('touchSession (über resolveSessionUser)', () => {
	it('schreibt nicht, wenn last_seen_at jünger als der Schwellwert ist', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([
			sessionRow({
				lastSeenAt: new Date(NOW.getTime() - (SESSION_TOUCH_THRESHOLD_SECONDS - 5) * 1000)
			})
		]);

		await resolveSessionUser(cookies);

		expect(mockDb.update).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('schreibt, sobald der Schwellwert überschritten ist', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([
			sessionRow({
				lastSeenAt: new Date(NOW.getTime() - (SESSION_TOUCH_THRESHOLD_SECONDS + 5) * 1000)
			})
		]);
		const update = stubUpdate();

		await resolveSessionUser(cookies);

		const written = update.set.mock.calls[0]![0] as { expiresAt: Date; lastSeenAt: Date };
		expect(written.expiresAt.getTime()).toBe(NOW.getTime() + SESSION_IDLE_SECONDS * 1000);
		expect(written.lastSeenAt.getTime()).toBe(NOW.getTime());
	});

	it('setzt beim Fortschreiben das Cookie mit, damit beide Lebensdauern nicht auseinanderlaufen', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([
			sessionRow({
				lastSeenAt: new Date(NOW.getTime() - (SESSION_TOUCH_THRESHOLD_SECONDS + 5) * 1000)
			})
		]);

		await resolveSessionUser(cookies);

		expect(cookies.set).toHaveBeenCalledTimes(1);
		expect(cookies.set.mock.calls[0]![1]).toBe('the-token');
		expect(cookies.set.mock.calls[0]![2].maxAge).toBe(SESSION_IDLE_SECONDS);
	});

	it('verlängert expires_at nie über absolute_expires_at hinaus', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		// Absolute Grenze in 5 Minuten, Inaktivitätsfenster wäre 1 Stunde.
		const absolute = new Date(NOW.getTime() + 5 * 60 * 1000);
		stubSelect([
			sessionRow({
				absoluteExpiresAt: absolute,
				lastSeenAt: new Date(NOW.getTime() - (SESSION_TOUCH_THRESHOLD_SECONDS + 5) * 1000)
			})
		]);
		const update = stubUpdate();

		await resolveSessionUser(cookies);

		const written = update.set.mock.calls[0]![0] as { expiresAt: Date };
		expect(written.expiresAt.getTime()).toBe(absolute.getTime());
	});

	it('bricht den Request nicht ab, wenn das Fortschreiben fehlschlägt', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([
			sessionRow({
				lastSeenAt: new Date(NOW.getTime() - (SESSION_TOUCH_THRESHOLD_SECONDS + 5) * 1000)
			})
		]);
		mockDb.update.mockReturnValue({
			set: vi.fn().mockReturnValue({ where: vi.fn().mockRejectedValue(new Error('db down')) })
		});

		const resolved = await resolveSessionUser(cookies);

		expect(resolved?.user.sub).toBe(USER.sub);
		expect(mockError).toHaveBeenCalled();
	});

	it('schreibt trotz überschrittenem Schwellwert nicht fort, wenn { verlaengern: false } übergeben wird', async () => {
		// Für den Poll-Pfad des Admin-Eingangs (siehe sessionTouchExemption.ts): Sein
		// 60-s-Takt träfe sonst fast immer die Touch-Schwelle und verlängerte die
		// Sitzung bei jedem Poll um eine weitere Stunde.
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		const row = sessionRow({
			lastSeenAt: new Date(NOW.getTime() - (SESSION_TOUCH_THRESHOLD_SECONDS + 5) * 1000)
		});
		stubSelect([row]);

		const resolved = await resolveSessionUser(cookies, { verlaengern: false });

		expect(mockDb.update).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		// Die gültige Session wird trotzdem aufgelöst — nur die Verlängerung entfällt.
		expect(resolved?.user.sub).toBe(USER.sub);
		expect(resolved?.expiresAt.getTime()).toBe(row.expiresAt.getTime());
	});

	it('löscht eine abgelaufene Session auch mit { verlaengern: false } (Ablaufprüfung bleibt aktiv)', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubSelect([sessionRow({ expiresAt: new Date(NOW.getTime() - 1000) })]);
		const del = stubDelete();

		const resolved = await resolveSessionUser(cookies, { verlaengern: false });

		expect(resolved).toBeNull();
		expect(del.where).toHaveBeenCalled();
		expect(cookies.delete).toHaveBeenCalled();
	});
});

describe('destroySession', () => {
	it('setzt revoked_at und löscht das Cookie', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		const update = stubUpdate();

		await destroySession(cookies);

		const written = update.set.mock.calls[0]![0] as { revokedAt: Date };
		expect(written.revokedAt.getTime()).toBe(NOW.getTime());

		const options = cookies.delete.mock.calls[0]![1];
		expect(options.sameSite).toBe('none');
		expect(options.secure).toBe(true);
	});

	it('löscht das Cookie auch ohne passende Zeile', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue(undefined);

		await destroySession(cookies);

		expect(cookies.delete).toHaveBeenCalled();
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it('macht dasselbe Cookie ungültig, auch wenn der Client es behält (Regression B7)', async () => {
		const cookies = mockCookies();
		cookies.get.mockReturnValue('the-token');
		stubUpdate();

		await destroySession(cookies);

		// Der Client schickt das Cookie erneut — die Zeile ist jetzt widerrufen.
		stubSelect([sessionRow({ revokedAt: NOW })]);
		expect(await resolveSessionUser(cookies)).toBeNull();
	});
});

describe('deleteExpiredSessions', () => {
	/* Ohne diesen Weg blieben user_claims (Name, E-Mail) einer widerrufenen Session
	   unbegrenzt liegen, wenn der Benutzer sich nie wieder anmeldet: createSession raeumt
	   nur Zeilen desselben sub auf. §5.3 der Spec verweist dafuer auf den bestehenden
	   Wartungsendpunkt. */
	it('löscht abgelaufene und widerrufene Zeilen unabhängig vom Benutzer', async () => {
		const del = stubDelete();
		del.where.mockResolvedValue({ count: 3 });

		const removed = await deleteExpiredSessions();

		expect(mockDb.delete).toHaveBeenCalledTimes(1);
		expect(del.where).toHaveBeenCalledTimes(1);
		expect(removed).toBe(3);
	});
});

describe('revokeAllForSub', () => {
	it('widerruft alle Sessions eines Benutzers', async () => {
		const update = stubUpdate();

		await revokeAllForSub(USER.sub);

		const written = update.set.mock.calls[0]![0] as { revokedAt: Date };
		expect(written.revokedAt.getTime()).toBe(NOW.getTime());
		expect(update.where).toHaveBeenCalled();
	});

	it('schreibt einen Audit-Eintrag', async () => {
		stubUpdate();

		await revokeAllForSub(USER.sub);

		expect(mockAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'auth.session_revoked', details: { sub: USER.sub } })
		);
	});
});
