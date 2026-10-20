import { env } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { ConfigRepository } from '#lib/server/db/configRepository.ts';
import {
	filterConfigsByUserAccess,
	canUserAccessConfigKey
} from '#lib/server/config/accessControl.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { EmailService } from '#lib/server/services/emailService.ts';
import { warnIfBodySizeLimitTooLow } from '#lib/server/startup/bodySizeLimit.ts';
import { json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Konfigurationsschlüssel, deren Wert (in MB) die Upload-Grenze bildet, gegen
 * die `BODY_SIZE_LIMIT` mindestens groß genug sein muss (Befund I1). Beim
 * Serverstart prüft `hooks.server.ts` das einmal; `security.maxVideoFileSize`
 * ist aber zur Laufzeit über diese Route änderbar — ohne erneute Prüfung hier
 * würde ein Admin unbemerkt eine Grenze setzen, die der Node-Adapter auf
 * Plattformebene gar nicht erst durchlässt.
 */
const BODY_SIZE_RELEVANT_CONFIG_KEYS = new Set([
	'security.maxFileSize',
	'security.maxVideoFileSize'
]);

/**
 * Verwirft die Kopie der Mail-Konfiguration im `EmailService`, wenn ein
 * Schlüssel geändert wurde, den er liest.
 *
 * `ConfigRepository.clearCache()` reicht dafür nicht: Der `EmailService` hält
 * seine eigene, fünf Minuten gültige Kopie (`getEmailConfig()`). Wer CC/BCC
 * eintrug und direkt danach eine Test-Mail auslöste, bekam bis zu fünf Minuten
 * lang die alte Empfängerliste — ohne Fehlermeldung, die Mail kam ja an, nur
 * eben nicht bei den neuen Empfängern.
 */
function invalidateEmailCacheIfNeeded(key: string): void {
	if (!key.startsWith('notification.email.') && !key.startsWith('email.smtp.')) {
		return;
	}

	EmailService.clearCaches();

	// Nur die SMTP-Schlüssel beschreiben die Verbindung selbst. Eine geänderte
	// Empfängerliste ist kein Grund, eine funktionierende Verbindung wegzuwerfen
	// — der Transporter wird sonst bei jedem Speichern in den Einstellungen neu
	// aufgebaut.
	if (key.startsWith('email.smtp.')) {
		EmailService.resetTransporter();
	}
}

const logger = createLogger('api:config');

export const GET: RequestHandler = async ({ url, locals }: RequestEvent) => {
	// SECURITY: Must be outside try/catch so redirect(302) propagates correctly
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	try {
		const category = url.searchParams.get('category');

		let configs;
		if (category) {
			configs = await ConfigRepository.getByCategory(
				category as Parameters<typeof ConfigRepository.getByCategory>[0]
			);
		} else {
			configs = await ConfigRepository.getAll();
		}

		// Filter configurations based on user access level
		const accessibleConfigs = filterConfigsByUserAccess(configs, locals.user);

		return json(accessibleConfigs);
	} catch (error) {
		logger.error({ error }, 'Failed to get configurations');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({
	request,
	locals,
	url,
	getClientAddress
}: RequestEvent) => {
	// SECURITY: Must be outside try/catch so redirect(302) propagates correctly
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	try {
		const body = await request.json();
		const { key, value, description, category } = body;

		if (!key || value === undefined || !category) {
			return json(
				{ success: false, error: 'Missing required fields: key, value, and category are required' },
				{ status: 400 }
			);
		}

		// SECURITY: Check if user has access to this specific configuration key
		if (!canUserAccessConfigKey(locals.user, key)) {
			return json(
				{
					success: false,
					error: 'Forbidden: You do not have permission to modify this configuration'
				},
				{ status: 403 }
			);
		}

		// Befund I1: Dieselbe Prüfung wie beim Serverstart (hooks.server.ts),
		// jetzt auch beim SCHREIBEN. Ohne sie könnte ein Admin
		// security.maxVideoFileSize über die Plattformgrenze BODY_SIZE_LIMIT
		// heben — die Dropzone verspricht dann sofort die neue Grenze, während
		// der Node-Adapter Uploads darüber ohne die Fehlermeldung dieser
		// Anwendung abbricht. Bewusst eine Ablehnung (400), keine bloße Warnung:
		// Eine Warnung würde in den Server-Logs verschwinden, die der Admin beim
		// Ändern einer Einstellung im UI nicht sieht — die inkonsistente
		// Konfiguration bliebe unbemerkt live, bis der erste Melder daran
		// scheitert. Der Admin muss stattdessen zuerst BODY_SIZE_LIMIT (und den
		// Reverse-Proxy) anheben und neu starten, bevor die Anwendung die
		// größere Grenze übernimmt.
		if (BODY_SIZE_RELEVANT_CONFIG_KEYS.has(key) && typeof value === 'number') {
			const warning = warnIfBodySizeLimitTooLow(env.BODY_SIZE_LIMIT, value * 1024 * 1024);
			if (warning) {
				logger.warn(
					{ key, value, action: 'config_update_rejected', reason: 'body_size_limit_too_low' },
					warning
				);
				return json({ success: false, error: warning }, { status: 400 });
			}
		}

		await ConfigRepository.upsert(
			{
				key,
				value,
				description,
				category
			},
			locals.user!.sub // Safe after requireUserRole check
		);

		// Clear entire cache for configuration changes
		ConfigRepository.clearCache();
		invalidateEmailCacheIfNeeded(key);

		const clientIp = getClientIp(getClientAddress, request);
		await logAuditEvent({
			action: 'config.update',
			resourceType: 'config',
			resourceId: key,
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			...(clientIp ? { ipAddress: clientIp } : {}),
			details: { key, category }
		});

		logger.info({ key, userId: locals.user!.sub }, 'Configuration updated'); // Safe after requireUserRole check

		return json({ success: true });
	} catch (error) {
		logger.error({ error }, 'Failed to update configuration');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({
	url,
	locals,
	request,
	getClientAddress
}: RequestEvent) => {
	// SECURITY: Must be outside try/catch so redirect(302) propagates correctly
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	try {
		const key = url.searchParams.get('key');

		if (!key) {
			return json({ success: false, error: 'Missing required parameter: key' }, { status: 400 });
		}

		// SECURITY: Check if user has access to this specific configuration key
		if (!canUserAccessConfigKey(locals.user, key)) {
			return json(
				{
					success: false,
					error: 'Forbidden: You do not have permission to delete this configuration'
				},
				{ status: 403 }
			);
		}

		await ConfigRepository.delete(key);

		// Clear entire cache for configuration changes
		ConfigRepository.clearCache();
		invalidateEmailCacheIfNeeded(key);

		const clientIp = getClientIp(getClientAddress, request);
		await logAuditEvent({
			action: 'config.delete',
			resourceType: 'config',
			resourceId: key,
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			...(clientIp ? { ipAddress: clientIp } : {}),
			details: { key }
		});

		logger.info({ key, userId: locals.user!.sub }, 'Configuration deleted'); // Safe after requireUserRole check

		return json({ success: true });
	} catch (error) {
		logger.error({ error }, 'Failed to delete configuration');
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
