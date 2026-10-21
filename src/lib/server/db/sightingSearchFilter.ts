/**
 * Gemeinsames `q`-Suchprädikat für die Admin-Übersicht
 * (`routes/admin/sichtungen/+page.server.ts`) und den Export
 * (`routes/api/sightings/export/exportFilterParams.ts`).
 *
 * Reine, DB-lose Funktion wie `balticSeaFilter.ts` und `deadFindingFilter.ts`:
 * Sie baut ein Drizzle-Prädikat über die Schema-Spalten, führt aber keine
 * Abfrage aus. Beide Aufrufer hängen das Ergebnis an ihre eigene
 * `and(...)`-Bedingungsliste — der Export erbt damit dieselbe Treffermenge, die
 * der Nutzer in der Tabelle gesehen hat.
 *
 * **Gesucht wird über fünf Felder** — Referenz-ID, E-Mail, Vor- und Nachname
 * und Fahrwasser. Das sind die Angaben, mit denen eine Rückfrage
 * hereinkommt („Meine Meldung von gestern", eine weitergeleitete
 * Bestätigungsmail, ein Anruf). Bewusst **nicht** dabei: `bemerkungen` und
 * `kommentar_intern` — Freitextfelder, in denen jeder zweite Suchbegriff
 * irgendwo vorkommt und die die Trefferliste unbrauchbar machen würden.
 *
 * **Performance (gemessen 2026-08-08, lokale Dev-DB, 19.947 Zeilen):** Der
 * `ILIKE '%…%'`-Ausdruck über alle fünf Spalten läuft als Seq Scan in 13–30 ms
 * (`EXPLAIN ANALYZE`, warm; „a" als Worst Case mit 18.734 Treffern: 13 ms).
 * Ein `pg_trgm`-GIN-Index ist deshalb **bewusst nicht** angelegt: Er kostet
 * Schreib- und Wartungsaufwand, greift bei Suchbegriffen unter drei Zeichen
 * ohnehin nicht, und bei dieser Tabellengröße gäbe es nichts zu gewinnen, was
 * ein Bearbeiter bemerkte. Neu bewerten, wenn die Tabelle die Größenordnung
 * 200.000 Zeilen erreicht oder die Messung über 200 ms steigt — dann wäre
 * `CREATE EXTENSION pg_trgm` plus je ein `gin_trgm_ops`-Index pro Spalte der
 * nächste Schritt.
 */
import { ilike, or, type SQL } from 'drizzle-orm';
import { sightings } from '#lib/server/db/schema.ts';

/** Spalten, über die gesucht wird — Reihenfolge bestimmt die `OR`-Kette. */
const SUCHSPALTEN = [
	sightings.referenceId,
	sightings.email,
	sightings.firstName,
	sightings.lastName,
	sightings.waterway
] as const;

/**
 * Der rohe Query-Parameter, auf einen belastbaren Begriff reduziert.
 *
 * @returns Der getrimmte Begriff, oder `undefined` für „keine Suche" — damit
 *   ein leeres Suchfeld nicht als Suche nach dem Leerstring gilt (die träfe
 *   jede Zeile).
 */
export function normalizeSearchTerm(q: string | null | undefined): string | undefined {
	const begriff = q?.trim();
	return begriff ? begriff : undefined;
}

/**
 * Entschärft die LIKE-Metazeichen im Suchbegriff.
 *
 * Der Nutzer tippt einen Literaltext, keinen Suchausdruck: Ohne diese
 * Umwandlung wäre ein eingegebenes `%` eine Suche nach allem und `_` ein Joker
 * für ein beliebiges Zeichen. Der Backslash muss zuerst dran, sonst
 * verdoppelte der zweite Durchgang die gerade erst eingefügten Escapes.
 *
 * Postgres nimmt bei LIKE/ILIKE ohne `ESCAPE`-Klausel den Backslash als
 * Escape-Zeichen — eine zusätzliche Klausel ist deshalb nicht nötig.
 */
function escapeLikePattern(begriff: string): string {
	return begriff.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * @param q Der rohe `q`-Query-Parameter.
 * @returns Ein Prädikat für `and(...)`, oder `undefined`, wenn nicht gesucht
 *   wird. Der Begriff geht als **gebundener Parameter** in die Abfrage
 *   (`ilike()` baut keinen SQL-Text) — es wird an keiner Stelle SQL aus
 *   Nutzereingaben zusammengesetzt.
 */
export function searchCondition(q: string | null | undefined): SQL | undefined {
	const begriff = normalizeSearchTerm(q);
	if (!begriff) return undefined;

	const muster = `%${escapeLikePattern(begriff)}%`;
	return or(...SUCHSPALTEN.map((spalte) => ilike(spalte, muster)));
}
