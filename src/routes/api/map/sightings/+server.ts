import { createLogger } from '#lib/logger.server.ts';
import { sightingsToGeoJSON, type DBSighting } from '#lib/map/mapUtils.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { berlinDayRangeUtc } from '#lib/server/datetime/berlinDayRange.ts';
import { consentGatedNameSearch, containsPattern } from '#lib/server/db/consentGatedSearch.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { json } from '@sveltejs/kit';
import { and, gte, lt, sql } from 'drizzle-orm';
import { mapSightingConditions } from './publicMapConditions';
import { resolveMapStatuses } from './statusFilter';
import type { RequestHandler } from './$types';

const logger = createLogger('api:map:sightings');

export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
	// Filter-Parameter aus der URL extrahieren
	const year = url.searchParams.get('year');
	const search = url.searchParams.get('search');

	// Statusfilter: ohne Parameter bleibt es die öffentliche Grundmenge, jeder
	// gesetzte Parameter verlangt eine Admin-Anmeldung. Die Entscheidung liegt
	// in statusFilter.ts, damit sie ohne Route testbar ist.
	const selection = resolveMapStatuses(url.searchParams.get('status'), isAdminUser(locals.user));

	// Jede Antwort dieser Route hängt vom Session-Cookie ab — ob überhaupt ein
	// Statusfilter erlaubt ist, entscheidet die Admin-Anmeldung. Ein Shared
	// Cache muss das wissen, sonst kann er die Antwort einer Session an eine
	// andere Session ausliefern. Gilt auch für den öffentlichen Fall ohne
	// Statusparameter — dort bleibt bewusst nur `Vary`, kein `Cache-Control`,
	// damit sich am unveränderten Verhalten nichts ändert (dieselbe Begründung
	// wie an der Schwesterroute /sichtungen/showreports.json:439-440).
	setHeaders({ Vary: 'Cookie' });

	if (!selection.ok) {
		// Die 403/400-Antwort hängt ebenso von der Session ab (unangemeldet vs.
		// Admin, gültiger vs. unbekannter Statuswert) — ohne diesen Header wäre
		// sie die einzige Antwort der Route ohne Cache-Direktive und könnte in
		// einem Shared Cache landen.
		setHeaders({ 'Cache-Control': 'private, no-store' });
		return json({ error: selection.message }, { status: selection.status });
	}

	if (!selection.isPublicDefault) {
		// Nicht freigegebene Meldungen dürfen nicht in einem geteilten Cache
		// landen — sonst liefert ein Proxy sie an Besucher aus.
		setHeaders({ 'Cache-Control': 'private, no-store' });
	}

	try {
		// Erstellen der Abfrage-Bedingungen
		const conditions = [
			// Grundmenge: gewählter Bearbeitungszustand UND plausible
			// Ostsee-Koordinaten. Ohne den Koordinatenfilter fallen NULL-Koordinaten
			// in sightingsToGeoJSON auf [0,0] zurück ("Null Island"). Identische
			// Grundmenge wie /api/map/sightings/years — siehe publicMapConditions.ts.
			...mapSightingConditions(selection.statuses)
		];

		// Jahr-Filter hinzufügen, wenn vorhanden
		if (year) {
			// Jahresgrenzen sind Berliner Mitternacht, die Spalte hält UTC. Halboffenes
			// Intervall statt BETWEEN, sonst fehlt der gesamte 31.12.
			const { start, endExclusive } = berlinDayRangeUtc(`${year}-01-01`, `${year}-12-31`);
			conditions.push(gte(sightingsTable.sightingDate, start));
			conditions.push(lt(sightingsTable.sightingDate, endExclusive));
		}

		// Suchfilter hinzufügen, wenn vorhanden. Der Guard prüft den getrimmten
		// Begriff — gleichlautend mit der Legacy-Route, die bei reinem Whitespace
		// ebenfalls nicht filtert. Andernfalls entstünde hier `%%`, was jede Zeile
		// ausschlösse, in der alle durchsuchten Felder NULL sind.
		if (search?.trim()) {
			// Fahrwasser und Seezeichen sind nicht personenbezogen und bleiben frei
			// durchsuchbar; Name und Schiffsname nur mit Einwilligung des Melders.
			// Das Gate ist mit der Legacy-API geteilt, damit beide öffentlichen
			// Flächen dieselbe Teilmenge freigeben — siehe consentGatedSearch.ts.
			const pattern = containsPattern(search);
			conditions.push(
				sql`(
          ${sightingsTable.waterway} LIKE ${pattern} ESCAPE '\\' OR
          ${sightingsTable.seaMark} LIKE ${pattern} ESCAPE '\\' OR
          ${consentGatedNameSearch(pattern, 'LIKE')}
        )`
			);
		}

		// Sichtungen aus der Datenbank abrufen - nur benötigte Felder
		const sightingsFromDB = await db
			.select({
				id: sightingsTable.id,
				sightingDate: sightingsTable.sightingDate,
				longitude: sightingsTable.longitude,
				latitude: sightingsTable.latitude,
				species: sightingsTable.species,
				totalCount: sightingsTable.totalCount,
				juvenileCount: sightingsTable.juvenileCount,
				isDead: sightingsTable.isDead,
				// Bearbeitungszustand — sightingsToGeoJSON leitet daraus `st` ab
				approvedAt: sightingsTable.approvedAt,
				rejectedAt: sightingsTable.rejectedAt,
				// Personenbezogene Daten mit Consent-Flags
				firstName: sightingsTable.firstName,
				lastName: sightingsTable.lastName,
				nameConsent: sightingsTable.nameConsent,
				shipName: sightingsTable.shipName,
				shipNameConsent: sightingsTable.shipNameConsent,
				// Nicht-personenbezogene Daten
				waterway: sightingsTable.waterway,
				seaMark: sightingsTable.seaMark
			})
			.from(sightingsTable)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(sightingsTable.sightingDate);

		// Konvertiere die Sichtungen in GeoJSON-Format
		const geoJson = sightingsToGeoJSON(sightingsFromDB as unknown as DBSighting[]);

		// Erfolgreiche Antwort zurückgeben
		return json(geoJson);
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Fehler beim Abrufen der Sichtungen für die Karte'
		);

		// Fehlerantwort zurückgeben — keine internen Fehlerdetails an den Client leaken
		// (der konkrete Fehler wurde oben serverseitig geloggt).
		return json({ error: 'Fehler beim Abrufen der Sichtungen' }, { status: 500 });
	}
};
