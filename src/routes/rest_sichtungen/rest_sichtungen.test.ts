/**
 * @fileoverview Tests for PDF-compliant Legacy REST API sighting creation
 *
 * Tests the POST /rest_sichtungen endpoint for 100% PDF specification compliance.
 * This endpoint MUST maintain exact compatibility with original schweinswalsichtung.de API.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import type { LegacySightingRequest } from '#lib/legacy-api/types.ts';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimits } from '#lib/server/middleware/rateLimit.ts';
import { DELETE, POST, PUT } from './+server';

// Mock dependencies - these need to be hoisted before any imports
vi.mock('#lib/server/db/sightingRepository.ts', () => ({
	saveSighting: vi.fn(),
	countRecentDuplicateSignals: vi.fn().mockResolvedValue({ sameEmail: 0, sameNotes: 0 })
}));

// Spam-Detektor mocken: verhindert echte MX-DNS-Lookups im Test und macht
// das an saveSighting übergebene Ergebnis deterministisch.
vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] })
}));

vi.mock('#lib/server/geo/checkBalticSeaFile.ts', () => ({
	checkBalticSeaFile: vi.fn()
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn().mockReturnValue({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// Mock ServerConfigService to prevent real config loading
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

// Note: EmailService is already mocked in vitest-setup-server.ts
// No need to mock it again here

// Import mocked modules statically to avoid race conditions
import { saveSighting } from '#lib/server/db/sightingRepository.ts';
import { checkBalticSeaFile } from '#lib/server/geo/checkBalticSeaFile.ts';

// Helper to create mock request event
function createMockRequestEvent(body: LegacySightingRequest, userAgent?: string): RequestEvent {
	return {
		request: {
			json: () => Promise.resolve(body),
			headers: {
				get: (name: string) => {
					if (name === 'content-type') return 'application/json';
					if (name === 'user-agent') return userAgent ?? null;
					return null;
				}
			}
		},
		getClientAddress: () => '127.0.0.1'
	} as any;
}

// Get mocked functions with proper typing
const mockSave = vi.mocked(saveSighting);
const mockCheckBalticSea = vi.mocked(checkBalticSeaFile);

describe('PDF-Compliant Legacy REST API - POST /rest_sichtungen', () => {
	beforeEach(() => {
		// Clear all mocks but don't reset implementations
		vi.clearAllMocks();

		// Der Rate-Limiter zählt prozessweit am Modul, nicht am Request: Ohne
		// diesen Reset teilen sich alle Tests dieser Datei das Kontingent von
		// 20 Meldungen pro Stunde und IP, und der 21. Test scheitert mit 429.
		resetRateLimits();

		// Default geo validation to return valid Baltic Sea location
		mockCheckBalticSea.mockReturnValue({
			inBaltic: true,
			inChartArea: true,
			longitude: 10.1367,
			latitude: 54.3233
		});

		// Default save to return successful result
		mockSave.mockResolvedValue({
			id: 12345
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('PDF Compliance - Basic Functionality', () => {
		it('should create sighting with required fields and return exact PDF response format', async () => {
			const validRequest: LegacySightingRequest = {
				sichtungsdatum: '2024-03-15 14:30', // PDF format: YYYY-MM-DD HH:MI
				anzahl_gesamt: 3,
				vorname: 'Max',
				name: 'Mustermann', // PDF uses "name" not "nachname"
				email: 'max@example.com'
			};

			const event = createMockRequestEvent(validRequest);
			const response = await POST(event);

			// PDF compliance: Must return 201 Created
			expect(response.status).toBe(201);

			// PDF compliance: Must return exact response format
			const responseData = await response.json();
			expect(responseData).toMatchObject({
				message: 'Saved' // Exact PDF specification
			});

			// PDF compliance: Must set Location header with exact format
			expect(response.headers.get('Location')).toBe('/rest_sichtungen/view/12345.json');

			// Verify correct data transformation
			expect(mockSave).toHaveBeenCalledWith(
				expect.objectContaining({
					sightingDate: '2024-03-15T12:00:00.000Z', // Date component (normalized to noon UTC)
					sightingTime: '14:30', // Time component
					firstName: 'Max',
					lastName: 'Mustermann', // Maps from "name" field
					email: 'max@example.com',
					totalCount: 3,
					entryChannel: 4 // APP channel
				}),
				undefined,
				expect.objectContaining({ score: expect.any(Number) }),
				'unbekannt'
			);
		});

		it('should handle all PDF-specified fields correctly', async () => {
			const fullRequest: LegacySightingRequest = {
				// Required fields (PDF specification)
				sichtungsdatum: '2024-03-15 09:15',
				anzahl_gesamt: 8,
				vorname: 'Anna',
				name: 'Schmidt',
				email: 'anna@example.com',

				// Optional fields (PDF specification)
				gps_breite: 54.5,
				gps_laenge: 11.2,
				fahrwasser: 'Kieler Bucht',
				seezeichen: 'Leuchtturm Dahmeshöved',
				vonwo: 1, // PDF: Integer-Range 0-3
				entfernung: 2, // PDF: Integer-Range 1-5
				anzahl_jung: 2,
				verteilung: 1, // PDF: Integer-Range 0-3
				aufnahme: 'photo123.jpg',
				aufnahmeHochladen: 1, // PDF: Boolean as 0/1
				verhalten: 3, // PDF: Integer-Range 0-3
				reaktion: 'Animals approached boat',
				sonstige_auffaelligkeiten: 'Perfect weather conditions', // PDF: field name uses "ae", not "ä"
				seegang: 2, // PDF: Integer-Range 0-5
				windrichtung: 'SO', // PDF: Must include 'SO'
				windstaerke: '3', // PDF: String format 1-12
				sichtweite: 3, // PDF: Integer-Range 1-4
				schiffsname: 'MS Baltic',
				telefon: '+49 123 456789',
				namensnennung: 1, // PDF: Boolean as 0/1
				schiffnamensnennung: 0, // PDF: Boolean as 0/1
				bemerkungen: 'Beautiful sighting',
				tierart: 0 // PDF: Integer-Range 0-10, Default = 0
			};

			const event = createMockRequestEvent(fullRequest);
			const response = await POST(event);

			expect(response.status).toBe(201);

			// Verify all fields are correctly mapped
			expect(mockSave).toHaveBeenCalledWith(
				expect.objectContaining({
					phone: '+49 123 456789',
					juvenileCount: 2,
					species: 0,
					latitude: 54.5,
					longitude: 11.2,
					nameConsent: true,
					shipNameConsent: false,
					mediaUpload: true,
					mediaFile: 'photo123.jpg',
					windDirection: 'SO', // Critical: Must support 'SO'
					otherObservations: 'Perfect weather conditions'
				}),
				undefined,
				expect.objectContaining({ score: expect.any(Number) }),
				'unbekannt'
			);
		});

		it('should also accept the historic umlaut spelling of sonstige_auffaelligkeiten', async () => {
			// Die Implementierung las bis 2026-07-30 nur `sonstige_auffälligkeiten`.
			// Beide Schreibweisen bleiben gültig, damit weder spec-konforme noch
			// bereits vorhandene Clients ihren Freitext verlieren.
			const event = createMockRequestEvent({
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 1,
				vorname: 'Umlaut',
				name: 'Test',
				email: 'umlaut@example.com',
				sonstige_auffälligkeiten: 'Auffälliges Verhalten'
			} as LegacySightingRequest);
			const response = await POST(event);

			expect(response.status).toBe(201);
			expect(mockSave).toHaveBeenCalledWith(
				expect.objectContaining({ otherObservations: 'Auffälliges Verhalten' }),
				undefined,
				expect.objectContaining({ score: expect.any(Number) }),
				'unbekannt'
			);
		});

		it('bewertet Legacy-Meldungen ohne Formular-Token-Malus (App kennt kein Token)', async () => {
			const { detectSpamIndicators } = await import('#lib/server/spam/spamDetector.ts');
			const event = createMockRequestEvent({
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 1,
				vorname: 'App',
				name: 'Client',
				email: 'app@example.com'
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
			expect(detectSpamIndicators).toHaveBeenCalledOnce();
			const spamInput = vi.mocked(detectSpamIndicators).mock.calls[0]?.[0];
			// Kein `submission`-Kontext: 'missing' würde jede App-Meldung bestrafen,
			// obwohl der Legacy-Vertrag gar kein Token vorsieht.
			expect(spamInput?.submission).toBeUndefined();
		});

		it('übergibt ohne GPS-Angabe keine Koordinaten an die Spam-Prüfung', async () => {
			// mapLegacyToCurrentSchema mappt fehlendes GPS auf 0 — ginge das roh in
			// den Detektor, entstünde mit ostsee_geo = 0 der falsche Indikator
			// „Position weit außerhalb der Ostsee" für jede Meldung ohne Position.
			const { detectSpamIndicators } = await import('#lib/server/spam/spamDetector.ts');
			const event = createMockRequestEvent({
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 1,
				vorname: 'Ohne',
				name: 'Position',
				email: 'ohne-gps@example.com'
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
			const spamInput = vi.mocked(detectSpamIndicators).mock.calls[0]?.[0];
			expect(spamInput?.latitude ?? null).toBeNull();
			expect(spamInput?.longitude ?? null).toBeNull();
		});

		it('should handle death finding (anzahl_gesamt = 0) as per PDF', async () => {
			const deathRequest: LegacySightingRequest = {
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 0, // PDF: "0 ist derzeit erlaubt und wird als Totfund interpretiert"
				vorname: 'Test',
				name: 'User',
				email: 'test@example.com',
				totfund_groesse: 180,
				totfund_zustand: 2, // PDF: Integer-Range 0-5
				totfund_geschlecht: 1 // PDF: Integer-Range 0-2
			};

			const event = createMockRequestEvent(deathRequest);
			const response = await POST(event);

			expect(response.status).toBe(201);
			expect(mockSave).toHaveBeenCalledWith(
				expect.objectContaining({
					totalCount: 0,
					isDead: true, // Auto-detected from anzahl_gesamt = 0
					deadSize: 180,
					deadCondition: 2,
					deadSex: 1
				}),
				undefined,
				expect.objectContaining({ score: expect.any(Number) }),
				'unbekannt'
			);
		});
	});

	describe('PDF Compliance - Validation Errors', () => {
		it('should return exact PDF error format for validation failures', async () => {
			const invalidRequest = {
				sichtungsdatum: '2024-03-15 12:00'
				// Missing required fields as per PDF
			} as LegacySightingRequest;

			const event = createMockRequestEvent(invalidRequest);
			const response = await POST(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();

			// PDF compliance: flache Fehlerform aus dem Abschnitt „Bei
			// Validierungsfehlern" — `message` ist ein String, `errors` liegt
			// daneben. Eine geschachtelte `message.message`-Struktur wäre für
			// Clients, die `message` als Text lesen, ein Objekt.
			expect(responseData.message).toBe('Validation failed.');
			expect(responseData.errors).toEqual(
				expect.objectContaining({
					anzahl_gesamt: expect.arrayContaining([expect.any(String)])
				})
			);
		});

		it('should validate PDF datetime format strictly', async () => {
			const invalidRequest: LegacySightingRequest = {
				sichtungsdatum: '15.03.2024 12:00', // Wrong format, PDF requires YYYY-MM-DD HH:MI
				anzahl_gesamt: 1,
				vorname: 'Test',
				name: 'User',
				email: 'test@example.com'
			};

			const event = createMockRequestEvent(invalidRequest);
			const response = await POST(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.message).toBe('Validation failed.');
			expect(responseData.errors).toHaveProperty('sichtungsdatum');
		});

		it('should validate coordinate ranges as per PDF', async () => {
			const invalidRequest: LegacySightingRequest = {
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 1,
				vorname: 'Test',
				name: 'User',
				email: 'test@example.com',
				gps_breite: 95, // PDF: Must be -90 to 90
				gps_laenge: 200 // PDF: Must be -180 to 180
			};

			const event = createMockRequestEvent(invalidRequest);
			const response = await POST(event);

			expect(response.status).toBe(400);
		});
	});

	describe('PDF Compliance - Field Ranges', () => {
		it('should accept all PDF-specified enum ranges', async () => {
			const rangeTestRequest: LegacySightingRequest = {
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 5,
				vorname: 'Range',
				name: 'Test',
				email: 'range@example.com',
				vonwo: 3, // PDF: 0-3 range
				entfernung: 5, // PDF: 1-5 range
				verteilung: 3, // PDF: 0-3 range
				verhalten: 3, // PDF: 0-3 range
				seegang: 5, // PDF: 0-5 range
				sichtweite: 4, // PDF: 1-4 range
				bootsantrieb: 4, // PDF: 0-4 range
				eingangskanal: 5, // PDF: 0-5 range
				tierart: 10, // PDF: 0-10 range
				totfund_zustand: 5, // PDF: 0-5 range
				totfund_geschlecht: 2 // PDF: 0-2 range
			};

			const event = createMockRequestEvent(rangeTestRequest);
			const response = await POST(event);

			// Should accept all valid ranges
			expect(response.status).toBe(201);
		});

		// Test wind directions - consolidated for better performance
		it.each([
			['N', 'North'],
			['NW', 'North-West'],
			['W', 'West'],
			['SW', 'South-West'],
			['S', 'South'],
			['SO', 'South-East (German)'],
			['O', 'East (German)'],
			['NO', 'North-East (German)']
		])('should support wind direction %s (%s)', async (direction) => {
			const event = createMockRequestEvent({
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 1,
				vorname: 'Wind',
				name: 'Test',
				email: 'wind@example.com',
				windrichtung: direction
			});
			const response = await POST(event);
			expect(response.status).toBe(201);
		});
	});

	describe('PDF Compliance - Unparsable Body', () => {
		it('should answer an unparsable JSON body with 200 and a flat "No data send." message', async () => {
			// Dieser Pfad ist keine PDF-Zusage, sondern Verhalten dieser
			// Implementierung (Status 200, nicht 400). Er wird hier festgenagelt,
			// weil `static/openapi.yml` ihn seit 2026-07-30 als 200-Response
			// dokumentiert — und weil `message` dabei ein String sein muss.
			const event = {
				request: {
					json: () => Promise.reject(new SyntaxError('Unexpected token')),
					headers: {
						get: (name: string) => (name === 'content-type' ? 'application/json' : null)
					}
				},
				getClientAddress: () => '127.0.0.1'
			} as unknown as RequestEvent;

			const response = await POST(event);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ message: 'No data send.' });
		});
	});

	describe('PDF Compliance - HTTP Methods', () => {
		// `GET` fehlt hier bewusst. Der Pfad gehört seit 2026-08 nicht mehr zu
		// den abgelehnten Methoden: Er ist der Index der Legacy-API und die
		// Datenquelle der Karte in der angebundenen iOS-App. Dass er hier bis
		// dahin mit `405` als „unsupported" festgeschrieben war, hat die Lücke
		// jahrelang wie eine Absicht aussehen lassen. Geprüft wird er in
		// `index.test.ts` — ein zweiter Test an dieser Stelle könnte nur
		// wiederholen, was dort steht.

		it('should reject PUT requests with 405', async () => {
			const response = await PUT();

			expect(response.status).toBe(405);
		});

		it('should reject DELETE requests with 405', async () => {
			const response = await DELETE();

			expect(response.status).toBe(405);
		});
	});

	describe('PDF Compliance - Database Error Handling', () => {
		it('should handle save errors gracefully', async () => {
			mockSave.mockRejectedValue(new Error('Database connection failed'));

			const validRequest: LegacySightingRequest = {
				sichtungsdatum: '2024-03-15 12:00',
				anzahl_gesamt: 1,
				vorname: 'Test',
				name: 'User',
				email: 'test@example.com'
			};

			const event = createMockRequestEvent(validRequest);
			const response = await POST(event);

			expect(response.status).toBe(500);
			const responseData = await response.json();
			expect(responseData.error).toBe('Failed to save sighting');
		});
	});
});

describe('Client-Kennung (eingangs_client)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetRateLimits();
		vi.mocked(saveSighting).mockResolvedValue({ id: 42 });
		vi.mocked(checkBalticSeaFile).mockReturnValue({
			inBaltic: true,
			inChartArea: true,
			longitude: 13.5,
			latitude: 54.5
		});
	});

	/** Eine Meldung, die die Validierung passiert und saveSighting erreicht. */
	const gueltigeMeldung = (): LegacySightingRequest =>
		({
			sichtungsdatum: '2024-03-15 12:00',
			anzahl_gesamt: 1,
			vorname: 'Client',
			name: 'Test',
			email: 'client-test@example.com'
		}) as unknown as LegacySightingRequest;

	it('speichert den User-Agent des Clients als vierten Parameter', async () => {
		const event = createMockRequestEvent(gueltigeMeldung(), 'OstSeeTiere/8');
		const response = await POST(event);

		expect(response.status).toBe(201);
		expect(vi.mocked(saveSighting).mock.calls[0]?.[3]).toBe('OstSeeTiere/8');
	});

	it('speichert unbekannt, wenn der Client keinen User-Agent schickt', async () => {
		// NULL ist dem Altbestand vorbehalten — ein neuer Datensatz ohne
		// User-Agent muss davon unterscheidbar bleiben.
		const event = createMockRequestEvent(gueltigeMeldung(), undefined);
		const response = await POST(event);

		expect(response.status).toBe(201);
		expect(vi.mocked(saveSighting).mock.calls[0]?.[3]).toBe('unbekannt');
	});
});
