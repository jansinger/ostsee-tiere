/**
 * @fileoverview Legacy REST API endpoint - Exact PDF specification compliance
 *
 * POST /rest_sichtungen
 *
 * Creates a new sighting using the EXACT legacy API format from the PDF specification.
 * This endpoint MUST maintain 100% compatibility with original schweinswalsichtung.de API.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import {
	LEGACY_API_MESSAGES,
	createOriginalApiErrorResponse,
	createSimpleErrorResponse
} from '#lib/legacy-api/error-messages.ts';
import { mapLegacyToCurrentSchema } from '#lib/legacy-api/field-mapping.ts';
import type { LegacyCreateResponse, LegacySightingRequest } from '#lib/legacy-api/types.ts';
import { validateDeathFinding } from '#lib/legacy-api/validation.ts';
import {
	createLegacyErrorFromYup,
	validateLegacySightingWithYup
} from '#lib/legacy-api/yup-validation.ts';
import { createLogger } from '#lib/logger.server.ts';
import { countRecentDuplicateSignals, saveSighting } from '#lib/server/db/sightingRepository.ts';
import { mapFormToSighting } from '#lib/server/db/mapFormToSighting.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';
import { EmailService } from '#lib/server/services/emailService.ts';
import { ServerConfigService } from '#lib/services/configService.ts';
import { json, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { enforceRateLimit, RATE_LIMITS } from '#lib/server/middleware/rateLimit.ts';
import { resolveEntryClient } from '#lib/server/utils/resolveEntryClient.ts';

const logger = createLogger('api:legacy:rest_sichtungen:pdf-compliant');

/**
 * POST handler - PDF specification compliant endpoint
 */
