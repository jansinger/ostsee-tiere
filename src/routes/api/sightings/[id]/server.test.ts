import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError } from 'yup';

// Mock all external dependencies
vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn(),
		delete: vi.fn()
	}
}));

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	updateSighting: vi.fn(),
	loadSightingFiles: vi.fn(),
	saveSightingFiles: vi.fn()
}));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/form/validation/sightingSchema.ts', () => {
	// Stabile Objektreferenz je Schema — `getAdminSightingSchema()` wird von
	// `+server.ts` mehrfach aufgerufen und muss jedes Mal dasselbe gemockte
	// `validate` liefern, sonst greift `vi.mocked(...).mockRejectedValueOnce`
	// unten am falschen Objekt.
	const sightingSchemaMock = { validate: vi.fn().mockResolvedValue(undefined) };
	// PUT validiert gegen das Admin-Schema (siehe +server.ts).
	const adminSightingSchemaMock = { validate: vi.fn().mockResolvedValue(undefined) };
	return {
		getSightingSchema: vi.fn(() => sightingSchemaMock),
		getAdminSightingSchema: vi.fn(() => adminSightingSchemaMock)
	};
});

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

import { db } from '#lib/server/db/index.ts';
import { getAdminSightingSchema } from '#lib/form/validation/sightingSchema.ts';

const adminSightingSchema = getAdminSightingSchema();
import { updateSighting } from '#lib/server/db/sightingRepository.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { PUT } from './+server';

/**
 * Erstellt einen minimalen Request-Mock für PUT-Anfragen
 */
function createPutRequest(body: Record<string, unknown>) {
	return {
		json: vi.fn().mockResolvedValue(body),
		headers: {
			get: vi.fn().mockReturnValue(null)
		}
	};
}

const mockGetClientAddress = vi.fn().mockReturnValue('1.2.3.4') as unknown as () => string;

/**
 * Erstellt ein minimales Drizzle-förmiges Sichtungs-Objekt (DB-Shape)
 * mit Feldern im englischen Drizzle-Mapping-Format
 */
function createDrizzleSighting(overrides: Record<string, unknown> = {}) {
	return {
		id: 42,
		species: 0,
		totalCount: 1,
		juvenileCount: 0,
		sightingDate: new Date('2024-01-15T00:00:00.000Z'),
		latitude: '54.0',
		longitude: '12.0',
		waterway: null,
		seaMark: null,
		sightingFrom: 0,
		sightingFromText: null,
		distance: 0,
		shipCount: null,
		distribution: 0,
		distributionText: null,
		mediaFile: null,
		mediaUpload: 0,
		behavior: 0,
		behaviorText: null,
		reaction: null,
		otherObservations: null,
		seaState: 0,
		windDirection: null,
		windForce: null,
		visibility: 0,
		shipName: null,
		homePort: null,
		boatType: null,
		boatDrive: 0,
		boatDriveText: null,
		firstName: 'Max',
		lastName: 'Mustermann',
		street: null,
		zipCode: null,
		city: null,
		phone: null,
		fax: null,
		email: 'max@example.com',
		nameConsent: 0,
		shipNameConsent: 0,
		notes: null,
		created: new Date('2024-01-10T00:00:00.000Z'),
		entryChannel: 0,
		approvedAt: null,
		verified: 0,
		inBalticSea: 1,
		internalComment: null,
		location: null,
		inBalticSeaGeo: 1,
		referenceId: 'ref-123',
		isDead: 0,
		deadCondition: null,
		deadGender: null,
		deadSize: null,
		deadPhoneReport: null,
		weatherData: null,
		weatherFetchedAt: null,
		weatherProvider: null,
		weatherApiVersion: null,
		weatherDataType: null,
		...overrides
	};
}

