/**
 * Filter „gleicher Melder wie Meldung X" für Admin-Liste und Export.
 *
 * Ersetzt den Link `/admin/sichtungen?q=<email>`: Der traf per `ILIKE '%…%'`
 * auch fremde Adressen (`a@b.de` fand `xa@b.de`) und fände nach der
 * Anonymisierung der Kontaktdaten gar nichts mehr. Gleich ist jetzt, was
 * denselben `melder_hash` trägt — dieselbe Gleichheit wie die Melder-Historie.
 *
 * Verknüpft wird über die ID einer Meldung, nicht über den Hash: Er verlässt
 * den Server nie, auch nicht als URL-Parameter (Browser-Verlauf,
 * Zugriffsprotokolle; docs/ANONYMISIERUNG_KONZEPT.md, 6.2). Die Abfrage
 * schlägt den Hash der genannten Meldung selbst nach. Hat sie keinen, ist das
 * Ergebnis leer — `NULL = NULL` trifft nichts.
 *
 * Wie `sightingSearchFilter.ts`: Sie baut ein Prädikat, führt aber keine
 * Abfrage aus. Liste und Export hängen es an ihre `and(...)`-Liste und zeigen
 * damit dieselbe Menge.
 */
import { sql, type SQL } from 'drizzle-orm';
import { sightings } from '#lib/server/db/schema.ts';

/** URL-Parameter für den Filter, gelesen von Liste, Export und Rückweg. */
export const SAME_REPORTER_PARAM = 'gleicherMelder';

/** Die Meldungs-ID aus dem Parameter, oder `undefined` für alles andere. */
export function parseSameReporterParam(raw: string | null | undefined): number | undefined {
	const wert = raw?.trim() ?? '';
	if (!/^[1-9]\d*$/.test(wert)) return undefined;
	const id = Number(wert);
	return Number.isSafeInteger(id) ? id : undefined;
}

/**
 * @param raw Der rohe Query-Parameter.
 * @returns Ein Prädikat für `and(...)`, oder `undefined` ohne gültige ID. Die ID
 *   geht als gebundener Parameter in die Abfrage.
 */
export function sameReporterCondition(raw: string | null | undefined): SQL | undefined {
	const id = parseSameReporterParam(raw);
	if (id === undefined) return undefined;

	return sql`${sightings.reporterHash} = (SELECT bezug.melder_hash FROM sichtungen bezug WHERE bezug.id = ${id})`;
}
