import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as testEmailPOST } from '../../routes/api/admin/test-email/+server';
import { POST as weatherRefreshPOST } from '../../routes/api/admin/weather/[id]/refresh/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/server/services/emailService.ts', () => ({
	EmailService: {
		sendTestEmail: vi.fn().mockResolvedValue(true),
		sendNewSightingNotification: vi.fn().mockResolvedValue(true),
		findNotificationBlocker: vi.fn().mockResolvedValue(null)
	}
}));

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	getSightingById: vi.fn(),
	updateSightingWeatherData: vi.fn().mockResolvedValue(true)
}));

vi.mock('#lib/server/services/weatherRefreshService.ts', () => ({
	fetchWeatherData: vi.fn()
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

const { getSightingById } = await import('#lib/server/db/sightingRepository.ts');
const { fetchWeatherData } = await import('#lib/server/services/weatherRefreshService.ts');

const mockWeatherData = {
	data_type: 'historical',
	provider: 'open-meteo',
	fetched_at: new Date().toISOString(),
	temperature: 18.5,
	windSpeed: 12.3
};

const mockSighting = {
	id: 42,
	latitude: '54.5',
	longitude: '13.5',
	sightingDate: new Date('2024-06-15T14:30:00Z')
};

describe('Contract: POST /api/admin/test-email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 for testType=simple and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/admin/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { testType: 'simple', recipient: 'test@example.com' }
		});
		const res = await testEmailPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 400 when sightingId is missing for testType=sighting', async () => {
		const event = createEvent('/api/admin/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { testType: 'sighting' }
		});
		const res = await testEmailPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(400);
		expect(apiRes).toSatisfyApiSpec();
	});

	/**
	 * Der Endpunkt verschickt eine Mail, die im Team-Postfach von einer echten
	 * Neu-Meldung nicht zu unterscheiden ist — er ist Diagnose der
	 * Mail-Konfiguration und gehört damit zu `/api/config/init` und
	 * `/api/config/reset`, nicht zum Tagesgeschäft eines Admins.
	 */
	it('verlangt die Rolle superadmin', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		const event = createEvent('/api/admin/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { testType: 'simple', recipient: 'test@example.com' }
		});

		await testEmailPOST(event);

		expect(requireUserRole).toHaveBeenCalledWith(expect.anything(), mockAdminUser, ['superadmin']);
	});

	/**
	 * Der Abschalter ist die häufigste Ursache und zugleich die verwirrendste:
	 * Die Test-Mail in den Einstellungen geht an ihm vorbei und kommt an. Wer
	 * dann „E-Mail konnte nicht gesendet werden. Bitte prüfen Sie die
	 * Konfiguration." liest, sucht am falschen Ende.
	 */
	it('nennt den Abschalter als Grund, statt pauschal auf die Konfiguration zu verweisen', async () => {
		const { EmailService } = vi.mocked(await import('#lib/server/services/emailService.ts'));
		vi.mocked(EmailService.sendNewSightingNotification).mockResolvedValueOnce(false);
		vi.mocked(EmailService.findNotificationBlocker).mockResolvedValueOnce('disabled');

		const event = createEvent('/api/admin/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { testType: 'sighting', sightingId: 42 }
		});
		const res = await testEmailPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(500);
		expect((apiRes.body as { error: string }).error).toMatch(/abgeschaltet/);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/admin/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { testType: 'simple' }
		});
		try {
			await testEmailPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('throws 403 when role is insufficient', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 403, body: { message: 'Forbidden' } };
		});
		const event = createEvent('/api/admin/test-email', {
			method: 'POST',
			locals: { user: mockAdminUser },
			body: { testType: 'simple' }
		});
		try {
			await testEmailPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: POST /api/admin/weather/{id}/refresh', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getSightingById).mockResolvedValue(mockSighting as any);
		vi.mocked(fetchWeatherData).mockResolvedValue(mockWeatherData as any);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/admin/weather/42/refresh', {
			method: 'POST',
			params: { id: '42' },
			locals: { user: mockAdminUser }
		});
		const res = await weatherRefreshPOST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 400 for invalid id', async () => {
		const event = createEvent('/api/admin/weather/abc/refresh', {
			method: 'POST',
			params: { id: 'abc' },
			locals: { user: mockAdminUser }
		});
		const res = await weatherRefreshPOST(event);

		expect(res.status).toBe(400);
	});

	it('returns 404 when sighting not found', async () => {
		vi.mocked(getSightingById).mockResolvedValueOnce(null);
		const event = createEvent('/api/admin/weather/999/refresh', {
			method: 'POST',
			params: { id: '999' },
			locals: { user: mockAdminUser }
		});
		const res = await weatherRefreshPOST(event);

		expect(res.status).toBe(404);
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/admin/weather/42/refresh', {
			method: 'POST',
			params: { id: '42' },
			locals: { user: mockAdminUser }
		});
		try {
			await weatherRefreshPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('throws 403 when role is insufficient', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 403, body: { message: 'Forbidden' } };
		});
		const event = createEvent('/api/admin/weather/42/refresh', {
			method: 'POST',
			params: { id: '42' },
			locals: { user: mockAdminUser }
		});
		try {
			await weatherRefreshPOST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});
