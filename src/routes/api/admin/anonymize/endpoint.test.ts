/**
 * `POST /api/admin/anonymize` — Zugang, Vorschau als Standard, Audit, 503.
 *
 * Der Endpunkt leert Kontaktdaten unwiderruflich. Ablauf und Sperren prüft
 * `anonymizeSightings.test.ts`; hier geht es um den Weg dorthin.
 */
import { MIN_TOKEN_LENGTH } from '#lib/server/media/cleanupAuth.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'z'.repeat(MIN_TOKEN_LENGTH);

const { anonymizeSightings, logAuditEvent, mockEnv } = vi.hoisted(() => ({
	anonymizeSightings: vi.fn(),
	logAuditEvent: vi.fn(),
	mockEnv: { CLEANUP_TOKEN: 'z'.repeat(32) }
}));

vi.mock('#lib/server/privacy/anonymizeSightings.ts', async () => {
	const actual = await vi.importActual<typeof import('#lib/server/privacy/anonymizeSightings.ts')>(
		'#lib/server/privacy/anonymizeSightings.ts'
	);
	return { ...actual, anonymizeSightings };
});
vi.mock('#lib/server/privacy/anonymizationQueries.ts', () => ({
	createAnonymizationPorts: () => ({})
}));
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent }));
vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));

import { ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { POST } from './+server';

const ADMIN = { sub: 'u1', email: 'a@b.de', roles: ['admin'] };

const REPORT = {
	mode: 'execute',
	executed: true,
	skipped: null,
	keyConfigured: true,
	activatedAt: '2026-11-01T10:00:00.000Z',
	due: 4,
	newestDueReceivedAt: '2026-08-08T12:00:00.000Z',
	byYear: [
		{
			year: 2026,
			total: 4,
			namesCleared: 3,
			namesKept: 1,
			shipsCleared: 0,
			shipsKept: 0,
			pending: 1
		}
	],
	pendingHashes: 0,
	hashed: 0,
	anonymized: 4,
	remaining: 0,
	done: true
};

function event(init: { token?: string; query?: string; user?: unknown } = {}) {
	return {
		request: new Request('https://x/api/admin/anonymize', {
			method: 'POST',
			headers: init.token ? { Authorization: `Bearer ${init.token}` } : {}
		}),
		url: new URL(`https://x/api/admin/anonymize?${init.query ?? ''}`),
		locals: { user: init.user },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('POST /api/admin/anonymize', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.CLEANUP_TOKEN = TOKEN;
		anonymizeSightings.mockResolvedValue(REPORT);
	});

	it('weist Aufrufe ohne Ausweis mit 401 ab', async () => {
		const response = await POST(event());

		expect(response.status).toBe(401);
		expect(anonymizeSightings).not.toHaveBeenCalled();
	});

	it('weist einen Nutzer ohne Admin-Rolle mit 401 ab', async () => {
		const response = await POST(event({ user: { sub: 'u2', roles: ['user'] } }));

		expect(response.status).toBe(401);
		expect(anonymizeSightings).not.toHaveBeenCalled();
	});

	it('weist ein falsches Token mit 401 ab', async () => {
		const response = await POST(event({ token: 'x'.repeat(MIN_TOKEN_LENGTH) }));

		expect(response.status).toBe(401);
	});

	it('führt ohne mode die Vorschau aus und schreibt kein Audit', async () => {
		anonymizeSightings.mockResolvedValueOnce({ ...REPORT, mode: 'preview', executed: false });

		const response = await POST(event({ user: ADMIN }));

		expect(response.status).toBe(200);
		expect(anonymizeSightings).toHaveBeenCalledWith(expect.objectContaining({ mode: 'preview' }));
		expect(logAuditEvent).not.toHaveBeenCalled();
	});

	it('führt nur bei mode=execute aus, auch über den Token-Weg', async () => {
		const response = await POST(event({ token: TOKEN, query: 'mode=execute&limit=2000' }));

		expect(response.status).toBe(200);
		expect(anonymizeSightings).toHaveBeenCalledWith(
			expect.objectContaining({ mode: 'execute', limit: 2000, trigger: 'token' })
		);
	});

	it('ignoriert ein unbrauchbares Limit statt zu raten', async () => {
		await POST(event({ user: ADMIN, query: 'mode=execute&limit=abc' }));

		expect(anonymizeSightings).toHaveBeenCalledWith(
			expect.objectContaining({ limit: undefined, trigger: 'session' })
		);
	});

	it('schreibt beim Ausführen ein Audit ohne personenbezogene Werte', async () => {
		await POST(event({ user: ADMIN, query: 'mode=execute' }));

		expect(logAuditEvent).toHaveBeenCalledOnce();
		const entry = logAuditEvent.mock.calls[0]![0];
		expect(entry).toMatchObject({
			action: 'privacy.anonymize',
			resourceType: 'sighting',
			userEmail: ADMIN.email,
			status: 'success',
			details: {
				trigger: 'session',
				executed: true,
				skipped: null,
				due: 4,
				anonymized: 4,
				remaining: 0,
				hashed: 0,
				newestDueReceivedAt: '2026-08-08T12:00:00.000Z'
			}
		});
		// Keine Zeilen, keine Adressen, keine IDs — nur Zahlen.
		expect(JSON.stringify(entry.details)).not.toMatch(/@|"ids?"/);
	});

	it('antwortet ohne Schlüssel mit 503 und schreibt nichts', async () => {
		anonymizeSightings.mockRejectedValueOnce(new ReporterHashKeyMissingError());

		const response = await POST(event({ token: TOKEN, query: 'mode=execute' }));

		expect(response.status).toBe(503);
		expect(logAuditEvent).not.toHaveBeenCalled();
	});

	it('meldet einen unerwarteten Fehler als 500', async () => {
		anonymizeSightings.mockRejectedValueOnce(new Error('DB weg'));

		const response = await POST(event({ user: ADMIN, query: 'mode=execute' }));

		expect(response.status).toBe(500);
	});
});
