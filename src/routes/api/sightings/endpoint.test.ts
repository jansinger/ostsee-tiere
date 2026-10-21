import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';
import { saveSighting } from '#lib/server/db/sightingRepository.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';
import { issueFormToken } from '#lib/server/spam/formToken.ts';

// Mock dependencies
vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	saveSighting: vi.fn().mockResolvedValue({ id: 123 }),
	countRecentDuplicateSignals: vi.fn().mockResolvedValue({ sameEmail: 0, sameNotes: 0 })
}));

// Spam-Detektor mocken: verhindert echte MX-DNS-Lookups im Test und macht
// das übergebene Ergebnis deterministisch prüfbar.
vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] })
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// Mock EmailService to prevent sending real emails during tests
vi.mock('#lib/server/services/emailService.ts', () => ({
	EmailService: {
		sendNewSightingNotification: vi.fn().mockResolvedValue(true),
		sendTestEmail: vi.fn().mockResolvedValue(true),
		initialize: vi.fn().mockResolvedValue(undefined),
		clearTemplateCache: vi.fn()
	}
}));

// Mock ServerConfigService to prevent DB access for email config
vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getEmailConfig: vi.fn().mockResolvedValue({
			enabled: false,
			recipient: '',
			sender: 'noreply@test.com',
			senderName: 'Test'
		})
	}
}));

const mockedSaveSighting = vi.mocked(saveSighting);
const mockedDetectSpam = vi.mocked(detectSpamIndicators);

