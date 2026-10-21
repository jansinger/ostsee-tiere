import * as m from '#lib/paraglide/messages.js';
import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { sightingFiles } from '#lib/server/db/schema.ts';
import { deleteFileByPath } from '#lib/server/db/sightingFilesRepository.ts';
import { getStorageProvider } from '#lib/server/storage/factory.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { getUploadUid } from '#lib/server/auth/uploadOwnership.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import {
	RATE_LIMITS,
	enforceRateLimit,
	createRateLimitIdentifier
} from '#lib/server/middleware/rateLimit.ts';
import { error, isHttpError, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const logger = createLogger('FileDeleteAPI');

export const DELETE: RequestHandler = async ({ request, locals, getClientAddress, cookies }) => {
	const userIdentifier = locals.user?.sub || 'anonymous';
	const isAuthenticated = !!locals.user;
	const clientIp = getClientIp(getClientAddress, request);

	try {
		// Rate Limiting (analog zum Upload) — verhindert massenhaftes anonymes Löschen
		const rateLimitConfig = isAuthenticated
			? RATE_LIMITS.FILE_UPLOAD_AUTHENTICATED
			: RATE_LIMITS.FILE_UPLOAD_ANONYMOUS;
		const rateLimitIdentifier = createRateLimitIdentifier(
			locals.user?.sub,
			clientIp ?? 'unknown',
			isAuthenticated
		);
		enforceRateLimit(rateLimitIdentifier, rateLimitConfig, 'file_delete');

		const { filePath } = await request.json();

		if (!filePath) {
			throw error(400, 'File path ist erforderlich');
		}

		// Check if user is admin or if file is deletable by regular users
		const isAdmin = isAdminUser(locals.user);

		// Security audit logging
		logger.info(
			{
				action: 'file_delete_attempt',
				user: userIdentifier,
				authenticated: isAuthenticated,
				isAdmin,
				clientIp,
				filePath
			},
			'File deletion requested'
		);

		if (!isAdmin) {
			// For non-admin users, check if file exists and has no sightingId assigned
			const fileRecord = await db
				.select({
					id: sightingFiles.id,
					sightingId: sightingFiles.sightingId,
					uid: sightingFiles.uid
				})
				.from(sightingFiles)
				.where(eq(sightingFiles.filePath, filePath))
				.limit(1);

			if (fileRecord.length === 0) {
				logger.warn({ filePath }, 'File not found in database for deletion');
				throw error(404, m.api_files_delete_text_datei_nicht_gefunden());
			}

			const file = fileRecord[0]!; // Safe after length check
			if (file.sightingId !== null) {
				logger.warn(
					{
						action: 'file_delete_blocked',
						reason: 'file_assigned_to_sighting',
						filePath,
						sightingId: file.sightingId,
						user: userIdentifier,
						authenticated: isAuthenticated,
						clientIp
					},
					'Non-admin user attempted to delete file assigned to sighting'
				);
				throw error(403, m.api_files_delete_text_datei_kann_nicht_geloescht_werden_sie_is());
			}

			// Ownership-Binding: Anonyme, noch nicht zugeordnete Uploads dürfen nur von DEM
			// Client gelöscht werden, der sie hochgeladen hat. Der beim Upload gesetzte,
			// cookie-gebundene Owner-UID muss mit dem gespeicherten uid der Datei übereinstimmen.
			const requesterUid = getUploadUid(cookies);
			if (!requesterUid || requesterUid !== file.uid) {
				logger.warn(
					{
						action: 'file_delete_blocked',
						reason: 'upload_uid_mismatch',
						filePath,
						user: userIdentifier,
						authenticated: isAuthenticated,
						hasCookie: !!requesterUid,
						clientIp
					},
					'Non-admin user attempted to delete file without matching upload-uid cookie'
				);
				throw error(403, m.api_files_delete_text_datei_kann_nicht_geloescht_werden_keine());
			}

			logger.info(
				{
					action: 'file_delete_allowed',
					filePath,
					user: userIdentifier,
					authenticated: isAuthenticated,
					clientIp
				},
				'User deleting unassigned file'
			);
		} else {
			logger.info(
				{
					action: 'file_delete_admin',
					filePath,
					user: userIdentifier,
					clientIp
				},
				'Admin user deleting file'
			);
		}

		// Basic security check - no path traversal
		if (filePath.includes('..') || filePath.includes('\\') || filePath.startsWith('/')) {
			logger.warn({ filePath }, 'Verdächtiger Datei-Pfad erkannt');
			throw error(400, m.api_files_delete_text_ungueltiger_datei_pfad());
		}

		// Use storage provider to delete file
		const storage = getStorageProvider();
		try {
			await storage.delete(filePath);

			logger.info({ filePath }, 'Datei erfolgreich gelöscht');

			await deleteFileByPath(filePath);

			if (isAdmin) {
				await logAuditEvent({
					action: 'file.delete',
					resourceType: 'file',
					resourceId: filePath,
					...(locals.user?.email ? { userEmail: locals.user.email } : {}),
					...(clientIp ? { ipAddress: clientIp } : {})
				});
			}

			return json({
				success: true,
				message: m.api_files_delete_text_datei_erfolgreich_geloescht(),
				filePath
			});
		} catch (deleteError: unknown) {
			logger.error({ error: deleteError, filePath }, 'Fehler beim Löschen der Datei');

			// For cloud storage, we don't get ENOENT errors, so just log and continue
			return json({
				success: true,
				message: m.api_files_delete_text_datei_wurde_geloescht_oder_existierte_be(),
				filePath
			});
		}
	} catch (err) {
		if (isHttpError(err)) {
			throw err; // Re-throw SvelteKit errors
		}

		logger.error({ error: err }, 'Unerwarteter Fehler beim Datei-Löschen');
		throw error(500, m.api_files_delete_text_interner_server_fehler_beim_datei_loesch());
	}
};
