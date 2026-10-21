import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { generateKmlData } from '#lib/server/export/kmlExport.ts';
import { text } from '@sveltejs/kit';
import { and, isNotNull } from 'drizzle-orm';
import { buildExportConditions, parseExportFilterParams, xmlEscape } from '../exportFilterParams';
import { toFrontendSighting } from '../toFrontendSighting';
import type { RequestHandler } from './$types';

const logger = createLogger('api:sightings:export:kml');

export const GET: RequestHandler = async ({ url, locals }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const filterResult = parseExportFilterParams(url);
	if ('error' in filterResult) {
		return text(
			`<?xml version="1.0" encoding="UTF-8"?><error>${xmlEscape(filterResult.error.message)}</error>`,
			{ status: 400, headers: { 'Content-Type': 'application/xml' } }
		);
	}
	const { fromDate, toDate } = filterResult.params;

	try {
		// Erstellen der Abfrage-Bedingungen (KML benötigt immer Koordinaten)
		const conditions = [
			isNotNull(sightingsTable.latitude),
			isNotNull(sightingsTable.longitude),
			...buildExportConditions(filterResult.params)
		];

		// Sichtungen aus der Datenbank abrufen
		const sightings = await db
			.select()
			.from(sightingsTable)
			.where(and(...conditions))
			.orderBy(sightingsTable.sightingDate);

		// Formatierung ausschließlich über den getesteten Exporter — er rechnet
		// die UTC-Zeitstempel nach Europe/Berlin um.
		const kmlContent = generateKmlData(sightings.map(toFrontendSighting));

		// Audit-Log schreiben
		await logAuditEvent({
			action: 'export.download',
			resourceType: 'export',
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			details: {
				format: 'kml',
				fromDate: fromDate || null,
				toDate: toDate || null
			}
		});

		// KML-Datei zurückgeben
		return text(kmlContent, {
			headers: {
				'Content-Type': 'application/vnd.google-earth.kml+xml;charset=utf-8',
				'Content-Disposition': 'attachment; filename="sichtungen-export.kml"'
			}
		});
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Fehler beim KML-Export'
		);

		return text('<?xml version="1.0" encoding="UTF-8"?><error>Fehler beim KML-Export</error>', {
			status: 500,
			headers: {
				'Content-Type': 'application/xml'
			}
		});
	}
};
