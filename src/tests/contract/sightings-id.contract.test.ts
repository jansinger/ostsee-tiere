import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT, DELETE } from '../../routes/api/sightings/[id]/+server';
import { createEvent, mockAdminUser } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';

const { mockSelectLimit, mockDeleteWhere, mockSighting, mockUpdateSighting, mockSchema } =
	vi.hoisted(() => {
		const mockSighting = {
			id: 123,
			sightingDate: new Date('2024-06-15T14:30:00Z'),
			created: new Date('2024-06-15T15:00:00Z'),
			species: 1,
			totalCount: 2,
			juvenileCount: 0,
			latitude: 54.5,
			longitude: 13.5,
			isDead: 0,
			firstName: 'Max',
			lastName: 'Muster',
			email: 'max@example.com',
			verified: 1,
			approvedAt: null,
			internalComment: null,
			referenceId: 'ref-test-123'
		};
		const mockSelectLimit = vi.fn().mockResolvedValue([{ ...mockSighting }]);
		const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
		const mockUpdateSighting = vi.fn().mockResolvedValue({ ...mockSighting });
		const mockSchema = {
			sightings: {
				id: 'id',
				approvedAt: 'approvedAt',
				internalComment: 'internalComment',
				verified: 'verified'
			},
			sightingFiles: { sightingId: 'sightingId', filePath: 'filePath' }
		};
		return { mockSelectLimit, mockDeleteWhere, mockSighting, mockUpdateSighting, mockSchema };
	});

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({ limit: mockSelectLimit })
			})
		}),
		// DELETE löscht Dateizeilen und Sichtung gemeinsam in einer Transaktion
		transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
			callback({
				delete: (table: unknown) => ({
					where:
						table === mockSchema.sightingFiles
							? () => ({ returning: vi.fn().mockResolvedValue([]) })
							: mockDeleteWhere
				})
			})
		),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ ...mockSighting }])
				})
			})
		}),
		delete: vi.fn().mockReturnValue({
			where: mockDeleteWhere
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('#lib/server/db/schema.ts', mockSchema);
});

// PUT und DELETE schreiben einen Audit-Eintrag. Ohne diese Attrappe liefe der
// echte `auditService` gegen die db-Attrappe, scheiterte still in seinem
// eigenen catch und zöge `auditLogs` aus der Schema-Attrappe — dort fehlte es
// unbemerkt, bis `strictModuleMock` es meldete.
vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: vi.fn(() => ({ delete: vi.fn().mockResolvedValue(undefined) }))
}));

vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		eq: vi.fn((a, b) => ({ a, b }))
	});
});

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	loadSightingFiles: vi.fn().mockResolvedValue([]),
	saveSightingFiles: vi.fn().mockResolvedValue(undefined),
	updateSighting: mockUpdateSighting
}));

vi.mock('#lib/form/validation/sightingSchema.ts', () => ({
	getSightingSchema: vi.fn(() => ({ validate: vi.fn().mockResolvedValue(undefined) })),
	// PUT validiert gegen das Admin-Schema (siehe +server.ts).
	getAdminSightingSchema: vi.fn(() => ({ validate: vi.fn().mockResolvedValue(undefined) }))
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const validSightingBody = {
	referenceId: 'ref-test-123',
	firstName: 'Max',
	lastName: 'Muster',
	email: 'max@example.com',
	species: 0,
	totalCount: 1,
	sightingDate: '2024-06-15',
	hasPosition: true,
	latitude: 54.5,
	longitude: 13.5,
	privacyConsent: true,
	entryChannel: 0,
	boatDrive: 1,
	sightingFrom: 1,
	distance: 1,
	isDead: false
};

describe('Contract: GET /api/sightings/{id}', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectLimit.mockResolvedValue([{ ...mockSighting }]);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/123', {
			params: { id: '123' },
			locals: { user: mockAdminUser }
		});
		const res = await GET(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 400 for invalid id', async () => {
		const event = createEvent('/api/sightings/abc', {
			params: { id: 'abc' },
			locals: { user: mockAdminUser }
		});

		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 404 when sighting not found', async () => {
		mockSelectLimit.mockResolvedValueOnce([]);
		const event = createEvent('/api/sightings/999', {
			params: { id: '999' },
			locals: { user: mockAdminUser }
		});

		try {
			await GET(event);
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
		const event = createEvent('/api/sightings/123', {
			params: { id: '123' },
			locals: { user: mockAdminUser }
		});
		try {
			await GET(event);
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
		const event = createEvent('/api/sightings/123', {
			params: { id: '123' },
			locals: { user: mockAdminUser }
		});
		try {
			await GET(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: DELETE /api/sightings/{id}', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectLimit.mockResolvedValue([{ id: 123 }]);
		mockDeleteWhere.mockResolvedValue(undefined);
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/123', {
			method: 'DELETE',
			params: { id: '123' },
			locals: { user: mockAdminUser }
		});
		const res = await DELETE(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 400 for invalid id', async () => {
		const event = createEvent('/api/sightings/abc', {
			method: 'DELETE',
			params: { id: 'abc' },
			locals: { user: mockAdminUser }
		});

		try {
			await DELETE(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 404 when sighting not found', async () => {
		mockSelectLimit.mockResolvedValueOnce([]);
		const event = createEvent('/api/sightings/999', {
			method: 'DELETE',
			params: { id: '999' },
			locals: { user: mockAdminUser }
		});

		try {
			await DELETE(event);
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
		const event = createEvent('/api/sightings/123', {
			method: 'DELETE',
			params: { id: '123' },
			locals: { user: mockAdminUser }
		});
		try {
			await DELETE(event);
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
		const event = createEvent('/api/sightings/123', {
			method: 'DELETE',
			params: { id: '123' },
			locals: { user: mockAdminUser }
		});
		try {
			await DELETE(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});

describe('Contract: PUT /api/sightings/{id}', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectLimit.mockResolvedValue([{ ...mockSighting }]);
		mockUpdateSighting.mockResolvedValue({ ...mockSighting });
	});

	it('re-throws HttpError vom updateSighting direkt (nicht als 500 wrappen)', async () => {
		const { error } = await import('@sveltejs/kit');
		mockUpdateSighting.mockImplementationOnce(() => {
			throw error(400, 'Validation failed');
		});

		const event = createEvent('/api/sightings/123', {
			method: 'PUT',
			params: { id: '123' },
			locals: { user: mockAdminUser },
			body: validSightingBody
		});

		await expect(PUT(event)).rejects.toMatchObject({ status: 400 });
	});

	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/api/sightings/123', {
			method: 'PUT',
			params: { id: '123' },
			locals: { user: mockAdminUser },
			body: validSightingBody
		});
		const res = await PUT(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('throws 400 for invalid id', async () => {
		const event = createEvent('/api/sightings/abc', {
			method: 'PUT',
			params: { id: 'abc' },
			locals: { user: mockAdminUser },
			body: validSightingBody
		});

		try {
			await PUT(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('throws 302 when unauthenticated', async () => {
		const { requireUserRole } = vi.mocked(await import('#lib/server/auth/auth.ts'));
		requireUserRole.mockImplementationOnce(() => {
			throw { status: 302, location: '/api/auth/login' };
		});
		const event = createEvent('/api/sightings/123', {
			method: 'PUT',
			params: { id: '123' },
			locals: { user: mockAdminUser },
			body: validSightingBody
		});
		try {
			await PUT(event);
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
		const event = createEvent('/api/sightings/123', {
			method: 'PUT',
			params: { id: '123' },
			locals: { user: mockAdminUser },
			body: validSightingBody
		});
		try {
			await PUT(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});
});