export async function POST(event: RequestEvent): Promise<Response> {
	const clientIp = getClientIp(() => event.getClientAddress(), event.request);

	// Rate limiting: 20 submissions per hour per IP (legacy endpoint has no auth)
	enforceRateLimit(
		`ip:${clientIp}`,
		RATE_LIMITS.SIGHTING_SUBMISSION,
		'legacy:rest_sichtungen:post'
	);

	try {
		// Handle different request types for mobile app compatibility
		let requestData: LegacySightingRequest;
		const contentType = event.request.headers.get('content-type') || '';

		// Handle form data (from mobile apps without Content-Type header)
		if (
			contentType.includes('application/x-www-form-urlencoded') ||
			!contentType.includes('application/json')
		) {
			try {
				const formData = await event.request.formData();
				requestData = Object.fromEntries(formData.entries()) as unknown as LegacySightingRequest;
				logger.debug({ ip: clientIp }, 'Processing form data from mobile app');
			} catch (_formError) {
				// Try JSON parsing as fallback
				try {
					const text = await event.request.text();
					requestData = JSON.parse(text);
				} catch (jsonError) {
					logger.warn(
						{ error: jsonError, ip: clientIp },
						'Failed to parse request body as JSON or form data'
					);
					const errorResponse = createSimpleErrorResponse(LEGACY_API_MESSAGES.NO_DATA_SEND);
					return json(errorResponse, { status: 200 });
				}
			}
		} else {
			// Handle JSON requests
			try {
				requestData = await event.request.json();
			} catch (parseError) {
				logger.warn({ error: parseError, ip: clientIp }, 'Failed to parse JSON request body');
				const errorResponse = createSimpleErrorResponse(LEGACY_API_MESSAGES.NO_DATA_SEND);
				return json(errorResponse, { status: 200 });
			}
		}

		// Check if we actually got data (empty object = no meaningful data)
		if (!requestData || Object.keys(requestData).length === 0) {
			logger.debug({ ip: clientIp }, 'Empty request data received');

			// Use Yup validation to get proper German error messages
			const validation = await validateLegacySightingWithYup({} as LegacySightingRequest);
			const errorResponse = createLegacyErrorFromYup(validation);

			return json(errorResponse, { status: 400 });
		}

		// Note: Skip Content-Type validation for mobile app compatibility
		// Original API doesn't enforce Content-Type headers strictly

		logger.debug(
			{
				data: { ...requestData, email: '***masked***' },
				ip: clientIp
			},
			'Legacy sighting creation request received (PDF compliant endpoint)'
		);

		// Comprehensive field validation using Yup schema with German messages
		const validation = await validateLegacySightingWithYup(requestData);
		if (!validation.isValid) {
			logger.warn(
				{
					errors: validation.errors,
					ip: clientIp
				},
				'Legacy field validation failed'
			);

			const errorResponse = createLegacyErrorFromYup(validation);

			return json(errorResponse, { status: 400 });
		}

		// Death finding specific validation
		const deathFindingErrors: Record<string, string[]> = {};
		validateDeathFinding(requestData, deathFindingErrors);
		if (Object.keys(deathFindingErrors).length > 0) {
			logger.info(
				{
					warnings: deathFindingErrors,
					ip: clientIp
				},
				'Death finding validation warnings (non-blocking)'
			);
		}

		// Transform legacy data to current schema
		let transformedData;
		try {
			transformedData = mapLegacyToCurrentSchema(requestData as LegacySightingRequest);
		} catch (mappingError: unknown) {
			const errorMsg =
				mappingError instanceof Error ? mappingError.message : 'Unknown mapping error';
			logger.error(
				{
					error: errorMsg,
					ip: clientIp
				},
				'Failed to map legacy data to current schema'
			);

			const errorResponse = createOriginalApiErrorResponse('Data transformation failed', {
				_general: [errorMsg]
			});

			return json(errorResponse, { status: 400 });
		}

		// Spam-Heuristik wie an der Web-API — aber OHNE Token-Kontext: Der
		// Legacy-Vertrag kennt kein Formular-Token, ein 'missing'-Malus würde
		// jede App-Meldung bestrafen. Rein additiv, Response bleibt unverändert.
		// Koordinaten aus der Abbildung, nicht roh aus transformedData:
		// mapLegacyToCurrentSchema setzt fehlendes GPS auf 0, erst
		// mapFormToSighting normalisiert das zu null. Rohwerte ergäben mit
		// ostsee_geo = 0 für jede Meldung ohne Position den falschen Indikator
		// „Position weit außerhalb der Ostsee".
		const mappedSighting = mapFormToSighting(transformedData);
		const recentDuplicates = await countRecentDuplicateSignals({
			email: transformedData.email,
			notes: transformedData.notes
		});
		const spamCheck = await detectSpamIndicators({
			latitude: mappedSighting.latitude != null ? Number(mappedSighting.latitude) : undefined,
			longitude: mappedSighting.longitude != null ? Number(mappedSighting.longitude) : undefined,
			species: transformedData.species,
			firstName: transformedData.firstName || undefined,
			lastName: transformedData.lastName || undefined,
			email: transformedData.email || undefined,
			waterway: transformedData.waterway || undefined,
			seaMark: transformedData.seaMark || undefined,
			notes: transformedData.notes || undefined,
			inBalticSeaGeo: mappedSighting.inBalticSeaGeo,
			recentDuplicates
		});

		// Der User-Agent ist die einzige Herkunftsangabe, die ein Legacy-Client
		// mitbringt. Er ist frei wählbar und damit ein Hinweis, kein Beweis —
		// er darf keine Entscheidung über Gültigkeit oder Zugriff tragen.
		const entryClient = resolveEntryClient({
			source: 'agent',
			userAgent: event.request.headers.get('user-agent')
		});

		// Save sighting using existing repository
		let savedSighting;
		try {
			savedSighting = await saveSighting(transformedData, undefined, spamCheck, entryClient);

			logger.info(
				{
					sightingId: savedSighting.id,
					legacyCount: requestData.anzahl_gesamt,
					isDeathFinding: requestData.anzahl_gesamt === 0,
					ip: clientIp
				},
				'Legacy sighting created successfully (PDF compliant)'
			);

			// Send email notification if enabled — fire-and-forget, damit der SMTP-Versand
			// die HTTP-Response nicht blockiert. Fehler werden geloggt, nicht geworfen.
			try {
				const emailConfig = await ServerConfigService.getEmailConfig();
				if (emailConfig.enabled && emailConfig.recipient && savedSighting.id) {
					// Use new ID-based email service that reads from database
					// This ensures correct Baltic Sea validation data is used
					const emailSightingId = savedSighting.id;
					void EmailService.sendNewSightingNotification(emailSightingId)
						.then(() => {
							logger.info(
								{ sightingId: emailSightingId, referenceId: transformedData.referenceId },
								'Legacy API email notification sent successfully'
							);
						})
						.catch((emailError) => {
							logger.warn(
								{ sightingId: emailSightingId, emailError },
								'Failed to send email notification for legacy sighting'
							);
						});
				}
			} catch (emailError) {
				// Don't fail the request if the email config lookup fails
				logger.warn(
					{ sightingId: savedSighting.id, emailError },
					'Failed to send email notification for legacy sighting'
				);
			}
		} catch (saveError: unknown) {
			const isError = saveError instanceof Error;
			const errorMsg = isError ? saveError.message : 'Unknown save error';
			logger.error(
				{
					error: errorMsg,
					stack: isError ? saveError.stack : undefined,
					ip: clientIp
				},
				'Failed to save legacy sighting'
			);

			// Handle different types of save errors
			if (isError && saveError.name === 'ValidationError') {
				const errorResponse = createOriginalApiErrorResponse('Sighting validation failed', {
					_general: [errorMsg]
				});
				return json(errorResponse, { status: 400 });
			}

			// Database or system error
			const errorResponse = {
				error: 'Failed to save sighting',
				message: 'Internal server error occurred'
			};
			return json(errorResponse, { status: 500 });
		}

		// Create PDF-compliant success response
		const successResponse: LegacyCreateResponse = {
			message: 'Saved'
		};

		// Set Location header as per PDF specification
		const locationHeader = `/rest_sichtungen/view/${savedSighting.id}.json`;

		return json(successResponse, {
			status: 201,
			headers: {
				Location: locationHeader
			}
		});
	} catch (unexpectedError: unknown) {
		// Re-throw SvelteKit HTTP errors (e.g. 429 rate limit) so they propagate correctly
		if (isHttpError(unexpectedError)) throw unexpectedError;

		const isError = unexpectedError instanceof Error;
		logger.error(
			{
				error: isError ? unexpectedError.message : 'Unknown error',
				stack: isError ? unexpectedError.stack : undefined,
				ip: clientIp
			},
			'Unexpected error in PDF-compliant legacy sighting creation'
		);

		const errorResponse = createOriginalApiErrorResponse('Internal server error', {
			_general: ['An unexpected error occurred']
		});

		return json(errorResponse, { status: 500 });
	}
}

