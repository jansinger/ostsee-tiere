/**
 * `GET /api/sightings/export` liefert ganze Zeilen (`db.select()`) an den
 * Browser — `ExportModal.svelte` ruft ihn schon für die Vorschau auf. Der
 * Melder-Hash gehört nicht hinein (docs/ANONYMISIERUNG_KONZEPT.md, 6.2).
 * Gefunden im Review von PR #1007.
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
							{ id: 1, species: 1, reporterHash: 'a'.repeat(64), reporterInternal: false }
						])
				})
			})
		}))
	}
}));

import { GET } from './+server';

describe('GET /api/sightings/export', () => {
	it('gibt den Melder-Hash nicht aus', async () => {
		const response = await GET({
			url: new URL('https://x/api/sightings/export'),
			locals: { user: { roles: ['admin'] } }
		} as never);
		const body = await response.json();

		expect(body).toEqual({ sightings: [{ id: 1, species: 1 }], count: 1 });
	});
});
