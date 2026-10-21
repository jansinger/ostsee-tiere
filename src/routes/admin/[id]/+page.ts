import { HERKUNFT_EINGANG, HERKUNFT_PARAMETER } from '#lib/components/admin/adminReturn.ts';
import { resolveQueueOrder } from '#lib/components/admin/queueOrder.ts';
import type { SightingQueue } from '#lib/components/admin/sightingQueue.ts';
import type { SightingStatusLogEntry } from '#lib/components/admin/sightingStatusLog.ts';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';
import type { PageLoad } from './$types';

type FetchFn = typeof fetch;

interface StatusLogResult {
	statusLog: SightingStatusLogEntry[];
	statusLogFailed: boolean;
}

interface QueueResult {
	queue: SightingQueue | null;
	queueFailed: boolean;
}

interface ReporterHistoryResult {
	reporterHistory: ReporterHistory | null;
	reporterHistoryFailed: boolean;
}

/**
 * Status-Historie der Detailansicht (Spec B3).
 *
 * Steht hier und nicht im `+layout.ts`: Die Bearbeitungsmaske (`[id]/edit`)
 * hängt am selben Layout, zeigt den Status aber nur an — sie soll die Abfrage
 * nicht mitschleppen.
 *
 * Die Historie enthält Bearbeiter-Kennungen und kommt deshalb aus dem
 * admin-geschützten Verify-Endpunkt, nicht aus `/api/sightings/[id]`.
 *
 * **Ein Fehler hier darf die Seite nicht kosten** — die Historie ist eine
 * Ergänzung, ohne sie bleibt die Sichtung vollständig lesbar. Er darf aber auch
 * nicht als Altbestand durchgehen: Eine leere Liste behauptet „es gab keine
 * Entscheidungen", ein Fehlschlag heißt „unbekannt, ob es welche gab". Beides
 * sieht im DOM gleich aus, und die Verwechslung wäre derselbe Fehlermodus,
 * gegen den das Feature antritt — eine Zeitleiste mit Lücke sieht vollständig
 * aus und ist es nicht. Deshalb `statusLogFailed`, das die Zeitleiste als
 * dritten Fall darstellt.
 *
 * Eine Antwort ohne `history` zählt dabei als Fehlschlag und nicht als leere
 * Historie: Sie ist ein Vertragsbruch des Endpunkts, kein Altbestand.
 */
async function ladeStatusLog(fetchFn: FetchFn, id: string): Promise<StatusLogResult> {
	try {
		const response = await fetchFn(`/api/sightings/${id}/verify`);
		if (!response.ok) {
			return { statusLog: [], statusLogFailed: true };
		}

		const body = await response.json();
		if (!Array.isArray(body?.history)) {
			return { statusLog: [], statusLogFailed: true };
		}

		return { statusLog: body.history as SightingStatusLogEntry[], statusLogFailed: false };
	} catch {
		return { statusLog: [], statusLogFailed: true };
	}
}

/**
 * Prüft die Gestalt von `history`, statt sie zu casten.
 *
 * `null` ist zulässig (nicht ermittelbar). Ein Objekt muss die drei Zählfelder
 * als `number` mitbringen sowie `since` als `string | null` — ohne diese
 * Prüfung fiele `getReporterLevel` bei einem kaputten Wert (`"kaputt"`, `{}`,
 * `{ approved: 0, rejected: 0, open: 0 }` ohne `since`, …) auf
 * `undefined`-Vergleiche zurück und würde `'first'` liefern: die Oberfläche
 * behauptete dann „Erstmeldung", wo ein Vertragsbruch des Endpunkts vorliegt
 * — die Verwechslung, gegen die dieses Feature antritt. `since` ist dabei
 * genauso Pflicht wie die Zählfelder (`static/openapi.yml` führt es als
 * `required`), nur eben mit `null` als zulässigem Wert.
 */
function istGueltigeMelderHistorie(value: unknown): value is ReporterHistory | null {
	if (value === null) return true;
	if (typeof value !== 'object') return false;

	const kandidat = value as Partial<Record<keyof ReporterHistory, unknown>>;
	return (
		typeof kandidat.approved === 'number' &&
		typeof kandidat.rejected === 'number' &&
		typeof kandidat.open === 'number' &&
		(typeof kandidat.since === 'string' || kandidat.since === null)
	);
}

