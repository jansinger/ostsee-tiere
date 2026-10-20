/**
 * Der Aufräum-Endpunkt ist über HTTP löschend — die Zugangs- und
 * Klemmungsregeln aus dem Entwurf (§ 4, § 5) sind hier festgeschrieben.
 */
import { ORPHAN_RETENTION_HOURS } from '#lib/constants/uploadRetention.ts';
import { MIN_TOKEN_LENGTH } from '#lib/server/media/cleanupAuth.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'z'.repeat(MIN_TOKEN_LENGTH);

// vi.hoisted: vi.mock wird über die Importe gehoben und dürfte sonst nicht auf
// diese Bindungen zugreifen.
const { cleanupOrphans, logAuditEvent, mockEnv } = vi.hoisted(() => ({
	cleanupOrphans: vi.fn(),
	logAuditEvent: vi.fn(),
	mockEnv: { CLEANUP_TOKEN: 'z'.repeat(32) }
}));

vi.mock('#lib/server/media/orphanCleanup.ts', () => ({ cleanupOrphans }));
vi.mock('#lib/server/media/cleanupPorts.ts', () => ({ createDbPorts: () => ({}) }));
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent }));
vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));

import { POST } from './+server';

const ADMIN = { sub: 'u1', email: 'a@b.de', roles: ['admin'] };

function event(init: { token?: string; query?: string; user?: unknown } = {}) {
	return {
		request: new Request('https://x/api/admin/cleanup-orphans', {
			method: 'POST',
			headers: init.token ? { Authorization: `Bearer ${init.token}` } : {}
		}),
		url: new URL(`https://x/api/admin/cleanup-orphans?${init.query ?? ''}`),
		locals: { user: init.user },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('POST /api/admin/cleanup-orphans', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cleanupOrphans.mockResolvedValue({
			rowsFound: 0,
			filesFound: 0,
			rowsDeleted: 0,
			filesDeleted: 0,
			failed: 0,
			remaining: 0
		});
	});

	it('weist einen Aufruf ohne Ausweis ab', async () => {
		expect((await POST(event())).status).toBe(401);
	});

	it('weist ein falsches Token ab', async () => {
		expect((await POST(event({ token: 'y'.repeat(MIN_TOKEN_LENGTH) }))).status).toBe(401);
	});

	it('lässt ein gültiges Token durch', async () => {
		expect((await POST(event({ token: TOKEN }))).status).toBe(200);
	});

	it('lässt eine Admin-Session ohne Token durch', async () => {
		expect((await POST(event({ user: ADMIN }))).status).toBe(200);
	});

	it('weist einen angemeldeten Nutzer ohne Admin-Rolle ab', async () => {
		expect((await POST(event({ user: { sub: 'u2', email: 'c@d.de', roles: [] } }))).status).toBe(
			401
		);
	});

	it('läuft ohne mode als Vorschau', async () => {
		await POST(event({ token: TOKEN }));
		expect(cleanupOrphans).toHaveBeenCalledWith(expect.objectContaining({ execute: false }));
	});

	it('führt nur bei mode=execute wirklich aus', async () => {
		await POST(event({ token: TOKEN, query: 'mode=execute' }));
		expect(cleanupOrphans).toHaveBeenCalledWith(expect.objectContaining({ execute: true }));
	});

	it('klemmt eine zu kurze Frist, statt sie abzulehnen', async () => {
		// Ein geleaktes Token darf mit hours=0 keine frischen Uploads abräumen.
		const response = await POST(event({ token: TOKEN, query: 'hours=0&mode=execute' }));
		expect(response.status).toBe(200);
		expect(cleanupOrphans).toHaveBeenCalledWith(
			expect.objectContaining({ retentionMs: ORPHAN_RETENTION_HOURS * 60 * 60 * 1000 })
		);
	});

	it('lässt eine längere Frist zu', async () => {
		await POST(event({ token: TOKEN, query: 'hours=48' }));
		expect(cleanupOrphans).toHaveBeenCalledWith(
			expect.objectContaining({ retentionMs: 48 * 60 * 60 * 1000 })
		);
	});

	it('normalisiert eine Dezimalstelle in hours auf ganze Stunden', async () => {
		// OpenAPI dokumentiert `hours` als integer; eine krumme Frist wäre
		// weder dokumentiert noch nachvollziehbar.
		const response = await POST(event({ token: TOKEN, query: 'hours=48.5' }));

		expect(cleanupOrphans).toHaveBeenCalledWith(
			expect.objectContaining({ retentionMs: 48 * 60 * 60 * 1000 })
		);
		expect((await response.json()).retentionHours).toBe(48);
	});

	it('klemmt eine gebrochene Frist unterhalb der Mindestfrist hoch', async () => {
		await POST(event({ token: TOKEN, query: 'hours=0.5' }));

		expect(cleanupOrphans).toHaveBeenCalledWith(
			expect.objectContaining({ retentionMs: ORPHAN_RETENTION_HOURS * 60 * 60 * 1000 })
		);
	});

	it('deckelt limit auf 500', async () => {
		await POST(event({ token: TOKEN, query: 'limit=99999' }));
		expect(cleanupOrphans).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
	});

	it('fällt bei unlesbarem limit auf den Deckel zurück', async () => {
		await POST(event({ token: TOKEN, query: 'limit=abc' }));
		expect(cleanupOrphans).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
	});

	it('schreibt bei execute einen Audit-Eintrag', async () => {
		await POST(event({ token: TOKEN, query: 'mode=execute' }));
		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'file.cleanup_orphans', resourceType: 'file' })
		);
	});

	it('unterscheidet Cron- und Admin-Auslöser im Audit-Eintrag', async () => {
		await POST(event({ token: TOKEN, query: 'mode=execute' }));
		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({ details: expect.objectContaining({ trigger: 'token' }) })
		);
	});

	it('schreibt bei der Vorschau keinen Audit-Eintrag', async () => {
		await POST(event({ token: TOKEN }));
		expect(logAuditEvent).not.toHaveBeenCalled();
	});

	it('meldet 500, wenn der Lauf scheitert', async () => {
		cleanupOrphans.mockRejectedValue(new Error('DB weg'));
		expect((await POST(event({ token: TOKEN }))).status).toBe(500);
	});
});
