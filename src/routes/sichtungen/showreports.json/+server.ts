/**
 * @fileoverview Legacy REST API endpoint - PDF specification compliance
 *
 * GET /sichtungen/showreports.json
 *
 * Retrieves sightings in EXACT legacy format from PDF specification.
 * This endpoint MUST maintain 100% compatibility with original schweinswalsichtung.de API.
 *
 * CRITICAL: Response format uses abbreviated field names as specified in PDF!
 *
 * Einzige bewusste Abweichung von der Spezifikation: der Umfang der `search`-Suche
 * für nicht angemeldete Aufrufer (Datenschutz, siehe Kommentar am Suchfilter und
 * "Deviation: consent-gated search" in docs/LEGACY_API_SPECIFICATION.md).
 * Feldnamen, URL-Pfade, Datentypen und Response-Struktur sind unverändert.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import {
	formatDateDDMMYY,
	formatTimeHHMI,
	getYearRange,
	toUnixTimestamp
} from '#lib/legacy-api/date-utils.ts';
import { createLogger } from '#lib/logger.server.ts';
import { getSpeciesLabel } from '#lib/report/formOptions/species.ts';
import { baseLocale } from '#lib/paraglide/runtime.js';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { approvedOnly } from '#lib/server/db/approvalFilter.ts';
import { consentGatedNameSearch, containsPattern } from '#lib/server/db/consentGatedSearch.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { berlinCalendarDayIso } from '#lib/utils/format/dateTime.ts';
import { json, type RequestEvent } from '@sveltejs/kit';
import { and, between, gte, lt, sql } from 'drizzle-orm';

const logger = createLogger('api:legacy:showreports:pdf-compliant');

/**
 * PDF-compliant legacy sighting response format
 * Field names MUST match PDF specification exactly!
 */
interface PDFCompliantSightingResponse {
	ts: number; // Unix Timestamp
	id: number; // Report ID
	dt: string; // Date (DD.MM.YY format)
	ti: string; // Time (HH:MI format)
	lat: string; // Latitude as STRING (not number!)
	lon: string; // Longitude as STRING (not number!)
	ct: number; // Total count
	yo: number; // Young count
	ta?: string; // Tierart (species name as string)
	tf?: number; // Totfund (death finding): 0=false, 1=true
	sh?: string; // Ship name (only if consent)
	na?: string; // Name (first + last, only if consent)
	ar?: string; // Area/waterway
	bm?: number; // Baltic marker (admin only): 0=Outside, 1=inchartarea, 2=inbaltic
	va?: number; // Validated (admin only): 0=False, 1=True
}

/**
 * GET handler for PDF-compliant sighting retrieval
 *
 * Returns sightings in EXACT PDF format with abbreviated field names
 */
