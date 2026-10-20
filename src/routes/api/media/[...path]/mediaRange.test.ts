import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { resetByteBudgets } from '#lib/server/middleware/byteBudget.ts';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	isAdminUser: vi.fn().mockReturnValue(false)
}));

const fileRecord = {
	id: 1,
	sightingId: 42,
	fileName: 'wal.mp4',
	filePath: 'sichtung-42/wal.mp4',
	mimeType: 'video/mp4',
	size: 10,
	originalName: 'wal.mp4',
	approvedAt: new Date('2026-01-01T00:00:00Z'),
	verified: 1
};

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({ limit: async () => [fileRecord] })
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

function createEvent(rangeHeader: string | null, clientIp = '127.0.0.1') {
	return {
		params: { path: 'sichtung-42/wal.mp4' },
		url: new URL('http://localhost/api/media/sichtung-42/wal.mp4'),
		request: {
			headers: {
				get: (name: string) => (name.toLowerCase() === 'range' ? rangeHeader : null)
			}
		} as unknown as Request,
		locals: {},
		getClientAddress: () => clientIp
	} as never;
}

beforeEach(() => {
	resetByteBudgets();
	getFileStream.mockReset();
	getMetadata.mockReset();
	getMetadata.mockResolvedValue({
		size: 10,
		mimeType: 'video/mp4',
		lastModified: new Date('2026-01-01T00:00:00Z')
	});
	getFileStream.mockImplementation(async () => ({
		stream: new Response('0123456789').body,
		totalSize: 10,
		rangeDelivered: true
	}));
});

describe('/api/media GET — Range', () => {
	it('kündigt Range-Unterstützung auch ohne Range-Header an', async () => {
		const response = await GET(createEvent(null));

		expect(response.status).toBe(200);
		expect(response.headers.get('Accept-Ranges')).toBe('bytes');
		expect(response.headers.get('Content-Length')).toBe('10');
	});

	it('beantwortet einen Range mit 206 und Content-Range', async () => {
		getFileStream.mockImplementation(async () => ({
			stream: new Response('2345').body,
			totalSize: 10,
			rangeDelivered: true
		}));

		const response = await GET(createEvent('bytes=2-5'));

		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
		expect(response.headers.get('Content-Length')).toBe('4');
	});

	it('reicht den Bereich an den Storage weiter', async () => {
		await GET(createEvent('bytes=2-5'));

		expect(getFileStream).toHaveBeenCalledWith('sichtung-42/wal.mp4', { start: 2, end: 5 });
	});

	it('beantwortet einen unerfüllbaren Range mit 416', async () => {
		const response = await GET(createEvent('bytes=999-'));

		expect(response.status).toBe(416);
		expect(response.headers.get('Content-Range')).toBe('bytes */10');
	});

	it('rechnet mit der Größe aus dem Storage, nicht mit der aus der Datenbank', async () => {
		// Die DB-Zeile sagt 10 Bytes, die Datei hat 20. Läuft die
		// Bereichsrechnung gegen die DB-Größe, wäre "bytes=15-" unerfüllbar
		// und der Content-Range-Nenner falsch.
		getMetadata.mockResolvedValue({
			size: 20,
			mimeType: 'video/mp4',
			lastModified: new Date('2026-01-01T00:00:00Z')
		});
		getFileStream.mockImplementation(async () => ({
			stream: new Response('01234').body,
			totalSize: 20,
			rangeDelivered: true
		}));

		const response = await GET(createEvent('bytes=15-'));

		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe('bytes 15-19/20');
	});

	it('zählt Teilanfragen nicht gegen das Media-Rate-Limit', async () => {
		// MEDIA_ACCESS_ANONYMOUS erlaubt 30 Abrufe pro Minute. Ein Player macht
		// beim Springen im Video leicht ebenso viele Range-Anfragen — würde
		// jede zählen, endete die Wiedergabe mitten im Video mit 429.
		//
		// 40 unterschiedliche Ein-Byte-Bereiche brauchen eine Datei, die groß
		// genug ist, dass jeder einzelne davon erfüllbar bleibt — sonst wird ab
		// Byte 10 (Standard-Mock-Größe) korrekt 416 statt 206 erwartet.
		getMetadata.mockResolvedValue({
			size: 1000,
			mimeType: 'video/mp4',
			lastModified: new Date('2026-01-01T00:00:00Z')
		});
		getFileStream.mockImplementation(async () => ({
			stream: new Response('x').body,
			totalSize: 1000,
			rangeDelivered: true
		}));

		for (let i = 0; i < 40; i++) {
			const response = await GET(createEvent(`bytes=${i}-${i}`));
			expect(response.status).toBe(206);
		}
	});

	it('fällt auf 200 mit voller Länge zurück, wenn der Storage den Bereich nicht liefert', async () => {
		// Ein CDN vor Vercel Blob darf einen Range-Header ignorieren und mit 200
		// und dem vollen Body antworten (RFC 9110). Antwortet die Route in diesem
		// Fall trotzdem mit 206, widersprechen sich Status, Content-Range und der
		// tatsächlich gesendete Body — ein Player bricht die Wiedergabe ab.
		getFileStream.mockImplementation(async () => ({
			stream: new Response('0123456789').body,
			totalSize: 10,
			rangeDelivered: false
		}));

		const response = await GET(createEvent('bytes=2-5'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Length')).toBe('10');
		expect(response.headers.get('Content-Range')).toBeNull();
	});

	it('teilt sich das Rate-Limit nicht zwischen Range- und Nicht-Range-Anfragen (Befund 1)', async () => {
		// MEDIA_ACCESS_ANONYMOUS erlaubt nur 30 Nicht-Range-Anfragen pro Minute,
		// MEDIA_RANGE_ANONYMOUS aber 300 Range-Anfragen. Läuft beides über
		// denselben Zähler-Schlüssel, verbraucht ein Player, der beim Springen im
		// Video 35 Range-Anfragen stellt (< 300, erlaubt), unbemerkt das viel
		// engere Nicht-Range-Budget mit — eine anschließende gewöhnliche Anfrage
		// (z. B. ein Vorschaubild ohne Range-Header) bekäme fälschlich 429, obwohl
		// es die erste Nicht-Range-Anfrage in diesem Fenster ist.
		const clientIp = '203.0.113.42';

		getMetadata.mockResolvedValue({
			size: 1000,
			mimeType: 'video/mp4',
			lastModified: new Date('2026-01-01T00:00:00Z')
		});
		getFileStream.mockImplementation(async () => ({
			stream: new Response('x').body,
			totalSize: 1000,
			rangeDelivered: true
		}));

		for (let i = 0; i < 35; i++) {
			const response = await GET(createEvent(`bytes=${i}-${i}`, clientIp));
			expect(response.status).toBe(206);
		}

		getMetadata.mockResolvedValue({
			size: 10,
			mimeType: 'video/mp4',
			lastModified: new Date('2026-01-01T00:00:00Z')
		});
		getFileStream.mockImplementation(async () => ({
			stream: new Response('0123456789').body,
			totalSize: 10,
			rangeDelivered: true
		}));

		const response = await GET(createEvent(null, clientIp));

		expect(response.status).toBe(200);
	});
});
