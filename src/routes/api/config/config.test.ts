import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		upsert: vi.fn().mockResolvedValue(undefined),
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

vi.mock('#lib/server/services/emailService.ts', () => ({
	EmailService: { clearCaches: vi.fn(), resetTransporter: vi.fn() }
}));

import { EmailService } from '#lib/server/services/emailService.ts';
import { PUT, DELETE } from './+server';

function putEvent(key: string, value: unknown, category: string) {
	return {
		request: new Request('http://localhost/api/config', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ key, value, category })
		}),
		locals: { user: { email: 'admin@test.com', sub: 'auth0|admin', roles: ['admin'] } },
		url: new URL('http://localhost/api/config'),
		getClientAddress: () => '127.0.0.1'
	};
}

describe('PUT /api/config — Audit Logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loggt config.update mit key und category', async () => {
		const event = {
			request: new Request('http://localhost/api/config', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key: 'maintenance_mode', value: true, category: 'system' })
			}),
			locals: { user: { email: 'admin@test.com', sub: 'auth0|admin', roles: ['admin'] } },
			url: new URL('http://localhost/api/config'),
			getClientAddress: () => '127.0.0.1'
		};

		await PUT(event as never);

		expect(mockLogAuditEvent).toHaveBeenCalledOnce();
		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'config.update',
				resourceType: 'config',
				resourceId: 'maintenance_mode',
				details: expect.objectContaining({ key: 'maintenance_mode', category: 'system' })
			})
		);
	});
});

// ---------------------------------------------------------------------------
// E-Mail-Cache
//
// `EmailService` hält seine eigene Kopie der Mail-Konfiguration fünf Minuten
// lang. `ConfigRepository.clearCache()` erreicht die nicht. Wer also CC/BCC
// speicherte und danach eine Test-Mail auslöste, bekam bis zu fünf Minuten lang
// die alte Empfängerliste — die frisch eingetragene Adresse blieb aus, ohne
// dass irgendwo ein Fehler erschien.
// ---------------------------------------------------------------------------
describe('PUT /api/config — E-Mail-Cache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('verwirft den EmailService-Cache bei notification.email.*', async () => {
		await PUT(putEvent('notification.email.cc', ['kopie@example.com'], 'email') as never);

		expect(EmailService.clearCaches).toHaveBeenCalledOnce();
	});

	it('verwirft den EmailService-Cache bei email.smtp.*', async () => {
		await PUT(putEvent('email.smtp.host', 'smtp.example.com', 'email') as never);

		expect(EmailService.clearCaches).toHaveBeenCalledOnce();
	});

	it('rührt den EmailService-Cache bei fremden Schlüsseln nicht an', async () => {
		await PUT(putEvent('display.maintenanceMode', true, 'display') as never);

		expect(EmailService.clearCaches).not.toHaveBeenCalled();
	});

	// Der Transporter hält eine offene SMTP-Verbindung. Er muss neu aufgebaut
	// werden, wenn sich die Verbindungsdaten ändern — aber auch nur dann: eine
	// geänderte Empfängerliste ist kein Grund, eine funktionierende Verbindung
	// wegzuwerfen.
	it('verwirft den Transporter bei email.smtp.*', async () => {
		await PUT(putEvent('email.smtp.host', 'smtp.example.com', 'email') as never);

		expect(EmailService.resetTransporter).toHaveBeenCalledOnce();
	});

	it('verwirft den Transporter NICHT bei notification.email.*', async () => {
		await PUT(putEvent('notification.email.cc', ['kopie@example.com'], 'email') as never);

		expect(EmailService.resetTransporter).not.toHaveBeenCalled();
	});
});

describe('DELETE /api/config — Audit Logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loggt config.delete beim Löschen einer Einstellung', async () => {
		const event = {
			url: new URL('http://localhost/api/config?key=maintenance_mode'),
			locals: { user: { email: 'admin@test.com', sub: 'auth0|admin', roles: ['admin'] } },
			request: new Request('http://localhost/api/config?key=maintenance_mode', {
				method: 'DELETE'
			}),
			getClientAddress: () => '127.0.0.1'
		};

		await DELETE(event as never);

		expect(mockLogAuditEvent).toHaveBeenCalledOnce();
		expect(mockLogAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'config.delete',
				resourceType: 'config',
				resourceId: 'maintenance_mode',
				details: expect.objectContaining({ key: 'maintenance_mode' })
			})
		);
	});
});
