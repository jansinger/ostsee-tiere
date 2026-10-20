/**
 * Lesbare Beschriftungen der aktiven Filter für den Export-Dialog
 * (`ExportModal.svelte`).
 *
 * Eigenes Modul statt einer Funktion in der Komponente: Diese Liste ist die
 * dritte Stelle, an der ein neuer Tabellenfilter nachgezogen werden muss —
 * neben `exportFilterParams.ts` (was tatsächlich gefiltert wird) und
 * `tableReturnUrl.ts` (was der Rückweg behält). Vergisst man sie, verspricht
 * der Dialog eine andere Menge, als die Datei enthält; als reine Funktion ist
 * das ohne Browser testbar (`exportFilterDisplay.test.ts`).
 *
 * **Kein eigener Wortschatz.** Jedes Wort kommt aus derselben Quelle wie im
 * Filter-Panel und in der Chip-Zeile der Tabelle: `getEntryChannelOptions()`,
 * `SIGHTING_STATUS_PRESENTATION`, `DEAD_FINDING_PRESENTATION`,
 * `BALTIC_SEA_STATUS_PRESENTATION` und `filterLabels.ts`. Bis 2026-08-10 stand
 * hier ein zweiter Satz Formulierungen; der sichtbarste Schaden war der Kanal,
 * der als rohe Datenbank-Zahl erschien („Kanal: 0"), während der Chip
 * derselben Seite „Kanal: Web" sagte — beide gleichzeitig am Bildschirm.
 *
 * **Warum nicht einfach `buildFilterChips` aufrufen**, wo die Chips dieselbe
 * Rechnung schon anstellen? Drei Gründe, jeder für sich ausreichend:
 *
 * 1. `buildFilterChips` liegt in `src/routes/admin/sichtungen/` — ein Import
 *    von hier aus wäre eine Abhängigkeit von `#lib` auf eine Route.
 * 2. Die Eingaben sind verschiedene Typen. Die Chips lesen `FilterParams`, wo
 *    jeder Schlüssel als String existiert und „nicht gesetzt" `''` heißt; hier
 *    kommt ein loses `Record<string, string | boolean | undefined>` an, wie es
 *    an die Export-API geht.
 * 3. Das Datum wird bewusst anders formatiert. `formatWallClockDateTime`
 *    sortiert den Kalendertag nur um, ohne `Date`-Objekt — sonst bestimmte die
 *    Browser-Zone den Tag mit (bis zu ±1 Tag).
 *
 * Übernommen werden deshalb die **Wörter**, nicht die Sätze: „Nur mit
 * Aufnahmen" bleibt satzartig, weil dieser Dialog eine Menge beschreibt und
 * kein wegklickbares Bedienelement ist. Beim **Status** geht das nicht — aus
 * „Freigegeben" lässt sich „freigegebene" nicht mechanisch bilden, und ein
 * zweites, gebeugtes Wort je Status wäre genau die Zweitbeschriftung, um die
 * es hier geht. Dort steht deshalb `Status: Freigegeben`, wortgleich zum
 * Statusreiter über der Tabelle — und in derselben `Feld: Wert`-Form wie die
 * sechs übrigen Einträge dieser Liste.
 */
import { formatWallClockDateTime } from '#lib/utils/format/formatWallClockDateTime.ts';
import { MEDIA_UPLOAD_ANNOUNCED_MISSING } from '#lib/utils/media/photoAnnouncement.ts';
import {
	BALTIC_SEA_STATUS_PRESENTATION,
	isBalticSeaStatus
} from '#lib/utils/geo/balticSeaStatus.ts';
import {
	AUFNAHME_LABEL,
	isAufnahmeFilterWert,
	isMeldeartFilterWert,
	kanalLabel,
	MELDEART_LABEL,
	type AufnahmeFilterWert
} from '#lib/components/admin/filterLabels.ts';
import { SIGHTING_STATUS_PRESENTATION } from '#lib/components/admin/sightingStatus.ts';
import { normalizeStatusParam } from '#lib/components/admin/sightingStatusFilter.ts';

