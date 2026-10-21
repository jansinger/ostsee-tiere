/**
 * @fileoverview Was über einen Melder aus dem eigenen Bestand bekannt ist.
 *
 * Client-sicher: nur Typen, kein Import aus `#lib/server/**` — der Bruch fiele
 * sonst erst in `npm run build` auf, nicht in `npm run check`.
 *
 * **Die Zahlen zählen die *anderen* Meldungen desselben Melders.** Die Meldung,
 * die gerade angesehen wird, ist nicht Teil ihrer eigenen Vorgeschichte;
 * `findReporterHistory` zieht sie aus dem Topf ab, in dem sie steckt.
 *
 * **Nichts davon wird persistiert.** Es gibt keine Spalte, keinen Score und
 * keinen Backfill: Reputation ändert sich rückwirkend mit jeder Freigabe, ein
 * gespeicherter Wert wäre ab dem nächsten Klick falsch. Die Abgrenzung zum
 * Spam-Score steht in `docs/SPAM_DETECTION.md`.
 */
export interface ReporterHistory {
	/** Andere Meldungen dieses Melders, die freigegeben wurden. */
	approved: number;
	/** Andere Meldungen dieses Melders, die abgelehnt wurden. */
	rejected: number;
	/** Andere Meldungen dieses Melders, die noch offen sind. */
	open: number;
	/**
	 * Früheste Meldung dieses Melders als ISO-Zeichenkette in UTC — **inklusive**
	 * der aktuellen. „Melder seit" ist eine Aussage über die Person, nicht über
	 * die Restmenge; ein Erstmelder hat damit korrekt das heutige Datum.
	 */
	since: string | null;
}
