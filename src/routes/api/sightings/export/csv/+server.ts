import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { generateCsvData } from '#lib/server/export/csvExport.ts';
import { text } from '@sveltejs/kit';
import { and } from 'drizzle-orm';
import { buildExportConditions, parseExportFilterParams } from '../exportFilterParams';
import { toFrontendSighting } from '../toFrontendSighting';
import type { RequestHandler } from './$types';

const logger = createLogger('api:sightings:export:csv');

export const GET: RequestHandler = async ({ url, locals }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const filterResult = parseExportFilterParams(url);
	if ('error' in filterResult) {
		return text(filterResult.error.message, {
			status: 400,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
	const { fromDate, toDate } = filterResult.params;

	try {
		// Erstellen der Abfrage-Bedingungen
		const conditions = buildExportConditions(filterResult.params);

		// Sichtungen aus der Datenbank abrufen
		const sightings = await db
			.select()
			.from(sightingsTable)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(sightingsTable.sightingDate);

		// Formatierung ausschließlich über den getesteten Exporter — er rechnet
		// die UTC-Zeitstempel nach Europe/Berlin um.
		const csvContent = generateCsvData(sightings.map(toFrontendSighting));

		// Audit-Log schreiben
		await logAuditEvent({
			action: 'export.download',
			resourceType: 'export',
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			details: {
				format: 'csv',
				fromDate: fromDate || null,
				toDate: toDate || null
			}
		});

		// CSV-Datei zurückgeben
		return text(csvContent, {
			headers: {
				'Content-Type': 'text/csv;charset=utf-8',
				'Content-Disposition': 'attachment; filename="sichtungen-export.csv"'
			}
		});
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Fehler beim CSV-Export'
		);

		return text('Fehler beim CSV-Export', {
			status: 500,
			headers: {
				'Content-Type': 'text/plain'
			}
		});
	}
};
