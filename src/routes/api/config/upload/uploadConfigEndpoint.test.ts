import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
import { PUBLIC_UPLOAD_ALLOWED_TYPES } from '#lib/constants/uploadDefaults.ts';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getUploadConfig: vi.fn().mockResolvedValue({
			maxFileSize: 25,
			maxFileSizeBytes: 25 * 1024 * 1024,
			maxVideoFileSize: 150,
			maxVideoFileSizeBytes: 150 * 1024 * 1024,
			maxTotalUploadSize: 250,
			maxTotalUploadSizeBytes: 250 * 1024 * 1024,
			allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']
		})
	}
}));

function createEvent(user: { sub: string } | null) {
	return {
		locals: user ? { user } : {},
		request: { headers: { get: () => null } } as unknown as Request,
		setHeaders: vi.fn(),
		getClientAddress: () => '127.0.0.1',
		url: new URL('http://localhost/api/config/upload')
	} as never;
}

describe('/api/config/upload GET', () => {
	it('gibt anonymen Meldern die Größen aus der Konfiguration', async () => {
		const response = await GET(createEvent(null));
		const body = await response.json();

		expect(body.maxFileSizeBytes).toBe(25 * 1024 * 1024);
		expect(body.maxVideoFileSizeBytes).toBe(150 * 1024 * 1024);
	});

	it('gibt anonymen Meldern nur die kuratierte Typliste', async () => {
		const response = await GET(createEvent(null));
		const body = await response.json();

		expect(body.allowedTypes).toEqual([...PUBLIC_UPLOAD_ALLOWED_TYPES]);
	});

	it('gibt angemeldeten Nutzern die volle Serverliste', async () => {
		const response = await GET(createEvent({ sub: 'auth0|admin' }));
		const body = await response.json();

		expect(body.allowedTypes).toContain('video/mp4');
		expect(body.maxVideoFileSizeBytes).toBe(150 * 1024 * 1024);
	});

	it('liefert das Gesamtlimit je Meldung (Befund I4) — sonst driftet die Dropzone gegen UPLOAD_LIMITS.MAX_TOTAL_SIZE', async () => {
		// Vorher lieferte dieser Endpunkt maxTotalUploadSize gar nicht aus: Senkt
		// ein Admin security.maxTotalUploadSize auf 50, prüft der Client
		// weiterhin gegen die statische Konstante (250 MB) und verspricht mehr,
		// als der Server annimmt.
		const response = await GET(createEvent(null));
		const body = await response.json();

		expect(body.maxTotalUploadSize).toBe(250);
		expect(body.maxTotalUploadSizeBytes).toBe(250 * 1024 * 1024);
	});

	it('liefert das Gesamtlimit auch angemeldeten Nutzern', async () => {
		const response = await GET(createEvent({ sub: 'auth0|admin' }));
		const body = await response.json();

		expect(body.maxTotalUploadSizeBytes).toBe(250 * 1024 * 1024);
	});
});
