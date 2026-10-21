import * as m from '#lib/paraglide/messages.js';
import { Stroke, Fill, Style, Circle, Text } from 'ol/style';
import type { Feature } from 'ol';
import type { Geometry } from 'ol/geom';
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';

/**
 * Prüft ob ein Wert zwischen zwei Grenzen liegt (inklusiv).
 * Ersetzt die vorherige Number.prototype.between Prototype-Extension.
 */
export function isBetween(value: number, lower: number, upper: number): boolean {
	return lower < upper ? value >= lower && value <= upper : value >= upper && value <= lower;
}

/**
 * Eigenschaften einer Sichtung für die Stildarstellung
 */
export interface SightingProperties {
	ta: number; // Tierart (species)
	ct: number; // Count
	tf: boolean; // Totfund (dead)
	ts: number; // Timestamp
	st?: SightingStatus; // Bearbeitungszustand (nur in der Admin-Ansicht ungleich 'approved')
	[key: string]: unknown; // Weitere Eigenschaften
}

/**
 * Definition einer Anzahl-Filtergruppe (Legende „Anzahl")
 */
export interface LegendGroup {
	name: string;
	match: (properties: SightingProperties) => boolean;
}

/**
 * Stil-Cache für schnelleren Zugriff
 */
const styleCache: Record<string, Style | Style[]> = {};

/**
 * Leert den Style-Cache (für dispose/cleanup)
 */
export function clearStyleCache(): void {
	Object.keys(styleCache).forEach((k) => delete styleCache[k]);
}

const defaultRadius = 8;

/**
 * Codierungssystem der Karte (UX-Review M1):
 * - Ringfarbe des Markers = Artgruppe (farbfehlsicht-sichere Okabe-Ito/Wong-Palette)
 * - Emoji-Symbol = zweiter, redundanter Kanal für die Artgruppe
 * - Anzahl der Tiere = Zahl unter dem Marker (ab 2 Tieren)
 * - Schwarzer Ring = Totfund (Zustands-Kanal, überschreibt die Gruppenfarbe)
 * - Strichmuster des Rings = Bearbeitungszustand (nur in der Admin-Ansicht
 *   ungleich „freigegeben": gestrichelt = offen, gepunktet = abgelehnt) —
 *   am Einzelmarker wie am Cluster-Ring, siehe `aggregateClusterStatus`
 * Legende (LegendPanel.svelte) rendert aus genau diesen Konstanten.
 */
export type SpeciesCategory = 'kleinwal' | 'grosswal' | 'robbe' | 'unbekannt';

export interface SpeciesGroupStyle {
	label: string; // Badge-/Legendentext der Gruppe
	color: string; // Ring- und Akzentfarbe (≥ 3:1 auf Weiß, WCAG 1.4.11)
	symbol: string; // Emoji als zweiter Kanal
}

export const speciesGroupStyles: Record<SpeciesCategory, SpeciesGroupStyle> = {
	kleinwal: { label: 'Kleinwal', color: '#0072B2', symbol: '🐬' }, // Wong-Blau
	grosswal: { label: 'Großwal', color: '#009E73', symbol: '🐋' }, // Wong-Grün
	robbe: { label: 'Robbe', color: '#D55E00', symbol: '🦭' }, // Wong-Vermillion
	// „Unbekannte Walart" (M8): weder Klein- noch Großwal zuordenbar → neutrale Gruppe
	unbekannt: { label: m.map_styleutils_text_art_unbestimmt(), color: '#767676', symbol: '❓' }
};

/** Hintergrund des Markerkreises — Bezugsfläche für die 3:1-Kontrastprüfung der Ringe */
export const MARKER_BACKGROUND_COLOR = '#FFFFFF';

/** Totfund überschreibt die Gruppenfarbe des Rings */
export const TOTFUND_RING_COLOR = '#000000';

