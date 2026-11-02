/**
 * Der Melder-Hash verlässt den Server nie — `getSightingByReferenceId` lädt
 * die ganze Zeile (`db.select()`), dieser Handler gibt sie direkt aus.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/auth/auth.ts', () => ({ requireUserRole: vi.fn() }));
vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	getSightingByReferenceId: vi.fn().mockResolvedValue({
		id: 42,
		referenceId: 'ref-1',
		reporterHash: 'a'.repeat(64),
		reporterInternal: true
	})
}));
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

import { GET } from './+server';

describe('GET /api/sightings/ref/[refId]', () => {
	it('gibt den Melder-Hash nicht aus', async () => {
		const response = await GET({
			params: { refId: 'ref-1' },
			url: new URL('https://x/api/sightings/ref/ref-1'),
			locals: { user: { roles: ['admin'] } }
		} as never);
		const body = await response.json();

		expect(body).toMatchObject({ id: 42, referenceId: 'ref-1' });
		expect(body).not.toHaveProperty('reporterHash');
		expect(body).not.toHaveProperty('reporterInternal');
	});
});
