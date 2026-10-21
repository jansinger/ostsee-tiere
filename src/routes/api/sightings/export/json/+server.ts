import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { text } from '@sveltejs/kit';
import { and } from 'drizzle-orm';
import { buildExportConditions, parseExportFilterParams } from '../exportFilterParams';
import type { RequestHandler } from './$types';

const logger = createLogger('api:sightings:export:json');

export const GET: RequestHandler = async ({ url, locals }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const filterResult = parseExportFilterParams(url);
	if ('error' in filterResult) {
		return text(JSON.stringify({ error: filterResult.error.message }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	const { fromDate, toDate, verified, entryChannel, mediaUpload } = filterResult.params;

	try {
		// Erstellen der Abfrage-Bedingungen
		const conditions = buildExportConditions(filterResult.params);

		// Sichtungen aus der Datenbank abrufen
		const sightings = await db
			.select()
			.from(sightingsTable)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(sightingsTable.sightingDate);

		// Export-Metadaten hinzufügen.
		// Bewusst kein Berlin-Formatter: JSON ist das Maschinenformat des Exports
		// und gibt die Zeitstempel als UTC-ISO-Strings aus (`Date#toJSON`).
		// Menschenlesbare Ortszeit liefern CSV, KML und XML.
		const exportData = {
			metadata: {
				exportDate: new Date().toISOString(),
				recordCount: sightings.length,
				filters: {
					dateFrom: fromDate || null,
					dateTo: toDate || null,
					verified: verified || null,
					entryChannel: entryChannel || null,
					mediaUpload: mediaUpload || null
				}
			},
			sichtungen: sightings
		};

		// Audit-Log schreiben
		await logAuditEvent({
			action: 'export.download',
			resourceType: 'export',
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			details: {
				format: 'json',
				fromDate: fromDate || null,
				toDate: toDate || null
			}
		});

		// JSON-String erstellen (schön formatiert)
		const jsonContent = JSON.stringify(exportData, null, 2);

		// JSON-Datei zurückgeben
		return text(jsonContent, {
			headers: {
				'Content-Type': 'application/json;charset=utf-8',
				'Content-Disposition': 'attachment; filename="sichtungen-export.json"'
			}
		});
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Fehler beim JSON-Export'
		);

		return text(JSON.stringify({ error: 'Fehler beim JSON-Export' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
};
