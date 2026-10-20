/**
 * Ostsee-Status einer Sichtung — **die einzige Stelle**, an der dieser Status
 * entsteht.
 *
 * Angeschlossen sind die Admin-Übersicht (`routes/admin/sichtungen/+page.svelte`), die
 * Detailansicht (`components/admin/AdminSightingView.svelte`) und die
 * Benachrichtigungs-Mail (über `server/templates/balticSeaEmailContext.ts`, weil
 * Handlebars keine TypeScript-Funktion aufrufen kann). Wer eine vierte
 * Anzeigestelle baut, ruft diese Funktion auf und baut die Flag-Logik nicht nach
 * — genau daran ist die Mail auseinandergelaufen.
 *
 * **Nicht nach `#lib/server/` verschieben:** Die Admin-Übersicht ist eine
 * Client-Komponente. Die Funktion ist reine Logik über die Flags plus
 * Koordinaten und hat keine Server-Abhängigkeiten.
 *
 * Die Tabelle `sichtungen` hält zwei Flags, deren Namen die Bedeutungen verkehrt
 * herum nahelegen: `ostsee` (`inBalticSea`) ist die **strenge** Punkt-in-Polygon-
 * Prüfung, `ostsee_geo` (`inBalticSeaGeo`) nur die **grobe** Bounding Box. Die
 * fachliche Aussage „liegt in der Ostsee" hängt deshalb allein an `ostsee`.
 *
 * Aus der Kombination beider Flags — und der Frage, ob überhaupt Koordinaten
 * vorliegen — entstehen die vier Zustände unten.
 *
 * Der Fall `edge` ist ein **Widerspruch zwischen den beiden Flags**: als Ostsee
 * markiert, Position aber außerhalb des Kartenbereichs. Er hieß hier zunächst
 * „Rand", weil `docs/OSTSEE_FLAGS.md` ihn als Westkanten-Fall beschrieb (die
 * Bounding Box schneide Kieler Bucht und Flensburger Förde ab). Das ist am
 * 2026-07-30 nachgemessen und **widerlegt** worden: auf 54,8° N liegt der
 * westlichste Polygon-Treffer bei 9,43° O, also östlich der Boxgrenze. Die Zeilen
 * in diesem Zustand sind Altdaten mit unplausiblen Koordinaten (95 westlich
 * 8,5° O, 50 bis −98°/+100°, 10 zwischen 8,5 und 9,4° O) — deshalb „Widerspruch"
 * und nicht „Rand".
 *
 * Der Fall `noPosition` ist beim Umsetzen dieser Korrektur aus den Daten
 * dazugekommen: Von den 533 Zeilen mit `ostsee = 1` und `ostsee_geo = 0` haben
 * **378 überhaupt keine Koordinaten**. Ohne Koordinaten belegt auch `ostsee = 1`
 * nichts — diese Zeilen als Ostsee-Aussage zu führen wäre derselbe Fehler wie der
 * hier behobene: eine Zugehörigkeit behaupten, die die Daten nicht tragen.
 *
 * Vollständige Referenz inkl. Messwerten: `docs/OSTSEE_FLAGS.md`
 */
export type BalticSeaStatus = 'baltic' | 'edge' | 'outside' | 'noPosition';

/**
 * Alle Felder sind nullish-tolerant: `ostsee` ist in der DB nullable, und
 * `FrontendSighting` leitet sich von Drizzles `InferInsertModel` ab — dort sind
 * Spalten mit Default optional, also zusätzlich `undefined`. Die Koordinaten sind
 * `numeric`-Spalten und kommen deshalb als String.
 */
export type BalticSeaFlags = {
	/** Spalte `ostsee` — exaktes Polygon, nullable (Altbestand-Asymmetrie). */
	inBalticSea?: number | null | undefined;
	/** Spalte `ostsee_geo` — Bounding Box, drei Werte (0, 1, 2). */
	inBalticSeaGeo?: number | null | undefined;
	/** Spalte `gps_breite`. */
	latitude?: string | null | undefined;
	/** Spalte `gps_laenge`. */
	longitude?: string | null | undefined;
};

/**
 * Beide Flag-Spalten werden mit `> 0` geprüft, nie mit `= 1`: `ostsee_geo` enthält
 * aus dem Altsystem zusätzlich den Wert `2` mit derselben Bedeutung wie `1`. Ein
 * Vergleich auf `= 1` ließe 79 % des Bestands lautlos herausfallen.
 */
export function getBalticSeaStatus({
	inBalticSea,
	inBalticSeaGeo,
	latitude,
	longitude
}: BalticSeaFlags): BalticSeaStatus {
	// Die Koordinaten sind nur dann eine Aussage, wenn *beide* vorliegen — eine
	// halbe Position lässt sich nicht auf der Karte prüfen.
	const hasPosition = isFiniteCoordinate(latitude) && isFiniteCoordinate(longitude);
	if (!hasPosition) {
		return 'noPosition';
	}

	if (!((inBalticSea ?? 0) > 0)) {
		return 'outside';
	}

	return (inBalticSeaGeo ?? 0) > 0 ? 'baltic' : 'edge';
}

function isFiniteCoordinate(value: string | null | undefined): boolean {
	if (value === null || value === undefined || value.trim() === '') {
		return false;
	}
	return Number.isFinite(Number(value));
}

type BalticSeaStatusPresentation = {
	label: string;
	/** Statusfarbe als *Fläche* — deshalb ohne `-strong` (siehe design-system.md). */
	badgeClass: string;
	title: string;
};

export const BALTIC_SEA_STATUS_PRESENTATION: Record<BalticSeaStatus, BalticSeaStatusPresentation> =
	{
		baltic: {
			label: 'Ostsee',
			badgeClass: 'badge-info',
			title: 'Position liegt im Ostsee-Polygon und im Kartenbereich.'
		},
		edge: {
			label: 'Widerspruch',
			badgeClass: 'badge-warning',
			title:
				'Als Ostsee markiert, Position aber außerhalb des Kartenbereichs — im Altbestand meist unplausible Koordinaten. Bitte prüfen.'
		},
		outside: {
			label: 'außerhalb',
			badgeClass: 'badge-ghost',
			title: 'Position liegt nicht im Ostsee-Polygon.'
		},
		noPosition: {
			label: 'ohne Position',
			badgeClass: 'badge-outline',
			title: 'Keine verwertbaren Koordinaten — eine Ostsee-Zuordnung ist nicht möglich.'
		}
	};

/**
 * Type Guard für einen rohen Query-/Filter-Wert. Leitet die gültigen Werte aus
 * den Schlüsseln von `BALTIC_SEA_STATUS_PRESENTATION` ab, statt sie in einer
 * zweiten Liste zu wiederholen — der Record ist bereits als
 * `Record<BalticSeaStatus, …>` exhaustiv typisiert, ein fünfter Status würde
 * hier also einen Typfehler auslösen, nicht erst zur Laufzeit stillschweigend
 * durchrutschen.
 *
 * Nimmt bewusst `unknown` — Aufrufer wie `ExportModal.svelte` lesen den Wert aus
 * einem gemischt typisierten Filter-Objekt (`Record<string, string | boolean>`),
 * ein engerer Parametertyp würde dort einen weiteren Cast erzwingen.
 */
export function isBalticSeaStatus(value: unknown): value is BalticSeaStatus {
	if (typeof value !== 'string') {
		return false;
	}
	return (Object.keys(BALTIC_SEA_STATUS_PRESENTATION) as BalticSeaStatus[]).includes(
		value as BalticSeaStatus
	);
}
