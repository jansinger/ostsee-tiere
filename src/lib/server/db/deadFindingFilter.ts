/**
 * Gemeinsames Meldeart-Filterprädikat (Totfund/Lebendsichtung) für die
 * Admin-Übersicht (`routes/admin/sichtungen/+page.server.ts`) und den Export
 * (`routes/api/sightings/export/exportFilterParams.ts`) — dieselbe Trennung
 * wie `mediaUploadFilter.ts`: reine, DB-lose Funktion, die ein Drizzle-Prädikat
 * baut und es dem Aufrufer für dessen `and(...)`-Liste überlässt.
 *
 * Totfund heißt `totfund <> 0`, nicht `= 1` — dieselbe Boolean-Semantik wie
 * `isDeadFinding()` in `#lib/components/admin/deadFinding.ts`, die das Badge
 * setzt. Ein Altbestandswert wie die `2` in `ostsee_geo` (docs/OSTSEE_FLAGS.md)
 * würde sonst das Badge tragen, aber aus dem Filter fallen.
 */
import { eq, ne, type SQL } from 'drizzle-orm';
import { sightings } from '#lib/server/db/schema.ts';

/** Query-Parameter-Wert für „nur Totfunde". */
export const DEAD_FINDING_FILTER_DEAD = '1';
/** Query-Parameter-Wert für „nur Lebendsichtungen". */
export const DEAD_FINDING_FILTER_ALIVE = '0';

/**
 * @param deadFinding Der rohe Query-Parameter (`'1'`, `'0'` oder alles
 *   andere/fehlend für „kein Filter").
 * @returns Ein Prädikat für `and(...)`, oder `undefined`, wenn der Wert keinen
 *   Filter auslöst.
 */
export function deadFindingCondition(deadFinding: string | null | undefined): SQL | undefined {
	if (deadFinding === DEAD_FINDING_FILTER_DEAD) {
		return ne(sightings.isDead, 0);
	}
	if (deadFinding === DEAD_FINDING_FILTER_ALIVE) {
		return eq(sightings.isDead, 0);
	}
	return undefined;
}