describe('/api/sightings POST endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedSaveSighting.mockResolvedValue({ id: 123 });
		mockedDetectSpam.mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] });
	});

	const createMockRequestEvent = (body: unknown) => {
		return {
			request: {
				json: async () => body,
				headers: {
					get: vi.fn((name: string) => {
						const headerMap: Record<string, string> = {
							'x-forwarded-for': '127.0.0.1',
							'x-real-ip': '127.0.0.1',
							'user-agent': 'vitest-test-agent'
						};
						return headerMap[name] || null;
					})
				}
			} as unknown as Request,
			cookies: {} as unknown as Parameters<typeof POST>[0]['cookies'],
			fetch: fetch,
			getClientAddress: () => '127.0.0.1',
			locals: {},
			params: {},
			platform: undefined,
			route: { id: '/api/sightings' },
			setHeaders: vi.fn(),
			url: new URL('http://localhost/api/sightings'),
			isDataRequest: false,
			isSubRequest: false,
			isRemoteRequest: false
		} as unknown as Parameters<typeof POST>[0];
	};

	it('should reject requests with admin fields', async () => {
		const maliciousRequest = createMockRequestEvent({
			firstName: 'John',
			lastName: 'Doe',
			email: 'john@example.com',
			species: 0,
			totalCount: 1,
			verified: true, // Admin field
			internalComment: 'This should not be allowed', // Admin field
			privacyConsent: true
		});

		const response = await POST(maliciousRequest);
		const result = await response.json();

		expect(response.status).toBe(403);
		expect(result.success).toBe(false);
		expect(result.code).toBe('FORBIDDEN_FIELDS');
		expect(result.forbiddenFields).toContain('verified');
		expect(result.forbiddenFields).toContain('internalComment');
	});

	it('should reject requests with unknown fields', async () => {
		const requestWithUnknownFields = createMockRequestEvent({
			firstName: 'John',
			lastName: 'Doe',
			email: 'john@example.com',
			species: 0,
			totalCount: 1,
			unknownField: 'should not be allowed',
			anotherBadField: 123,
			privacyConsent: true
		});

		const response = await POST(requestWithUnknownFields);
		const result = await response.json();

		expect(response.status).toBe(400);
		expect(result.success).toBe(false);
		expect(result.code).toBe('INVALID_FIELDS');
		expect(result.rejectedFields).toContain('unknownField');
		expect(result.rejectedFields).toContain('anotherBadField');
	});

	it('should accept valid sighting data', async () => {
		const validRequest = createMockRequestEvent({
			referenceId: 'test-ref-123',
			firstName: 'John',
			lastName: 'Doe',
			email: 'john@example.com',
			species: 0,
			totalCount: 1,
			sightingDate: '2024-01-15',
			hasPosition: true,
			latitude: 54.5,
			longitude: 13.5,
			privacyConsent: true,
			entryChannel: 0,
			boatDrive: 1,
			sightingFrom: 1,
			distance: 1,
			isDead: false
		});

		const response = await POST(validRequest);
		const result = await response.json();

		expect(response.status).toBe(201);
		expect(result.success).toBe(true);
		expect(result.id).toBe(123);
	}, 15000);

	it('should handle validation errors properly', async () => {
		const invalidRequest = createMockRequestEvent({
			// Missing required fields like firstName, lastName, email
			species: 0,
			totalCount: 1,
			privacyConsent: true
		});

		const response = await POST(invalidRequest);
		const result = await response.json();

		expect(response.status).toBe(400);
		expect(result.success).toBe(false);
		expect(result.code).toBe('VALIDATION_ERROR');
		expect(result.errors).toBeDefined();
	});

	it('should reject requests with honeypot field (spam protection)', async () => {
		const spamRequest = createMockRequestEvent({
			firstName: 'Spammer',
			lastName: 'Bot',
			email: 'spam@example.com',
			species: 0,
			totalCount: 1,
			privacyConsent: true,
			_honeypot: 'i-am-a-bot' // Honeypot field filled = spam
		});

		const response = await POST(spamRequest);
		const result = await response.json();

		expect(response.status).toBe(400);
		expect(result.success).toBe(false);
	});

	it('should reject non-object request bodies', async () => {
		const invalidRequest = createMockRequestEvent('not an object');

		const response = await POST(invalidRequest);
		const result = await response.json();

		expect(response.status).toBe(400);
		expect(result.success).toBe(false);
		expect(result.code).toBe('INVALID_FIELDS');
	});

	it('should call saveSighting on successful submission', async () => {
		const validRequest = createMockRequestEvent({
			referenceId: 'save-ref-123',
			firstName: 'Test',
			lastName: 'User',
			email: 'test@example.com',
			species: 0,
			totalCount: 1,
			sightingDate: '2024-01-15',
			hasPosition: true,
			latitude: 54.5,
			longitude: 13.5,
			privacyConsent: true,
			entryChannel: 0,
			boatDrive: 1,
			sightingFrom: 1,
			distance: 1,
			isDead: false
		});

		const response = await POST(validRequest);
		expect(response.status).toBe(201);

		// saveSighting should have been called exactly once
		expect(saveSighting).toHaveBeenCalledOnce();
	}, 15000);

	it('should accept requests with valid weather data', async () => {
		const validWeatherData = {
			provider: 'open-meteo',
			fetched_at: new Date().toISOString(),
			api_version: '1.0',
			data_type: 'historical',
			location: { latitude: 54.5, longitude: 13.5 },
			observation_time: '2024-01-15T12:00:00Z',
			raw_data: {
				temperature_2m: 8.5,
				wind_speed_10m: 15,
				wind_direction_10m: 270,
				weather_code: 3,
				visibility: 10000
			},
			processed: {
				beaufort: 4,
				seaState: 3,
				visibilityCategory: 'clear'
			},
			quality: {
				confidence: 0.85,
				source: 'historical'
			}
		};

		const requestWithWeather = createMockRequestEvent({
			referenceId: 'weather-ref-123',
			firstName: 'Test',
			lastName: 'User',
			email: 'test@example.com',
			species: 0,
			totalCount: 1,
			sightingDate: '2024-01-15',
			hasPosition: true,
			latitude: 54.5,
			longitude: 13.5,
			privacyConsent: true,
			entryChannel: 0,
			boatDrive: 1,
			sightingFrom: 1,
			distance: 1,
			isDead: false,
			weatherData: validWeatherData
		});

		const response = await POST(requestWithWeather);
		expect(response.status).toBe(201);

		// saveSighting should have been called with weather data as second argument
		expect(saveSighting).toHaveBeenCalledOnce();
		const weatherArg = vi.mocked(saveSighting).mock.calls[0]?.[1];
		expect(weatherArg).toBeDefined();
		expect(weatherArg).toHaveProperty('provider', 'open-meteo');
		expect(weatherArg).toHaveProperty('data_type', 'historical');
		expect(weatherArg).toHaveProperty('quality.confidence', 0.85);
	}, 15000);

	it('should include referenceId in valid submission', async () => {
		const validRequest = createMockRequestEvent({
			referenceId: 'ref-test-456',
			firstName: 'Test',
			lastName: 'User',
			email: 'test@example.com',
			species: 0,
			totalCount: 1,
			sightingDate: '2024-01-15',
			hasPosition: true,
			latitude: 54.5,
			longitude: 13.5,
			privacyConsent: true,
			entryChannel: 0,
			boatDrive: 1,
			sightingFrom: 1,
			distance: 1,
			isDead: false
		});

		await POST(validRequest);

		// saveSighting should be called with data including referenceId
		expect(saveSighting).toHaveBeenCalled();
		const formData = vi.mocked(saveSighting).mock.calls[0]?.[0];
		expect(formData).toHaveProperty('referenceId', 'ref-test-456');
	}, 15000);

	describe('Spam-Score bei der Meldung', () => {
		const validBody = (): Record<string, unknown> => ({
			referenceId: 'spam-ref-1',
			firstName: 'Test',
			lastName: 'User',
			email: 'test@example.com',
			species: 0,
			totalCount: 1,
			sightingDate: '2024-01-15',
			hasPosition: true,
			latitude: 54.5,
			longitude: 13.5,
			privacyConsent: true,
			entryChannel: 0,
			boatDrive: 1,
			sightingFrom: 1,
			distance: 1,
			isDead: false
		});

		it('entfernt _formToken vor der Feld-Validierung und akzeptiert die Meldung', async () => {
			const request = createMockRequestEvent({ ...validBody(), _formToken: 'kein-echtes-token' });

			const response = await POST(request);

			expect(response.status).toBe(201);
			expect(saveSighting).toHaveBeenCalledOnce();
		}, 15000);

		it('übergibt das Spam-Ergebnis als dritten Parameter an saveSighting', async () => {
			const spamResult = { score: 7, isHighRisk: true, indicators: ['Testindikator'] };
			mockedDetectSpam.mockResolvedValue(spamResult);

			const response = await POST(createMockRequestEvent(validBody()));

			expect(response.status).toBe(201);
			expect(mockedSaveSighting.mock.calls[0]?.[2]).toEqual(spamResult);
		}, 15000);

		it('übergibt die eigene Release-Version als vierten Parameter an saveSighting', async () => {
			const response = await POST(createMockRequestEvent(validBody()));

			expect(response.status).toBe(201);
			expect(mockedSaveSighting.mock.calls[0]?.[3]).toMatch(/^web\/\d+\.\d+\.\d+/);
		}, 15000);

		it('leitet die Client-Kennung vom Aufrufer ab, nicht vom gemeldeten entryChannel', async () => {
			// Kanal (entryChannel) und Erzeuger (Client-Kennung) beantworten verschiedene
			// Fragen: entryChannel ist eine fachliche Angabe zur Meldung (hier: Post,
			// MAIL = 2), die Client-Kennung beschreibt, über welchen Weg (dieses
			// Webformular) sie technisch eingegangen ist. Eine Meldung, die als
			// Post-Meldung deklariert ist, bekommt trotzdem `web/<version>`.
			const response = await POST(createMockRequestEvent({ ...validBody(), entryChannel: 2 }));

			expect(response.status).toBe(201);
			expect(mockedSaveSighting.mock.calls[0]?.[3]).toMatch(/^web\/\d+\.\d+\.\d+/);
		}, 15000);

		it('weist ein im Request-Body mitgeschicktes entryClient als unbekanntes Feld ab', async () => {
			// entryClient wird ausschließlich serverseitig aus dem Aufrufer
			// abgeleitet (resolveEntryClient) — ein Client könnte sich sonst
			// beliebig ausgeben. Der Endpunkt weist unbekannte Felder heute mit
			// 400/INVALID_FIELDS ab; das ist der bestehende Schutz, den dieser
			// Test festnagelt.
			const response = await POST(
				createMockRequestEvent({ ...validBody(), entryClient: 'gefälscht/1.0' })
			);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
			expect(result.code).toBe('INVALID_FIELDS');
			expect(result.rejectedFields).toContain('entryClient');
			expect(mockedSaveSighting).not.toHaveBeenCalled();
		}, 15000);

		it('meldet fehlendes Token als tokenStatus missing', async () => {
			await POST(createMockRequestEvent(validBody()));

			expect(mockedDetectSpam).toHaveBeenCalledWith(
				expect.objectContaining({ submission: { tokenStatus: 'missing' } })
			);
		}, 15000);

		it('meldet unbrauchbares Token als tokenStatus invalid', async () => {
			await POST(createMockRequestEvent({ ...validBody(), _formToken: 'kein-echtes-token' }));

			expect(mockedDetectSpam).toHaveBeenCalledWith(
				expect.objectContaining({ submission: { tokenStatus: 'invalid' } })
			);
		}, 15000);

		it('meldet ein gültiges Token als tokenStatus valid mit Formular-Alter', async () => {
			await POST(createMockRequestEvent({ ...validBody(), _formToken: issueFormToken() }));

			expect(mockedDetectSpam).toHaveBeenCalledWith(
				expect.objectContaining({
					submission: expect.objectContaining({
						tokenStatus: 'valid',
						ageSeconds: expect.any(Number)
					})
				})
			);
		}, 15000);
	});
});
