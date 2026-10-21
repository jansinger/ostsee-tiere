/**
 * Befund 4 (PR #682 Review): Die Rate-Limit-Stufenwahl entschied bisher allein
 * über die Existenz des `Range`-Headers (`!!request.headers.get('range')`).
 * Ein Client, der `Range: unsinn` schickt, bekam damit das 10x höhere
 * `media_range`-Limit (300/min statt 30/min anonym) — `parseRangeHeader`
 * stuft den Header aber als `kind: 'none'` ein und liefert die volle Datei,
 * genau wie eine Anfrage ganz ohne `Range`-Header.
 *
 * Dieser Test zeigt: Nach dem Byte-Budget bleibt die eigentliche
 * Volumen-Bremse zwar unberührt, aber die ANFRAGENZAHL-Stufe muss ehrlich
 * sein — ein kaputter Header darf nicht das hohe Limit erschleichen.
 */
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

function createEvent(rangeHeader: string | null, clientIp = '198.51.100.99') {
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

describe('/api/media GET — Rate-Limit-Stufe bei syntaktisch kaputtem Range-Header', () => {
	it('bekommt das niedrige media_access-Limit (30/min anonym), nicht das hohe media_range-Limit (300/min)', async () => {
		// MEDIA_ACCESS_ANONYMOUS erlaubt 30 Anfragen/Minute. Wird "Range: unsinn"
		// fälschlich als Range-Anfrage gezählt, würde erst nach 300 Anfragen
		// (media_range-Limit) 429 kommen. Zählt es korrekt gegen media_access,
		// muss die 31. Anfrage bereits scheitern.
		// enforceRateLimit() wirft SvelteKit error(429) statt eine Response
		// zurückzugeben — die 31. Anfrage muss deshalb werfen, nicht zurückkehren.
		let lastStatus = 0;
		try {
			for (let i = 0; i < 31; i++) {
				const response = await GET(createEvent('bytes=unsinn'));
				lastStatus = response.status;
			}
		} catch (err) {
			lastStatus = (err as { status?: number }).status ?? 0;
		}

		expect(lastStatus).toBe(429);
	});

	it('lässt einen syntaktisch gültigen Range-Header weiterhin das hohe Limit nutzen', async () => {
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

		// 31 gültige Range-Anfragen bleiben unter dem media_range-Limit
		// (300/min) und dürfen deshalb nicht 429 auslösen.
		for (let i = 0; i < 31; i++) {
			const response = await GET(createEvent(`bytes=${i}-${i}`));
			expect(response.status).toBe(206);
		}
	});
});