/**
 * Zweiter Kanal für den Bearbeitungszustand — die Ringfarbe trägt bereits die
 * Artgruppe und darf hier nicht mitbelegt werden. Strichmuster statt Farbe:
 * Es bleibt bei Farbfehlsichtigkeit unterscheidbar, und die Legende erklärt es.
 * `undefined` = durchgezogen, wie bisher.
 *
 * `rejected` stand zunächst auf `[1, 4]` mit dem Standard-Linienende. Am
 * gerenderten Marker (Radius 14, Strichbreite 3) war das kein gepunkteter Ring,
 * sondern ein Strahlenkranz: Ein Segment der Länge 1 bei Breite 3 steht quer
 * zur Kurve, also als radiale Zacke. Die Kreiskontur verschwand dabei, und mit
 * ~20 % Strichdeckung war die Begrenzung deutlich schwächer als bei den anderen
 * beiden Zuständen — WCAG 1.4.11 verlangt für grafische Objekte 3:1.
 * `[2, 5]` mit rundem Linienende ergibt echte Punkte auf der Kreislinie, bleibt
 * gegen `[6, 4]` klar unterscheidbar und hält die Kontur. Verglichen wurden
 * `[1, 4]` (butt), `[2, 5]` und `[1, 7]` (beide round) am gerenderten Bild.
 */
export const STATUS_LINE_DASH: Record<SightingStatus, number[] | undefined> = {
	approved: undefined,
	open: [6, 4],
	rejected: [2, 5]
};

/**
 * Rundes Linienende nur für die gepunktete Variante — bei `[6, 4]` würde es die
 * Striche an beiden Enden verlängern und den Unterschied zu `rejected`
 * verkleinern, genau den Kanal also schwächen, um den es hier geht.
 */
export const STATUS_LINE_CAP: Record<SightingStatus, 'butt' | 'round'> = {
	approved: 'butt',
	open: 'butt',
	rejected: 'round'
};

/**
 * Symbol-Definition einer Tierart — Farbe und Symbol kommen immer aus der Gruppe
 */
export interface SpeciesSymbol {
	symbol: string; // Unicode-Symbol (identisch mit der Gruppe)
	baseColor: string; // Gruppenfarbe (identisch mit speciesGroupStyles[category].color)
	size: number; // Relative Größe
	category: SpeciesCategory;
}

function speciesEntry(category: SpeciesCategory, size = 1.0): SpeciesSymbol {
	const group = speciesGroupStyles[category];
	return { symbol: group.symbol, baseColor: group.color, size, category };
}

/**
 * Mapping von Tierarten-IDs zu Gruppen-Symbolik
 */
export const speciesSymbols: Record<string, SpeciesSymbol> = {
	'0': speciesEntry('kleinwal'), // Schweinswal
	'1': speciesEntry('robbe'), // Kegelrobbe
	'2': speciesEntry('robbe'), // Seehund
	'3': speciesEntry('kleinwal'), // Delphin
	'4': speciesEntry('kleinwal'), // Beluga
	'5': speciesEntry('grosswal', 1.15), // Zwergwal
	'6': speciesEntry('grosswal', 1.15), // Finnwal
	'7': speciesEntry('grosswal', 1.15), // Buckelwal
	'8': speciesEntry('unbekannt'), // Unbekannte Walart
	'9': speciesEntry('robbe'), // Ringelrobbe
	'10': speciesEntry('robbe') // Unbekannte Robbenart
};

/**
 * Anzahl-Filtergruppen: reine Filterlogik (Legende, countManager, hiddenColors).
 * Die Anzahl wird auf der Karte als Zahl dargestellt, nicht mehr als Farbe.
 */
export const legendGroups: Record<string, LegendGroup> = {
	ct1: {
		name: '1',
		match: (val) => !val.tf && val.ct === 1
	},
	ct2: {
		name: '2-5',
		match: (val) => !val.tf && val.ct >= 2 && val.ct <= 5
	},
	ct6: {
		name: '6-10',
		match: (val) => !val.tf && val.ct >= 6 && val.ct <= 10
	},
	ct11: {
		name: '11-15',
		match: (val) => !val.tf && val.ct >= 11 && val.ct <= 15
	},
	ct15: {
		name: '> 15',
		match: (val) => !val.tf && val.ct > 15
	},
	ct0: {
		name: 'Totfund',
		match: (val) => val.tf || val.ct === 0
	}
};

/**
 * Bestimmt die Anzahl-Gruppe eines Features basierend auf seinen Eigenschaften
 */
export function getFeatureColorGroup(properties: SightingProperties): string {
	for (const [key, group] of Object.entries(legendGroups)) {
		if (group.match(properties)) {
			return key;
		}
	}

	// Standardwert, wenn keine Übereinstimmung gefunden wurde
	return 'ct1';
}

/** Schriftgröße des Emoji-Symbols einer Art */
function markerFontSize(speciesSymbol: SpeciesSymbol): number {
	return Math.round(defaultRadius * 2.5 * speciesSymbol.size);
}

