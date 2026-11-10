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

/**
 * Ein Eintrag der angezeigten Historie: eine Prüfentscheidung aus dem Log
 * oder die Anonymisierung der Melderdaten.
 */
export type SightingHistoryItem =
	| { kind: 'verdict'; key: string; at: string; entry: SightingStatusLogEntry }
	| { kind: 'anonymized'; key: string; at: string };

/**
 * Fügt die Anonymisierung in die Entscheidungen ein, zeitlich sortiert.
 *
 * Sie wird **abgeleitet**, nicht protokolliert: Den Zeitpunkt trägt die Zeile
 * selbst (`anonymisiert_am`), und `sichtung_status_log` schreibt ausschließlich
 * der Verify-Endpunkt (`statusLogWriteScan.test.ts`). Ein zweiter Speicherort
 * für denselben Zeitpunkt könnte abweichen, dieser nicht. Fristablauf und
 * Löschersuchen sind an der Zeile nicht unterscheidbar — wer ein Löschersuchen
 * ausgeführt hat, steht im Audit-Log, nicht hier.
 */
export function buildSightingHistory(
	entries: SightingStatusLogEntry[],
	anonymizedAt: Date | string | null | undefined
): SightingHistoryItem[] {
	const items: SightingHistoryItem[] = entries.map((entry) => ({
		kind: 'verdict',
		key: `verdict-${entry.id}`,
		at: entry.recordedAt,
		entry
	}));
	if (anonymizedAt == null) return items;

	const at = anonymizedAt instanceof Date ? anonymizedAt : new Date(anonymizedAt);
	if (Number.isNaN(at.getTime())) return items;

	const time = at.getTime();
	const index = items.findIndex((item) => new Date(item.at).getTime() > time);
	const anonymized: SightingHistoryItem = {
		kind: 'anonymized',
		key: 'anonymized',
		at: at.toISOString()
	};
	if (index === -1) items.push(anonymized);
	else items.splice(index, 0, anonymized);
	return items;
}
