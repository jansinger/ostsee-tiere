/**
 * @fileoverview Die aktiven Filter der Sichtungstabelle als einzeln
 * entfernbare Chips.
 *
 * Bei geschlossenem Panel zeigte nur ein Punkt-Badge, *dass* gefiltert wird.
 * Welcher Filter greift, stand nirgends, und zurücknehmen ließ sich nur alles
 * auf einmal — wer eine zu enge Menge vor sich hatte, musste das Panel
 * aufklappen und die sieben Felder durchsehen.
 *
 * **Keine zweite Beschriftungsquelle.** Wort für Wort kommen die Chips aus
 * denselben Quellen wie die `<select>`-Felder des Panels:
 * `getEntryChannelOptions()`, `DEAD_FINDING_PRESENTATION`,
 * `BALTIC_SEA_STATUS_PRESENTATION`, `SIGHTING_STATUS_PRESENTATION` und
 * `MEDIA_UPLOAD_ANNOUNCED_MISSING`. Die beiden Ja/Nein-Wortpaare ohne eigenes
 * Präsentationsmodul — „Mit"/„Ohne" und „Lebendsichtung" — standen dafür bis
 * 2026-08-10 in dieser Datei; sie liegen jetzt in
 * `#lib/components/admin/filterLabels.ts`, weil mit dem Export-Dialog eine
 * Aufrufstelle in `#lib` dazugekommen ist (Begründung dort). Das Panel
 * (`+page.svelte`) rendert seine `<option>`-Beschriftungen weiterhin daraus,
 * statt sie ein zweites Mal zu tippen. Ein eigener Wortschatz an einer der
 * Stellen hieße, dass Chip, Panel und Export denselben Filter verschieden
 * benennen, sobald eine davon angefasst wird — derselbe Fehler, gegen den
 * `deadFinding.ts` und `balticSeaStatus.ts` angelegt wurden.
 *
 * Client-sicher: **kein** Import aus `#lib/server/**`. Die Seite ist eine
 * Client-Komponente, und der Bruch fiele erst in `npm run build` auf.
 *
 * Der Filterzustand kommt aus `activeFilters.ts` und damit aus der URL — hier
 * entsteht kein zweiter gemerkter Zustand.
 */
import type { ReadonlyURL } from '$app/state';
import {
	AUFNAHME_LABEL,
	isAufnahmeFilterWert,
	isMeldeartFilterWert,
	kanalLabel,
	MELDEART_LABEL
} from '#lib/components/admin/filterLabels.ts';
import {
	SIGHTING_STATUS_PRESENTATION,
	type SightingStatus
} from '#lib/components/admin/sightingStatus.ts';
import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
import {
	BALTIC_SEA_STATUS_PRESENTATION,
	isBalticSeaStatus
} from '#lib/utils/geo/balticSeaStatus.ts';
import type { FilterParams } from './activeFilters';

export type FilterChip = {
	param: keyof FilterParams;
	/** Menschenlesbar und für sich verständlich — „Sichtung von 01.06.2026", „Kanal: Web". */
	label: string;
};

export type BuildFilterChipsOptions = {
	/**
	 * Den Status-Chip auslassen. Die Aufrufstelle setzt das, solange die
	 * Statusreiter über der Tabelle stehen: Der aktive Reiter zeigt den Status
	 * bereits, ein zweites Bedienelement für dieselbe Aussage wäre die
	 * Doppelung, gegen die die Reiter angetreten sind.
	 */
	skipVerified?: boolean;
};

/**
 * Reihenfolge der Chips — dieselbe wie im Panel, damit „zweiter Chip" und
 * „zweites Feld" dasselbe meinen. Die Freitext-Suche steht zuletzt; ihr Feld
 * liegt außerhalb des Panels.
 */
const CHIP_ORDER = [
	'fromDate',
	'toDate',
	'verified',
	'deadFinding',
	'entryChannel',
	'mediaUpload',
	'balticSea',
	'q'
] as const satisfies readonly (keyof FilterParams)[];

/**
 * Das Datum im Format der Tabelle. `fromDate`/`toDate` sind reine
 * Kalenderdaten (`YYYY-MM-DD`) und werden als UTC-Mitternacht gelesen — in
 * Europe/Berlin liegt der Offset ganzjährig vorwärts, der Datumsteil kippt
 * also nicht auf den Vortag.
 */
function datum(value: string): string {
	return formatLocalDateTime(value, 'date');
}

function statusLabel(value: string): string {
	return isSightingStatus(value) ? SIGHTING_STATUS_PRESENTATION[value].label : value;
}

function isSightingStatus(value: string): value is SightingStatus {
	return Object.hasOwn(SIGHTING_STATUS_PRESENTATION, value);
}

/**
 * Ein Wert, den keine Quelle kennt (veraltetes Lesezeichen, von Hand getippte
 * URL), erscheint unverändert. Den Chip wegzulassen wäre der schlechtere
 * Ausgang: Die Tabelle filterte dann sichtbar, ohne dass es etwas zum
 * Wegklicken gäbe.
 */
const CHIP_LABEL: Record<keyof FilterParams, (value: string) => string> = {
	fromDate: (value) => `Sichtung von ${datum(value)}`,
	toDate: (value) => `Sichtung bis ${datum(value)}`,
	verified: (value) => `Status: ${statusLabel(value)}`,
	deadFinding: (value) =>
		`Meldeart: ${isMeldeartFilterWert(value) ? MELDEART_LABEL[value] : value}`,
	entryChannel: (value) => `Kanal: ${kanalLabel(value)}`,
	mediaUpload: (value) =>
		`Aufnahme: ${isAufnahmeFilterWert(value) ? AUFNAHME_LABEL[value] : value}`,
	balticSea: (value) =>
		`Ostsee: ${isBalticSeaStatus(value) ? BALTIC_SEA_STATUS_PRESENTATION[value].label : value}`,
	q: (value) => `Suche: „${value}“`
};

/** Ein Chip je gesetztem Filter, in der Reihenfolge des Panels. */
export function buildFilterChips(
	params: FilterParams,
	options: BuildFilterChipsOptions = {}
): FilterChip[] {
	return CHIP_ORDER.filter((param) => {
		if (options.skipVerified && param === 'verified') return false;
		return params[param] !== '';
	}).map((param) => ({ param, label: CHIP_LABEL[param](params[param]) }));
}

/**
 * Die URL ohne diesen einen Filter.
 *
 * `page=1` aus demselben Grund wie bei jedem anderen Filterwechsel: Die
 * Trefferzahl springt, und ohne Rücksprung stünde man auf einer leeren Seite 7.
 * Die übergebene URL bleibt unverändert — der Aufrufer navigiert mit dem
 * Rückgabewert.
 */
export function removeFilterParam(url: ReadonlyURL, param: keyof FilterParams): URL {
	const ziel = new URL(url.href);
	ziel.searchParams.delete(param);
	ziel.searchParams.set('page', '1');
	return ziel;
}
