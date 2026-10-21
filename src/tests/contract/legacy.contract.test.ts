import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvent } from './helpers/createEvent';
import { asApiResponse } from './helpers/asApiResponse';
/*
 * Die vier Routen-Module bewusst statisch am Dateikopf, nicht per
 * `await import()` im Testkörper — gleiche Begründung wie in
 * `src/routes/sichtungen/showreports.json/localePinning.test.ts`: Der Modulgraph
 * zieht über die formOptions den kompletten Paraglide-Barrel
 * (`#lib/paraglide/messages.js` → 1.306 Einzelmodule) nach. Dessen Transform kostet
 * im vollen `test:quick`-Lauf ~5 s, weil 340 Testdateien parallel um dieselben
 * Kerne konkurrieren, und lief damit im Testkörper in Vitests 5000-ms-Grenze pro
 * Test. Am Dateikopf zählt derselbe Aufwand zur Collect-Phase, für die keine
 * Test-Zeitgrenze gilt. `vi.mock` wird über alle Importe gehoben, die Attrappen
 * oben greifen also unverändert.
 */
import { POST } from '../../routes/rest_sichtungen/+server';
import { GET as getAntworten } from '../../routes/rest_sichtungen/antworten.json/+server';
import { GET as getInBaltic } from '../../routes/rest_sichtungen/inBaltic.json/+server';
import { GET as getShowreports } from '../../routes/sichtungen/showreports.json/+server';

// ─── Shared hoisted mocks ───────────────────────────────────────────────────

const { mockSaveSighting, mockValidate, mockCreateError, mockSelectLimit } = vi.hoisted(() => {
	const mockSaveSighting = vi.fn().mockResolvedValue({ id: 1234 });
	const mockValidate = vi.fn().mockResolvedValue({ isValid: true, errors: {} });
	const mockCreateError = vi
		.fn()
		.mockReturnValue({ message: 'Validation failed.', errors: { anzahl_gesamt: ['Required'] } });
	const mockSelectLimit = vi.fn().mockResolvedValue([]);
	return { mockSaveSighting, mockValidate, mockCreateError, mockSelectLimit };
});

// ─── POST /rest_sichtungen mocks ────────────────────────────────────────────

vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	saveSighting: mockSaveSighting,
	countRecentDuplicateSignals: vi.fn().mockResolvedValue({ sameEmail: 0, sameNotes: 0 })
}));

// Spam-Detektor mocken: verhindert echte MX-DNS-Lookups im Contract-Test.
vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] })
}));
vi.mock('#lib/server/services/emailService.ts', () => ({
	EmailService: {
		sendNewSightingNotification: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getEmailConfig: vi.fn().mockResolvedValue({ enabled: false, recipient: null })
	}
}));

vi.mock('#lib/legacy-api/yup-validation.ts', () => ({
	validateLegacySightingWithYup: mockValidate,
	createLegacyErrorFromYup: mockCreateError
}));

vi.mock('#lib/legacy-api/validation.ts', () => ({
	validateDeathFinding: vi.fn()
}));

vi.mock('#lib/legacy-api/field-mapping.ts', () => ({
	mapLegacyToCurrentSchema: vi.fn().mockReturnValue({
		sightingDate: '2024-01-15',
		time: '14:30',
		firstName: 'Max',
		lastName: 'Mustermann',
		email: 'max@example.com',
		totalCount: 2,
		species: 0
	})
}));

vi.mock('#lib/legacy-api/error-messages.ts', () => ({
	LEGACY_API_MESSAGES: { NO_DATA_SEND: 'No data send.' },
	// Flache Legacy-Fehlerform (`message` als String) — wie das echte Modul und
	// wie `LegacyErrorResponse` in static/openapi.yml.
	createOriginalApiErrorResponse: vi.fn().mockReturnValue({ message: 'Error' }),
	createSimpleErrorResponse: vi.fn().mockReturnValue({ message: 'Error' })
}));

vi.mock('#lib/server/middleware/rateLimit.ts', () => ({
	enforceRateLimit: vi.fn(),
	RATE_LIMITS: { SIGHTING_SUBMISSION: { limit: 20, window: 3600 } }
}));

