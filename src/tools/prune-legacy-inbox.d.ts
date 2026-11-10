/**
 * Handgeschriebene Typdeklaration für prune-legacy-inbox.js.
 *
 * Gleicher Grund wie bei send-legacy-inbox.d.ts: `src/tools/**\/*.js` ist von
 * der Typprüfung ausgeschlossen, der Test importiert das Modul aber.
 */

export declare const ABGEWIESEN_MONATE: number;
export declare const IMPORTIERT_TAGE: number;

export declare function empfangenAm(datei: string): Date | null;

export interface AufraeumBericht {
	geloescht: { importiert: number; abgewiesen: number };
	/** Dateien ohne lesbares Datum, als `unterverzeichnis/datei`. */
	uebersprungen: string[];
	/** Dateien im Posteingang, die über der Frist liegen — nie gelöscht, nur gezählt. */
	posteingangUeberFrist: number;
}

export declare function raeumeAuf(optionen: {
	datenVerzeichnis: string;
	jetzt?: Date;
	log?: { log(nachricht: string): void; error(nachricht: string): void };
}): Promise<AufraeumBericht>;
