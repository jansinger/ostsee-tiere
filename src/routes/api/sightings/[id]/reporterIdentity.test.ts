/**
 * Der Melder-Hash verlässt den Server nie (docs/ANONYMISIERUNG_KONZEPT.md,
 * Abschnitt 6.2) — auch nicht an Admins. Beide Handler hier geben eine ganze
 * Zeile aus `db.select()` bzw. `.returning()` zurück; ohne
 * `omitReporterIdentity` stünde jede neue Spalte automatisch in der Antwort.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/auth/auth.ts', () => ({ requireUserRole: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({ db: { select: vi.fn() } }));
vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	updateSighting: vi.fn(),
	loadSightingFiles: vi.fn().mockResolvedValue([]),
	saveSightingFiles: vi.fn()
}));
vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('#lib/form/validation/sightingSchema.ts', () => {
	const schema = { validate: vi.fn().mockResolvedValue(undefined) };
	return { getSightingSchema: vi.fn(() => schema), getAdminSightingSchema: vi.fn(() => schema) };
});
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

import { db } from '#lib/server/db/index.ts';
import { updateSighting } from '#lib/server/db/sightingRepository.ts';
import { GET, PUT } from './+server';

const ROW = {
	id: 42,
	species: 1,
	email: 'erika@example.invalid',
	reporterHash: 'a'.repeat(64),
	reporterInternal: false
};

function primeSelect(): void {
	vi.mocked(db.select).mockReturnValue({
		from: () => ({ where: () => ({ limit: () => Promise.resolve([ROW]) }) })
	} as never);
}

const baseEvent = {
	params: { id: '42' },
	url: new URL('https://x/api/sightings/42'),
	locals: { user: { sub: 'u1', email: 'admin@example.invalid', roles: ['admin'] } },
	getClientAddress: () => '127.0.0.1'
};

describe('/api/sightings/[id] gibt den Melder-Hash nicht aus', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		primeSelect();
	});

	it('GET', async () => {
		const response = await GET(baseEvent as never);
		const body = await response.json();

		expect(body).toMatchObject({ id: 42, species: 1 });
		expect(body).not.toHaveProperty('reporterHash');
		expect(body).not.toHaveProperty('reporterInternal');
	});

	it('PUT', async () => {
		vi.mocked(updateSighting).mockResolvedValue(ROW as never);
		const request = {
			json: vi.fn().mockResolvedValue({ species: 1 }),
			headers: { get: vi.fn().mockReturnValue(null) }
		};

		const response = await PUT({ ...baseEvent, request } as never);
		const body = await response.json();

		expect(body).toMatchObject({ id: 42 });
		expect(body).not.toHaveProperty('reporterHash');
		expect(body).not.toHaveProperty('reporterInternal');
	});
});