// ─── GET /rest_sichtungen/inBaltic.json mocks ───────────────────────────────

vi.mock('#lib/server/geo/checkBalticSeaFile.ts', () => ({
	checkBalticSeaFile: vi.fn().mockReturnValue({ inBaltic: true, inChartArea: true })
}));

// ─── GET /sichtungen/showreports.json mocks ─────────────────────────────────

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: mockSelectLimit
					})
				})
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('#lib/server/db/schema.ts', {
		sightings: {
			id: 'id',
			sightingDate: 'sightingDate',
			latitude: 'latitude',
			longitude: 'longitude',
			totalCount: 'totalCount',
			juvenileCount: 'juvenileCount',
			firstName: 'firstName',
			lastName: 'lastName',
			nameConsent: 'nameConsent',
			waterway: 'waterway',
			shipName: 'shipName',
			shipNameConsent: 'shipNameConsent',
			approvedAt: 'approvedAt',
			species: 'species',
			isDead: 'isDead',
			email: 'email'
		}
	});
});

// Attrappe für `drizzle-orm`: Die Contract-Tests prüfen ausschließlich die
// Response gegen static/openapi.yml, nicht die erzeugte SQL — deshalb genügen
// Platzhalter.
//
// Diese Attrappe ersetzt das Modul vollständig, ein hier fehlender Helper ist
// zur Laufzeit also nicht da — auch bei **mittelbarem** Aufruf: Seit
// `/sichtungen/showreports.json` sein Freigabe-Prädikat über `approvedOnly()`
// aus `#lib/server/db/approvalFilter.js` bezieht, hängt der Endpunkt an
// `isNotNull`, ohne es selbst zu importieren. `strictModuleMock` nennt den
// fehlenden Namen; ohne es meldete der Test nur „expected 500 to be 200",
// weil der catch-Block der Route den Wurf verschluckt (PR #701).
//
// Bewusst nur die tatsächlich aufgerufenen Helper (YAGNI, empirisch geprüft):
// `gte`/`lt` etwa nutzt der Endpunkt für den `year`-Filter, den hier kein Test
// setzt. Wer einen solchen Test ergänzt, muss sie nachtragen — die Attrappe
// sagt jetzt selbst, welchen.
//
// Die Rückgabetypen sind absichtlich uneinheitlich, weil es die Originale auch
// sind: `and`/`between` sind Kombinatoren (Array/Objekt), `sql` und `isNotNull`
// bauen SQL-Fragmente und geben deshalb beide einen String zurück — im echten
// drizzle ist `isNotNull(value)` nichts anderes als ein sql-Template mit dem
// Suffix "is not null". Die Form ist hier ohnehin inert: Die Bedingungen wandern
// über `and(...)` in `.where()`, und der `db`-Mock unten wertet dieses Argument
// nicht aus.
vi.mock('drizzle-orm', async () => {
	const { strictModuleMock } = await import('./helpers/strictModuleMock');
	return strictModuleMock('drizzle-orm', {
		and: vi.fn((...args) => args),
		between: vi.fn((a, b, c) => ({ a, b, c })),
		isNotNull: vi.fn((column) => `${String(column)} is not null`),
		sql: Object.assign(
			vi.fn((strings: TemplateStringsArray) => String(strings.raw[0])),
			{
				raw: vi.fn((s: string) => s)
			}
		)
	});
});

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Contract: POST /rest_sichtungen', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidate.mockResolvedValue({ isValid: true, errors: {} });
		mockSaveSighting.mockResolvedValue({ id: 1234 });
	});

	it('returns 201 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/rest_sichtungen', {
			method: 'POST',
			body: {
				sichtungsdatum: '2024-01-15 14:30',
				anzahl_gesamt: 2,
				vorname: 'Max',
				name: 'Mustermann',
				email: 'max@example.com'
			}
		});
		const res = await POST(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(201);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 400 for validation errors', async () => {
		mockValidate.mockResolvedValueOnce({ isValid: false, errors: { anzahl_gesamt: ['Required'] } });
		mockCreateError.mockReturnValueOnce({
			message: 'Validation failed.',
			errors: { anzahl_gesamt: ['Dieses Feld kann nicht leer gelassen werden.'] }
		});

		const event = createEvent('/rest_sichtungen', {
			method: 'POST',
			body: {}
		});
		const res = await POST(event);

		expect(res.status).toBe(400);
	});

	it('throws 429 when rate limit is exceeded', async () => {
		const { enforceRateLimit } = vi.mocked(await import('#lib/server/middleware/rateLimit.ts'));
		enforceRateLimit.mockImplementationOnce(() => {
			throw { status: 429, body: { message: 'Too many requests' } };
		});
		const event = createEvent('/rest_sichtungen', {
			method: 'POST',
			body: {
				sichtungsdatum: '2024-01-15 14:30',
				anzahl_gesamt: 2,
				vorname: 'Max',
				name: 'Mustermann',
				email: 'max@example.com'
			}
		});
		try {
			await POST(event);
			expect.fail('should have thrown');
		} catch (e: any) {
			expect(e.status).toBe(429);
		}
	});
});

