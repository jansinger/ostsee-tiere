/**
 * @fileoverview Auszeichnung eines Totfunds im Admin-Bereich.
 *
 * Eine Quelle für Wort und Icon der drei Anzeigestellen — Sichtungstabelle,
 * Mobilkarte und Detailansicht —, nach dem Vorbild von
 * `BALTIC_SEA_STATUS_PRESENTATION` (`#lib/utils/geo/balticSeaStatus.ts`). Ohne
 * sie liefen Beschriftung und Icon an drei Stellen auseinander, sobald eine
 * davon angefasst wird.
 *
 * Wort und Icon sind bewusst identisch zur Einstiegsseite des Meldeformulars
 * (`OPTIONS` in `#lib/report/components/ReportKindChoice.svelte`): Melder und
 * Admin sollen dieselbe Sache gleich benennen.
 *
 * **Nur der Totfund wird ausgezeichnet.** Für die Lebendsichtung gibt es hier
 * bewusst kein Gegenstück — sie ist der Normalfall und bleibt neutral. Ein
 * zweites Badge in jeder Zeile hätte den Kontrast wieder eingeebnet, um den es
 * hier geht.
 *
 * **Was hier bewusst NICHT steht: die Farben der übrigen Anzeigestellen.**
 * `text-error` am Tabellen-Marker, `border-error` an dessen Zelle und an der
 * Detailkarte sowie das `alert-warning` des Einordnungsbanners stehen an ihrer
 * jeweiligen Aufrufstelle. Jede dieser Klassen hat genau eine Verwendung; sie
 * hier zu spiegeln, ergäbe vier Konstanten mit je einem Leser — Indirektion
 * ohne den Nutzen, den `label` und `icon` haben (die stehen an drei bzw. vier
 * Stellen). Dass das Banner `warning` trägt und die Auszeichnungen `error`,
 * ist ebenfalls Absicht: Das Banner ordnet den Datensatz ein, die
 * Auszeichnungen heben ihn hervor.
 */
export const DEAD_FINDING_PRESENTATION = {
	label: 'Totfund',
	icon: 'lucide:triangle-alert',
	/** Flächenfarbe — deshalb ohne `-strong`-Suffix (`.claude/rules/design-system.md`). */
	badgeClass: 'badge-error',
	/**
	 * Der Satz, der in der Detailansicht über allen Angaben steht. Er
	 * wiederholt nicht nur das Wort „Totfund", sondern sagt, was es bedeutet —
	 * dieselbe Formulierung wie in der Einstiegsseite des Meldeformulars.
	 */
	description: 'Totfund — Fund eines toten Tieres'
} as const;

/**
 * Ob eine Sichtung ein Totfund ist.
 *
 * `isDead` kommt als `0`/`1` aus der Datenbank (Spalte `totfund`); die
 * Umwandlung in einen Wahrheitswert gehört deshalb an eine Stelle und nicht in
 * jede Aufrufstelle.
 */
export function isDeadFinding(isDead: number | boolean | null | undefined): boolean {
	return Boolean(isDead);
}
