/**
 * Gemeinsames `balticSea`-Filterprädikat für die Admin-Übersicht
 * (`routes/admin/sichtungen/+page.server.ts`) und den Export
 * (`routes/api/sightings/export/exportFilterParams.ts`).
 *
 * Bewusst als reine, DB-lose Funktion: Sie baut ein Drizzle-Prädikat über die
 * Schema-Spalten, führt aber keine Abfrage aus — dieselbe Trennung wie
 * `mediaUploadFilter.ts` und `approvalFilter.ts`. Beide Aufrufer hängen das
 * Ergebnis an ihre eigene `and(...)`-Bedingungsliste.
 *
 * Die vier Werte übersetzen `getBalticSeaStatus()`
 * (`#lib/utils/geo/balticSeaStatus.ts`) — **die einzige Stelle, an der dieser
 * Status entsteht** — in SQL. Genau an dieser Übersetzung ist die
 * Benachrichtigungs-Mail schon einmal von der Admin-Anzeige abgewichen
 * (Fehler 4, `docs/OSTSEE_FLAGS.md`): Ein `{{#if sighting.inBalticSeaGeo}}` in
 * einer Handlebars-Vorlage konnte den Altsystem-Wert `2` nicht von `0`
 * unterscheiden. Diese Datei ist die einzig erlaubte SQL-Übersetzung der
 * Flag-Logik — wer eine weitere Stelle braucht, importiert von hier, statt die
 * Fallunterscheidung erneut zu schreiben. `balticSeaFilter.test.ts` prüft die
 * Übersetzung gegen `getBalticSeaStatus()` über das volle Kreuzprodukt der
 * Eingaben.
 *
 * Wie in `database.md`/`geo.md` festgehalten: Beide Flag-Spalten werden mit
 * `> 0` geprüft, nie mit `= 1` — `ostsee_geo` enthält aus dem Altsystem
 * zusätzlich den Wert `2` mit derselben Bedeutung wie `1`.
 *
 * **Bekannte Grenze — `NaN` in den Koordinatenspalten:** `gps_breite`/`gps_laenge`
 * sind `numeric`-Spalten; Postgres kann darin `NaN` speichern. `getBalticSeaStatus()`
 * prüft die Koordinaten mit `Number.isFinite()` und würde eine solche Zeile als
 * `noPosition` einordnen, dieses Prädikat hier prüft für `noPosition` dagegen nur
 * `IS NULL` — eine `NaN`-Koordinate ist nicht `NULL` und fiele deshalb durch alle
 * vier Filter-Werte, statt bei `noPosition` zu landen wie in der Anzeige. In der
 * Dev-DB gibt es 0 solche Zeilen, der Fall ist aktuell theoretisch; relevant wird
 * er erst, wenn eine Quelle `NaN` in diese Spalten schreiben kann.
 */
import { and, gt, isNotNull, isNull, lte, or, type SQL } from 'drizzle-orm';
import { sightings } from '#lib/server/db/schema.ts';
import { isBalticSeaStatus } from '#lib/utils/geo/balticSeaStatus.ts';

/** Position vorhanden heißt: beide Koordinatenspalten sind gesetzt. */
const hasPosition = (): SQL | undefined =>
	and(isNotNull(sightings.latitude), isNotNull(sightings.longitude));

/**
 * „Flag gesetzt" — `> 0`, wie `getBalticSeaStatus()` es mit `(wert ?? 0) > 0`
 * prüft. Bei `NULL` liefert `>` in SQL `NULL` (nicht `TRUE`), das Prädikat
 * lässt die Zeile also korrekt durchfallen.
 */
const flagOn = (column: typeof sightings.inBalticSea | typeof sightings.inBalticSeaGeo): SQL =>
	gt(column, 0);

/**
 * „Flag nicht gesetzt" — bewusst **nicht** `not(flagOn(column))`: SQLs
 * dreiwertige Logik macht aus `NOT (NULL > 0)` wieder `NULL`, nicht `TRUE`,
 * eine Zeile mit `NULL`-Flag fiele also lautlos aus dem Filter. `getBalticSeaStatus()`
 * behandelt `NULL` über `?? 0` explizit als „nicht gesetzt" — das bildet diese
 * Bedingung nach, indem sie `NULL` und `<= 0` gleichermaßen zulässt.
 */
const flagOff = (
	column: typeof sightings.inBalticSea | typeof sightings.inBalticSeaGeo
): SQL | undefined => or(isNull(column), lte(column, 0));

/**
 * @param balticSea Der rohe Query-Parameter — einer der vier Statuswerte aus
 *   `BalticSeaStatus` (`'baltic'`, `'edge'`, `'outside'`, `'noPosition'`) oder
 *   alles andere/fehlend für „kein Filter".
 * @returns Ein Prädikat für `and(...)`, oder `undefined`, wenn der Wert keinen
 *   Filter auslöst.
 */
export function balticSeaCondition(balticSea: string | null | undefined): SQL | undefined {
	if (!isBalticSeaStatus(balticSea)) {
		return undefined;
	}

	switch (balticSea) {
		case 'noPosition':
			return or(isNull(sightings.latitude), isNull(sightings.longitude));
		case 'outside':
			return and(hasPosition(), flagOff(sightings.inBalticSea));
		case 'baltic':
			return and(hasPosition(), flagOn(sightings.inBalticSea), flagOn(sightings.inBalticSeaGeo));
		case 'edge':
			return and(hasPosition(), flagOn(sightings.inBalticSea), flagOff(sightings.inBalticSeaGeo));
		default: {
			// Exhaustiveness-Guard: Ein fünfter `BalticSeaStatus`-Wert lässt TypeScript
			// hier nicht mehr kompilieren, statt den `switch` lautlos zu verlassen und
			// `undefined` (= „kein Filter") zurückzugeben.
			const _exhaustive: never = balticSea;
			return _exhaustive;
		}
	}
}
