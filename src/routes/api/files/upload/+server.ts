import * as m from '#lib/paraglide/messages.js';
import { FILE_VALIDATION_PRESETS, UPLOAD_ERROR_MESSAGES } from '#lib/constants/upload.ts';
import { maxUploadSizeFor } from '#lib/constants/uploadLimits.ts';
import { createLogger } from '#lib/logger.server.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import {
	saveUploadedFile,
	sumFileSizesForReference
} from '#lib/server/db/sightingFilesRepository.ts';
import { getOrCreateUploadUid } from '#lib/server/auth/uploadOwnership.ts';
import { readImageExifData } from '#lib/server/media/exifUtils.ts';
import { getStorageProvider } from '#lib/server/storage/factory.ts';
import { isDangerousFileType, validateMagicBytes } from '#lib/server/validation/magicBytes.ts';
import { validateFile } from '#lib/utils/validation/fileValidation.ts';
import { ServerConfigService } from '#lib/services/configService.ts';
import {
	RATE_LIMITS,
	enforceRateLimit,
	createRateLimitIdentifier,
	buildRateLimitHeaders
} from '#lib/server/middleware/rateLimit.ts';
import { consumeByteBudget, type ByteBudget } from '#lib/server/middleware/byteBudget.ts';
import { isCuid } from '@paralleldrive/cuid2';
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('FileUploadAPI');

// Get storage provider and upload file
const storage = getStorageProvider();