/**
 * GET /rest_sichtungen — der Index der Legacy-API.
 *
 * Wörtlich dieselbe Funktion wie `GET /sichtungen/showreports.json`, nicht
 * eine zweite Umsetzung daneben. Die Vorgänger-Anwendung machte es genauso:
 * `RestSichtungenController::index()` und `SichtungenController::showReports()`
 * bestehen aus denselben zwei Zeilen (`parseList()` und `getReports()`), und
 * `getReports()` schickt jeden Datensatz durch `ReportUtils::mapReport()` —
 * das erzeugt die kompakte Form, die `showreports.json` hier bereits
 * ausliefert. Belege liegen unter `docs/archive/legacy-cakephp/`.
 *
 * Dass CakePHP bei `_serialize` als Zeichenkette (`'Sichtungen'`) den Wert
 * direkt serialisiert und nicht in ein Objekt hüllt, steht im Klassenkommentar
 * von `Cake/View/JsonView.php`. Die Antwort war also auch dort ein blankes
 * Array — keine Umhüllung `{"Sichtungen": […]}`.
 *
 * Bis 2026-08 antwortete dieser Pfad mit `405`. Die angebundene iOS-App fragt
 * ihn an; er ist die Datenquelle ihrer Karte, und die blieb dadurch leer.
 *
 * **Das Rate-Limit gilt bewusst nur für POST.** Es steht am Anfang des
 * Schreibpfads und begrenzt Meldungen, nicht Abrufe. Eine Karte, die sich nach
 * 20 Aufrufen abschaltet, wäre schlimmer als gar keine.
 */
export { GET } from '../sichtungen/showreports.json/+server';

export async function PUT() {
	const errorResponse = {
		error: 'Method not allowed',
		message: 'Only POST method is supported for this endpoint'
	};

	return json(errorResponse, { status: 405 });
}

export async function DELETE() {
	const errorResponse = {
		error: 'Method not allowed',
		message: 'Only POST method is supported for this endpoint'
	};

	return json(errorResponse, { status: 405 });
}
