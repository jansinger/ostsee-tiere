/**
 * `POST /api/admin/reporter-erasure` — Löschersuchen (Art. 17 DSGVO).
 *
 * Nur Superadmins, nur per Session: Die Anfrage enthält eine Adresse, und
 * schon die Vorschau verrät, ob es zu ihr Meldungen gibt. Den Cron-Token
 * akzeptiert der Endpunkt deshalb nicht.
 */
import { error, isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { eraseReporter, logAuditEvent, requireUserRole, loggerCalls } = vi.hoisted(() => ({
	eraseReporter: vi.fn(),
	logAuditEvent: vi.fn(),
	requireUserRole: vi.fn(),
	loggerCalls: [] as unknown[]
}));

vi.mock('#lib/server/privacy/eraseReporter.ts', async () => {
	const actual = await vi.importActual<typeof import('#lib/server/privacy/eraseReporter.ts')>(
		'#lib/server/privacy/eraseReporter.ts'
	);
	return { ...actual, eraseReporter };
});
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent }));
vi.mock('#lib/server/auth/auth.ts', () => ({ requireUserRole }));
vi.mock('#lib/logger.server.ts', () => {
	const record = (...args: unknown[]) => loggerCalls.push(args);
	return {
		createLogger: () => ({ info: record, warn: record, error: record, debug: record })
	};
});

import { ReporterHashKeyMissingError } from '#lib/server/privacy/hashReporters.ts';
import { InvalidErasureAddressError } from '#lib/server/privacy/eraseReporter.ts';
import { POST } from './+server';

const SUPERADMIN = { sub: 's1', email: 'chef@example.invalid', roles: ['superadmin'] };
const ADDRESS = 'erika@example.invalid';

function event(body: unknown) {
	return {
		request: new Request('https://x/api/admin/reporter-erasure', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		url: new URL('https://x/api/admin/reporter-erasure'),
		locals: { user: SUPERADMIN },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('POST /api/admin/reporter-erasure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loggerCalls.length = 0;
		eraseReporter.mockResolvedValue({
			mode: 'preview',
			matched: 3,
			alreadyAnonymized: 1,
			erased: 0
		});
	});

	it('verlangt die Rolle superadmin', async () => {
		requireUserRole.mockImplementationOnce(() => {
			throw error(403, 'Forbidden');
		});

		const thrown = await Promise.resolve()
			.then(() => POST(event({ email: ADDRESS })))
			.catch((e: unknown) => e);

		expect(isHttpError(thrown) && thrown.status).toBe(403);
		expect(requireUserRole).toHaveBeenCalledWith(expect.any(URL), SUPERADMIN, ['superadmin']);
		expect(eraseReporter).not.toHaveBeenCalled();
	});

	it('führt ohne mode die Vorschau aus', async () => {
		const response = await POST(event({ email: ADDRESS }));

		expect(response.status).toBe(200);
		expect(eraseReporter).toHaveBeenCalledWith(
			expect.objectContaining({ email: ADDRESS, mode: 'preview' })
		);
		expect(await response.json()).toEqual({
			mode: 'preview',
			matched: 3,
			alreadyAnonymized: 1,
			erased: 0
		});
	});

	it('führt mit mode=execute aus', async () => {
		await POST(event({ email: ADDRESS, mode: 'execute' }));

		expect(eraseReporter).toHaveBeenCalledWith(expect.objectContaining({ mode: 'execute' }));
	});

	it('schreibt ein Audit ohne die Adresse', async () => {
		await POST(event({ email: ADDRESS, mode: 'execute' }));

		const entry = logAuditEvent.mock.calls[0]![0];
		expect(entry).toMatchObject({ action: 'privacy.erasure', status: 'success' });
		expect(JSON.stringify(entry)).not.toContain(ADDRESS);
	});

	it('loggt die Adresse nicht', async () => {
		await POST(event({ email: ADDRESS, mode: 'execute' }));

		expect(JSON.stringify(loggerCalls)).not.toContain(ADDRESS);
	});

	it('weist einen Body ohne Adresse mit 400 ab', async () => {
		const response = await POST(event({ mode: 'execute' }));

		expect(response.status).toBe(400);
		expect(eraseReporter).not.toHaveBeenCalled();
	});

	it('weist eine unbrauchbare Adresse mit 400 ab', async () => {
		eraseReporter.mockRejectedValueOnce(new InvalidErasureAddressError());

		const response = await POST(event({ email: '  ' }));

		expect(response.status).toBe(400);
	});

	it('antwortet ohne Schlüssel mit 503', async () => {
		eraseReporter.mockRejectedValueOnce(new ReporterHashKeyMissingError());

		const response = await POST(event({ email: ADDRESS }));

		expect(response.status).toBe(503);
	});
});
