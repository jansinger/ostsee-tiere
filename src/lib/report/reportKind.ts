import { isDeadFinding } from '#lib/report/formConfig.ts';
import {
	loadFromStorage,
	removeFromStorage,
	saveToStorage,
	STORAGE_KEYS
} from '#lib/storage/localStorage.ts';

/** Die zwei Zweige des Meldeformulars. */
export type ReportKind = 'alive' | 'dead';

/**
 * Name des Query-Parameters — und zugleich der Bestandteil des `href`, den die
 * beiden Karten auf der Einstiegsseite tragen.
 *
 * Das ist kein Zufall, sondern ein tragender Vertrag: Ein Klick VOR der
 * Hydration navigiert nativ über den `href`. Nur weil dieser `meldung` heißt
 * und `lebend`/`totfund` trägt, landet der Melder dabei auf `/?meldung=totfund`,
 * wo `resolveReportKind` den Zweig schon serverseitig auflöst. Stünde der Name
 * auf beiden Seiten als Literal, machte eine einseitige Umbenennung den JS-losen
 * Pfad still wieder wirkungslos — ohne dass ein Test rot würde.
 *
 * Bis zum UX-Review 2026-08-07 hing derselbe Vertrag am `name` zweier Radios
 * und einem nativen GET-Submit; der Weg trug den Zweig zwar auch, ersetzte
 * dabei aber die gesamte Query. Der `href` erhält sie (`+page.svelte`).
 */
export const REPORT_KIND_PARAM = 'meldung';

/**
 * Der Query-Parameter ist bewusst deutsch: Er steht in Links, die das Museum
 * selbst setzt und liest.
 *
 * Map statt Objektliteral: Der Parameterwert kommt fremdkontrolliert aus der
 * URL. Ein Objektliteral als Lookup-Tabelle würde für geerbte Property-Namen
 * wie `constructor` oder `__proto__` truthy Werte statt `undefined` liefern.
 */
const PARAM_TO_KIND = new Map<string, ReportKind>([
	['lebend', 'alive'],
	['totfund', 'dead']
]);

export function reportKindToIsDead(kind: ReportKind): boolean {
	return kind === 'dead';
}

/**
 * Der Query-Parameter-Wert für einen Zweig. Eigenständige, über `ReportKind`
 * erschöpfende Zuordnung — kein Aufruf von `PARAM_TO_KIND.get()` in
 * Gegenrichtung, weil eine `Map` dafür keinen erschöpfenden Zugriff bietet.
 * Ein `switch` über `ReportKind` lässt TypeScript meckern, sobald ein
 * dritter Zweig hinzukommt, statt still `'lebend'` zu liefern.
 */
export function reportKindToParam(kind: ReportKind): 'lebend' | 'totfund' {
	switch (kind) {
		case 'alive':
			return 'lebend';
		case 'dead':
			return 'totfund';
	}
}

/**
 * Entscheidet, welcher Zweig gilt — und ob die Auswahlseite überhaupt erscheint.
 *
 * Rein und ohne Browser-Zugriff, damit die Zustandsmaschine inklusive
 * Migrationspfad in Node testbar bleibt.
 *
 * @param param     Wert von `?meldung=` oder null
 * @param stored    Zuvor gespeicherter Zweig oder null
 * @param savedIsDead `isDead` aus gespeicherten Formulardaten oder null.
 *                  Nur für den Altbestand relevant: Wer beim Deploy mitten im
 *                  Formular sitzt, hat noch kein `reportKind` — sein Zweig wird
 *                  aus `isDead` abgeleitet, statt ihn zurückzuwerfen.
 * @returns Der geltende Zweig, oder null wenn die Auswahlseite erscheinen muss.
 */
export function resolveReportKind(
	param: string | null,
	stored: ReportKind | null,
	savedIsDead: unknown
): ReportKind | null {
	const fromParam = param ? PARAM_TO_KIND.get(param) : undefined;
	if (fromParam) {
		return fromParam;
	}
	if (stored) {
		return stored;
	}
	if (savedIsDead !== null && savedIsDead !== undefined) {
		return isDeadFinding(savedIsDead) ? 'dead' : 'alive';
	}
	return null;
}

export function readReportKind(): ReportKind | null {
	return loadFromStorage<ReportKind | null>(STORAGE_KEYS.REPORT_KIND, null);
}

export function writeReportKind(kind: ReportKind): void {
	saveToStorage(STORAGE_KEYS.REPORT_KIND, kind);
}

export function clearReportKind(): void {
	removeFromStorage(STORAGE_KEYS.REPORT_KIND);
}
