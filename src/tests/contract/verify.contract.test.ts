import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	PATCH as verifyPATCH,
	GET as verifyGET
} from '../../routes/api/sightings/[id]/verify/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

// Vereinheitlichter Freigabe-Workflow: Es gibt nur zwei Zustände (ungeprüft / geprüft).
// "geprüft" schreibt IMMER beide Legacy-Spalten (verified UND approvedAt) in einem
// einzigen db.update(...).set(...)-Aufruf. Ein dritter Zustand "geprüft aber nicht
// veröffentlicht" existiert nicht mehr. Der separate /approve-Endpunkt entfällt.

const {
	mockSelectLimit,
	mockSelectOrderBy,
	mockUpdate,
	mockUpdateSet,
	mockUpdateWhere,
	mockLogValues
} = vi.hoisted(() => {
	const mockSelectLimit = vi.fn().mockResolvedValue([{ id: 1, verified: 0, approvedAt: null }]);
	// Status-Historie des GET (B3): select().from().where().orderBy()
	const mockSelectOrderBy = vi.fn().mockResolvedValue([]);
	const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
	const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
	const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
	const mockLogValues = vi.fn().mockResolvedValue(undefined);
	return {
		mockSelectLimit,
		mockSelectOrderBy,
		mockUpdate,
		mockUpdateSet,
		mockUpdateWhere,
		mockLogValues
	};
});

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: mockSelectLimit,
					orderBy: mockSelectOrderBy
				})
			})
		}),
		update: mockUpdate,
		// Statusspalten und Historien-Eintrag laufen in einer Transaktion (B3) —
		// die Attrappe reicht dieselben Doubles durch, damit die Erwartung
		// „genau ein set()" unverändert gilt.
		transaction: vi.fn((callback: (tx: unknown) => unknown) =>
			callback({
				update: mockUpdate,
				insert: vi.fn().mockReturnValue({ values: mockLogValues })
			})
		)
	}
}));

vi.mock('#lib/server/db/schema.ts', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('#lib/server/db/schema.ts', {
		sightings: {
			id: 'id',
			approvedAt: 'approvedAt',
			verified: 'verified',
			rejectedAt: 'rejectedAt',
			rejectedBy: 'rejectedBy'
		},
		sightingStatusLog: {
			id: 'id',
			sightingId: 'sightingId',
			verdict: 'verdict',
			editor: 'editor',
			recordedAt: 'recordedAt'
		}
	});
});

vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		eq: vi.fn((a, b) => ({ a, b })),
		asc: vi.fn((a) => ({ asc: a }))
	});
});

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('Contract: PATCH /api/sightings/{id}/verify', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectLimit.mockResolvedValue([{ id: 1, verified: 0, approvedAt: null }]);
		mockUpdateWhere.mockResolvedValue(undefined);
		mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
		mockUpdate.mockReturnValue({ set: mockUpdateSet });
		mockSelectOrderBy.mockResolvedValue([]);
	});

	it('returns 200 verified=1 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});
		const res = await verifyPATCH(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 verified=0 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 0 }
		});
		const res = await verifyPATCH(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('schreibt bei verified=1 verified UND approvedAt in EINEM einzigen db.update(...).set(...)-Aufruf', async () => {
		const { db } = await import('#lib/server/db/index.ts');
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});

		await verifyPATCH(event);

		expect(db.update).toHaveBeenCalledTimes(1);
		expect(mockUpdateSet).toHaveBeenCalledTimes(1);
		expect(mockUpdateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				verified: 1,
				approvedAt: expect.any(Date)
			})
		);
	});

	it('schreibt bei verified=0 approvedAt=null in DEMSELBEN update-Aufruf wie verified', async () => {
		const { db } = await import('#lib/server/db/index.ts');
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 0 }
		});

		await verifyPATCH(event);

		expect(db.update).toHaveBeenCalledTimes(1);
		expect(mockUpdateSet).toHaveBeenCalledTimes(1);
		expect(mockUpdateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				verified: 0,
				approvedAt: null
			})
		);
	});

	it('gibt approvedAt als gesetzten Zeitwert in der Response zurück, wenn verified=1', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});

		const res = await verifyPATCH(event);
		const body = await res.json();

		expect(body.approvedAt).not.toBeNull();
		expect(body.approvedAt).toBeDefined();
		expect(new Date(body.approvedAt).toString()).not.toBe('Invalid Date');
	});

	it('gibt approvedAt=null in der Response zurück, wenn verified=0', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 0 }
		});

		const res = await verifyPATCH(event);
		const body = await res.json();

		expect(body.approvedAt).toBeNull();
	});

	it('protokolliert das Audit-Event sighting.verify mit verified und approved=true', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});

		await verifyPATCH(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.verify',
				details: expect.objectContaining({ verified: 1, approved: true })
			})
		);
	});

	it('protokolliert das Audit-Event sighting.verify mit verified und approved=false', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 0 }
		});

		await verifyPATCH(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.verify',
				details: expect.objectContaining({ verified: 0, approved: false })
			})
		);
	});

	it('protokolliert den Vorzustand im Audit-Event', async () => {
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		mockSelectLimit.mockResolvedValueOnce([
			{ id: 1, verified: 1, approvedAt: new Date('2026-01-01T00:00:00.000Z') }
		]);
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 0 }
		});

		await verifyPATCH(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.verify',
				details: expect.objectContaining({
					previousVerified: 1,
					previouslyApproved: true
				})
			})
		);
	});

	it('protokolliert eine noch nicht freigegebene Sichtung als previouslyApproved=false', async () => {
		// Gegenstück zum Test darüber: Der Vorzustand muss auch dann korrekt im
		// Audit-Log stehen, wenn `freigegeben_am` NULL ist. Dieser Zweig war vor
		// der Zentralisierung der Freigabeprüfung nicht abgedeckt.
		const { logAuditEvent } = vi.mocked(await import('#lib/server/audit/auditService.ts'));
		mockSelectLimit.mockResolvedValueOnce([{ id: 1, verified: 0, approvedAt: null }]);
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});

		await verifyPATCH(event);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.verify',
				details: expect.objectContaining({
					previousVerified: 0,
					previouslyApproved: false
				})
			})
		);
	});

	it('throws 400 for invalid verified value', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 2 }
		});

		try {
			await verifyPATCH(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 400 for invalid id', async () => {
		const event = createEvent('/api/sightings/abc/verify', {
			method: 'PATCH',
			params: { id: 'abc' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});

		try {
			await verifyPATCH(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 404 when sighting not found', async () => {
		mockSelectLimit.mockResolvedValueOnce([]);
		const event = createEvent('/api/sightings/999/verify', {
			method: 'PATCH',
			params: { id: '999' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});

		try {
			await verifyPATCH(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(404);
		}
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});
		try {
			await verifyPATCH(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('throws 403 when role is insufficient', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 403, body: { message: 'Forbidden' } };
		});
		const event = createEvent('/api/sightings/1/verify', {
			method: 'PATCH',
			params: { id: '1' },
			locals: { user: mockAdminUser },
			body: { verified: 1 }
		});
		try {
			await verifyPATCH(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: GET /api/sightings/{id}/verify', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectLimit.mockResolvedValue([
			{ id: 1, verified: 1, approvedAt: new Date('2026-01-01T00:00:00.000Z') }
		]);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			params: { id: '1' },
			locals: { user: mockAdminUser }
		});
		const res = await verifyGET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('gibt id, verified, approvedAt, rejectedAt und die Status-Historie zurück', async () => {
		const event = createEvent('/api/sightings/1/verify', {
			params: { id: '1' },
			locals: { user: mockAdminUser }
		});
		const res = await verifyGET(event);
		const body = await res.json();

		expect(body).toEqual({
			id: 1,
			verified: 1,
			approvedAt: '2026-01-01T00:00:00.000Z',
			rejectedAt: null,
			// Leer ist der Normalfall des Altbestands (B3): Die Aufzeichnung
			// beginnt mit der Tabelle, nicht mit der Sichtung.
			history: []
		});
	});

	it('gibt approvedAt=null zurück, wenn die Sichtung ungeprüft ist', async () => {
		mockSelectLimit.mockResolvedValueOnce([{ id: 1, verified: 0, approvedAt: null }]);
		const event = createEvent('/api/sightings/1/verify', {
			params: { id: '1' },
			locals: { user: mockAdminUser }
		});
		const res = await verifyGET(event);
		const body = await res.json();

		expect(body.verified).toBe(0);
		expect(body.approvedAt).toBeNull();
	});

	it('throws 404 when sighting not found', async () => {
		mockSelectLimit.mockResolvedValueOnce([]);
		const event = createEvent('/api/sightings/999/verify', {
			params: { id: '999' },
			locals: { user: mockAdminUser }
		});

		try {
			await verifyGET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(404);
		}
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/sightings/1/verify', {
			params: { id: '1' },
			locals: { user: mockAdminUser }
		});
		try {
			await verifyGET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('throws 403 when role is insufficient', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 403, body: { message: 'Forbidden' } };
		});
		const event = createEvent('/api/sightings/1/verify', {
			params: { id: '1' },
			locals: { user: mockAdminUser }
		});
		try {
			await verifyGET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});
