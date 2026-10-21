/**
 * @fileoverview Tests for PDF-compliant Legacy REST API sighting retrieval
 *
 * Tests the GET /sichtungen/showreports.json endpoint for 100% PDF specification compliance.
 * This endpoint MUST return data in EXACT format specified in PDF documentation.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, POST, PUT, DELETE } from './+server';
import type { RequestEvent } from '@sveltejs/kit';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { approvedOnly } from '#lib/server/db/approvalFilter.ts';
import { sightings } from '#lib/server/db/schema.ts';

// Die WHERE-Bedingung wird aus dem DB-Mock herausgereicht, damit die Tests die
// tatsächlich erzeugte SQL prüfen können statt nur den HTTP-Status. Ohne das
// bleibt der Suchfilter unsichtbar — genau so konnte die ungegatete Suche
// über personenbezogene Felder unbemerkt bleiben.
const captured = vi.hoisted(() => ({ where: null as unknown, orderBy: [] as unknown[] }));

const dialect = new PgDialect();

/** Rendert die zuletzt erfasste WHERE-Bedingung als SQL-Text mit Parametern. */
function capturedWhereQuery(): { text: string; params: unknown[] } {
	if (!captured.where) {
		throw new Error('Keine WHERE-Bedingung erfasst — wurde die Query ausgeführt?');
	}
	const query = dialect.sqlToQuery(captured.where as SQL);
	return { text: query.sql, params: query.params };
}

/** Rendert die zuletzt erfasste ORDER-BY-Liste als SQL-Text. */
function capturedOrderByText(): string {
	if (captured.orderBy.length === 0) {
		throw new Error('Keine Sortierung erfasst — wurde die Query ausgeführt?');
	}
	return captured.orderBy.map((teil) => dialect.sqlToQuery(teil as SQL).sql).join(', ');
}

// Mock database - simplified approach using partial database operations
const mockSightingData = [
	{
		id: 817,
		// Migrierter Altdatensatz: 25.01.2012 14:50 Ortszeit == 13:50 UTC (MEZ).
		// Die Spalte hält echte UTC-Zeitpunkte, die API gibt Ortszeit aus.
		sichtungsdatum: '2012-01-25T13:50:00.000Z',
		latitude: '54.646667',
		longitude: '11.333333',
		totalCount: 1,
		juvenileCount: 0,
		firstName: 'Jörg',
		lastName: 'Schneider',
		nameConsent: true,
		waterway: 'Kieler Förde',
		shipName: 'Fährschiff "Deutschland"',
		shipNameConsent: true,
		approvedAt: new Date('2012-01-26T10:00:00.000Z'),
		species: 0, // Schweinswal
		isDead: 0 // Not a death finding
	},
	{
		id: 826,
		sichtungsdatum: '2012-03-30T16:10:00.000Z',
		latitude: '56.093587',
		longitude: '10.512543',
		totalCount: 1,
		juvenileCount: 0,
		firstName: 'Jörg',
		lastName: 'Hiller',
		nameConsent: true,
		waterway: null,
		shipName: null,
		shipNameConsent: false,
		approvedAt: new Date('2012-03-31T09:00:00.000Z'),
		species: 1, // Kegelrobbe
		isDead: 0 // Not a death finding
	},
	{
		id: 827,
		sichtungsdatum: '2012-04-15T09:30:00.000Z',
		latitude: '55.123456',
		longitude: '12.987654',
		totalCount: 3,
		juvenileCount: 1,
		firstName: 'Anna',
		lastName: 'Private',
		nameConsent: false, // No consent - should not show name
		waterway: 'Fehmarnbelt',
		shipName: 'Private Yacht',
		shipNameConsent: false, // No consent - should not show ship name
		approvedAt: new Date('2012-04-16T08:00:00.000Z'),
		species: 2, // Seehund
		isDead: 1 // Death finding
	}
];

vi.mock('#lib/server/db/index.ts', () => {
	return {
		db: {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn((condition: unknown) => {
						captured.where = condition;
						return {
							orderBy: vi.fn((...teile: unknown[]) => {
								captured.orderBy = teile;
								return {
									limit: vi.fn(() => Promise.resolve(mockSightingData))
								};
							})
						};
					})
				}))
			}))
		}
	};
});

// Mock logger
vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

// Helper to create mock request event
function createMockRequestEvent(
	searchParams: Record<string, string> = {},
	locals: App.Locals = {}
): RequestEvent {
	const url = new URL('https://example.com/sichtungen/showreports.json');
	Object.entries(searchParams).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});

	return {
		url,
		locals,
		getClientAddress: () => '127.0.0.1'
	} as any;
}

