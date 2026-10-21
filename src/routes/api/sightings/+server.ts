import * as m from '#lib/paraglide/messages.js';
import { env } from '#lib/server/env.ts';
import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';
import { createLogger } from '#lib/logger.server.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { resolveEntryClient } from '#lib/server/utils/resolveEntryClient.ts';
import { getBuildInfo } from '#lib/server/startup/versionInfo.ts';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import { db } from '#lib/server/db/index.ts';
import { approvedOnly } from '#lib/server/db/approvalFilter.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { berlinToChar } from '#lib/server/db/sqlTimeZone.ts';
import { getYearRange } from '#lib/legacy-api/date-utils.ts';
import { countRecentDuplicateSignals, saveSighting } from '#lib/server/db/sightingRepository.ts';
import { mapFormToSighting } from '#lib/server/db/mapFormToSighting.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';
import { verifyFormToken } from '#lib/server/spam/formToken.ts';
import type { SpamSubmissionContext } from '#lib/types/spam.ts';
import { EmailService } from '#lib/server/services/emailService.ts';
import type { StoredWeatherData } from '#lib/services/weatherService.ts';
import {
	checkForbiddenAdminFields,
	validateSightingFormData
} from '#lib/server/validation/requestValidation.ts';
import { ServerConfigService } from '#lib/services/configService.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';
import { json, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { and, gte, lt, sql } from 'drizzle-orm';
import { ValidationError } from 'yup';
import type { RequestHandler } from './$types';
import {
	enforceRateLimit,
	RATE_LIMITS,
	createRateLimitIdentifier
} from '#lib/server/middleware/rateLimit.ts';

// Dynamic environment variable for Docker runtime
const NODE_ENV = env.NODE_ENV ?? 'development';

// Logger für diesen API-Endpunkt erstellen
const logger = createLogger('api:sightings');

export async function GET(event: RequestEvent) {
	try {
		// Jahr aus Query-Parameter holen, Standard ist das aktuelle Jahr
		const year = event.url.searchParams.get('year')
			? parseInt(event.url.searchParams.get('year') as string)
			: new Date().getFullYear();

		// Zeitraum für das angegebene Jahr in deutscher Ortszeit (halboffenes
		// Intervall) — `new Date(year, 0, 1)` hinge an der Prozess-Zeitzone;
		// `dt`/`ti` werden unten nach Europe/Berlin formatiert, der Filter muss
		// dieselbe Jahresauslegung haben.
		const { startDate, endDate } = getYearRange(year);

		logger.debug({ year, startDate, endDate }, 'Sichtungen abrufen');

		// Abfrage der Sichtungen für das angegebene Jahr
		const result = await db
			.select({
				id: sightings.id,
				ts: sightings.created,
				// H2: dt/ti in Europe/Berlin — dieselben Feldnamen liefert
				// showreports.json bereits in Berlin, ein rohes to_char() ohne
				// AT TIME ZONE wäre UTC-Wanduhrzeit und würde 1-2 h abweichen.
				dt: berlinToChar(sightings.sightingDate, 'DD.MM.YYYY'),
				ti: berlinToChar(sightings.sightingDate, 'HH24:MI'),
				lat: sightings.latitude,
				lon: sightings.longitude,
				ct: sightings.totalCount,
				yo: sightings.juvenileCount,
				ta: sightings.species,
				tf: sightings.isDead,
				na: sql<string>`CASE WHEN ${sightings.nameConsent} = 1 THEN 
                    CONCAT(${sightings.firstName}, ' ', ${sightings.lastName}) 
                    ELSE NULL END`,
				ar: sightings.waterway,
				sh: sql<string>`CASE WHEN ${sightings.shipNameConsent} = 1 THEN 
                     ${sightings.shipName} 
                     ELSE NULL END`
			})
			.from(sightings)
			// Der Endpunkt ist ohne Session erreichbar, also gilt die öffentliche
			// Grundmenge: nur freigegebene Sichtungen. `na`/`sh` prüfen zwar die
			// Einwilligung, aber eine Einwilligung erlaubt die Veröffentlichung des
			// Namens — nicht die Veröffentlichung einer ungeprüften Meldung.
			// `approvedOnly()` statt eigener Bedingung, damit das Prädikat genau
			// einmal definiert bleibt (siehe approvalFilter.ts).
			.where(
				and(
					approvedOnly(),
					gte(sightings.sightingDate, startDate),
					lt(sightings.sightingDate, endDate)
				)
			)
			.orderBy(sightings.sightingDate);

		logger.info({ year, count: result.length }, 'Sichtungen erfolgreich abgerufen');

		// Cache-Header setzen (5 Minuten). Kurz gehalten, weil die Antwortmenge am
		// Freigabestatus hängt: eine frisch freigegebene Sichtung bleibt so lange
		// unsichtbar, wie die alte Antwort gecached ist.
		event.setHeaders({
			'Cache-Control': 'max-age=300',
			'Content-Type': 'application/json'
		});

		// JSON-Antwort zurückgeben
		return json(result);
	} catch (error) {
		logger.error(error, 'Fehler beim Abrufen der Sichtungen');
		return json({ error: 'Fehler beim Abrufen der Daten' }, { status: 500 });
	}
}

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const userIdentifier = locals.user?.sub || 'anonymous';
	const isAuthenticated = !!locals.user;
	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';

	// Security audit logging
	logger.info(
		{
			action: 'sighting_submission',
			user: userIdentifier,
			authenticated: isAuthenticated,
			clientIp,
			userAgent: request.headers.get('user-agent') || 'unknown'
		},
		'Sighting submission attempt'
	);

	// Rate limiting: 20 submissions per hour per user/IP
	enforceRateLimit(
		createRateLimitIdentifier(locals.user?.sub, clientIp, isAuthenticated),
		RATE_LIMITS.SIGHTING_SUBMISSION,
		'api:sightings:post'
	);

	try {
		// Daten aus dem Request-Body extrahieren
		const requestBody = await request.json();

		// Security: Check for honeypot field
		if (requestBody._honeypot) {
			logger.warn(
				{
					action: 'sighting_honeypot_triggered',
					clientIp,
					user: userIdentifier
				},
				'Honeypot field detected - likely spam'
			);
			throw new ValidationError(m.api_sightings_text_ungueltige_formularuebermittlung());
		}

		// Zeit-Token VOR der Feld-Validierung herausnehmen: Es ist kein
		// Formularfeld und würde sonst an der Whitelist scheitern. Es fließt
		// nur in den Spam-Score ein und blockiert bewusst nichts.
		let rawFormToken: unknown;
		if (requestBody && typeof requestBody === 'object') {
			rawFormToken = (requestBody as Record<string, unknown>)._formToken;
			delete (requestBody as Record<string, unknown>)._formToken;
		}

		logger.debug({ requestBody }, 'Sichtung speichern - Request empfangen');

		// 1. Prüfe auf verbotene Admin-Felder
		const adminFieldCheck = checkForbiddenAdminFields(requestBody);
		if (adminFieldCheck.hasForbiddenFields) {
			logger.warn(
				{ forbiddenFields: adminFieldCheck.forbiddenFields },
				'Verbotene Admin-Felder in Request'
			);

			return json(
				{
					success: false,
					code: 'FORBIDDEN_FIELDS',
					message: `Die folgenden Felder dürfen nicht von Clients gesetzt werden: ${adminFieldCheck.forbiddenFields.join(', ')}`,
					forbiddenFields: adminFieldCheck.forbiddenFields
				},
				{ status: 403 }
			);
		}

		// 2. Validiere erlaubte Felder (Whitelist)
		const fieldValidation = validateSightingFormData(requestBody);
		if (!fieldValidation.isValid) {
			logger.warn(
				{
					rejectedFields: fieldValidation.rejectedFields,
					error: fieldValidation.error
				},
				'Unerlaubte Felder in Request'
			);

			return json(
				{
					success: false,
					code: 'INVALID_FIELDS',
					message: fieldValidation.error,
					rejectedFields: fieldValidation.rejectedFields
				},
				{ status: 400 }
			);
		}

		const formData = fieldValidation.data!;
		logger.debug({ formData }, 'Bereinigte Sichtungsdaten');

		// 3. Validierung der Formulardaten mit Schema
		// Setze Server-seitige Defaults für Felder, die nicht von Clients gesetzt werden dürfen
		const formDataWithDefaults: SightingFormValues = {
			...formData,
			entryChannel: formData.entryChannel ?? EntryChannelEnum.WEB, // Default: Web (0)
			verified: false, // Immer false für neue Client-Sichtungen
			internalComment: undefined // Keine internen Kommentare von Clients
		};

		await getSightingSchema().validate(formDataWithDefaults, { abortEarly: false });

		// Extract and validate weather data from form if available
		let weatherData: StoredWeatherData | undefined;
		if (formDataWithDefaults.weatherData) {
			const { validateWeatherData } =
				await import('#lib/server/validation/weatherDataValidation.ts');
			const weatherResult = validateWeatherData(formDataWithDefaults.weatherData);
			if (weatherResult.valid) {
				weatherData = formDataWithDefaults.weatherData as StoredWeatherData;
				logger.info(
					{ sightingRef: formDataWithDefaults.referenceId, weatherDataType: weatherData.data_type },
					'Saving sighting with validated weather data'
				);
			} else {
				logger.warn(
					{ sightingRef: formDataWithDefaults.referenceId, reason: weatherResult.reason },
					'Client weather data rejected - saving sighting without weather'
				);
			}
		} else {
			logger.debug(
				{ sightingRef: formDataWithDefaults.referenceId },
				'No weather data provided with sighting'
			);
		}

		// Spam-Heuristik zum Meldezeitpunkt — inklusive Zeit-Token-Kontext, den
		// nachträgliche Prüfungen (Admin-Modal, E-Mail) nicht mehr haben. Das
		// Ergebnis wird persistiert; abgelehnt wird hier nichts (Triage im Admin).
		const tokenCheck = verifyFormToken(rawFormToken);
		const submission: SpamSubmissionContext =
			tokenCheck.status === 'valid'
				? { tokenStatus: 'valid', ageSeconds: tokenCheck.ageSeconds }
				: { tokenStatus: tokenCheck.status };
		// Ostsee-Flag aus derselben Abbildung, die auch die DB-Spalte füllt —
		// der Detektor rechnet keine eigene Geografie. `saveSighting` mappt
		// gleich noch einmal; mapFormToSighting ist pur, das Ergebnis identisch.
		const { inBalticSeaGeo } = mapFormToSighting(formDataWithDefaults);
		const recentDuplicates = await countRecentDuplicateSignals({
			email: formDataWithDefaults.email,
			notes: formDataWithDefaults.notes
		});
		const spamCheck = await detectSpamIndicators({
			latitude: formDataWithDefaults.latitude ?? undefined,
			longitude: formDataWithDefaults.longitude ?? undefined,
			species: formDataWithDefaults.species,
			firstName: formDataWithDefaults.firstName || undefined,
			lastName: formDataWithDefaults.lastName || undefined,
			email: formDataWithDefaults.email || undefined,
			waterway: formDataWithDefaults.waterway || undefined,
			seaMark: formDataWithDefaults.seaMark || undefined,
			notes: formDataWithDefaults.notes || undefined,
			inBalticSeaGeo,
			recentDuplicates,
			submission
		});
		if (spamCheck.isHighRisk) {
			logger.warn(
				{
					event: 'security.spam_suspect',
					clientIp,
					score: spamCheck.score,
					indicators: spamCheck.indicators
				},
				'Sichtung mit hohem Spam-Score eingegangen'
			);
		}

		// Client-Kennung serverseitig aus dem eigenen Build, nicht aus dem Body:
		// Der Melder soll nicht bestimmen können, als was seine Meldung gilt.
		const entryClient = resolveEntryClient({
			source: 'web',
			appVersion: getBuildInfo().version
		});

		const { id } = await saveSighting(formDataWithDefaults, weatherData, spamCheck, entryClient);
		const referenceId = formDataWithDefaults.referenceId || `REF-${id}`;

		logger.info({ id, referenceId }, 'Sichtung erfolgreich gespeichert');

		// Send email notification if enabled — fire-and-forget, damit der SMTP-Versand
		// die HTTP-Response nicht blockiert. Fehler werden geloggt, nicht geworfen.
		try {
			const emailConfig = await ServerConfigService.getEmailConfig();
			if (emailConfig.enabled && emailConfig.recipient && id) {
				// Use new ID-based email service that reads from database
				// This ensures correct Baltic Sea validation data is used
				void EmailService.sendNewSightingNotification(id)
					.then(() => {
						logger.info({ id, referenceId }, 'Email notification sent successfully');
					})
					.catch((emailError) => {
						logger.error(
							{ emailError, id },
							'Failed to send email notification, but sighting was saved'
						);
					});
			}
		} catch (emailError) {
			// Don't fail the request if the email config lookup fails
			logger.error({ emailError, id }, 'Failed to send email notification, but sighting was saved');
		}

		// Erfolgreiche Antwort
		return json({ success: true, id, referenceId }, { status: 201 });
	} catch (error: unknown) {
		// Re-throw SvelteKit HTTP errors (e.g. 429 rate limit) so they propagate correctly
		if (isHttpError(error)) throw error;

		// Prüfen, ob es sich um einen Yup-Validierungsfehler handelt
		if (
			(typeof error === 'object' &&
				error !== null &&
				'name' in error &&
				error.name === 'ValidationError') ||
			error instanceof ValidationError
		) {
			// Strukturierte Fehlerausgabe für Validierungsfehler
			const validationErrors: Record<string, string> = {};

			// Yup sammelt die Fehler in einem errors-Array, wenn abortEarly: false
			if ('inner' in error && Array.isArray(error.inner)) {
				error.inner.forEach((validationError) => {
					const path = validationError.path || 'unbekanntesFeld';
					validationErrors[path] = validationError.message;
				});
			} else {
				// Fallback für den Fall, dass die Fehlerstruktur anders ist
				validationErrors.allgemein =
					'message' in error && typeof error.message === 'string'
						? error.message
						: m.api_sightings_text_unbekannter_validierungsfehler();
			}

			logger.warn({ validationErrors }, 'Validierungsfehler bei Sichtung');

			return json(
				{
					success: false,
					code: 'VALIDATION_ERROR',
					message: m.api_sightings_text_validierungsfehler_bei_der_eingabe(),
					errors: validationErrors
				},
				{ status: 400 }
			);
		}

		// Datenbankfehler
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof error.code === 'string' &&
			error.code.startsWith('23')
		) {
			// PostgreSQL-Fehler mit Integritätsverletzungen (23xxx)
			logger.error(error, 'Datenbankfehler beim Speichern der Sichtung');
			return json(
				{
					success: false,
					code: 'DATABASE_ERROR',
					message: m.api_sightings_text_die_daten_konnten_nicht_in_der_datenbank(),
					detail:
						NODE_ENV === 'development'
							? 'detail' in error
								? error.detail
								: String(error)
							: undefined
				},
				{ status: 422 }
			);
		}

		// Allgemeiner Fehler
		logger.error(error, 'Fehler beim Speichern der Sichtung');

		return json(
			{
				success: false,
				code: 'SERVER_ERROR',
				message: m.api_sightings_text_ein_unbekannter_fehler_ist_aufgetreten(),
				detail:
					NODE_ENV === 'development'
						? error instanceof Error
							? error.message
							: String(error)
						: undefined
			},
			{ status: 500 }
		);
	}
};
