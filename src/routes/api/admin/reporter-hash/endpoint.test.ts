/**
 * Der Backfill-Endpunkt des Melder-Hashes schreibt in `sichtungen` — die
 * Zugangsregeln sind hier festgeschrieben. Er ist der einzige Weg, den
 * Backfill auf deployten Hosts anzustoßen: Die Datenbank ist dort von außen
 * nicht erreichbar, und `src/tools/` liegt nicht im Runtime-Image.
 */
import { MIN_TOKEN_LENGTH } from '#lib/server/media/cleanupAuth.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'z'.repeat(MIN_TOKEN_LENGTH);

const { hashReporters, logAuditEvent, mockEnv } = vi.hoisted(() => ({
	hashReporters: vi.fn(),
	logAuditEvent: vi.fn(),
	// Literal statt MIN_TOKEN_LENGTH: vi.hoisted läuft vor den Importen.
	mockEnv: { CLEANUP_TOKEN: 'z'.repeat(32) }
}));

vi.mock('#lib/server/privacy/hashReporters.ts', async () => {
	const actual = await vi.importActual<typeof import('#lib/server/privacy/hashReporters.ts')>(
		'#lib/server/privacy/hashReporters.ts'
	);
	return { ...actual, hashReporters };
});
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent }));
vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));

import { ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { POST } from './+server';

const ADMIN = { sub: 'u1', email: 'a@b.de', roles: ['admin'] };

function event(init: { token?: string; query?: string; user?: unknown } = {}) {
	return {
		request: new Request('https://x/api/admin/reporter-hash', {
			method: 'POST',
			headers: init.token ? { Authorization: `Bearer ${init.token}` } : {}
		}),
		url: new URL(`https://x/api/admin/reporter-hash?${init.query ?? ''}`),
		locals: { user: init.user },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('POST /api/admin/reporter-hash', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.CLEANUP_TOKEN = TOKEN;
		hashReporters.mockResolvedValue({ hashed: 3, remaining: 0, done: true });
	});

	it('weist Aufrufe ohne Ausweis mit 401 ab', async () => {
		const response = await POST(event());

		expect(response.status).toBe(401);
		expect(hashReporters).not.toHaveBeenCalled();
	});

	it('weist einen Nutzer ohne Admin-Rolle mit 401 ab', async () => {
		const response = await POST(event({ user: { sub: 'u2', roles: ['user'] } }));

		expect(response.status).toBe(401);
		expect(hashReporters).not.toHaveBeenCalled();
	});

	it('weist ein falsches Token mit 401 ab', async () => {
		const response = await POST(event({ token: 'x'.repeat(MIN_TOKEN_LENGTH) }));

		expect(response.status).toBe(401);
	});

	it('lässt eine Admin-Session durch und gibt den Bericht zurück', async () => {
		const response = await POST(event({ user: ADMIN }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ hashed: 3, remaining: 0, done: true });
	});

	it('lässt den Token-Weg durch (Cron ohne Session)', async () => {
		const response = await POST(event({ token: TOKEN }));

		expect(response.status).toBe(200);
		expect(hashReporters).toHaveBeenCalledOnce();
	});

	it('reicht das Limit aus der Query durch und ignoriert ein unbrauchbares', async () => {
		await POST(event({ user: ADMIN, query: 'limit=50' }));
		await POST(event({ user: ADMIN, query: 'limit=abc' }));

		expect(hashReporters).toHaveBeenNthCalledWith(1, { limit: 50 });
		expect(hashReporters).toHaveBeenNthCalledWith(2, {});
	});

	it('schreibt einen Audit-Eintrag mit dem Ergebnis', async () => {
		await POST(event({ user: ADMIN }));

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.reporter_hash_backfill',
				userEmail: ADMIN.email,
				details: expect.objectContaining({ hashed: 3, trigger: 'session' }),
				status: 'success'
			})
		);
	});

	it('antwortet ohne Schlüssel mit 503 — ein Cron mit `curl -f` meldet das als Fehler', async () => {
		hashReporters.mockRejectedValueOnce(new ReporterHashKeyMissingError());

		const response = await POST(event({ token: TOKEN }));

		expect(response.status).toBe(503);
		expect(logAuditEvent).not.toHaveBeenCalled();
	});

	it('meldet einen anderen Fehler als 500', async () => {
		hashReporters.mockRejectedValueOnce(new Error('DB weg'));

		const response = await POST(event({ user: ADMIN }));

		expect(response.status).toBe(500);
	});
});
