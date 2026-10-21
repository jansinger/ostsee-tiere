/**
 * Felder, die niemals im Klartext im Log stehen dürfen.
 *
 * Defense-in-Depth gegen versehentliches Loggen von PII und Geheimnissen.
 * `*.<feld>` deckt jeweils eine Verschachtelungsebene ab (z. B. `{ data: { email } }`).
 * Die PII-Felder (name, vorname, strasse, plz, ort, ...) stammen aus der
 * Legacy-API-Spezifikation (`docs/LEGACY_API_SPECIFICATION.md`) und dürfen
 * nicht in Logs erscheinen.
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
		// Anschrift
		'strasse',
		'*.strasse',
		'plz',
		'*.plz',
		'ort',
		'*.ort',
		'address',
		'*.address'
	],
	remove: true
};
