import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Befund I1: `warnIfBodySizeLimitTooLow()` lief bislang nur einmal beim
 * Serverstart (`hooks.server.ts`). `security.maxVideoFileSize` ist aber zur
 * Laufzeit über `PUT /api/config` änderbar — setzt ein Admin dort z. B. 200 MB,
 * verspricht die Dropzone sofort 200 MB, während der Node-Adapter bei
 * `BODY_SIZE_LIMIT` (typischerweise deutlich darunter) abbricht. Der Melder
 * sieht dann den generischen Text aus `uploadUtils.ts`, nicht die sorgfältig
 * formulierte Meldung.
 *
 * Diese Tests sichern ab, dass `PUT /api/config` dieselbe Prüfung beim
 * SCHREIBEN einer größenrelevanten Einstellung erneut anwendet und die
 * Schreibung ablehnt, statt die Inkonsistenz stillschweigend zu übernehmen.
 */

const MB = 1024 * 1024;
const mockEnv: Record<string, string> = {};

vi.mock('#lib/server/env.ts', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_target, prop: string) => mockEnv[prop] ?? undefined
	})
}));

const { mockLogAuditEvent } = vi.hoisted(() => ({
	mockLogAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: mockLogAuditEvent
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { mockUpsert } = vi.hoisted(() => ({
	mockUpsert: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		upsert: mockUpsert,
		clearCache: vi.fn(),
		getAll: vi.fn().mockResolvedValue([]),
		getByCategory: vi.fn().mockResolvedValue([]),
		delete: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('#lib/server/config/accessControl.ts', () => ({
	filterConfigsByUserAccess: vi.fn().mockImplementation((configs: unknown[]) => configs),
	canUserAccessConfigKey: vi.fn().mockReturnValue(true)
}));

import { PUT } from './+server';

function putEvent(body: Record<string, unknown>) {
	return {
		request: new Request('http://localhost/api/config', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user: { email: 'admin@test.com', sub: 'auth0|admin', roles: ['admin'] } },
		url: new URL('http://localhost/api/config'),
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('PUT /api/config — BODY_SIZE_LIMIT-Wächter (Befund I1)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete mockEnv.BODY_SIZE_LIMIT;
	});

	it('lehnt security.maxVideoFileSize ab, wenn BODY_SIZE_LIMIT darunter liegt', async () => {
		mockEnv.BODY_SIZE_LIMIT = String(120 * MB);

		const response = await PUT(
			putEvent({ key: 'security.maxVideoFileSize', value: 200, category: 'security' })
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.success).toBe(false);
		expect(body.error).toContain('BODY_SIZE_LIMIT');
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it('lehnt security.maxFileSize ebenfalls ab, wenn BODY_SIZE_LIMIT darunter liegt', async () => {
		mockEnv.BODY_SIZE_LIMIT = String(5 * MB);

		const response = await PUT(
			putEvent({ key: 'security.maxFileSize', value: 10, category: 'security' })
		);

		expect(response.status).toBe(400);
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it('erlaubt die Änderung, wenn BODY_SIZE_LIMIT ausreichend darüber liegt', async () => {
		mockEnv.BODY_SIZE_LIMIT = String(300 * MB);

		const response = await PUT(
			putEvent({ key: 'security.maxVideoFileSize', value: 200, category: 'security' })
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(mockUpsert).toHaveBeenCalledOnce();
	});

	it('greift nicht bei größenirrelevanten Konfigurationsschlüsseln', async () => {
		// BODY_SIZE_LIMIT ist absichtlich winzig — der Wächter darf hier trotzdem
		// nicht anschlagen, weil der geänderte Schlüssel keine Upload-Grenze ist.
		mockEnv.BODY_SIZE_LIMIT = String(1);

		const response = await PUT(
			putEvent({ key: 'notification.email.enabled', value: true, category: 'notification' })
		);

		expect(response.status).toBe(200);
		expect(mockUpsert).toHaveBeenCalledOnce();
	});

	it('lehnt ab, wenn BODY_SIZE_LIMIT nicht gesetzt ist — der Adapter greift dann auf 512K zurück', async () => {
		// Ungesetzt ist NICHT "keine Grenze": node_modules/@sveltejs/adapter-node/
		// files/handler.js:25 verwendet dann den Standardwert 512K — weit unter
		// jeder sinnvollen Videogrenze. Der Wächter muss das wie jeden anderen
		// zu niedrigen Wert behandeln, statt ihn stillschweigend durchzulassen.
		const response = await PUT(
			putEvent({ key: 'security.maxVideoFileSize', value: 500, category: 'security' })
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('BODY_SIZE_LIMIT');
		expect(mockUpsert).not.toHaveBeenCalled();
	});
});
