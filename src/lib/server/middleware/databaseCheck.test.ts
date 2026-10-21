import type { Handle } from '@sveltejs/kit/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks müssen vor dem Import der zu testenden Datei stehen
vi.mock('#lib/server/env.ts', () => ({ env: {} }));

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

vi.mock('#lib/server/db/index.ts', () => ({
	isDatabaseAvailable: vi.fn(),
	testDatabaseConnection: vi.fn()
}));

// SvelteKit error() werfen lassen wie in der echten Implementierung
vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual('@sveltejs/kit');
	return {
		...actual
	};
});

import { isDatabaseAvailable, testDatabaseConnection } from '#lib/server/db/index.ts';
import { databaseCheck, resetDatabaseCheckCache } from '#lib/server/middleware/databaseCheck.ts';
import { env } from '#lib/server/env.ts';

const mockIsDatabaseAvailable = vi.mocked(isDatabaseAvailable);
const mockTestDatabaseConnection = vi.mocked(testDatabaseConnection);

// Hilfsfunktion: Event-Mock erstellen
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

// resolve-Mock gibt immer 200 OK zurück
const resolve = vi.fn(async () => new Response('ok', { status: 200 }));

// Hilfsfunktion: Handle aufrufen
async function runHandle(pathname: string): Promise<Response> {
	return databaseCheck({
		event: createEvent(pathname) as Parameters<Handle>[0]['event'],
		resolve: resolve as Parameters<Handle>[0]['resolve']
	});
}

