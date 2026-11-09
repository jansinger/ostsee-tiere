/**
 * Bearbeiten einer anonymisierten Meldung über `PUT /api/sightings/[id]`.
 *
 * - Name und E-Mail sind dann keine Pflicht mehr (Kontext `anonymized` fürs
 *   Admin-Schema) — sonst wäre die Meldung gar nicht mehr speicherbar.
 * - Ein geleertes Feld wieder zu füllen wird abgewiesen, mit Nennung des
 *   Feldes. Die Absicherung im UPDATE selbst prüft
 *   `sightingRepositoryReporterHash.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validate } = vi.hoisted(() => ({ validate: vi.fn() }));

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
	const schema = { validate };
	return { getSightingSchema: vi.fn(() => schema), getAdminSightingSchema: vi.fn(() => schema) };
});
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

import { db } from '#lib/server/db/index.ts';
import { updateSighting } from '#lib/server/db/sightingRepository.ts';
import { PUT } from './+server';

const ANONYMIZED_ROW = {
	id: 42,
	species: 1,
	email: null,
	firstName: null,
	lastName: null,
	nameConsent: 0,
	shipNameConsent: 0,
	anonymizedAt: new Date('2026-11-09T03:15:00Z')
};

function primeSelect(row: Record<string, unknown>): void {
	vi.mocked(db.select).mockReturnValue({
		from: () => ({ where: () => ({ limit: () => Promise.resolve([row]) }) })
	} as never);
}

function put(body: Record<string, unknown>) {
	return PUT({
		params: { id: '42' },
		url: new URL('https://x/api/sightings/42'),
		locals: { user: { sub: 'u1', email: 'admin@example.invalid', roles: ['admin'] } },
		getClientAddress: () => '127.0.0.1',
		request: {
			json: vi.fn().mockResolvedValue(body),
			headers: { get: vi.fn().mockReturnValue(null) }
		}
	} as never);
}

describe('PUT /api/sightings/[id] — anonymisierte Meldung', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		validate.mockResolvedValue(undefined);
		vi.mocked(updateSighting).mockResolvedValue(ANONYMIZED_ROW as never);
	});

	it('validiert mit dem Kontext `anonymized`', async () => {
		primeSelect(ANONYMIZED_ROW);

		const response = await put({ species: 2, email: '' });

		expect(response.status).toBe(200);
		expect(validate).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ context: { anonymized: true } })
		);
	});

	it('validiert nicht anonymisierte Meldungen wie bisher', async () => {
		primeSelect({ ...ANONYMIZED_ROW, anonymizedAt: null, email: 'a@example.invalid' });

		await put({ species: 2, email: 'a@example.invalid' });

		expect(validate).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ context: { anonymized: false } })
		);
	});

	it('weist das Wiederbefüllen geleerter Felder mit 422 ab und nennt sie', async () => {
		primeSelect(ANONYMIZED_ROW);

		const response = await put({ species: 2, email: 'neu@example.invalid', firstName: 'Erika' });
		const body = await response.json();

		expect(response.status).toBe(422);
		expect(body).toMatchObject({ success: false, code: 'ANONYMIZED_FIELDS' });
		expect(Object.keys(body.errors).sort()).toEqual(['email', 'firstName']);
		expect(updateSighting).not.toHaveBeenCalled();
	});

	it('lässt den Namen bei Namens-Einwilligung weiter bearbeiten', async () => {
		primeSelect({ ...ANONYMIZED_ROW, nameConsent: 1, firstName: 'Erika' });

		const response = await put({ species: 2, firstName: 'Erika M.' });

		expect(response.status).toBe(200);
		expect(updateSighting).toHaveBeenCalled();
	});
});