export const POST: RequestHandler = async ({ request, locals, getClientAddress, cookies }) => {
	// Security: Track authentication status
	const isAuthenticated = !!locals.user;
	const userIdentifier = locals.user?.sub || 'anonymous';
	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';

	try {
		const contentType = request.headers.get('content-type') || '';

		if (!contentType.includes('multipart/form-data')) {
			throw error(400, 'Content-Type muss multipart/form-data sein');
		}

		const formData = await request.formData();
		const file = formData.get('file') as File;
		const referenceId = formData.get('referenceId') as string;
		const uid = formData.get('uid') as string;

		if (!file) {
			throw error(400, m.api_files_upload_text_keine_datei_hochgeladen());
		}

		if (!referenceId || !isCuid(referenceId)) {
			throw error(400, 'Reference ID ist erforderlich');
		}
		if (!uid || !isCuid(uid)) {
			throw error(400, 'Upload ID ist erforderlich');
		}

		// Rate limiting based on authentication status. Identifier und Ergebnis
		// werden hier (statt erst nach der Größenprüfung) ermittelt, weil die
		// Byte-Budget-Prüfung unten denselben Identifier braucht.
		const rateLimitConfig = isAuthenticated
			? RATE_LIMITS.FILE_UPLOAD_AUTHENTICATED
			: RATE_LIMITS.FILE_UPLOAD_ANONYMOUS;

		const rateLimitIdentifier = createRateLimitIdentifier(
			userIdentifier,
			clientIp,
			isAuthenticated
		);

		const rateLimitResult = enforceRateLimit(rateLimitIdentifier, rateLimitConfig, 'file_upload');

		// Die Konfiguration ist die einzige Autorität für Größen — dieselbe
		// Quelle, aus der /api/config/upload die Dropzone speist. Zwei getrennte
		// Zahlen (anonym/angemeldet) waren nur nötig, solange die öffentliche
		// Auskunft statisch war; siehe docs/archive/VIDEO_UPLOAD_KONZEPT_2026-07-31.md.
		const uploadConfig = await ServerConfigService.getUploadConfig();
		const maxSize = maxUploadSizeFor(file.type, {
			maxFileSize: uploadConfig.maxFileSizeBytes,
			maxVideoFileSize: uploadConfig.maxVideoFileSizeBytes
		});

		if (file.size > maxSize) {
			logger.warn(
				{
					action: 'file_upload_rejected',
					reason: 'size_limit_exceeded',
					user: userIdentifier,
					authenticated: isAuthenticated,
					clientIp,
					fileName: file.name,
					fileType: file.type,
					fileSize: file.size,
					maxAllowed: maxSize
				},
				'Upload rejected - file too large'
			);
			throw error(
				413,
				UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE(file.name, maxSize, file.size, file.type)
			);
		}

		// Gesamtlimit je Meldung. Die referenceId kommt vom Client und wird nur
		// gegen isCuid() geprüft — dieses Limit ist deshalb KEINE Missbrauchsbremse
		// (die übernimmt das Byte-Budget unten), sondern schützt eine ehrliche
		// Meldung davor, unbemerkt anzuwachsen (zehn 100-MB-Videos wären sonst
		// 1 GB pro Meldung). Bewusst VOR dem Byte-Budget geprüft: Der Melder
		// erfährt so den konkreteren Fehler (wie viel die Meldung schon enthält),
		// und ein Versuch, der nur das Meldungs-Limit sprengt, belastet nicht die
		// stündliche IP-Missbrauchsbremse — die bleibt für tatsächlichen Missbrauch
		// reserviert.
		const alreadyUploaded = await sumFileSizesForReference(referenceId);
		if (alreadyUploaded + file.size > uploadConfig.maxTotalUploadSizeBytes) {
			logger.warn(
				{
					action: 'file_upload_rejected',
					reason: 'total_size_limit_exceeded',
					user: userIdentifier,
					clientIp,
					referenceId,
					alreadyUploaded,
					fileSize: file.size,
					maxAllowed: uploadConfig.maxTotalUploadSizeBytes
				},
				'Upload rejected - total size for this report exceeded'
			);
			throw error(
				413,
				m.api_files_upload_text_die_meldung_enthaelt_bereits_used_mb({
					used: Math.round(alreadyUploaded / 1024 / 1024),
					max: uploadConfig.maxTotalUploadSize
				})
			);
		}

		// Volumen-Bremse. Der Zähler oben begrenzt die Anzahl der Uploads, nicht
		// ihr Volumen; bei 100 MB je Video wären 20 Uploads 2 GB pro Stunde und
		// IP. Das ist die Missbrauchsbremse — anders als das Gesamtlimit oben
		// gilt sie über alle Meldungen einer IP/eines Nutzers hinweg.
		const byteBudget: ByteBudget = isAuthenticated
			? RATE_LIMITS.UPLOAD_BYTES_AUTHENTICATED
			: RATE_LIMITS.UPLOAD_BYTES_ANONYMOUS;
		const budgetResult = consumeByteBudget(rateLimitIdentifier, file.size, byteBudget);

		if (!budgetResult.allowed) {
			logger.warn(
				{
					action: 'file_upload_rejected',
					reason: 'byte_budget_exhausted',
					user: userIdentifier,
					authenticated: isAuthenticated,
					clientIp,
					fileSize: file.size,
					usedBytes: budgetResult.usedBytes,
					remainingBytes: budgetResult.remainingBytes
				},
				'Upload rejected - hourly byte budget exhausted'
			);
			throw error(
				429,
				m.api_files_upload_text_sie_haben_in_der_letzten_stunde_bereits({
					used: Math.round(budgetResult.usedBytes / 1024 / 1024)
				})
			);
		}

		// Security audit logging
		logger.info(
			{
				action: 'file_upload_attempt',
				user: userIdentifier,
				authenticated: isAuthenticated,
				clientIp,
				fileName: file.name,
				fileSize: file.size,
				fileType: file.type,
				referenceId,
				uid
			},
			'File upload initiated'
		);

		// Create dynamic validation preset using configuration
		const dynamicPreset = {
			allowedTypes: uploadConfig.allowedTypes,
			maxFileSize: uploadConfig.maxFileSizeBytes,
			maxVideoFileSize: uploadConfig.maxVideoFileSizeBytes,
			maxFiles: FILE_VALIDATION_PRESETS.MEDIA.maxFiles,
			accept: uploadConfig.allowedTypes
				.map((type) =>
					type.startsWith('image/') ? 'image/*' : type.startsWith('video/') ? 'video/*' : type
				)
				.join(',')
		};

		// Validierung der Datei mit konfigurierten Werten
		const validationResult = validateFile(file, dynamicPreset);
		if (!validationResult.isValid) {
			throw error(400, validationResult.errors.join(' '));
		}

		// JUST FOR TESTING await new Promise((f) => setTimeout(f, 5000));

		const fileBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(fileBuffer);

		// Validate magic bytes to ensure file content matches declared type
		const magicBytesValidation = validateMagicBytes(buffer, file.type);
		if (!magicBytesValidation.isValid) {
			logger.warn(
				{
					fileName: file.name,
					declaredType: file.type,
					detectedType: magicBytesValidation.actualType,
					referenceId
				},
				'File type mismatch detected'
			);
			throw error(
				400,
				magicBytesValidation.message ||
					m.api_files_upload_text_dateiinhalt_stimmt_nicht_mit_dem_angegeb()
			);
		}

		// Check for potentially dangerous file types
		if (isDangerousFileType(file.type)) {
			logger.warn(
				{
					fileName: file.name,
					fileType: file.type,
					referenceId
				},
				'Potentially dangerous file type rejected'
			);
			throw error(400, m.api_files_upload_text_dieser_dateityp_ist_aus_sicherheitsgruen());
		}

		const [uploadedFile, metadata] = await Promise.all([
			storage.upload(file, buffer, {
				uid,
				referenceId,
				preserveOriginalName: false
			}),
			readImageExifData(buffer)
		]);

		logger.info(
			{
				action: 'file_upload_success',
				user: userIdentifier,
				authenticated: isAuthenticated,
				clientIp,
				fileInfo: uploadedFile,
				referenceId,
				uid,
				size: file.size
			},
			'Datei erfolgreich hochgeladen'
		);

		uploadedFile.exifData = metadata;

		// Ownership-Binding: Serverseitig generierter, cookie-gebundener Owner-UID.
		// Wird MIT der Datei gespeichert (überschreibt den nicht vertrauenswürdigen
		// client-gelieferten FormData-uid in der DB) und beim Löschen als Nachweis geprüft.
		// Wichtig: Dateiname auf der Platte und die JSON-Response behalten den per-Datei-uid
		// (Frontend-Key); nur der DB-Datensatz erhält den Owner-UID.
		const ownerUid = getOrCreateUploadUid(cookies);
		await saveUploadedFile({ ...uploadedFile, uid: ownerUid }, referenceId);

		// Add rate limit headers from the already-computed result (no second counter increment)
		return json(uploadedFile, {
			headers: buildRateLimitHeaders(rateLimitConfig, rateLimitResult)
		});
	} catch (err) {
		// Re-throw SvelteKit HttpErrors (from error() helper) and Responses
		if (isHttpError(err) || err instanceof Response) {
			throw err;
		}

		logger.error({ error: err }, 'Unerwarteter Fehler beim Datei-Upload');
		throw error(500, m.api_files_upload_text_interner_server_fehler_beim_datei_upload());
	}
};
