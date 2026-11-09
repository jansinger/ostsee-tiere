/**
 * Felder, die niemals im Klartext im Log stehen dürfen.
 *
 * Defense-in-Depth gegen versehentliches Loggen von PII und Geheimnissen.
 * `*.<feld>` deckt jeweils eine Verschachtelungsebene ab (z. B. `{ data: { email } }`).
 * Die PII-Felder stehen doppelt: mit den Legacy-Namen der Datenbank und der
 * Legacy-API (`docs/LEGACY_API_SPECIFICATION.md`) und mit den Schlüsseln des
 * Drizzle-Schemas, unter denen der Code sie tatsächlich loggt.
 *
 * Gemeinsam genutzt von `logger/serverLogger.ts` und dem Server-Zweig von
 * `#lib/logger.js`. Getrennt gepflegt driften die beiden auseinander, ohne dass
 * es jemandem auffällt: Der SSR-Pfad hatte bis zum 2026-08-19 überhaupt keine
 * Redaction, obwohl Komponenten-Skripte beim Rendern auf dem Server laufen.
 */
export const LOG_REDACTION = {
	paths: [
		'email',
		'*.email',
		'phone',
		'*.phone',
		'telefon',
		'*.telefon',
		'password',
		'*.password',
		'token',
		'*.token',
		// Personenbezogene Namensfelder (Legacy-API + moderne Form)
		'name',
		'*.name',
		'vorname',
		'*.vorname',
		'firstName',
		'*.firstName',
		'lastName',
		'*.lastName',
		// Anschrift — Spaltennamen der Datenbank UND Schlüssel des
		// Drizzle-Schemas. Bis 2026-11 standen hier nur die deutschen Namen,
		// geloggt wird aber mit den englischen (`street`, `zipCode`, `city`):
		// Die Anschrift ging ungefiltert durch. `redaction.test.ts` prüft deshalb
		// gegen echtes Pino statt gegen diese Liste.
		'strasse',
		'*.strasse',
		'street',
		'*.street',
		'plz',
		'*.plz',
		'zipCode',
		'*.zipCode',
		'ort',
		'*.ort',
		'city',
		'*.city',
		'address',
		'*.address',
		'fax',
		'*.fax',
		// Schiff — führt bei Sportbooten oft direkt zum Eigner
		'schiffsname',
		'*.schiffsname',
		'shipName',
		'*.shipName',
		'heimathafen',
		'*.heimathafen',
		'homePort',
		'*.homePort'
	],
	remove: true
};