describe('databaseCheck Middleware', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetDatabaseCheckCache();

		// Standardmäßig: DB-Check nicht überspringen
		// delete statt '' — ?? greift nur bei null/undefined, nicht bei leerem String
		delete (env as Record<string, string | undefined>).SKIP_DB_CHECK;
		delete process.env.SKIP_DB_CHECK;

		// Standardmäßig: DB verfügbar
		mockIsDatabaseAvailable.mockReturnValue(true);
		mockTestDatabaseConnection.mockResolvedValue(true);
	});

	describe('SKIP_DB_CHECK', () => {
		it('leitet Request durch ohne DB-Prüfung wenn SKIP_DB_CHECK=true (env)', async () => {
			(env as Record<string, string>).SKIP_DB_CHECK = 'true';

			const response = await runHandle('/admin');

			expect(response.status).toBe(200);
			expect(mockIsDatabaseAvailable).not.toHaveBeenCalled();
			expect(mockTestDatabaseConnection).not.toHaveBeenCalled();
		});

		it('leitet Request durch ohne DB-Prüfung wenn SKIP_DB_CHECK=1 (env)', async () => {
			(env as Record<string, string>).SKIP_DB_CHECK = '1';

			const response = await runHandle('/api/sightings');

			expect(response.status).toBe(200);
			expect(mockIsDatabaseAvailable).not.toHaveBeenCalled();
		});

		it('leitet Request durch ohne DB-Prüfung wenn SKIP_DB_CHECK=true (process.env)', async () => {
			process.env.SKIP_DB_CHECK = 'true';

			const response = await runHandle('/admin');

			expect(response.status).toBe(200);
			expect(mockIsDatabaseAvailable).not.toHaveBeenCalled();
		});
	});

	describe('requiresDatabase — optionale Pfade (kein DB-Check nötig)', () => {
		const optionalPaths = [
			'/health',
			'/api/health',
			'/db-unavailable',
			'/maintenance',
			'/_app/chunk.js',
			'/favicon.ico',
			'/.well-known/openid-configuration'
		];

		for (const pathname of optionalPaths) {
			it(`leitet "${pathname}" durch ohne DB zu prüfen`, async () => {
				const response = await runHandle(pathname);

				expect(response.status).toBe(200);
				expect(mockIsDatabaseAvailable).not.toHaveBeenCalled();
				expect(mockTestDatabaseConnection).not.toHaveBeenCalled();
			});
		}
	});

	describe('requiresDatabase — default Pfade (kein DB-Check nötig)', () => {
		const defaultPaths = ['/impressum', '/datenschutz', '/about', '/'];

		for (const pathname of defaultPaths) {
			it(`leitet "${pathname}" durch ohne DB zu prüfen`, async () => {
				const response = await runHandle(pathname);

				expect(response.status).toBe(200);
				expect(mockIsDatabaseAvailable).not.toHaveBeenCalled();
			});
		}
	});

	describe('requiresDatabase — erforderliche Pfade (DB-Check wird durchgeführt)', () => {
		it('leitet /admin durch wenn DB verfügbar', async () => {
			const response = await runHandle('/admin');

			expect(mockIsDatabaseAvailable).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('leitet /api/upload durch wenn DB verfügbar', async () => {
			const response = await runHandle('/api/upload');

			expect(mockIsDatabaseAvailable).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('leitet /api/sightings durch wenn DB verfügbar', async () => {
			const response = await runHandle('/api/sightings');

			expect(mockIsDatabaseAvailable).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('leitet /api/map/sightings durch wenn DB verfügbar', async () => {
			const response = await runHandle('/api/map/sightings');

			expect(mockIsDatabaseAvailable).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('leitet /sichtungen durch wenn DB verfügbar', async () => {
			const response = await runHandle('/sichtungen');

			expect(mockIsDatabaseAvailable).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('prüft DB auch für unbekannte /api/* Pfade', async () => {
			const response = await runHandle('/api/unknown-endpoint');

			expect(mockIsDatabaseAvailable).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});
	});

	describe('DB nicht verfügbar — 503 Fehler', () => {
		beforeEach(() => {
			mockIsDatabaseAvailable.mockReturnValue(true);
			mockTestDatabaseConnection.mockResolvedValue(false);
		});

		it('wirft 503 für /api/* Pfade wenn DB nicht erreichbar', async () => {
			await expect(runHandle('/api/sightings')).rejects.toMatchObject({
				status: 503
			});
		});

		it('wirft 503 für /admin wenn DB nicht erreichbar', async () => {
			await expect(runHandle('/admin')).rejects.toMatchObject({
				status: 503
			});
		});

		it('wirft 503 für /sichtungen wenn DB nicht erreichbar', async () => {
			await expect(runHandle('/sichtungen')).rejects.toMatchObject({
				status: 503
			});
		});

		it('wirft 503 wenn isDatabaseAvailable false zurückgibt', async () => {
			mockIsDatabaseAvailable.mockReturnValue(false);

			await expect(runHandle('/admin')).rejects.toMatchObject({
				status: 503
			});

			// Bei isDatabaseAvailable=false wird testDatabaseConnection nicht aufgerufen
			expect(mockTestDatabaseConnection).not.toHaveBeenCalled();
		});

		it('wirft 503 wenn testDatabaseConnection einen Fehler wirft', async () => {
			mockTestDatabaseConnection.mockRejectedValue(new Error('Verbindung abgelehnt'));

			await expect(runHandle('/api/sightings')).rejects.toMatchObject({
				status: 503
			});
		});
	});

	describe('Cache-Verhalten', () => {
		it('ruft testDatabaseConnection nur einmal auf bei mehreren Requests innerhalb des Cache-Intervalls', async () => {
			await runHandle('/admin');
			await runHandle('/admin');
			await runHandle('/api/sightings');

			expect(mockTestDatabaseConnection).toHaveBeenCalledTimes(1);
		});

		it('nutzt gecachten false-Wert und prüft DB nicht erneut', async () => {
			mockTestDatabaseConnection.mockResolvedValue(false);

			// Erster Request befüllt Cache mit false
			await expect(runHandle('/admin')).rejects.toMatchObject({ status: 503 });

			// Zweiter Request nutzt Cache — kein weiterer DB-Aufruf
			await expect(runHandle('/admin')).rejects.toMatchObject({ status: 503 });

			expect(mockTestDatabaseConnection).toHaveBeenCalledTimes(1);
		});

		it('ruft testDatabaseConnection nach resetDatabaseCheckCache erneut auf', async () => {
			// Erster Request
			await runHandle('/admin');
			expect(mockTestDatabaseConnection).toHaveBeenCalledTimes(1);

			// Cache zurücksetzen
			resetDatabaseCheckCache();

			// Zweiter Request nach Reset — DB wird erneut geprüft
			await runHandle('/admin');
			expect(mockTestDatabaseConnection).toHaveBeenCalledTimes(2);
		});

		it('resetDatabaseCheckCache erlaubt neuen DB-Check nach vorherigem Fehler', async () => {
			mockTestDatabaseConnection.mockResolvedValue(false);

			// DB nicht verfügbar — Cache auf false
			await expect(runHandle('/admin')).rejects.toMatchObject({ status: 503 });

			// Cache zurücksetzen und DB als verfügbar markieren
			resetDatabaseCheckCache();
			mockTestDatabaseConnection.mockResolvedValue(true);

			// Jetzt sollte der Request durchkommen
			const response = await runHandle('/admin');
			expect(response.status).toBe(200);
			expect(mockTestDatabaseConnection).toHaveBeenCalledTimes(2);
		});
	});

	describe('resolve wird aufgerufen', () => {
		it('übergibt das Event an resolve wenn DB verfügbar', async () => {
			await runHandle('/admin');

			expect(resolve).toHaveBeenCalledOnce();
			expect(resolve).toHaveBeenCalledWith(
				expect.objectContaining({ url: expect.objectContaining({ pathname: '/admin' }) })
			);
		});

		it('übergibt das Event an resolve für optionale Pfade', async () => {
			await runHandle('/health');

			expect(resolve).toHaveBeenCalledOnce();
			expect(mockIsDatabaseAvailable).not.toHaveBeenCalled();
		});
	});
});
