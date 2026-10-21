/**
 * @fileoverview Status-Historie einer Sichtung — Typ und Wortlaut der Einträge.
 *
 * Die Einträge kommen aus `sichtung_status_log` über
 * `GET /api/sightings/[id]/verify` (Spec B3). Geschrieben werden sie
 * ausschließlich vom Verify-Endpunkt; Begründung, Datenschutz und Aufbewahrung
 * stehen am Tabellen-Docblock in `#lib/server/db/schema.js`.
 *
 * Client-sicher: **kein** Import aus `#lib/server/…` — wie bei
 * `sightingStatus.ts` fiele der Bruch sonst erst in `npm run build` auf.
 */
import type { SightingVerdict } from './sightingVerdict';

/**
 * Ein Eintrag, so wie ihn der Endpunkt liefert.
 *
 * `recordedAt` ist ein String und kein `Date`: Der Weg führt durch JSON, und
 * ein `Date` im Typ wäre eine Behauptung, die erst eine Umwandlung wahr macht.
 */
export interface SightingStatusLogEntry {
	id: number;
	verdict: SightingVerdict;
	/** Die Kennung des Bearbeiters (E-Mail aus der Anmeldung) — `null` beim Altbestand. */
	editor: string | null;
	recordedAt: string;
}

/**
 * Das Wort für die **Handlung**, die der Eintrag festhält.
 *
 * Bewusst nicht `SIGHTING_STATUS_PRESENTATION[…].label`: Dort steht der
 * *Zustand* („Offen"), hier steht ein abgeschlossenes *Ereignis*. Für
 * `approve`/`reject` fallen beide Wörter zusammen, für `reset` nicht — „Offen"
 * als Eintrag einer Zeitleiste liest sich wie ein Zustandsbericht, nicht wie
 * eine Entscheidung, die jemand getroffen hat.
 *
 * Farbe und Icon kommen weiterhin aus der einen Quelle
 * (`SIGHTING_STATUS_PRESENTATION` über `verdictToStatus`) — hier ist nur der
 * Wortlaut eigen, und nur aus diesem Grund.
 */
export const VERDICT_LOG_LABEL: Record<SightingVerdict, string> = {
	approve: 'Freigegeben',
	reject: 'Abgelehnt',
	reset: 'Zurückgesetzt'
};