/**
 * Der Aufnahme-Filter als Satz. „Mit"/„Ohne" stehen in `AUFNAHME_LABEL` als
 * Satzanfang groß — hier stehen sie mitten im Satz.
 *
 * Der Sonderwert bekommt keinen `Aufnahmen`-Zusatz: „Nur angekündigt, fehlt
 * noch Aufnahmen" wäre kein Satz.
 */
const AUFNAHME_SATZ: Record<AufnahmeFilterWert, string> = {
	'1': `Nur ${AUFNAHME_LABEL['1'].toLowerCase()} Aufnahmen`,
	'0': `Nur ${AUFNAHME_LABEL['0'].toLowerCase()} Aufnahmen`,
	[MEDIA_UPLOAD_ANNOUNCED_MISSING]: `Nur ${AUFNAHME_LABEL[
		MEDIA_UPLOAD_ANNOUNCED_MISSING
	].toLowerCase()}`
};

/**
 * @param currentFilters Die Filterwerte der Tabelle, so wie sie auch an die
 *   Export-API gehen.
 * @returns Je ein Badge-Text pro aktivem Filter, oder `['Keine Filter aktiv']`.
 */
export function getActiveFiltersDisplay(
	currentFilters: Record<string, string | boolean | undefined>
): string[] {
	const filterDisplays: string[] = [];

	// `fromDate`/`toDate` sind reine Kalendertag-Strings ("YYYY-MM-DD") aus dem
	// Datumsfilter, kein Zeitpunkt — formatWallClockDateTime sortiert nur um,
	// ohne Date-Objekt (sonst bestimmt die Browser-Zone den Tag mit, bis zu
	// ±1 Tag).
	if (currentFilters.fromDate) {
		filterDisplays.push(
			`Sichtung von: ${formatWallClockDateTime(currentFilters.fromDate as string)}`
		);
	}
	if (currentFilters.toDate) {
		filterDisplays.push(
			`Sichtung bis: ${formatWallClockDateTime(currentFilters.toDate as string)}`
		);
	}
	const statusFilter = normalizeStatusParam(currentFilters.verified as string | null);
	if (statusFilter) {
		filterDisplays.push(`Status: ${SIGHTING_STATUS_PRESENTATION[statusFilter].label}`);
	}
	if (currentFilters.entryChannel && currentFilters.entryChannel !== 'all') {
		filterDisplays.push(`Kanal: ${kanalLabel(String(currentFilters.entryChannel))}`);
	}
	const mediaUpload = currentFilters.mediaUpload;
	if (typeof mediaUpload === 'string' && isAufnahmeFilterWert(mediaUpload)) {
		filterDisplays.push(AUFNAHME_SATZ[mediaUpload]);
	}
	if (isBalticSeaStatus(currentFilters.balticSea)) {
		const presentation = BALTIC_SEA_STATUS_PRESENTATION[currentFilters.balticSea];
		filterDisplays.push(`Ostsee-Status: ${presentation.label}`);
	}
	const deadFinding = currentFilters.deadFinding;
	if (typeof deadFinding === 'string' && isMeldeartFilterWert(deadFinding)) {
		filterDisplays.push(`Meldeart: ${MELDEART_LABEL[deadFinding]}`);
	}
	// Getrimmt geprüft und getrimmt angezeigt — dieselbe Grenze wie serverseitig
	// in `normalizeSearchTerm`, sonst stünde hier ein Badge für eine Suche, die
	// die Abfrage gar nicht einschränkt.
	const searchTerm = typeof currentFilters.q === 'string' ? currentFilters.q.trim() : '';
	if (searchTerm) {
		filterDisplays.push(`Suche: „${searchTerm}"`);
	}

	return filterDisplays.length > 0 ? filterDisplays : ['Keine Filter aktiv'];
}
