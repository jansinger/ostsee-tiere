/**
 * Der JSON-Export gibt ganze Zeilen aus (`db.select()`). Exporte verlassen das
 * System und unterliegen keiner Löschfrist — der Melder-Hash gehört nicht
 * hinein (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 6.2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/auth/auth.ts', () => ({ requireUserRole: vi.fn() }));
vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn(() => ({
			from: () => ({
				where: () => ({
					orderBy: () =>
						Promise.resolve([
							{ id: 1, species: 1, reporterHash: 'a'.repeat(64), reporterInternal: false },
							{ id: 2, species: 2, reporterHash: null, reporterInternal: null }
						])
				})
			})
		}))
	}
}));

import { GET } from './+server';

describe('GET /api/sightings/export/json', () => {
	it('enthält den Melder-Hash nicht', async () => {
		const response = await GET({
			url: new URL('https://x/api/sightings/export/json'),
			locals: { user: { roles: ['admin'] } }
		} as never);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(JSON.parse(body).sichtungen).toEqual([
			{ id: 1, species: 1 },
			{ id: 2, species: 2 }
		]);
		expect(body).not.toContain('reporterHash');
		expect(body).not.toContain('reporterInternal');
	});
});
