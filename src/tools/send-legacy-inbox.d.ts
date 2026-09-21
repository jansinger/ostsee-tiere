/**
 * Handgeschriebene Typdeklaration für send-legacy-inbox.js.
 *
 * Gleicher Grund wie bei import-legacy-inbox.d.ts: `src/tools/**\/*.js` ist in
 * tsconfig.json von der Typprüfung ausgeschlossen, aber der Test importiert das
 * Modul und zöge es damit transitiv unter `strict` in den Programmgraphen. Eine
 * co-lokierte `.d.ts` hat bei der Auflösung Vorrang und liefert bewusst lockere
 * Typen für die Test-Stellvertreter.
 */

/** Ein Posteingang, egal ob lokal oder über SSH erreichbar. */
export interface Speicher {
	beschreibung?: string;
	liste(): Promise<string[]>;
	lies(datei: string): Promise<string>;
	verschiebe(datei: string): Promise<void>;
}

export interface SendeOptionen {
	/** Basis-URL der Zielinstanz, z. B. `https://ostsee-tiere.de`. */
	basisUrl: string;
	speicher: Speicher;
	/** Nur zum Testen. Default: globales `fetch`. */
	fetchImpl?(url: string, init: unknown): Promise<Response>;
	/** Nur zum Testen. Default: `console`. */
	log?: { log(nachricht: string): void; error(nachricht: string): void };
}

/**
 * Eine Datei, die der Endpunkt nicht angenommen hat oder die gar nicht erst
 * gesendet werden konnte. Sie bleibt im Posteingang liegen — jeder Eintrag
 * hier braucht einen Menschen.
 */
export interface Ablehnung {
	datei: string;
	http?: number;
	antwort?: string;
	grund?: string;
}

/**
 * Grund für einen abgebrochenen Lauf. Die drei Fälle sind bewusst
 * unterscheidbar: `rate-limit` ist harmlos und wird durch einen späteren Lauf
 * geheilt, `netzwerk` lässt offen, ob die Sichtung angelegt wurde, und
 * `verschieben` heißt, dass die Sichtung sicher angelegt ist und die Datei von
 * Hand nachgezogen werden muss.
 */
export interface Abbruch {
	grund: 'rate-limit' | 'netzwerk' | 'verschieben';
	datei: string;
	sichtungId?: string | null;
	meldung?: string;
}

export function sende(optionen: SendeOptionen): Promise<{
	uebernommen: number;
	abgelehnt: Ablehnung[];
	abbruch: Abbruch | null;
	gesamt: number;
}>;

export function erstelleDateiSpeicher(datenVerzeichnis: string): Speicher;

export function erstelleSshSpeicher(optionen: {
	host: string;
	datenVerzeichnis: string;
	sudo?: boolean;
	/** Nur zum Testen: ersetzt den `ssh`-Aufruf. */
	ausfuehren?(argumente: string[]): Promise<{ stdout: string }>;
	/** Nur zum Testen. Default: `console`. */
	log?: { log(nachricht: string): void; error(nachricht: string): void };
}): Speicher;

export function fehlerText(fehler: unknown): string;