/**
 * Melder-Historie der Detailansicht.
 *
 * Gleiche Konstruktion wie beim Status-Log: Ein Fehlschlag darf die Seite nicht
 * kosten, darf aber auch nicht als „keine Vorgeschichte" durchgehen. Beides
 * sähe im DOM gleich aus, und die Verwechslung wäre genau der Fehlermodus,
 * gegen den die Anzeige antritt.
 *
 * Eine Antwort ohne das Feld `history` zählt als Fehlschlag: Sie ist ein
 * Vertragsbruch des Endpunkts, kein Altbestand. Dasselbe gilt für eine
 * Antwort, deren `history` zwar existiert, aber nicht die erwartete Gestalt
 * hat (`istGueltigeMelderHistorie`) — auch das ist ein Vertragsbruch und kein
 * leeres Ergebnis.
 */
async function ladeMelderHistorie(fetchFn: FetchFn, id: string): Promise<ReporterHistoryResult> {
	try {
		const response = await fetchFn(`/api/sightings/${id}/reporter-history`);
		if (!response.ok) {
			return { reporterHistory: null, reporterHistoryFailed: true };
		}

		const body = await response.json();
		if (!('history' in (body ?? {})) || !istGueltigeMelderHistorie(body.history)) {
			return { reporterHistory: null, reporterHistoryFailed: true };
		}

		return {
			reporterHistory: body.history,
			reporterHistoryFailed: false
		};
	} catch {
		return { reporterHistory: null, reporterHistoryFailed: true };
	}
}

async function ladeQueue(
	fetchFn: FetchFn,
	id: string,
	order: 'asc' | 'desc'
): Promise<QueueResult> {
	try {
		const response = await fetchFn(`/api/sightings/${id}/queue?order=${order}`);
		if (!response.ok) {
			return { queue: null, queueFailed: true };
		}

		const body = await response.json();
		/* `total` ist die Pflichtangabe des Vertrags. Eine Antwort ohne sie ist
		   ein Vertragsbruch und kein leerer Stapel — die Unterscheidung ist
		   dieselbe wie beim Status-Log, und sie trägt hier den Auto-Advance:
		   Wer „unbekannt" für „zu Ende" hält, landet bei jedem Fehler im
		   Eingang und hält den Stapel für abgearbeitet. */
		if (typeof body?.total !== 'number') {
			return { queue: null, queueFailed: true };
		}

		return { queue: body as SightingQueue, queueFailed: false };
	} catch {
		return { queue: null, queueFailed: true };
	}
}

/**
 * Lädt Status-Historie und, aus dem Eingang heraus, die Nachbarn im Stapel
 * offener Meldungen — aber nur bei `?from=inbox`. Aus der Tabelle heraus gibt
 * es keine Warteschlange, und ein Aufruf „für alle Fälle" wäre eine Abfrage,
 * deren Ergebnis niemand anzeigt.
 *
 * `queueOrder` kommt aus `resolveQueueOrder` — derselben Regel wie im Eingang
 * (`/admin`) und im Queue-Endpunkt. Eine eigene Auswertung hier würde die
 * Warteschlange in einer anderen Reihenfolge blättern als der Eingang sie
 * anzeigt, und der Auto-Advance überspränge dabei still eine Meldung.
 */
export const load: PageLoad = async ({ params, fetch, url }) => {
	const ausEingang = url.searchParams.get(HERKUNFT_PARAMETER) === HERKUNFT_EINGANG;
	const queueOrder = resolveQueueOrder(url.searchParams.get('order'));

	const [statusLogResult, queueResult, reporterHistoryResult] = await Promise.all([
		ladeStatusLog(fetch, params.id),
		ausEingang
			? ladeQueue(fetch, params.id, queueOrder)
			: Promise.resolve<QueueResult>({ queue: null, queueFailed: false }),
		ladeMelderHistorie(fetch, params.id)
	]);

	return { ...statusLogResult, ...queueResult, ...reporterHistoryResult, queueOrder };
};