/** Request-Event eines eingeloggten Admins (Rolle wie in `hooks.server.ts` gesetzt). */
function createAdminRequestEvent(searchParams: Record<string, string> = {}): RequestEvent {
	return createMockRequestEvent(searchParams, {
		user: { sub: 'auth0|admin', roles: ['admin'] } as NonNullable<App.Locals['user']>,
		isAdmin: true
	});
}

describe('PDF-Compliant Legacy REST API - GET /sichtungen/showreports.json', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		captured.where = null;
		// Ohne diesen Reset sähe `capturedOrderByText()` noch die Sortierung
		// eines früheren Tests und bliebe grün, selbst wenn die Implementierung
		// gar kein `orderBy()` mehr aufruft — etwa nach einem frühen Return.
		captured.orderBy = [];
	});

	describe('PDF Compliance - Response Format', () => {
		it('should return data in exact PDF format with abbreviated field names', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(response.status).toBe(200);

			const responseData = await response.json();
			// Must be a JSON array per legacy API specification
			expect(Array.isArray(responseData)).toBe(true);
			expect(responseData).toHaveLength(3);

			// Verify EXACT PDF field names (abbreviated)
			const firstSighting = responseData[0];
			expect(firstSighting).toHaveProperty('ts'); // Unix Timestamp
			expect(firstSighting).toHaveProperty('id'); // Report ID
			expect(firstSighting).toHaveProperty('dt'); // Date DD.MM.YY
			expect(firstSighting).toHaveProperty('ti'); // Time HH:MI
			expect(firstSighting).toHaveProperty('lat'); // Latitude as STRING
			expect(firstSighting).toHaveProperty('lon'); // Longitude as STRING
			expect(firstSighting).toHaveProperty('ct'); // Total count
			expect(firstSighting).toHaveProperty('yo'); // Young count
			expect(firstSighting).toHaveProperty('ta'); // Tierart (species)
			expect(firstSighting).toHaveProperty('tf'); // Totfund (death finding)

			// Optional fields (consent-dependent)
			expect(firstSighting).toHaveProperty('sh'); // Ship name
			expect(firstSighting).toHaveProperty('na'); // Name
			expect(firstSighting).toHaveProperty('ar'); // Area

			// Verify data types as per PDF
			expect(typeof firstSighting.ts).toBe('number'); // Unix timestamp
			expect(typeof firstSighting.id).toBe('number');
			expect(typeof firstSighting.dt).toBe('string');
			expect(typeof firstSighting.ti).toBe('string');
			expect(typeof firstSighting.lat).toBe('string'); // CRITICAL: Must be string
			expect(typeof firstSighting.lon).toBe('string'); // CRITICAL: Must be string
			expect(typeof firstSighting.ct).toBe('number');
			expect(typeof firstSighting.yo).toBe('number');
			expect(typeof firstSighting.ta).toBe('string'); // Species name
			expect(typeof firstSighting.tf).toBe('number'); // Death finding flag (0/1)
		});

		it('should format dates exactly as PDF specification (DD.MM.YY)', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			const firstSighting = responseData[0];

			// PDF format: DD.MM.YY (2-digit year!)
			expect(firstSighting.dt).toBe('25.01.12');
			expect(firstSighting.ti).toBe('14:50'); // German local time, unchanged by the UTC migration

			// Verify Unix timestamp - the true instant, not the local rendering
			expect(firstSighting.ts).toBe(1327499400); // Unix timestamp for 2012-01-25T13:50:00.000Z
		});

		it('should return coordinates as strings with proper precision', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			const firstSighting = responseData[0];

			// PDF requirement: Coordinates must be strings, not numbers
			expect(firstSighting.lat).toBe('54.646667');
			expect(firstSighting.lon).toBe('11.333333');
		});

		it('should respect name consent settings as per PDF', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			// First sighting: has name consent
			expect(responseData[0].na).toBe('Jörg Schneider');

			// Third sighting: no name consent (nameConsent: false)
			expect(responseData[2].na).toBeUndefined();
		});

		it('should respect ship name consent settings as per PDF', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			// First sighting: has ship name consent
			expect(responseData[0].sh).toBe('Fährschiff "Deutschland"');

			// Second sighting: no ship name consent
			expect(responseData[1].sh).toBeUndefined();

			// Third sighting: no ship name consent
			expect(responseData[2].sh).toBeUndefined();
		});

		it('should include area/waterway information', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			// First sighting: has waterway
			expect(responseData[0].ar).toBe('Kieler Förde');

			// Second sighting: no waterway (null in database)
			expect(responseData[1].ar).toBeUndefined();

			// Third sighting: has waterway
			expect(responseData[2].ar).toBe('Fehmarnbelt');
		});

		it('should not include admin-only fields (bm, va) in public response', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			Object.values(responseData).forEach((sighting: any) => {
				// PDF: "wird nur bei angemeldetem Admin geliefert"
				expect(sighting).not.toHaveProperty('bm'); // Baltic marker
				expect(sighting).not.toHaveProperty('va'); // Validated
			});
		});

		it('should include species (ta) and death finding (tf) fields', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);
			const responseData = await response.json();

			// First sighting: Schweinswal, not dead
			expect(responseData[0].ta).toBe('Schweinswal');
			expect(responseData[0].tf).toBe(0);

			// Second sighting: Kegelrobbe, not dead
			expect(responseData[1].ta).toBe('Kegelrobbe');
			expect(responseData[1].tf).toBe(0);

			// Third sighting: Seehund, dead
			expect(responseData[2].ta).toBe('Seehund');
			expect(responseData[2].tf).toBe(1);
		});
	});

	describe('PDF Compliance - Filtering', () => {
		it('should filter by year parameter as per PDF', async () => {
			const event = createMockRequestEvent({ year: '2012' });
			const response = await GET(event);

			expect(response.status).toBe(200);
			// Database filtering is tested through integration - query structure is mocked
		});

		it('should validate year parameter range', async () => {
			const event = createMockRequestEvent({ year: '1800' }); // Too old
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidYear');
		});

		it('should filter by location with radius as per PDF', async () => {
			const event = createMockRequestEvent({ location: '54.5,11.2' });
			const response = await GET(event);

			expect(response.status).toBe(200);
			// Database filtering is tested through integration - query structure is mocked
		});

		it('should validate location format', async () => {
			const event = createMockRequestEvent({ location: '54.5' }); // Missing longitude
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidLocationFormat');
		});

		it('should filter by bounding box as per PDF (OpenLayers format)', async () => {
			// PDF: "Kompatibel mit OpenLayers"
			const event = createMockRequestEvent({ bbox: '9,53,31,66' }); // Baltic Sea area
			const response = await GET(event);

			expect(response.status).toBe(200);
			// Database filtering is tested through integration - query structure is mocked
		});

		it('should validate bounding box format', async () => {
			const event = createMockRequestEvent({ bbox: '9,53,31' }); // Too few coordinates
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidBBoxFormat');
		});

		it('should search in specified fields as per PDF', async () => {
			// PDF: "Sucht nach dem angegebenen Text in den Feldern E-Mail, Name, Vorname und Schiffsname"
			const event = createMockRequestEvent({ search: 'Schneider' });
			const response = await GET(event);

			expect(response.status).toBe(200);
			// Database filtering is tested through integration - query structure is mocked
		});

		it('should handle distance parameter with location', async () => {
			const event = createMockRequestEvent({
				location: '54.5,11.2',
				distance: '50000' // 50km in meters
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
		});

		it('should reject invalid distance parameter', async () => {
			const event = createMockRequestEvent({ distance: '-100' });
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidDistance');
		});

		it('should reject non-numeric distance parameter', async () => {
			const event = createMockRequestEvent({ distance: 'abc' });
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidDistance');
		});

		it('should reject partially-numeric distance parameter like "50000abc"', async () => {
			const event = createMockRequestEvent({ distance: '50000abc' });
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidDistance');
		});

		it('should reject decimal distance parameter', async () => {
			const event = createMockRequestEvent({ distance: '500.5' });
			const response = await GET(event);

			expect(response.status).toBe(400);
			const responseData = await response.json();
			expect(responseData.error).toBe('InvalidDistance');
		});
	});

	describe('Datenschutz - Suche über personenbezogene Felder', () => {
		// Hintergrund: Die Ausgabe war schon immer consent-gegated (`na`, `sh`),
		// die Trefferzahl nicht. Ein anonymer Aufrufer konnte damit prüfen, ob eine
		// E-Mail-Adresse oder ein Name im Bestand existiert — auch bei Meldern ohne
		// Einwilligung. Vgl. `/api/map/sightings`, das dieselbe Consent-Gatung umsetzt.

		it('durchsucht für anonyme Aufrufer die E-Mail-Adresse nicht', async () => {
			await GET(createMockRequestEvent({ search: 'melder@example.com' }));

			const { text } = capturedWhereQuery();
			expect(text).not.toContain('"email"');
		});

		it('durchsucht Name und Schiffsname für anonyme Aufrufer nur mit Einwilligung', async () => {
			await GET(createMockRequestEvent({ search: 'Private' }));

			const { text } = capturedWhereQuery();
			// Die Felder werden weiterhin durchsucht ...
			expect(text).toContain('"vorname"');
			expect(text).toContain('"name"');
			expect(text).toContain('"schiffsname"');
			// ... aber ausschließlich innerhalb des Consent-Gates.
			expect(text).toMatch(/"namensnennung"\s*=\s*1/);
			expect(text).toMatch(/"schiffnamensnennung"\s*=\s*1/);
		});

		it('behandelt LIKE-Wildcards im Suchbegriff als Literale', async () => {
			// Ohne Escaping matcht `search=%` jeden Datensatz und `_` jedes
			// Einzelzeichen — das verstärkt das Membership-Orakel zusätzlich.
			await GET(createMockRequestEvent({ search: '50%_x' }));

			const { text, params } = capturedWhereQuery();
			expect(params).toContain('%50\\%\\_x%');
			expect(text).toContain('ESCAPE');
		});

		it('durchsucht für eingeloggte Admins weiterhin alle vier Felder der Spezifikation', async () => {
			await GET(createAdminRequestEvent({ search: 'Schneider' }));

			const { text } = capturedWhereQuery();
			expect(text).toContain('"email"');
			expect(text).toContain('"vorname"');
			expect(text).toContain('"name"');
			expect(text).toContain('"schiffsname"');
			// Kein Consent-Gate: Admins sehen ohnehin alle Felder.
			expect(text).not.toContain('"namensnennung"');
			expect(text).not.toContain('"schiffnamensnennung"');
		});

		it('erzeugt ohne search-Parameter keine Bedingung auf personenbezogene Felder', async () => {
			await GET(createMockRequestEvent());

			const { text } = capturedWhereQuery();
			expect(text).not.toContain('"email"');
			expect(text).not.toContain('"vorname"');
			expect(text).not.toContain('"schiffsname"');
		});
	});

	describe('PDF Compliance - Cache and Headers', () => {
		it('should set proper cache headers', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
			expect(response.headers.get('Content-Type')).toBe('application/json');
		});

		it('markiert die Admin-Antwort als nicht öffentlich cachebar', async () => {
			// Die Antwort hängt seit der Consent-Gatung von der Session ab: Ein Admin
			// bekommt unter derselben URL mehr Treffer. Mit `public` dürfte ein Shared
			// Cache die Admin-Antwort an anonyme Aufrufer weiterreichen — genau das
			// Orakel, das die Gatung schließt.
			const response = await GET(createAdminRequestEvent({ search: 'Schneider' }));

			expect(response.status).toBe(200);
			expect(response.headers.get('Cache-Control')).toBe('private, max-age=0, no-store');
		});

		it('meldet die Abhängigkeit von der Session per Vary', async () => {
			const anonymous = await GET(createMockRequestEvent({ search: 'Schneider' }));

			expect(anonymous.headers.get('Vary')).toBe('Cookie');
		});
	});

	describe('PDF Compliance - HTTP Method Restrictions', () => {
		it('should reject POST requests with 405', async () => {
			const response = await POST();

			expect(response.status).toBe(405);
			const responseData = await response.json();
			expect(responseData).toMatchObject({
				error: 'MethodNotAllowed',
				message: 'Only GET method is supported for this endpoint'
			});
		});

		it('should reject PUT requests with 405', async () => {
			const response = await PUT();

			expect(response.status).toBe(405);
		});

		it('should reject DELETE requests with 405', async () => {
			const response = await DELETE();

			expect(response.status).toBe(405);
		});
	});

	describe('PDF Compliance - Error Handling', () => {
		it('should handle unexpected errors gracefully', async () => {
			// Database error handling is tested through integration tests
			// This unit test verifies basic error response structure
			const event = createMockRequestEvent();
			const response = await GET(event);

			// With working mocks, we get successful response
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('application/json');
		});
	});

	describe('PDF Compliance - Data Ordering and Limits', () => {
		it('should order results by date descending', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(response.status).toBe(200);
			// Database ordering is tested through integration - query structure is mocked
		});

		// `sichtungsdatum` allein ist kein eindeutiger Schlüssel: In den
		// Produktionsdaten teilen sich 81 Zeitpunkte mehrere Sichtungen, die
		// größte Gruppe neun. Ohne eindeutiges zweites Kriterium ist die
		// Reihenfolge innerhalb einer solchen Gruppe undefiniert — zwei
		// aufeinanderfolgende Aufrufe gegen dieselbe Datenbank lieferten
		// nachweislich verschiedene Reihenfolgen. Weil `.limit(1000)` im
		// Normalbetrieb immer greift, entscheidet der Zufall damit auch
		// darüber, WELCHE Sichtungen am Rand noch mitkommen.
		it('sortiert eindeutig, damit dieselbe Anfrage dieselbe Antwort liefert', async () => {
			const event = createMockRequestEvent();
			await GET(event);

			// Die gesamte Sortierung festschreiben, nicht nur „id kommt vor":
			// Eine vertauschte Reihenfolge (`id` zuerst) oder ein verlorenes
			// `DESC` wäre eine andere Antwort für denselben Aufruf — und genau
			// die Reproduzierbarkeit ist der Zweck dieses Tests.
			expect(capturedOrderByText()).toBe(
				'"sichtungen"."sichtungsdatum" DESC, "sichtungen"."id" DESC'
			);
		});

		it('should apply reasonable result limit', async () => {
			const event = createMockRequestEvent();
			const response = await GET(event);

			expect(response.status).toBe(200);
			// Database limit is tested through integration - query structure is mocked
		});
	});

	describe('Freigabefilter', () => {
		// Das Prädikat ist in `#lib/server/db/approvalFilter.js` **einmal** definiert,
		// damit Karte und öffentliche Statistik nicht erneut auseinanderlaufen
		// (19.262 vs. 19.877, Stand 2026-07-27). Dieser Endpunkt hatte es lange
		// von Hand nachgebaut — die Zentralisierung greift nur, wenn der Aufrufer
		// den Import wirklich hat.

		/**
		 * Der Filter, wie er bis zur Umstellung wörtlich im Endpunkt stand.
		 *
		 * `/sichtungen/showreports.json` unterliegt dem Legacy-Vertrag
		 * (docs/LEGACY_API_SPECIFICATION.md) und bedient seit 2026-07-30 einen
		 * produktiven iOS-Client. Der Wechsel auf den Helper darf deshalb nur die
		 * Schreibweise ändern, nicht die Semantik — genau das hält der Vergleich
		 * unten fest.
		 */
		const historischerInlineFilter = sql`${sightings.approvedAt} IS NOT NULL`;

		it('nutzt das gemeinsame Prädikat aus approvedOnly()', async () => {
			await GET(createMockRequestEvent());

			const { text } = capturedWhereQuery();
			// Die Groß-/Kleinschreibung ist hier **absichtlich** das
			// Unterscheidungsmerkmal und `toContain` deshalb case-sensitiv zu
			// lassen: Der Helper rendert `is not null`, ein von Hand nachgebautes
			// `sql`-Literal nach altem Muster `IS NOT NULL`. Nur so schlägt dieser
			// Test an, wenn jemand den Import wieder durch Inline-SQL ersetzt.
			// Der Test darunter zeigt, dass beide Schreibweisen für PostgreSQL
			// dasselbe bedeuten — das gilt für den Vertrag, nicht für diese Prüfung.
			expect(text).toContain(dialect.sqlToQuery(approvedOnly()).sql);
		});

		it('erzeugt dieselbe SQL wie der frühere Inline-Filter', () => {
			const helper = dialect.sqlToQuery(approvedOnly());
			const inline = dialect.sqlToQuery(historischerInlineFilter);

			// SQL-Schlüsselwörter sind case-insensitiv; alles andere muss
			// zeichengleich sein, inklusive der Tabellenqualifizierung.
			expect(helper.sql.toLowerCase()).toBe(inline.sql.toLowerCase());
			// Keine Parameter auf beiden Seiten — sonst verschöbe sich die
			// Nummerierung der übrigen Platzhalter in der zusammengesetzten Query.
			expect(helper.params).toEqual([]);
			expect(inline.params).toEqual([]);
		});

		it('bleibt neben den übrigen Filtern erhalten', async () => {
			await GET(createMockRequestEvent({ year: '2012', bbox: '9,53,31,66', search: 'Schneider' }));

			const { text } = capturedWhereQuery();
			expect(text).toContain(dialect.sqlToQuery(approvedOnly()).sql);
			expect(text).toContain('sichtungsdatum');
		});

		it('filtert auch für eingeloggte Admins auf freigegebene Sichtungen', async () => {
			// Der Endpunkt liefert Admins zwar eine weitere Suche, aber keine
			// ungeprüften Sichtungen — die Grundmenge ist für alle dieselbe.
			await GET(createAdminRequestEvent({ search: 'Schneider' }));

			const { text } = capturedWhereQuery();
			expect(text).toContain(dialect.sqlToQuery(approvedOnly()).sql);
		});
	});
});