describe('Contract: GET /rest_sichtungen/antworten.json', () => {
	it('returns 200 and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/rest_sichtungen/antworten.json');
		const res = await getAntworten(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns all required option groups', async () => {
		const event = createEvent('/rest_sichtungen/antworten.json');
		const res = await getAntworten(event);
		const body = await res.json();

		const required = [
			'tierart',
			'vonwo',
			'entfernung',
			'verteilung',
			'verhalten',
			'seegang',
			'windrichtung',
			'windstaerke',
			'sichtweite',
			'bootsantrieb',
			'eingangskanal',
			'totfund_zustand',
			'totfund_geschlecht'
		];
		for (const key of required) {
			expect(body).toHaveProperty(key);
		}
	});
});

describe('Contract: GET /rest_sichtungen/inBaltic.json', () => {
	it('returns 200 with valid location and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/rest_sichtungen/inBaltic.json', {
			searchParams: { location: '54.3233,13.0814' }
		});
		const res = await getInBaltic(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 400 when location parameter is missing', async () => {
		const event = createEvent('/rest_sichtungen/inBaltic.json');
		const res = await getInBaltic(event);

		expect(res.status).toBe(400);
	});
});

describe('Contract: GET /sichtungen/showreports.json', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectLimit.mockResolvedValue([]);
	});

	it('returns 200 empty array and satisfies the OpenAPI spec', async () => {
		const event = createEvent('/sichtungen/showreports.json');
		const res = await getShowreports(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('returns 200 with sighting data and satisfies the OpenAPI spec', async () => {
		mockSelectLimit.mockResolvedValueOnce([
			{
				id: 817,
				sichtungsdatum: new Date('2024-01-25T14:50:00Z'),
				latitude: '54.646667',
				longitude: '11.333333',
				totalCount: 1,
				juvenileCount: 0,
				firstName: 'Max',
				lastName: 'Mustermann',
				nameConsent: false,
				waterway: 'Fehmarnbelt',
				shipName: null,
				shipNameConsent: false,
				approvedAt: new Date(),
				species: 0,
				isDead: false
			}
		]);

		const event = createEvent('/sichtungen/showreports.json');
		const res = await getShowreports(event);
		const apiRes = await asApiResponse(res, event);

		expect(apiRes.status).toBe(200);
		expect(apiRes).toSatisfyApiSpec();
	});

	it('lat/lon fields are strings (critical legacy requirement)', async () => {
		mockSelectLimit.mockResolvedValueOnce([
			{
				id: 817,
				sichtungsdatum: new Date('2024-01-25T14:50:00Z'),
				latitude: '54.646667',
				longitude: '11.333333',
				totalCount: 1,
				juvenileCount: 0,
				firstName: null,
				lastName: null,
				nameConsent: false,
				waterway: null,
				shipName: null,
				shipNameConsent: false,
				approvedAt: new Date(),
				species: 0,
				isDead: false
			}
		]);

		const event = createEvent('/sichtungen/showreports.json');
		const res = await getShowreports(event);
		const body = await res.json();

		expect(typeof body[0].lat).toBe('string');
		expect(typeof body[0].lon).toBe('string');
	});
});
