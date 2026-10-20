import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { berlinDatePart } from '#lib/server/db/sqlTimeZone.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { json } from '@sveltejs/kit';
import { and, sql } from 'drizzle-orm';
import { mapSightingConditions } from '../publicMapConditions';
import { resolveMapStatuses } from '../statusFilter';
import type { RequestHandler } from './$types';

const logger = createLogger('api:map:sightings:years');

/**
 * Verfügbare Jahre für die Sichtungskarte, jeweils mit Anzahl der Sichtungen.
 *
 * Grundmenge identisch zu `GET /api/map/sightings` (`publicMapConditions.ts`):
 * freigegeben und mit plausiblen Ostsee-Koordinaten. Kalenderjahr wird über
 * `berlinDatePart('year', ...)` gebildet — derselbe Ausdruck wie überall sonst
 * im Projekt, damit der vorhandene Ausdrucksindex (`idx_year_sichtungen`) greift.
 */
export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
	// Muss denselben Statusfilter fahren wie GET /api/map/sightings — sonst
	// zeigt das Jahres-Dropdown Zahlen, die auf der Karte nicht auftauchen.
	const selection = resolveMapStatuses(url.searchParams.get('status'), isAdminUser(locals.user));

	// Gleiche Begründung wie an der Schwesterroute GET /api/map/sightings:
	// jede Antwort hängt vom Session-Cookie ab, ein Shared Cache muss das
	// wissen. Der öffentliche Fall ohne Statusparameter bekommt bewusst nur
	// `Vary`, kein `Cache-Control` — Verhalten bleibt dort byte-identisch.
	setHeaders({ Vary: 'Cookie' });

	if (!selection.ok) {
		// Auch die 403/400-Antwort ist session-abhängig — ohne diesen Header
		// wäre sie die einzige Antwort der Route ohne Cache-Direktive.
		setHeaders({ 'Cache-Control': 'private, no-store' });
		return json({ error: selection.message }, { status: selection.status });
	}

	if (!selection.isPublicDefault) {
		setHeaders({ 'Cache-Control': 'private, no-store' });
	}

	try {
		const yearExpression = berlinDatePart('year', sightingsTable.sightingDate);

		const rows = await db
			.select({
				year: sql<number | string>`${yearExpression}`,
				count: sql<number | string>`COUNT(*)`
			})
			.from(sightingsTable)
			.where(and(...mapSightingConditions(selection.statuses)))
			.groupBy(yearExpression)
			.orderBy(sql`${yearExpression} DESC`);

		const years = rows
			.map((row) => ({ year: Number(row.year), count: Number(row.count) }))
			.filter((entry) => entry.count > 0);

		return json({ years });
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Fehler beim Abrufen der verfügbaren Jahre für die Karte'
		);

		// Fehlerantwort zurückgeben — keine internen Fehlerdetails an den Client leaken
		// (der konkrete Fehler wurde oben serverseitig geloggt).
		return json({ error: 'Fehler beim Abrufen der verfügbaren Jahre' }, { status: 500 });
	}
};
