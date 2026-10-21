/**
 * @fileoverview Geteilte Grundmenge für die öffentliche Sichtungskarte.
 *
 * Der Feature-Endpoint (`GET /api/map/sightings`) und der Jahres-Endpoint
 * (`GET /api/map/sightings/years`) müssen exakt dieselben Sichtungen zählen —
 * sonst zeigt das Jahres-Dropdown Zahlen, die auf der Karte nicht auftauchen.
 * Die Bedingungsliste liegt deshalb hier einmal statt doppelt in beiden Routen.
 *
 * Zusätzlich zur öffentlichen Freigabe (`approvedOnly()`, siehe
 * `.claude/rules/api.md`) werden NULL- und unplausible Koordinaten
 * herausgefiltert: `sightingsToGeoJSON` (`#lib/map/mapUtils.js`) fällt bei
 * NULL-Koordinaten auf `[0, 0]` zurück ("Null Island"). Dieser Serverfilter
 * macht den Fallback für die Karte unerreichbar, ohne die Funktion selbst
 * anzufassen — andere Aufrufer von `sightingsToGeoJSON` bleiben unverändert.
 *
 * Seit 2026-08 nimmt die Funktion die Bearbeitungszustände entgegen, damit
 * Admins auf der Karte auch offene und abgelehnte Meldungen sehen können.
 * Beide Routen müssen denselben Wert übergeben — sonst zählt das
 * Jahres-Dropdown eine andere Menge, als die Karte zeigt. Genau dafür liegt
 * die Bedingungsliste hier und nicht doppelt in den Routen.
 */

import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { BALTIC_SEA_BBOX } from '#lib/utils/geo/checkBalticSea.ts';
import { gte, isNotNull, lte, or, type SQL } from 'drizzle-orm';
import { PUBLIC_MAP_STATUSES } from './statusFilter';

/**
 * Die drei Bearbeitungszustände sind disjunkt und vollständig: `approvedAt`
 * und `rejectedAt` sind nie gleichzeitig gesetzt (`.claude/rules/api.md`),
 * „offen" ist der Fall, in dem beide `NULL` sind. Eine Disjunktion kann
 * deshalb keine Zeile doppelt liefern.
 */
function statusCondition(statuses: readonly SightingStatus[]): SQL {
	const effective = statuses.length > 0 ? statuses : PUBLIC_MAP_STATUSES;
	const parts = effective.map((status) => {
		if (status === 'approved') return approvedOnly();
		if (status === 'rejected') return rejectedOnly();
		return openOnly();
	});

	// `effective` ist nie leer (Fallback oben), `parts` also mindestens ein
	// Element — das `!` ist damit ein Laufzeit-Fakt, keine Behauptung. Und
	// `or(...parts)` mit mindestens einem Argument liefert nie `undefined`
	// (siehe drizzle-orm-Quelle), der `SQL`-Cast betrifft also nur diesen
	// einen, dokumentierten Fall — nicht `parts[0]`, das steht ohnehin fest.
	return parts.length === 1 ? parts[0]! : (or(...parts) as SQL);
}

/**
 * Bedingungen für die Grundmenge der Sichtungskarte: gewählter
 * Bearbeitungszustand und plausible Ostsee-Koordinaten (Bounding Box aus
 * `checkBalticSea.ts`, nicht dupliziert).
 *
 * Ohne Argument entsteht exakt die öffentliche Grundmenge von vorher —
 * jeder abweichende Aufruf setzt eine bestandene Admin-Prüfung voraus
 * (`resolveMapStatuses` in `statusFilter.ts`).
 *
 * Wird per `...mapSightingConditions(statuses)` in ein `and(...)` gespreizt.
 */
export function mapSightingConditions(
	statuses: readonly SightingStatus[] = PUBLIC_MAP_STATUSES
): SQL[] {
	return [
		statusCondition(statuses),
		isNotNull(sightingsTable.latitude),
		isNotNull(sightingsTable.longitude),
		gte(sightingsTable.latitude, BALTIC_SEA_BBOX.minLatitude.toString()),
		lte(sightingsTable.latitude, BALTIC_SEA_BBOX.maxLatitude.toString()),
		gte(sightingsTable.longitude, BALTIC_SEA_BBOX.minLongitude.toString()),
		lte(sightingsTable.longitude, BALTIC_SEA_BBOX.maxLongitude.toString())
	];
}
