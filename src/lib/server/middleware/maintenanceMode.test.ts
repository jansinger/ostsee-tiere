import type { Handle } from '@sveltejs/kit/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks müssen vor dem Import der zu testenden Datei stehen
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		isMaintenanceModeEnabled: vi.fn(),
		getString: vi.fn()
	}
}));

// @sveltejs/kit redirect wirft eine Response — echte Implementierung beibehalten
vi.mock('@sveltejs/kit', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@sveltejs/kit')>();
	return { ...actual };
});

import { ServerConfigService } from '#lib/services/configService.ts';
import { maintenanceMode, getMaintenanceConfig } from '#lib/server/middleware/maintenanceMode.ts';

const mockIsMaintenanceModeEnabled = vi.mocked(ServerConfigService.isMaintenanceModeEnabled);
const mockGetString = vi.mocked(ServerConfigService.getString);

function createEvent(pathname: string) {
	return {
		url: { pathname },
		request: new Request(`http://localhost${pathname}`),
		locals: {},
		cookies: {},
		params: {},
		route: { id: pathname },
		isDataRequest: false,
		isSubRequest: false,
		platform: undefined
	};
}

const resolve = vi.fn(async () => new Response('ok', { status: 200 }));

async function runHandle(pathname: string): Promise<Response> {
	return maintenanceMode({
		event: createEvent(pathname) as Parameters<Handle>[0]['event'],
		resolve: resolve as Parameters<Handle>[0]['resolve']
	});
}

describe('maintenanceMode Middleware', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsMaintenanceModeEnabled.mockResolvedValue(false);
		mockGetString.mockResolvedValue('Wartungsmodus aktiv');
	});

	describe('Bypass-Pfade — kein Maintenance-Check', () => {
		it('resolves für /admin ohne Maintenance-Check', async () => {
			const response = await runHandle('/admin');

			expect(response.status).toBe(200);
			expect(mockIsMaintenanceModeEnabled).not.toHaveBeenCalled();
		});

		it('resolves für /admin/settings ohne Maintenance-Check', async () => {
			const response = await runHandle('/admin/settings');

			expect(response.status).toBe(200);
			expect(mockIsMaintenanceModeEnabled).not.toHaveBeenCalled();
		});

		it('resolves für /api/anything ohne Maintenance-Check', async () => {
			const response = await runHandle('/api/anything');

			expect(response.status).toBe(200);
			expect(mockIsMaintenanceModeEnabled).not.toHaveBeenCalled();
		});

		it('resolves für /maintenance ohne Maintenance-Check', async () => {
			const response = await runHandle('/maintenance');

			expect(response.status).toBe(200);
			expect(mockIsMaintenanceModeEnabled).not.toHaveBeenCalled();
		});
	});

	describe('Normale Pfade — mit Maintenance-Check', () => {
		it('resolves normale Seite wenn Maintenance deaktiviert', async () => {
			mockIsMaintenanceModeEnabled.mockResolvedValue(false);

			const response = await runHandle('/');

			expect(response.status).toBe(200);
			expect(mockIsMaintenanceModeEnabled).toHaveBeenCalledOnce();
		});

		it('redirectet zu /maintenance wenn Maintenance aktiviert', async () => {
			mockIsMaintenanceModeEnabled.mockResolvedValue(true);

			await expect(runHandle('/')).rejects.toMatchObject({ status: 302 });
		});

		it('resolves graceful wenn isMaintenanceModeEnabled einen Fehler wirft', async () => {
			mockIsMaintenanceModeEnabled.mockRejectedValue(new Error('DB-Fehler'));

			// Bei Fehler im Check wird kein Redirect durchgeführt — Seite bleibt erreichbar
			const response = await runHandle('/');

			expect(response.status).toBe(200);
		});
	});

	describe('resolve wird korrekt aufgerufen', () => {
		it('übergibt Event an resolve für Bypass-Pfade', async () => {
			await runHandle('/admin');

			expect(resolve).toHaveBeenCalledOnce();
			expect(resolve).toHaveBeenCalledWith(
				expect.objectContaining({ url: expect.objectContaining({ pathname: '/admin' }) })
			);
		});

		it('übergibt Event an resolve wenn Maintenance deaktiviert', async () => {
			mockIsMaintenanceModeEnabled.mockResolvedValue(false);

			await runHandle('/sichtungen');

			expect(resolve).toHaveBeenCalledOnce();
			expect(resolve).toHaveBeenCalledWith(
				expect.objectContaining({ url: expect.objectContaining({ pathname: '/sichtungen' }) })
			);
		});
	});

	describe('getMaintenanceConfig', () => {
		it('gibt enabled und message zurück', async () => {
			mockIsMaintenanceModeEnabled.mockResolvedValue(true);
			mockGetString.mockResolvedValue('Wir sind gleich zurück.');

			const config = await getMaintenanceConfig();

			expect(config).toEqual({
				enabled: true,
				message: 'Wir sind gleich zurück.'
			});
			expect(mockIsMaintenanceModeEnabled).toHaveBeenCalledOnce();
			expect(mockGetString).toHaveBeenCalledWith('display.maintenanceMessage');
		});
	});
});