/** Radius des Markerkreises einer Art (auch Bezug für den Anzahl-Offset) */
function markerRadius(speciesSymbol: SpeciesSymbol): number {
	return markerFontSize(speciesSymbol) / 2 + 4;
}

/**
 * Marker-Basisstyle (weißer Kreis, Gruppenfarben-Ring, Emoji) — hängt nur von
 * Art und Totfund-Status ab und wird deshalb unabhängig von der Anzahl gecacht.
 */
function getMarkerBaseStyle(speciesId: string, isDead: boolean, status: SightingStatus): Style {
	const key = `markerBase_${speciesId}#${isDead}#${status}`;
	if (styleCache[key]) {
		return styleCache[key] as Style;
	}

	const speciesSymbol = speciesSymbols[speciesId] ?? speciesEntry('unbekannt');
	const ringColor = isDead ? TOTFUND_RING_COLOR : speciesSymbol.baseColor;
	const fontSize = markerFontSize(speciesSymbol);

	const style = new Style({
		image: new Circle({
			radius: markerRadius(speciesSymbol),
			fill: new Fill({ color: MARKER_BACKGROUND_COLOR + 'E6' }), // 90% Deckung
			stroke: new Stroke({
				color: ringColor,
				width: 3,
				lineDash: STATUS_LINE_DASH[status],
				lineCap: STATUS_LINE_CAP[status]
			})
		}),
		text: new Text({
			text: speciesSymbol.symbol,
			font: `${fontSize}px Arial, sans-serif`,
			textAlign: 'center',
			textBaseline: 'middle'
		})
	});

	styleCache[key] = style;
	return style;
}

/**
 * Anzahl-Textstyle unter dem Marker — hängt nur von Anzahl und Offset ab
 * und wird artenübergreifend geteilt.
 */
function getCountTextStyle(count: number, offsetY: number): Style {
	const key = `countText_${count}#${offsetY}`;
	if (styleCache[key]) {
		return styleCache[key] as Style;
	}

	const style = new Style({
		text: new Text({
			text: count.toString(),
			font: 'bold 12px Arial, sans-serif',
			offsetY,
			fill: new Fill({ color: '#1A1A1A' }),
			stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
			textAlign: 'center',
			textBaseline: 'middle'
		})
	});

	styleCache[key] = style;
	return style;
}

/**
 * Erzeugt die Styles für ein Feature basierend auf Art, Anzahl und Totfund-Status
 */
export function createFeatureStyle(
	feature: Feature<Geometry>,
	hiddenSpecies: Record<string, boolean>,
	hiddenColors: Record<string, boolean>,
	timeFilter: { lower: number; upper: number }
): Style[] | null {
	const properties = feature.getProperties() as SightingProperties;
	const speciesId = (properties.speciesKey as string) || properties.ta.toString();
	const colorGroup = getFeatureColorGroup(properties);

	// Prüfen, ob das Feature ausgeblendet werden soll
	if (
		hiddenSpecies[speciesId] ||
		hiddenColors[colorGroup] ||
		!isBetween(properties.ts * 1000, timeFilter.lower, timeFilter.upper)
	) {
		feature.set('stcVisibility', false);
		return null;
	}

	feature.set('stcVisibility', true);
	feature.set('stcGroup', colorGroup);

	// Totfund-Regel kommt aus legendGroups.ct0 — colorGroup ist bereits berechnet
	const isDead = colorGroup === 'ct0';
	const status = properties.st ?? 'approved';
	const key = `marker_${speciesId}#${properties.ct}#${isDead}#${status}`;

	if (styleCache[key]) {
		return styleCache[key] as Style[];
	}

	// Basis- und Anzahl-Style werden separat gecacht und hier nur kombiniert —
	// so entsteht pro Anzahl kein neuer Ring/Emoji-Style
	const speciesSymbol = speciesSymbols[speciesId] ?? speciesEntry('unbekannt');
	const base = getMarkerBaseStyle(speciesId, isDead, status);
	const styles =
		properties.ct > 1
			? [base, getCountTextStyle(properties.ct, markerRadius(speciesSymbol) + 9)]
			: [base];
	styleCache[key] = styles;

	return styles;
}

/**
 * Cluster-Farbskala: hell → dunkel = wenige → viele Sichtungen.
 * Alle Farben halten ≥ 4,5:1 für die weiße Anzahl (WCAG 1.4.3) und
 * kollidieren nicht mit den Gruppenfarben der Einzelmarker.
 * Die Legende erklärt diese Skala aus derselben Konstante (M1).
 */
