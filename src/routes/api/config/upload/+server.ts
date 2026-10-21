import {
	PUBLIC_UPLOAD_ACCEPT,
	PUBLIC_UPLOAD_ALLOWED_TYPES
} from '#lib/constants/uploadDefaults.ts';
import { createLogger } from '#lib/logger.server.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { ServerConfigService } from '#lib/services/configService.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logger = createLogger('api:config:upload');

/**
 * Baut das `accept`-Attribut für den Datei-Dialog aus einer MIME-Typ-Liste.
 */
function buildAccept(allowedTypes: readonly string[]): string {
	return allowedTypes
		.map((type) =>
			type.startsWith('image/') ? 'image/*' : type.startsWith('video/') ? 'video/*' : type
		)
		.join(',');
}

export const GET: RequestHandler = async ({ setHeaders, locals, request, getClientAddress }) => {
	const isAuthenticated = !!locals.user;
	const userIdentifier = locals.user?.sub || 'anonymous';
	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';

	try {
		const uploadConfig = await ServerConfigService.getUploadConfig();

		// Die Typliste bleibt für anonyme Melder die kuratierte, kleinere:
		// Eine Teilmenge dessen, was der Server annimmt, ist unbedenklich —
		// umgekehrt entsteht die Drift, die uploadLimitConsistency.test.ts
		// verhindert. Die GRÖSSEN kommen für beide aus der Konfiguration,
		// sonst wirkt eine Änderung im Admin für anonyme Melder gar nicht.
		const allowedTypes = isAuthenticated
			? uploadConfig.allowedTypes
			: [...PUBLIC_UPLOAD_ALLOWED_TYPES];

		logger.info(
			{
				action: 'config_upload_request',
				user: userIdentifier,
				authenticated: isAuthenticated,
				clientIp,
				configType: isAuthenticated ? 'full' : 'public'
			},
			'Upload configuration requested'
		);

		setHeaders({
			'Cache-Control': 'public, max-age=300',
			'Content-Type': 'application/json'
		});

		return json({
			maxFileSize: uploadConfig.maxFileSize,
			maxFileSizeBytes: uploadConfig.maxFileSizeBytes,
			maxVideoFileSize: uploadConfig.maxVideoFileSize,
			maxVideoFileSizeBytes: uploadConfig.maxVideoFileSizeBytes,
			// Befund I4: Gesamtlimit je Meldung — vorher lieferte dieser Endpunkt
			// nur die Einzeldateigrößen, während der Client fest gegen
			// UPLOAD_LIMITS.MAX_TOTAL_SIZE (250 MB) prüfte. Für beide
			// Authentifizierungsstufen gleich, wie schon bei den Einzelgrößen —
			// nur die Typliste unterscheidet sich zwischen anonym und angemeldet.
			maxTotalUploadSize: uploadConfig.maxTotalUploadSize,
			maxTotalUploadSizeBytes: uploadConfig.maxTotalUploadSizeBytes,
			allowedTypes,
			accept: isAuthenticated ? buildAccept(allowedTypes) : PUBLIC_UPLOAD_ACCEPT
		});
	} catch (error) {
		logger.error({ error, user: userIdentifier, clientIp }, 'Failed to get upload configuration');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
