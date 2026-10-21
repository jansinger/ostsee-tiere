/**
 * @fileoverview Consent-gegatete Suche über personenbezogene Felder
 *
 * Die *Ausgabe* personenbezogener Felder war immer an die Einwilligung des
 * Melders gebunden (`namensnennung`, `schiffnamensnennung`), die *Trefferzahl*
 * einer Suche nicht. Damit konnte ein anonymer Aufrufer prüfen, ob ein Name
 * im Bestand existiert — auch bei Meldern, die nie zugestimmt haben. Seit
 * 2026-07-31 ist die Suche deshalb auf beiden öffentlichen Flächen gegated:
 *
 * - `/sichtungen/showreports.json` (Legacy-API, anonymer Zweig)
 * - `/api/map/sightings` (moderne Karte)
 *
 * Begründet wird die Einschränkung in `docs/LEGACY_API_SPECIFICATION.md`
 * („Deviation: consent-gated search") **ausdrücklich damit, dass beide Flächen
 * dieselbe Teilmenge freigeben**. Genau deshalb steht das Prädikat hier
 * **einmal** statt zweimal fast zeichengleich in den Routen — analog zu
 * `approvedOnly()` in `approvalFilter.ts`. Eine Fläche, die das Gate umgeht,
 * fällt beim Review auf, weil sie diesen Import nicht hat.
 *
 * Die E-Mail-Adresse wird bewusst gar nicht durchsucht statt nur gegated: Sie
 * ist in keiner öffentlichen Response enthalten, eine Suche darüber hat für
 * öffentliche Clients also keinen legitimen Zweck.
 *
 * **Nicht** hier abgebildet ist der Admin-Zweig der Legacy-Route: Eingeloggte
 * Admins bekommen die volle Vier-Feld-Suche der Spezifikation (inklusive
 * E-Mail) ohne Gate, weil sie diese Felder ohnehin sehen.
 */

import { sightings } from '#lib/server/db/schema.ts';
import { sql, type Column, type SQL } from 'drizzle-orm';

/**
 * Vergleichsoperator der Mustersuche.
 *
 * Der Unterschied zwischen den beiden Flächen ist bewusst und darf nicht
 * eingeebnet werden: Die Legacy-API ist vertraglich case-insensitiv (`ILIKE`,
 * siehe `docs/LEGACY_API_SPECIFICATION.md`), die Karte sucht case-sensitiv
 * (`LIKE`). Der Operator ist deshalb ein Pflichtargument ohne Default — er
 * muss an jeder Aufrufstelle sichtbar entschieden werden.
 */
export type LikeOperator = 'LIKE' | 'ILIKE';

/**
 * Escaped die LIKE-Wildcards `%`, `_` und den Escape-Backslash selbst, damit
 * ein Suchbegriff literal gesucht wird.
 *
 * Ohne das matcht `search=%` jeden Datensatz und `_` jedes Einzelzeichen —
 * beides verstärkt das oben beschriebene Membership-Orakel.
 *
 * Trimmt bewusst nicht; das gehört zu {@link containsPattern}.
 */
export function escapeLikePattern(term: string): string {
	return term.replace(/[%_\\]/g, '\\$&');
}

/**
 * Baut das Contains-Muster `%<Begriff>%`, das beide Flächen verwenden:
 * getrimmt und mit escapten Wildcards.
 *
 * Das Trimmen liegt hier, damit beide Flächen denselben Begriff suchen — sonst
 * liefert `search=%20Wal%20` je nach Route eine andere Treffermenge und die
 * Zusage „dieselbe Teilmenge" wäre nur noch ungefähr wahr.
 */
export function containsPattern(term: string): string {
	return `%${escapeLikePattern(term.trim())}%`;
}

/**
 * Das gemeinsame Consent-Gate als ein SQL-Fragment.
 *
 * Vor- und Nachname nur bei `namensnennung = 1`, der Schiffsname nur bei
 * `schiffnamensnennung = 1`, die E-Mail-Adresse nie.
 *
 * @param pattern Contains-Muster aus {@link containsPattern} — bereits escaped.
 * @param operator `ILIKE` (Legacy-API) oder `LIKE` (Karte), siehe {@link LikeOperator}.
 */
export function consentGatedNameSearch(pattern: string, operator: LikeOperator): SQL {
	// Beide Operatoren stehen literal im Quelltext statt per `sql.raw` — so
	// bleibt die erzeugte SQL greppbar und es gibt keinen Pfad, über den ein
	// Bezeichner ungeprüft in die Anweisung gelangt.
	const matches = (column: Column): SQL =>
		operator === 'ILIKE'
			? sql`${column} ILIKE ${pattern} ESCAPE '\\'`
			: sql`${column} LIKE ${pattern} ESCAPE '\\'`;

	return sql`(
		(${sightings.nameConsent} = 1 AND (
			${matches(sightings.firstName)} OR
			${matches(sightings.lastName)}
		)) OR
		(${sightings.shipNameConsent} = 1 AND
			${matches(sightings.shipName)}
		)
	)`;
}