export interface ClusterStyleStep {
	upTo: number | null; // inklusive Obergrenze, null = offene letzte Stufe
	color: string;
	radius: number;
	fontSize: number;
}

export const clusterStyleSteps: ClusterStyleStep[] = [
	{ upTo: 4, color: '#2E7D99', radius: 18, fontSize: 12 },
	{ upTo: 9, color: '#25647F', radius: 22, fontSize: 13 },
	{ upTo: 24, color: '#1E5266', radius: 26, fontSize: 14 },
	{ upTo: 49, color: '#16404F', radius: 30, fontSize: 15 },
	{ upTo: null, color: '#0F2933', radius: 35, fontSize: 16 }
];

/**
 * Wählt die Cluster-Stufe für eine Anzahl von Sichtungen
 */
export function getClusterStyleStep(size: number): ClusterStyleStep {
	return (
		clusterStyleSteps.find((step) => step.upTo !== null && size <= step.upTo) ??
		clusterStyleSteps[clusterStyleSteps.length - 1]!
	);
}

/**
 * Bearbeitungsstand eines ganzen Clusters — aggregiert aus den enthaltenen
 * Sichtungen. Die Aussage ist dieselbe wie am Einzelmarker, nur über eine Menge:
 * durchgezogen heißt „alle hier sind freigegeben", nicht „die meisten".
 *
 * Die Rangfolge ist `open` > `rejected` > `approved` und nicht die Mehrheit.
 * Eine Mehrheitsregel hätte bei 19.289 freigegebenen gegen 659 offene und
 * 5 abgelehnte (Stand 2026-08-13) praktisch jeden Cluster als „freigegeben"
 * ausgewiesen — also genau die Falschaussage bestätigt, gegen die dieser Kanal
 * angelegt wurde. `open` schlägt `rejected`, weil offen der Zustand ist, der
 * noch Arbeit verlangt; die seltenere Ablehnung darf ihn nicht verdecken.
 *
 * Der Preis dieser Regel ist bekannt und gewollt: Mit dem Statusfilter auf
 * „alle" ist auf kleinen Zoomstufen kaum ein Cluster rein freigegeben, das
 * Muster ist dort also wenig trennscharf. Trennscharf wird es über den
 * Statusfilter — und wahr ist es in beiden Fällen.
 */
export function aggregateClusterStatus(statuses: Iterable<SightingStatus>): SightingStatus {
	let hasRejected = false;
	for (const status of statuses) {
		if (status === 'open') return 'open';
		if (status === 'rejected') hasRejected = true;
	}
	return hasRejected ? 'rejected' : 'approved';
}

/**
 * Erstellt einen Style für ein Cluster mit der angegebenen Anzahl sichtbarer
 * Sichtungen. `status` kommt aus `aggregateClusterStatus` und ist außerhalb der
 * Admin-Ansicht immer `approved` — die öffentliche Karte sieht damit dieselbe
 * Optik wie bisher.
 */
export function createClusterStyle(size: number, status: SightingStatus = 'approved'): Style {
	// Der Status gehört in den Schlüssel: Ohne ihn erbte jeder spätere Cluster
	// derselben Größe die Optik des ersten (Test „cacht Cluster je Status getrennt").
	const clusterKey = `cluster_${size}#${status}`;

	if (styleCache[clusterKey]) {
		return styleCache[clusterKey] as Style;
	}

	const step = getClusterStyleStep(size);

	const style = new Style({
		image: new Circle({
			radius: step.radius,
			fill: new Fill({ color: step.color + 'E6' }), // 90% Deckung
			stroke: new Stroke({
				color: '#FFFFFF',
				width: 2,
				// Dieselben Konstanten wie am Einzelmarker — eine Quelle, eine Legende.
				// Bei Strichbreite 2 und Radius 18–35 gerendert geprüft: beide Muster
				// bleiben gegeneinander und gegen „durchgezogen" unterscheidbar.
				lineDash: STATUS_LINE_DASH[status],
				lineCap: STATUS_LINE_CAP[status]
			})
		}),
		text: new Text({
			text: size.toString(),
			font: `bold ${step.fontSize}px Arial, sans-serif`,
			fill: new Fill({ color: '#FFFFFF' }),
			textAlign: 'center',
			textBaseline: 'middle'
		})
	});

	styleCache[clusterKey] = style;

	return style;
}
