import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/geo/inBaltic/+server';
import { createEvent } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

vi.mock('#lib/server/geo/checkBalticSeaFile.ts', () => ({
	checkBalticSeaFile: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { checkBalticSeaFile } = await import('#lib/server/geo/checkBalticSeaFile.ts');

describe('Contract: GET /api/geo/inBaltic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkBalticSeaFile).mockReturnValue({
			inBaltic: true,
			inChartArea: true,
			longitude: 13.0814,
			latitude: 54.3233
		});
	});

	it('returns 200 with valid coordinates and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/geo/inBaltic', {
			searchParams: { latitude: '54.3', longitude: '13.0' }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns inBaltic and inChartArea booleans', async () => {
		vi.mocked(checkBalticSeaFile).mockReturnValue({
			inBaltic: false,
			inChartArea: true,
			longitude: 10.0,
			latitude: 53.5
		});

		const event = createEvent('/api/geo/inBaltic', {
			searchParams: { latitude: '53.5', longitude: '10.0' }
		});
		const res = await GET(event);
		const body = await res.json();

		expect(body).toMatchObject({ inBaltic: false, inChartArea: true });
	});

	it('throws 400 when latitude is missing', async () => {
		const event = createEvent('/api/geo/inBaltic', {
			searchParams: { longitude: '13.0' }
		});

		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 400 when longitude is missing', async () => {
		const event = createEvent('/api/geo/inBaltic', {
			searchParams: { latitude: '54.3' }
		});

		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 400 when longitude is out of range', async () => {
		const event = createEvent('/api/geo/inBaltic', {
			searchParams: { latitude: '54.3', longitude: '200' }
		});

		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 400 when latitude is out of range', async () => {
		const event = createEvent('/api/geo/inBaltic', {
			searchParams: { latitude: '100', longitude: '13.0' }
		});

		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});
});
