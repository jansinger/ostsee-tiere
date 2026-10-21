/**
 * Der Rescore-Endpunkt schreibt in `sichtungen` — die Zugangsregeln sind hier
 * festgeschrieben. Er ist der einzige Weg, den Backfill auf deployten Hosts
 * anzustoßen: dmm gibt den DB-Port nicht frei, hawking hat
 * `allowtcpforwarding no`.
 */
import { MIN_TOKEN_LENGTH } from '#lib/server/media/cleanupAuth.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'z'.repeat(MIN_TOKEN_LENGTH);

const { rescoreSightings, logAuditEvent, mockEnv } = vi.hoisted(() => ({
	rescoreSightings: vi.fn(),
	logAuditEvent: vi.fn(),
	// Literal statt MIN_TOKEN_LENGTH: vi.hoisted läuft vor den Importen.
	mockEnv: { CLEANUP_TOKEN: 'z'.repeat(32) }
}));

vi.mock('#lib/server/spam/rescoreSightings.ts', async () => {
	const actual = await vi.importActual<typeof import('#lib/server/spam/rescoreSightings.ts')>(
		'#lib/server/spam/rescoreSightings.ts'
	);
	return { ...actual, rescoreSightings };
});
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent }));
vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));

import { POST } from './+server';

const ADMIN = { sub: 'u1', email: 'a@b.de', roles: ['admin'] };

function event(init: { token?: string; query?: string; user?: unknown } = {}) {
	return {
		request: new Request('https://x/api/admin/spam-rescore', {
			method: 'POST',
			headers: init.token ? { Authorization: `Bearer ${init.token}` } : {}
		}),
		url: new URL(`https://x/api/admin/spam-rescore?${init.query ?? ''}`),
		locals: { user: init.user },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('POST /api/admin/spam-rescore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.CLEANUP_TOKEN = TOKEN;
		rescoreSightings.mockResolvedValue({
			scored: 2,
			skippedFailed: 0,
			lastId: 42,
			remaining: 0,
			done: true,
			stalled: false,
			distribution: { '0': 2 }
		});
	});

	it('weist Aufrufe ohne Ausweis mit 401 ab', async () => {
		const response = await POST(event());

		expect(response.status).toBe(401);
		expect(rescoreSightings).not.toHaveBeenCalled();
	});

	it('weist einen Nutzer ohne Admin-Rolle mit 401 ab', async () => {
		const response = await POST(event({ user: { sub: 'u2', roles: ['user'] } }));

		expect(response.status).toBe(401);
		expect(rescoreSightings).not.toHaveBeenCalled();
	});

	it('lässt eine Admin-Session durch und gibt den Bericht zurück', async () => {
		const response = await POST(event({ user: ADMIN }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ scored: 2, remaining: 0, done: true });
	});

	it('lässt den Token-Weg durch (Cron ohne Session)', async () => {
		const response = await POST(event({ token: TOKEN }));

		expect(response.status).toBe(200);
		expect(rescoreSightings).toHaveBeenCalledOnce();
	});

	it('weist ein falsches Token mit 401 ab', async () => {
		const response = await POST(event({ token: 'x'.repeat(MIN_TOKEN_LENGTH) }));

		expect(response.status).toBe(401);
	});

	it('reicht das Limit aus der Query durch', async () => {
		await POST(event({ user: ADMIN, query: 'limit=50' }));

		expect(rescoreSightings).toHaveBeenCalledWith({ limit: 50 });
	});

	it('ignoriert ein unbrauchbares Limit statt zu raten', async () => {
		await POST(event({ user: ADMIN, query: 'limit=abc' }));

		expect(rescoreSightings).toHaveBeenCalledWith({});
	});

	it('schreibt einen Audit-Eintrag mit dem Ergebnis', async () => {
		await POST(event({ user: ADMIN }));

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.spam_rescore',
				userEmail: ADMIN.email,
				status: 'success'
			})
		);
	});

	it('meldet einen Fehler im Rescore als 500, ohne den Prozess zu reißen', async () => {
		rescoreSightings.mockRejectedValueOnce(new Error('DB weg'));

		const response = await POST(event({ user: ADMIN }));

		expect(response.status).toBe(500);
	});
});
