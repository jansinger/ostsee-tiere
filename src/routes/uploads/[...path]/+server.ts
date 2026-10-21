import { createLogger } from '#lib/logger.server.ts';
import { getFileInfo, getUploadPath, isValidUploadPath } from '#lib/server/uploads.ts';
import { error } from '@sveltejs/kit';
import { createReadStream } from 'fs';
import { getStorageProvider, isCloudStorage } from '#lib/server/storage/factory.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { isSightingApproved } from '#lib/server/db/approvalFilter.ts';
import { sightingFiles, sightings } from '#lib/server/db/schema.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import {
	RATE_LIMITS,
	enforceRateLimit,
	createRateLimitIdentifier
} from '#lib/server/middleware/rateLimit.ts';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const logger = createLogger('api:uploads');

/**
 * Prüft anhand der Datenbank, ob der Zugriff auf eine Datei erlaubt ist.
 *
 * Regeln (analog zu /api/media):
 * - Öffentlicher Zugriff nur für freigegebene Sichtungen (`approvedAt` gesetzt).
 * - Unfreigegebene Medien nur für Admins.
 * - Unbekannte Dateien werden als 404 behandelt (Existenz wird nicht verraten).
 */
async function assertFileAccessAllowed(
	filePath: string,
	locals: App.Locals,
	clientIp: string
): Promise<boolean> {
	const fileRecord = await db
		.select({
			sightingId: sightingFiles.sightingId,
			approvedAt: sightings.approvedAt
		})
		.from(sightingFiles)
		.innerJoin(sightings, eq(sightingFiles.sightingId, sightings.id))
		.where(eq(sightingFiles.filePath, filePath))
		.limit(1);

	const file = fileRecord[0];
	if (!file) {
		logger.warn({ filePath, clientIp }, 'Datei nicht in Datenbank gefunden');
		throw error(404, 'Datei nicht gefunden');
	}

	const isApproved = isSightingApproved(file);
	if (!isApproved) {
		const user = locals.user;
		if (!isAdminUser(user)) {
			logger.warn(
				{
					action: 'upload_access_unauthorized',
					filePath,
					sightingId: file.sightingId,
					hasUser: !!user,
					clientIp
				},
				'Nicht autorisierter Zugriff auf unfreigegebene Datei'
			);
			// Existenz nicht verraten
			throw error(404, 'Datei nicht gefunden');
		}

		logger.info(
			{ filePath, sightingId: file.sightingId, userId: user?.sub },
			'Admin greift auf unfreigegebene Datei zu'
		);
	}

	return isApproved;
}

export const GET: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	const filePath = params.path;
	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';

	// Pfad-Validierung
	if (!filePath || !isValidUploadPath(filePath)) {
		logger.warn({ filePath }, 'Ungültiger Dateipfad angefordert');
		throw error(400, 'Ungültiger Dateipfad');
	}

	// Rate Limiting basierend auf Authentifizierungsstatus
	const isAuthenticated = !!locals.user;
	const rateLimitConfig = isAuthenticated
		? RATE_LIMITS.MEDIA_ACCESS_AUTHENTICATED
		: RATE_LIMITS.MEDIA_ACCESS_ANONYMOUS;
	const rateLimitIdentifier = createRateLimitIdentifier(
		locals.user?.sub,
		clientIp,
		isAuthenticated
	);
	enforceRateLimit(rateLimitIdentifier, rateLimitConfig, 'upload_access');

	// Freigabe-/Admin-Prüfung (analog zu /api/media)
	const isApproved = await assertFileAccessAllowed(filePath, locals, clientIp);
	// Unfreigegebene Dateien sind nur für Admins sichtbar — geteilte Caches dürfen sie nicht vorhalten.
	const cacheControlCloud = isApproved
		? 'public, max-age=31536000, immutable'
		: 'private, no-store';
	const cacheControlLocal = isApproved ? 'public, max-age=86400' : 'private, no-store';

	// For cloud storage, redirect to the actual URL
	if (isCloudStorage()) {
		try {
			const storage = getStorageProvider();
			const url = storage.getUrl(filePath);

			// For Vercel Blob and other cloud providers, redirect to their URL
			return new Response(null, {
				status: 302,
				headers: {
					Location: url,
					'Cache-Control': cacheControlCloud
				}
			});
		} catch (err) {
			logger.error({ error: err, filePath }, 'Fehler beim Abrufen der Cloud-Storage-URL');
			throw error(404, 'Datei nicht gefunden');
		}
	}

	// Local storage - serve directly
	const fullPath = getUploadPath(filePath);

	// Datei-Informationen abrufen
	const fileInfo = getFileInfo(fullPath);

	if (!fileInfo) {
		logger.info({ filePath }, 'Datei nicht gefunden');
		throw error(404, 'Datei nicht gefunden');
	}

	// Nur erlaubte Dateitypen servieren
	if (!fileInfo.isAllowed) {
		logger.warn({ filePath, mimeType: fileInfo.mimeType }, 'Nicht erlaubter Dateityp angefordert');
		throw error(403, 'Dateityp nicht erlaubt');
	}

	logger.debug(
		{ filePath, size: fileInfo.size, mimeType: fileInfo.mimeType },
		'Upload-Datei serviert'
	);

	// Datei-Stream erstellen
	const stream = createReadStream(fullPath);

	// Node.js ReadStream in Web ReadableStream konvertieren
	const readableStream = new ReadableStream({
		start(controller) {
			stream.on('data', (chunk: Buffer | string) => {
				if (Buffer.isBuffer(chunk)) {
					controller.enqueue(new Uint8Array(chunk));
				} else {
					controller.enqueue(new TextEncoder().encode(chunk));
				}
			});
			stream.on('end', () => controller.close());
			stream.on('error', (err) => controller.error(err));
		}
	});

	// Response mit Security-Headers
	return new Response(readableStream, {
		status: 200,
		headers: {
			'Content-Type': fileInfo.mimeType,
			'Cache-Control': cacheControlLocal,
			'Content-Length': fileInfo.size.toString(),
			'Last-Modified': fileInfo.lastModified.toUTCString(),
			// Security Headers
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'",
			'X-Frame-Options': 'DENY'
		}
	});
};