export async function GET(event: RequestEvent): Promise<Response> {
	const clientIp = getClientIp(() => event.getClientAddress());

	try {
		// Parse query parameters exactly as specified in PDF
		const searchParams = event.url.searchParams;
		const year = searchParams.get('year');
		const location = searchParams.get('location');
		const distance = searchParams.get('distance');
		const bbox = searchParams.get('bbox');
		const search = searchParams.get('search');

		// Steuert den Umfang der Suche (siehe Kommentar am Suchfilter weiter unten).
		// `isAdminUser` statt `locals.isAdmin`, damit hier dieselbe Rollenprüfung
		// greift wie in den übrigen Routen.
		const isAdmin = isAdminUser(event.locals.user);

		logger.debug(
			{
				year,
				location,
				distance,
				bbox,
				search: search ? '***masked***' : null, // Privacy: mask search terms
				isAdmin,
				ip: clientIp
			},
			'PDF-compliant legacy sightings retrieval request'
		);

		// Build where conditions array
		const whereConditions = [];

		// Only show approved sightings (as per PDF: "freigegeben").
		// Bewusst der gemeinsame Helper und kein nachgebautes Inline-SQL: Das
		// Prädikat ist in `#lib/server/db/approvalFilter.js` einmal definiert, damit
		// Karte und öffentliche Statistik nicht erneut auseinanderlaufen.
		//
		// Der Wechsel ist rein syntaktisch und damit vertragsneutral: Der Helper
		// kompiliert zu demselben qualifizierten Prädikat auf `freigegeben_am` wie
		// das frühere Inline-SQL — nur mit klein geschriebenen SQL-Schlüsselwörtern,
		// die PostgreSQL nicht unterscheidet — und trägt keine Parameter, die die
		// Platzhalter-Nummerierung der übrigen Filter verschieben könnten.
		// Festgehalten in `showreports.test.ts`, describe „Freigabefilter".
		whereConditions.push(approvedOnly());

		// Year filter - PDF specification behavior
		if (year) {
			const yearNum = parseInt(year);
			// NIEDRIG: Jahres-Obergrenze in Berliner Ortszeit statt Server-Prozesszone
			// (nur an Silvester relevant) — sonst zeichengleiches Verhalten.
			const currentBerlinYear = Number(berlinCalendarDayIso().slice(0, 4));
			if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= currentBerlinYear + 1) {
				// Jahresgrenzen in deutscher Ortszeit: `dt`/`ti` der Response werden
				// nach Europe/Berlin umgerechnet, der Filter muss dieselbe
				// Jahresauslegung haben und darf nicht an der Server-Zeitzone hängen.
				const { startDate, endDate } = getYearRange(yearNum);

				// Halboffenes Intervall [startDate, endDate): `endDate` ist Neujahr
				// des Folgejahres. SQL BETWEEN ist beidseitig inklusiv und würde eine
				// Sichtung exakt um 00:00 Ortszeit am 01.01. in zwei Jahren liefern —
				// 365 Datensätze haben genau diese Uhrzeit (keine Angabe).
				whereConditions.push(
					and(gte(sightings.sightingDate, startDate), lt(sightings.sightingDate, endDate))
				);

				logger.debug(
					{
						year: yearNum,
						startDate,
						endDate,
						ip: clientIp
					},
					'Applied year filter (PDF compliant)'
				);
			} else {
				logger.warn(
					{
						year,
						ip: clientIp
					},
					'Invalid year parameter (PDF compliant)'
				);

				return json(
					{
						error: 'InvalidYear',
						message: 'Year must be a valid number between 1900 and current year'
					},
					{ status: 400 }
				);
			}
		}

		// Distance validation (only used together with location) - PDF specification
		// Strict integer validation: reject partial numbers like "50000abc"
		let distanceMeters = 100000; // default 100km in meters
		if (distance) {
			if (!/^\d+$/.test(distance) || parseInt(distance, 10) <= 0) {
				return json(
					{
						error: 'InvalidDistance',
						message: 'Distance must be a positive integer in meters'
					},
					{ status: 400 }
				);
			}
			distanceMeters = parseInt(distance, 10);
		}

		// Location filter using ST_DWithin for accurate meter-based radius - PDF specification
		if (location) {
			const coords = location.split(',');
			if (coords.length === 2) {
				const lat = parseFloat(coords[0]!.trim());
				const lon = parseFloat(coords[1]!.trim());

				if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
					whereConditions.push(
						sql`ST_DWithin(
							ST_SetSRID(ST_MakePoint(
								CAST(${sightings.longitude} AS double precision),
								CAST(${sightings.latitude} AS double precision)
							), 4326)::geography,
							ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
							${distanceMeters}
						)`
					);

					logger.debug(
						{
							location,
							lat,
							lon,
							distanceMeters,
							ip: clientIp
						},
						'Applied location filter (PDF compliant)'
					);
				} else {
					return json(
						{
							error: 'InvalidLocation',
							message: 'Location must be in format "latitude,longitude" with valid ranges'
						},
						{ status: 400 }
					);
				}
			} else {
				return json(
					{
						error: 'InvalidLocationFormat',
						message: 'Location must be in format "latitude,longitude"'
					},
					{ status: 400 }
				);
			}
		}

		// Bounding box filter - PDF specification format
		if (bbox) {
			const coords = bbox.split(',');
			if (coords.length === 4) {
				const coordNumbers = coords.map((c) => parseFloat(c.trim()));

				if (coordNumbers.length === 4 && coordNumbers.every((n) => !isNaN(n))) {
					const [minLon, minLat, maxLon, maxLat] = coordNumbers as [number, number, number, number];

					// PDF: No results outside bbox=9,53,31,66 (Baltic Sea area)
					if (minLon < 9 || minLat < 53 || maxLon > 31 || maxLat > 66) {
						logger.debug(
							{
								bbox,
								note: 'Bounding box outside standard Baltic area',
								ip: clientIp
							},
							'Bounding box filter may return no results (PDF compliant)'
						);
					}

					whereConditions.push(
						and(
							between(sightings.longitude, minLon.toString(), maxLon.toString()),
							between(sightings.latitude, minLat.toString(), maxLat.toString())
						)
					);

					logger.debug(
						{
							bbox,
							minLon,
							minLat,
							maxLon,
							maxLat,
							ip: clientIp
						},
						'Applied bounding box filter (PDF compliant)'
					);
				} else {
					return json(
						{
							error: 'InvalidBBox',
							message: 'Bounding box must contain 4 valid numbers'
						},
						{ status: 400 }
					);
				}
			} else {
				return json(
					{
						error: 'InvalidBBoxFormat',
						message: 'Bounding box must be in format "minLon,minLat,maxLon,maxLat"'
					},
					{ status: 400 }
				);
			}
		}

		// Search filter - PDF specification: searches in Email, Name, First name, Ship name.
		//
		// BEWUSSTE ABWEICHUNG VON DER SPEZIFIKATION für nicht angemeldete Aufrufer
		// (dokumentiert in docs/LEGACY_API_SPECIFICATION.md):
		// Die *Ausgabe* war immer consent-gated (`na` nur bei `namensnennung`,
		// `sh` nur bei `schiffnamensnennung`), die *Trefferzahl* nicht. Damit konnte
		// ein anonymer Aufrufer prüfen, ob eine E-Mail-Adresse oder ein Name im
		// Bestand existiert — auch bei Meldern, die der Namensnennung nie zugestimmt
		// haben. Das widerspricht der Zusage im Meldeformular (Step4Contact.svelte).
		//
		// Deshalb gestuft: anonym ohne `email` und nur mit Einwilligung (identisch zu
		// /api/map/sightings), für angemeldete Admins die volle Vier-Feld-Suche der
		// Spezifikation — Admins sehen diese Felder ohnehin.
		if (search && search.trim().length > 0) {
			// Wildcards werden escaped, damit `%` und `_` literal gesucht werden —
			// ohne das matcht `search=%` jeden Datensatz und verstärkt das oben
			// beschriebene Orakel. Das Consent-Gate für den anonymen Zweig ist mit
			// /api/map/sightings geteilt, damit beide öffentlichen Flächen dieselbe
			// Teilmenge freigeben — siehe consentGatedSearch.ts.
			const searchTerm = containsPattern(search);

			whereConditions.push(
				isAdmin
					? sql`(
					${sightings.email} ILIKE ${searchTerm} ESCAPE '\\' OR
					${sightings.firstName} ILIKE ${searchTerm} ESCAPE '\\' OR
					${sightings.lastName} ILIKE ${searchTerm} ESCAPE '\\' OR
					${sightings.shipName} ILIKE ${searchTerm} ESCAPE '\\'
				)`
					: consentGatedNameSearch(searchTerm, 'ILIKE')
			);

			logger.debug(
				{
					searchLength: search.length,
					scope: isAdmin ? 'admin' : 'public',
					ip: clientIp
				},
				'Applied search filter (consent-gated for anonymous callers)'
			);
		}

		// Execute query with filters
		const dbSightings = await db
			.select({
				id: sightings.id,
				sichtungsdatum: sightings.sightingDate,
				latitude: sightings.latitude,
				longitude: sightings.longitude,
				totalCount: sightings.totalCount,
				juvenileCount: sightings.juvenileCount,
				firstName: sightings.firstName,
				lastName: sightings.lastName,
				nameConsent: sightings.nameConsent,
				waterway: sightings.waterway,
				shipName: sightings.shipName,
				shipNameConsent: sightings.shipNameConsent,
				approvedAt: sightings.approvedAt,
				species: sightings.species,
				isDead: sightings.isDead
			})
			.from(sightings)
			.where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
			// `id` als zweites Kriterium ist nicht Kosmetik, sondern das, was die
			// Antwort überhaupt erst reproduzierbar macht: `sichtungsdatum` ist
			// nicht eindeutig (81 mehrfach belegte Zeitpunkte im Produktivbestand,
			// größte Gruppe neun), und PostgreSQL darf gleiche Sortierschlüssel in
			// beliebiger Reihenfolge liefern. Zusammen mit dem `.limit(1000)`, das
			// im Normalbetrieb immer greift, entschied das bisher auch darüber,
			// WELCHE Sichtungen am Rand noch mitkommen — zwei aufeinanderfolgende
			// Aufrufe gegen dieselbe Datenbank lieferten verschiedene Reihenfolgen.
			.orderBy(sql`${sightings.sightingDate} DESC`, sql`${sightings.id} DESC`)
			.limit(1000); // Reasonable limit to prevent abuse

		// Transform to PDF-compliant format with EXACT field names
		const pdfCompliantSightings: PDFCompliantSightingResponse[] = dbSightings.map((sighting) => {
			const date = new Date(sighting.sichtungsdatum);

			// PDF format: DD.MM.YY (2-digit year!) - timezone-safe formatting
			const dt = formatDateDDMMYY(date);

			// PDF format: HH:MI - timezone-safe formatting
			const ti = formatTimeHHMI(date);

			// Create base response with required fields
			const response: PDFCompliantSightingResponse = {
				ts: toUnixTimestamp(date), // Unix timestamp
				id: sighting.id,
				dt, // Date in DD.MM.YY format
				ti, // Time in HH:MI format
				lat: sighting.latitude || '0', // MUST be string as per PDF
				lon: sighting.longitude || '0', // MUST be string as per PDF
				ct: sighting.totalCount || 0, // Total count
				yo: sighting.juvenileCount || 0 // Young count
			};

			// Add species name (ta) - convert from enum to German label
			//
			// Locale bewusst auf baseLocale ('de') gepinnt: Legacy-API-Vertrag
			// (CLAUDE.md, "Legacy REST API — 100 % Kompatibilität"; der iOS-Client
			// OstSeeTiere/8 hängt live daran). Das /de/- bzw. /en/-Präfix, mit dem
			// dieser Pfad laut .claude/rules/legacy-api.md zusätzlich erreichbar
			// ist, ist Routenkosmetik, keine Übersetzung — die Antwort muss in
			// jeder Variante identisch bleiben.
			if (sighting.species !== null && sighting.species !== undefined) {
				response.ta = getSpeciesLabel(sighting.species, baseLocale);
			}

			// Add death finding flag (tf) - convert boolean to 0/1
			response.tf = sighting.isDead ? 1 : 0;

			// Conditional fields based on consent (as per PDF specification)
			if (sighting.shipNameConsent && sighting.shipName) {
				response.sh = sighting.shipName;
			}

			if (sighting.nameConsent && (sighting.firstName || sighting.lastName)) {
				response.na = `${sighting.firstName || ''} ${sighting.lastName || ''}`.trim();
			}

			if (sighting.waterway) {
				response.ar = sighting.waterway;
			}

			// Admin-only fields (bm, va) are not included in public API
			// PDF: "wird nur bei angemeldetem Admin geliefert"

			return response;
		});

		logger.info(
			{
				totalResults: pdfCompliantSightings.length,
				filtersApplied: {
					year: !!year,
					location: !!location,
					distance: !!distance,
					bbox: !!bbox,
					search: !!search
				},
				ip: clientIp
			},
			'Legacy sightings retrieval completed'
		);

		return json(pdfCompliantSightings, {
			headers: {
				// Seit der Consent-Gatung der Suche hängt die Antwort von der Session ab:
				// Ein Admin bekommt unter derselben URL mehr Treffer als ein anonymer
				// Aufrufer. `public` würde einem Shared Cache erlauben, die Admin-Antwort
				// zu speichern und anonym auszuliefern — also genau das Membership-Orakel
				// wiederherzustellen, das die Gatung schließt. Cache-Header sind nicht
				// Teil des Legacy-Vertrags (docs/LEGACY_API_SPECIFICATION.md).
				'Cache-Control': isAdmin ? 'private, max-age=0, no-store' : 'public, max-age=300',
				Vary: 'Cookie',
				'Content-Type': 'application/json'
			}
		});
	} catch (dbError) {
		const error = dbError instanceof Error ? dbError : new Error('Unknown database error');
		logger.error(
			{
				error: error.message,
				stack: error.stack,
				ip: clientIp
			},
			'Error retrieving PDF-compliant legacy sightings'
		);

		const errorResponse = {
			error: 'DatabaseError',
			message: 'Failed to retrieve sightings'
		};

		return json(errorResponse, { status: 500 });
	}
}

/**
 * Handle unsupported HTTP methods
 */
export async function POST() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}

export async function PUT() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}

export async function DELETE() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}
