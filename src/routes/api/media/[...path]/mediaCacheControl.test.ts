/**
 * Befund 3 (PR #682 Review): Die Route setzte für JEDE Datei
 * `Cache-Control: public, max-age=31536000, immutable` — auch für Medien
 * nicht freigegebener Sichtungen, die der `isApproved`-Zweig darüber
 * ausdrücklich nur an Admins ausliefert. `public` erlaubt geteilten Caches
 * (CDN, Firmenproxy, Reverse Proxy) das Vorhalten und Weiterreichen; ein Jahr
 * `immutable` verschärft das, weil eine spätere Ablehnung der Sichtung den
 * Cache nicht invalidiert.
 *
 * Freigegebene Dateien behalten die lange öffentliche Cache-Dauer (CUID-
 * benannt, unveränderlich). Nicht freigegebene bekommen eine Direktive, die
 * geteiltes Zwischenspeichern ausschließt.
 *
 * Vorbestehender Befund, nicht durch diesen Branch eingeführt.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { resetByteBudgets } from '#lib/server/middleware/byteBudget.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	isAdminUser: vi.fn().mockReturnValue(false)
}));

let approvedAt: Date | null = new Date('2026-01-01T00:00:00Z');

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({
						limit: async () => [
							{
								id: 1,
								sightingId: 42,
								fileName: 'wal.jpg',
								filePath: 'sichtung-42/wal.jpg',
								mimeType: 'image/jpeg',
								size: 10,
								originalName: 'wal.jpg',
								get approvedAt() {
									return approvedAt;
								},
								verified: 1
							}
						]
					})
				})
			})
		})
	}
}));

const getFileStream = vi.fn();
const getMetadata = vi.fn();

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: () => ({ getFileStream, getMetadata })
}));

function createEvent(clientIp = '127.0.0.1') {
	return {
		params: { path: 'sichtung-42/wal.jpg' },
		url: new URL('http://localhost/api/media/sichtung-42/wal.jpg'),
		request: { headers: { get: () => null } } as unknown as Request,
		locals: { user: { sub: 'auth0|admin', roles: ['admin'] } },
		getClientAddress: () => clientIp
	} as never;
}

beforeEach(() => {
	resetByteBudgets();
	getFileStream.mockReset();
	getMetadata.mockReset();
	getMetadata.mockResolvedValue({
		size: 10,
		mimeType: 'image/jpeg',
		lastModified: new Date('2026-01-01T00:00:00Z')
	});
	getFileStream.mockImplementation(async () => ({
		stream: new Response('0123456789').body,
		totalSize: 10,
		rangeDelivered: true
	}));
});

describe('/api/media GET — Cache-Control', () => {
	it('behält die lange öffentliche Cache-Dauer für freigegebene Dateien', async () => {
		approvedAt = new Date('2026-01-01T00:00:00Z');

		const response = await GET(createEvent());

		expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
	});

	it('erlaubt für nicht freigegebene Dateien keine geteilten Caches (Befund 3)', async () => {
		approvedAt = null;
		vi.mocked(isAdminUser).mockReturnValue(true);

		const response = await GET(createEvent());

		const cacheControl = response.headers.get('Cache-Control') ?? '';
		expect(cacheControl).not.toContain('public');
		expect(cacheControl).toContain('private');
	});
});