describe('PUT /api/sightings/[id] - changedFields Audit-Diff', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('meldet nur geänderte Felder wenn species sich ändert (Drizzle-Shape Vergleich)', async () => {
		// Arrange: DB-Record vor dem Update (species = 0)
		const currentRecord = createDrizzleSighting({ species: 0 });

		// DB-Record nach dem Update (species = 1)
		const updatedRecord = createDrizzleSighting({ species: 1 });

		// DB-Mock: select() gibt currentRecord zurück
		const mockSelect = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([currentRecord])
				})
			})
		};
		vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

		// updateSighting gibt updatedRecord zurück (Drizzle-Shape)
		vi.mocked(updateSighting).mockResolvedValue(
			updatedRecord as unknown as Awaited<ReturnType<typeof updateSighting>>
		);

		// Minimal gültiger SightingFormData Request-Body (camelCase / SightingFormData Shape)
		const requestBody = {
			species: 1,
			totalCount: 1,
			date: '2024-01-15',
			time: '14:00',
			firstName: 'Max',
			lastName: 'Mustermann',
			email: 'max@example.com'
		};

		const mockRequest = createPutRequest(requestBody);
		const mockLocals = { user: { email: 'admin@example.com', roles: ['admin'] } };
		const mockUrl = new URL('http://localhost/api/sightings/42?preview=0');

		// Act
		await PUT({
			params: { id: '42' },
			request: mockRequest as unknown as Request,
			locals: mockLocals as unknown as App.Locals,
			url: mockUrl,
			getClientAddress: mockGetClientAddress
		} as Parameters<typeof PUT>[0]);

		// Assert: logAuditEvent wurde aufgerufen
		expect(logAuditEvent).toHaveBeenCalled();

		const auditCall = vi.mocked(logAuditEvent).mock.calls[0]?.[0];
		const changedFields: string[] = auditCall?.details?.changedFields as string[];

		// Der Bug: changedFields enthält ALLE Felder weil formData vs currentRecord verglichen wird
		// Nach dem Fix: changedFields enthält NUR 'species'
		expect(changedFields).toContain('species');
		expect(changedFields).not.toContain('totalCount');
		expect(changedFields).not.toContain('sightingDate');
		expect(changedFields).not.toContain('firstName');
		expect(changedFields).not.toContain('lastName');
		expect(changedFields).not.toContain('email');
		expect(changedFields.length).toBe(1);
		expect(auditCall?.ipAddress).toBe('1.2.3.4');
	});

	it('meldet keine geänderten Felder wenn sich nichts ändert', async () => {
		// Arrange: currentRecord und updatedRecord identisch
		const currentRecord = createDrizzleSighting({ species: 0 });
		const updatedRecord = createDrizzleSighting({ species: 0 });

		const mockSelect = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([currentRecord])
				})
			})
		};
		vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);
		vi.mocked(updateSighting).mockResolvedValue(
			updatedRecord as unknown as Awaited<ReturnType<typeof updateSighting>>
		);

		const requestBody = {
			species: 0,
			totalCount: 1,
			date: '2024-01-15',
			time: '14:00',
			firstName: 'Max',
			lastName: 'Mustermann',
			email: 'max@example.com'
		};

		const mockRequest = createPutRequest(requestBody);
		const mockLocals = { user: { email: 'admin@example.com', roles: ['admin'] } };
		const mockUrl = new URL('http://localhost/api/sightings/42?preview=0');

		// Act
		await PUT({
			params: { id: '42' },
			request: mockRequest as unknown as Request,
			locals: mockLocals as unknown as App.Locals,
			url: mockUrl,
			getClientAddress: mockGetClientAddress
		} as Parameters<typeof PUT>[0]);

		// Assert: changedFields ist leer
		expect(logAuditEvent).toHaveBeenCalled();
		const auditCall = vi.mocked(logAuditEvent).mock.calls[0]?.[0];
		const changedFields: string[] = auditCall?.details?.changedFields as string[];

		expect(changedFields.length).toBe(0);
	});
});

describe('PUT /api/sightings/[id] - abgelehnte Eingaben', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * Eine abgelehnte Eingabe ist kein Serverfehler.
	 *
	 * Vorher lief die Yup-`ValidationError` in den 500er-Zweig, und der Admin las
	 * „Interner Serverfehler" — ausgerechnet in dem Fall, in dem die Meldung ihm
	 * hätte sagen können, welches Feld ihn blockiert.
	 */
	it('antwortet mit 400 und nennt die betroffenen Felder', async () => {
		const validationError = new ValidationError('Bitte geben Sie eine Entfernung an.');
		validationError.inner = [
			Object.assign(new ValidationError('Bitte geben Sie eine Entfernung an.'), {
				path: 'distance'
			}),
			Object.assign(new ValidationError('Tierart fehlt'), { path: 'species' })
		];
		vi.mocked(adminSightingSchema.validate).mockRejectedValueOnce(validationError);

		const mockRequest = createPutRequest({ species: 1 });
		const response = await PUT({
			params: { id: '42' },
			request: mockRequest as unknown as Request,
			locals: { user: { email: 'admin@example.com', roles: ['admin'] } } as unknown as App.Locals,
			url: new URL('http://localhost/api/sightings/42'),
			getClientAddress: mockGetClientAddress
		} as Parameters<typeof PUT>[0]);

		expect(response.status).toBe(400);
		// Dieselbe Hülle wie bei POST /api/sightings — eine Ressource, ein Format.
		await expect(response.json()).resolves.toEqual({
			success: false,
			code: 'VALIDATION_ERROR',
			message: 'Bitte geben Sie eine Entfernung an.',
			errors: { distance: 'Bitte geben Sie eine Entfernung an.', species: 'Tierart fehlt' }
		});

		// Kein Update, wenn die Eingabe nicht durchkommt.
		expect(updateSighting).not.toHaveBeenCalled();
	});

	/**
	 * Nicht jeder Yup-Fehler trägt ein Feld: Ein schemaweiter `.test()` schlägt
	 * ohne `path` fehl, und je nach Aufrufweg bleibt `inner` leer. Ohne Auffangwert
	 * käme eine leere Fehlerkarte zurück — das Formular hätte dann nichts
	 * anzuzeigen und der Admin keinen Anhaltspunkt. `POST /api/sightings` löst das
	 * seit jeher über denselben Schlüssel.
	 */
	it('nennt einen Sammelschlüssel, wenn kein Feld benannt ist', async () => {
		const validationError = new ValidationError('Die Angaben passen nicht zusammen.');
		validationError.inner = [];
		vi.mocked(adminSightingSchema.validate).mockRejectedValueOnce(validationError);

		const response = await PUT({
			params: { id: '42' },
			request: createPutRequest({ species: 1 }) as unknown as Request,
			locals: { user: { email: 'admin@example.com', roles: ['admin'] } } as unknown as App.Locals,
			url: new URL('http://localhost/api/sightings/42'),
			getClientAddress: mockGetClientAddress
		} as Parameters<typeof PUT>[0]);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			errors: { allgemein: 'Die Angaben passen nicht zusammen.' }
		});
	});
});
