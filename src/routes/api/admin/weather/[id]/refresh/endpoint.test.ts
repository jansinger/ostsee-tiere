import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	getSightingById: vi.fn(),
	updateSightingWeatherData: vi.fn()
}));

vi.mock('#lib/server/services/weatherRefreshService.ts', () => ({
	fetchWeatherData: vi.fn().mockResolvedValue({
		provider: 'open-meteo',
		fetched_at: new Date().toISOString(),
		api_version: 'v1',
		data_type: 'historical',
		location: { latitude: 54.5, longitude: 13.5 },
		observation_time: '2024-07-15T14:00',
		raw_data: {},
		processed: {},
		quality: {}
	})
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn()
}));

const createMockEvent = (id: string, user: { email: string; roles: string[] } | null = null) => ({
	params: { id },
	locals: { user },
	url: new URL(`http://localhost/api/admin/weather/${id}/refresh`)
});

describe('/api/admin/weather/[id]/refresh POST endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ruft requireUserRole mit admin-Rolle auf', async () => {
		const { requireUserRole } = await import('#lib/server/auth/auth.ts');
		const { getSightingById } = await import('#lib/server/db/sightingRepository.ts');
		vi.mocked(getSightingById).mockResolvedValue(null);

		const event = createMockEvent('123', { email: 'admin@test.com', roles: ['admin'] });
		await POST(event as Parameters<typeof POST>[0]);

		expect(requireUserRole).toHaveBeenCalledWith(event.url, event.locals.user, [
			'admin',
			'superadmin'
		]);
	});

	it('lehnt ungültige Sichtungs-ID ab', async () => {
		const event = createMockEvent('invalid', { email: 'admin@test.com', roles: ['admin'] });
		const response = await POST(event as Parameters<typeof POST>[0]);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.success).toBe(false);
	});

	it('gibt 404 zurück wenn Sichtung nicht gefunden', async () => {
		const { getSightingById } = await import('#lib/server/db/sightingRepository.ts');
		vi.mocked(getSightingById).mockResolvedValue(null);

		const event = createMockEvent('999', { email: 'admin@test.com', roles: ['admin'] });
		const response = await POST(event as Parameters<typeof POST>[0]);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.success).toBe(false);
	});

	it('500-Antwort enthält keine internen Fehlerdetails', async () => {
		const { getSightingById } = await import('#lib/server/db/sightingRepository.ts');
		vi.mocked(getSightingById).mockRejectedValue(
			new Error('DB connection failed: postgresql://secret@host/db')
		);

		const event = createMockEvent('1', { email: 'admin@test.com', roles: ['admin'] });
		const response = await POST(event as Parameters<typeof POST>[0]);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.success).toBe(false);
		expect(body.error).not.toContain('postgresql://');
		expect(body.error).not.toContain('DB connection failed');
	});

	// H3: Datum + Uhrzeit müssen als Berlin-Wanduhrzeit an fetchWeatherData
	// gehen, nicht als UTC-Instant-Bestandteile (toISOString()).
	it('leitet Datum und Uhrzeit als Berlin-Wanduhrzeit ab (Sommerzeit, kein Tageswechsel)', async () => {
		const { getSightingById, updateSightingWeatherData } =
			await import('#lib/server/db/sightingRepository.ts');
		const { fetchWeatherData } = await import('#lib/server/services/weatherRefreshService.ts');
		vi.mocked(getSightingById).mockResolvedValue({
			id: 1,
			latitude: '54.5',
			longitude: '13.5',
			// 12:30 UTC entspricht im Sommer (Berlin = UTC+2) 14:30 Uhr Berlin
			sightingDate: new Date('2024-07-15T12:30:00Z')
		} as never);
		vi.mocked(updateSightingWeatherData).mockResolvedValue(true);

		const event = createMockEvent('1', { email: 'admin@test.com', roles: ['admin'] });
		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(vi.mocked(fetchWeatherData)).toHaveBeenCalledWith(54.5, 13.5, '2024-07-15', '14:30');
	});

	it('leitet Datum und Uhrzeit als Berlin-Wanduhrzeit ab (Tageswechsel über Mitternacht)', async () => {
		const { getSightingById, updateSightingWeatherData } =
			await import('#lib/server/db/sightingRepository.ts');
		const { fetchWeatherData } = await import('#lib/server/services/weatherRefreshService.ts');
		vi.mocked(getSightingById).mockResolvedValue({
			id: 2,
			latitude: '54.5',
			longitude: '13.5',
			// 22:30 UTC am 14.07. entspricht im Sommer 00:30 Uhr Berlin am 15.07. —
			// der UTC-Kalendertag liegt hier noch auf dem 14., der Berlin-Tag schon
			// auf dem 15.
			sightingDate: new Date('2024-07-14T22:30:00Z')
		} as never);
		vi.mocked(updateSightingWeatherData).mockResolvedValue(true);

		const event = createMockEvent('2', { email: 'admin@test.com', roles: ['admin'] });
		const response = await POST(event as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(vi.mocked(fetchWeatherData)).toHaveBeenCalledWith(54.5, 13.5, '2024-07-15', '00:30');
	});
});
