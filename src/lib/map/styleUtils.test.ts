// ol/style wird auf Modulebene instanziiert (new Stroke(), new Fill()).
// Mock muss vor dem Import aktiv sein — vi.mock() wird von Vitest automatisch gehoisted.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ol/style', () => {
	class Stroke {
		private opts: { color?: string; width?: number; lineDash?: number[]; lineCap?: string };
		constructor(opts?: { color?: string; width?: number; lineDash?: number[]; lineCap?: string }) {
			this.opts = opts ?? {};
		}
		getColor() {
			return this.opts.color ?? 'black';
		}
		getLineDash() {
			return this.opts.lineDash ?? null;
		}
		getLineCap() {
			return this.opts.lineCap;
		}
	}
	class Fill {
		private opts: { color?: string };
		constructor(opts?: { color?: string }) {
			this.opts = opts ?? {};
		}
		getColor() {
			return this.opts.color ?? '#000';
		}
	}
	class Circle {
		private opts: { stroke?: Stroke; fill?: Fill; radius?: number };
		constructor(opts?: { stroke?: Stroke; fill?: Fill; radius?: number }) {
			this.opts = opts ?? {};
		}
		getStroke() {
			return this.opts.stroke;
		}
		getFill() {
			return this.opts.fill;
		}
	}
	class Text {
		private opts: { text?: string };
		constructor(opts?: { text?: string }) {
			this.opts = opts ?? {};
		}
		getText() {
			return this.opts.text;
		}
	}
	class Style {
		private opts: { image?: unknown; text?: Text };
		constructor(opts?: { image?: unknown; text?: Text }) {
			this.opts = opts ?? {};
		}
		getImage() {
			return this.opts.image;
		}
		getText() {
			return this.opts.text;
		}
	}
	class RegularShape {
		constructor(_opts?: unknown) {}
	}
	return { Stroke, Fill, Style, Circle, RegularShape, Text };
});

import { Feature } from 'ol';
import type { Geometry } from 'ol/geom';
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';
import {
	aggregateClusterStatus,
	clearStyleCache,
	clusterStyleSteps,
	createClusterStyle,
	createFeatureStyle,
	getClusterStyleStep,
	getFeatureColorGroup,
	isBetween,
	legendGroups,
	MARKER_BACKGROUND_COLOR,
	speciesGroupStyles,
	speciesSymbols,
	TOTFUND_RING_COLOR
} from './styleUtils';
import type { SightingProperties, SpeciesCategory } from './styleUtils';

/**
 * WCAG-Kontrastverhältnis zweier Hex-Farben (z. B. '#0072B2' vs '#FFFFFF').
 */
function contrastRatio(hexA: string, hexB: string): number {
	const luminance = (hex: string): number => {
		const channels = [1, 3, 5].map((i) => {
			const c = parseInt(hex.slice(i, i + 2), 16) / 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
	};
	const [l1, l2] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
	return (l1! + 0.05) / (l2! + 0.05);
}

/** Minimaler Feature-Mock für createFeatureStyle */
function mockFeature(props: Partial<SightingProperties>): Feature<Geometry> {
	const properties = { ta: 0, ct: 1, tf: false, ts: 1000, ...props };
	const stored: Record<string, unknown> = {};
	return {
		getProperties: () => properties,
		set: (key: string, value: unknown) => {
			stored[key] = value;
		},
		get: (key: string) => stored[key]
	} as unknown as Feature<Geometry>;
}

const NO_FILTER = { lower: 0, upper: Number.MAX_SAFE_INTEGER };

describe('styleUtils', () => {
	describe('speciesGroupStyles (Farbe = Artgruppe, M1)', () => {
		const categories: SpeciesCategory[] = ['kleinwal', 'grosswal', 'robbe', 'unbekannt'];

		it('definiert alle vier Artgruppen mit Label, Farbe und Symbol', () => {
			for (const category of categories) {
				const group = speciesGroupStyles[category];
				expect(group, `Gruppe ${category} fehlt`).toBeDefined();
				expect(group.label).toBeTruthy();
				expect(group.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
				expect(group.symbol).toBeTruthy();
			}
		});

		it('alle Gruppenfarben sind paarweise verschieden', () => {
			const colors = categories.map((c) => speciesGroupStyles[c].color);
			expect(new Set(colors).size).toBe(colors.length);
		});

		it('jede Gruppenfarbe hat ≥ 3:1 Kontrast auf dem weißen Marker (WCAG 1.4.11)', () => {
			for (const category of categories) {
				const ratio = contrastRatio(speciesGroupStyles[category].color, MARKER_BACKGROUND_COLOR);
				expect(ratio, `${category}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
			}
		});

		it('Totfund-Ring ist Schwarz und von allen Gruppenfarben unterscheidbar', () => {
			expect(TOTFUND_RING_COLOR).toBe('#000000');
			for (const category of categories) {
				expect(speciesGroupStyles[category].color).not.toBe(TOTFUND_RING_COLOR);
			}
		});
	});

	describe('speciesSymbols', () => {
		it('hat Einträge für alle 11 Tierarten (0–10)', () => {
			for (let i = 0; i <= 10; i++) {
				expect(speciesSymbols[String(i)], `Tierart ${i} fehlt`).toBeDefined();
			}
		});

		it('jeder Eintrag hat symbol, baseColor, size und category', () => {
			for (const [id, entry] of Object.entries(speciesSymbols)) {
				expect(entry.symbol, `symbol fehlt für ${id}`).toBeTruthy();
				expect(entry.baseColor, `baseColor fehlt für ${id}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
				expect(entry.size, `size fehlt für ${id}`).toBeGreaterThan(0);
				expect(
					['kleinwal', 'grosswal', 'robbe', 'unbekannt'],
					`ungültige category für ${id}`
				).toContain(entry.category);
			}
		});

		it('Farbe und Symbol jeder Art stammen aus ihrer Gruppendefinition (eine Quelle für Karte + Legende)', () => {
			for (const [id, entry] of Object.entries(speciesSymbols)) {
				const group = speciesGroupStyles[entry.category];
				expect(entry.baseColor, `baseColor von ${id} weicht von Gruppe ab`).toBe(group.color);
				expect(entry.symbol, `symbol von ${id} weicht von Gruppe ab`).toBe(group.symbol);
			}
		});

		it('Kleinwale: Schweinswal (0), Delphin (3), Beluga (4)', () => {
			expect(speciesSymbols['0']!.category).toBe('kleinwal');
			expect(speciesSymbols['3']!.category).toBe('kleinwal');
			expect(speciesSymbols['4']!.category).toBe('kleinwal');
		});

		it('Großwale: Zwergwal (5), Finnwal (6), Buckelwal (7)', () => {
			expect(speciesSymbols['5']!.category).toBe('grosswal');
			expect(speciesSymbols['6']!.category).toBe('grosswal');
			expect(speciesSymbols['7']!.category).toBe('grosswal');
		});

		it('Unbekannte Walart (8) wird NICHT als Großwal ausgewiesen (M8)', () => {
			expect(speciesSymbols['8']!.category).toBe('unbekannt');
			expect(speciesGroupStyles['unbekannt'].label).not.toBe('Großwal');
		});

		it('Robben: Kegelrobbe (1), Seehund (2), Ringelrobbe (9), Unbekannte Robbenart (10)', () => {
			expect(speciesSymbols['1']!.category).toBe('robbe');
			expect(speciesSymbols['2']!.category).toBe('robbe');
			expect(speciesSymbols['9']!.category).toBe('robbe');
			expect(speciesSymbols['10']!.category).toBe('robbe');
		});
	});

	describe('legendGroups (Anzahl-Filtergruppen)', () => {
		it('enthält alle erwarteten Gruppen', () => {
			expect(legendGroups['ct0']).toBeDefined();
			expect(legendGroups['ct1']).toBeDefined();
			expect(legendGroups['ct2']).toBeDefined();
			expect(legendGroups['ct6']).toBeDefined();
			expect(legendGroups['ct11']).toBeDefined();
			expect(legendGroups['ct15']).toBeDefined();
		});

		it('ct0-matcher trifft auf Totfund (tf=true)', () => {
			const props: SightingProperties = { ta: 0, ct: 5, tf: true, ts: 0 };
			expect(legendGroups['ct0']!.match(props)).toBe(true);
		});

		it('ct0-matcher trifft auf ct === 0', () => {
			const props: SightingProperties = { ta: 0, ct: 0, tf: false, ts: 0 };
			expect(legendGroups['ct0']!.match(props)).toBe(true);
		});

		it('ct1-matcher trifft auf ct === 1, kein Totfund', () => {
			const props: SightingProperties = { ta: 0, ct: 1, tf: false, ts: 0 };
			expect(legendGroups['ct1']!.match(props)).toBe(true);
		});

		it('ct2-matcher trifft auf Bereich 2–5', () => {
			expect(legendGroups['ct2']!.match({ ta: 0, ct: 2, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct2']!.match({ ta: 0, ct: 5, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct2']!.match({ ta: 0, ct: 6, tf: false, ts: 0 })).toBe(false);
		});

		it('ct6-matcher trifft auf Bereich 6–10', () => {
			expect(legendGroups['ct6']!.match({ ta: 0, ct: 6, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct6']!.match({ ta: 0, ct: 10, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct6']!.match({ ta: 0, ct: 11, tf: false, ts: 0 })).toBe(false);
		});

		it('ct11-matcher trifft auf Bereich 11–15', () => {
			expect(legendGroups['ct11']!.match({ ta: 0, ct: 11, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct11']!.match({ ta: 0, ct: 15, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct11']!.match({ ta: 0, ct: 16, tf: false, ts: 0 })).toBe(false);
		});

		it('ct15-matcher trifft auf ct > 15', () => {
			expect(legendGroups['ct15']!.match({ ta: 0, ct: 16, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct15']!.match({ ta: 0, ct: 100, tf: false, ts: 0 })).toBe(true);
			expect(legendGroups['ct15']!.match({ ta: 0, ct: 15, tf: false, ts: 0 })).toBe(false);
		});
	});

	describe('getFeatureColorGroup', () => {
		it('gibt ct0 zurück für Totfund', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 3, tf: true, ts: 0 })).toBe('ct0');
		});

		it('gibt ct0 zurück für ct === 0', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 0, tf: false, ts: 0 })).toBe('ct0');
		});

		it('gibt ct1 zurück für ct === 1', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 1, tf: false, ts: 0 })).toBe('ct1');
		});

		it('gibt ct2 zurück für ct = 2 und ct = 5', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 2, tf: false, ts: 0 })).toBe('ct2');
			expect(getFeatureColorGroup({ ta: 0, ct: 5, tf: false, ts: 0 })).toBe('ct2');
		});

		it('gibt ct6 zurück für ct = 6', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 6, tf: false, ts: 0 })).toBe('ct6');
		});

		it('gibt ct11 zurück für ct = 11', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 11, tf: false, ts: 0 })).toBe('ct11');
		});

		it('gibt ct15 zurück für ct = 16', () => {
			expect(getFeatureColorGroup({ ta: 0, ct: 16, tf: false, ts: 0 })).toBe('ct15');
		});
	});

	describe('createFeatureStyle (Ring = Gruppenfarbe, Anzahl = Zahl)', () => {
		it('gibt null zurück, wenn die Art ausgeblendet ist', () => {
			const feature = mockFeature({ ta: 0 });
			expect(createFeatureStyle(feature, { '0': true }, {}, NO_FILTER)).toBeNull();
		});

		it('gibt null zurück, wenn die Anzahl-Gruppe ausgeblendet ist', () => {
			const feature = mockFeature({ ta: 0, ct: 3 });
			expect(createFeatureStyle(feature, {}, { ct2: true }, NO_FILTER)).toBeNull();
		});

		it('gibt null zurück, wenn der Zeitstempel außerhalb des Zeitfilters liegt', () => {
			const feature = mockFeature({ ta: 0, ts: 1 });
			expect(createFeatureStyle(feature, {}, {}, { lower: 5000, upper: 9000 })).toBeNull();
		});

		it('Einzeltier (ct=1): nur Marker-Style ohne Zahl', () => {
			clearStyleCache();
			const styles = createFeatureStyle(mockFeature({ ta: 0, ct: 1 }), {}, {}, NO_FILTER);
			expect(styles).toHaveLength(1);
		});

		it('Gruppe (ct=7): Marker-Style plus Anzahl-Text "7"', () => {
			clearStyleCache();
			const styles = createFeatureStyle(mockFeature({ ta: 0, ct: 7 }), {}, {}, NO_FILTER);
			expect(styles).toHaveLength(2);
			const countText = (styles![1] as unknown as { getText(): { getText(): string } }).getText();
			expect(countText.getText()).toBe('7');
		});

		it('Ringfarbe entspricht der Gruppenfarbe der Art (Robbe)', () => {
			clearStyleCache();
			const styles = createFeatureStyle(mockFeature({ ta: 1, ct: 2 }), {}, {}, NO_FILTER);
			const image = (
				styles![0] as unknown as { getImage(): { getStroke(): { getColor(): string } } }
			).getImage();
			expect(image.getStroke().getColor()).toBe(speciesGroupStyles['robbe'].color);
		});

		it('teilt den Marker-Basisstyle zwischen unterschiedlichen Anzahlen (Cache)', () => {
			clearStyleCache();
			const styles3 = createFeatureStyle(mockFeature({ ta: 0, ct: 3 }), {}, {}, NO_FILTER);
			const styles9 = createFeatureStyle(mockFeature({ ta: 0, ct: 9 }), {}, {}, NO_FILTER);
			// Ring+Emoji hängen nur von Art und Totfund ab — gleiche Style-Instanz
			expect(styles3![0]).toBe(styles9![0]);
		});

		it('teilt den Anzahl-Textstyle zwischen unterschiedlichen Arten (Cache)', () => {
			clearStyleCache();
			const porpoise = createFeatureStyle(mockFeature({ ta: 0, ct: 4 }), {}, {}, NO_FILTER);
			const seal = createFeatureStyle(mockFeature({ ta: 1, ct: 4 }), {}, {}, NO_FILTER);
			expect(porpoise![1]).toBe(seal![1]);
		});

		it('Totfund: Ring ist schwarz, unabhängig von der Art', () => {
			clearStyleCache();
			const styles = createFeatureStyle(mockFeature({ ta: 1, ct: 1, tf: true }), {}, {}, NO_FILTER);
			const image = (
				styles![0] as unknown as { getImage(): { getStroke(): { getColor(): string } } }
			).getImage();
			expect(image.getStroke().getColor()).toBe(TOTFUND_RING_COLOR);
		});
	});

	describe('clusterStyleSteps (Cluster-Skala, eine Quelle für Karte + Legende)', () => {
		it('Schwellen steigen monoton, letzte Stufe ist offen (upTo === null)', () => {
			expect(clusterStyleSteps.length).toBeGreaterThanOrEqual(3);
			for (let i = 1; i < clusterStyleSteps.length; i++) {
				const prev = clusterStyleSteps[i - 1]!;
				const curr = clusterStyleSteps[i]!;
				if (curr.upTo !== null) {
					expect(prev.upTo).not.toBeNull();
					expect(curr.upTo).toBeGreaterThan(prev.upTo!);
				}
				expect(curr.radius).toBeGreaterThan(prev.radius);
			}
			expect(clusterStyleSteps[clusterStyleSteps.length - 1]!.upTo).toBeNull();
		});

		it('weiße Zahl hat ≥ 4,5:1 Kontrast auf jeder Cluster-Farbe (WCAG 1.4.3)', () => {
			for (const step of clusterStyleSteps) {
				const ratio = contrastRatio(step.color, '#FFFFFF');
				expect(ratio, `${step.color}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
			}
		});

		it('getClusterStyleStep wählt die richtige Stufe', () => {
			expect(getClusterStyleStep(2)).toBe(clusterStyleSteps[0]);
			expect(getClusterStyleStep(10_000)).toBe(clusterStyleSteps[clusterStyleSteps.length - 1]);
			// Grenzwert: upTo ist inklusiv
			const first = clusterStyleSteps[0]!;
			expect(getClusterStyleStep(first.upTo!)).toBe(first);
			expect(getClusterStyleStep(first.upTo! + 1)).toBe(clusterStyleSteps[1]);
		});
	});

	describe('createClusterStyle', () => {
		it('zeigt die Anzahl als Text und nutzt die Farbe der passenden Stufe', () => {
			clearStyleCache();
			const style = createClusterStyle(3);
			const text = (style as unknown as { getText(): { getText(): string } }).getText();
			expect(text.getText()).toBe('3');
		});

		it('cached Styles pro Größe', () => {
			clearStyleCache();
			const style1 = createClusterStyle(2);
			expect(createClusterStyle(2)).toBe(style1);
			clearStyleCache();
			expect(createClusterStyle(2)).not.toBe(style1);
		});
	});

	describe('isBetween', () => {
		it('gibt true zurück für Wert innerhalb des Bereichs', () => {
			expect(isBetween(5, 1, 10)).toBe(true);
			expect(isBetween(1, 1, 10)).toBe(true);
			expect(isBetween(10, 1, 10)).toBe(true);
		});

		it('gibt false zurück für Wert außerhalb des Bereichs', () => {
			expect(isBetween(0, 1, 10)).toBe(false);
			expect(isBetween(11, 1, 10)).toBe(false);
		});

		it('funktioniert auch wenn lower > upper', () => {
			expect(isBetween(5, 10, 1)).toBe(true);
			expect(isBetween(0, 10, 1)).toBe(false);
		});
	});

	describe('clearStyleCache', () => {
		it('kann mehrfach aufgerufen werden ohne Fehler', () => {
			expect(() => {
				clearStyleCache();
				clearStyleCache();
			}).not.toThrow();
		});
	});
});

describe('Marker-Optik je Bearbeitungszustand', () => {
	beforeEach(() => {
		clearStyleCache();
	});

	const timeFilter = { lower: 0, upper: Number.MAX_SAFE_INTEGER };

	function strokeDashOf(st: string | undefined): number[] | undefined {
		return strokeOf(st).getLineDash() ?? undefined;
	}

	function strokeOf(st: string | undefined): {
		getLineDash: () => number[] | null;
		getLineCap: () => string | undefined;
	} {
		const feature = new Feature();
		feature.setProperties({ ta: 1, ct: 1, tf: false, ts: 1_750_000_000, st });
		const styles = createFeatureStyle(feature, {}, {}, timeFilter);
		const image = styles?.[0]!.getImage() as unknown as {
			getStroke: () => { getLineDash: () => number[] | null; getLineCap: () => string | undefined };
		};
		return image.getStroke();
	}

	it('zeichnet freigegebene Marker durchgezogen', () => {
		expect(strokeDashOf('approved')).toBeUndefined();
	});

	it('zeichnet Marker ohne Statusangabe durchgezogen', () => {
		// Die öffentliche Karte liefert immer 'approved'; ein fehlendes Feld darf
		// die bestehende Darstellung nicht verändern.
		expect(strokeDashOf(undefined)).toBeUndefined();
	});

	it('zeichnet offene Marker gestrichelt', () => {
		expect(strokeDashOf('open')).toEqual([6, 4]);
	});

	it('zeichnet abgelehnte Marker gepunktet', () => {
		expect(strokeDashOf('rejected')).toEqual([2, 5]);
	});

	it('gibt der gepunkteten Variante runde Linienenden, den anderen nicht', () => {
		/* Ohne `round` rendert ein kurzes Segment bei Strichbreite 3 als radiale
		   Zacke statt als Punkt — am gerenderten Marker war das ein Strahlenkranz
		   ohne erkennbare Kreiskontur. Bei `open` würde `round` die Striche
		   verlängern und den Abstand zu `rejected` verkleinern. */
		expect(strokeOf('rejected').getLineCap()).toBe('round');
		expect(strokeOf('open').getLineCap()).toBe('butt');
		expect(strokeOf('approved').getLineCap()).toBe('butt');
	});

	it('cacht Marker je Status getrennt', () => {
		// Ohne den Status im Cache-Schlüssel bekäme die zweite Art die Optik der
		// ersten — der Fehler wäre auf der Karte nur zufällig sichtbar.
		expect(strokeDashOf('open')).toEqual([6, 4]);
		expect(strokeDashOf('approved')).toBeUndefined();
	});
});

describe('aggregateClusterStatus (Bearbeitungsstand eines Clusters)', () => {
	it('freigegeben nur, wenn jede enthaltene Sichtung freigegeben ist', () => {
		expect(aggregateClusterStatus(['approved', 'approved'])).toBe('approved');
	});

	it('ein leerer Cluster gilt als freigegeben', () => {
		// Kommt auf der Karte nicht vor (createFilteredClusterStyle steigt bei
		// visibleCount === 0 vorher aus), darf aber nicht undefined liefern.
		expect(aggregateClusterStatus([])).toBe('approved');
	});

	it('offen, sobald eine offene Sichtung enthalten ist', () => {
		expect(aggregateClusterStatus(['approved', 'open'])).toBe('open');
		expect(aggregateClusterStatus(['rejected', 'open'])).toBe('open');
	});

	it('abgelehnt, wenn neben Freigaben nur Ablehnungen enthalten sind', () => {
		/* „Offen" schlägt „abgelehnt": Offen ist der Zustand, der noch Arbeit
		   verlangt — er darf von der selteneren Ablehnung nicht verdeckt werden
		   (im Bestand 659 offene gegen 5 abgelehnte). */
		expect(aggregateClusterStatus(['approved', 'rejected'])).toBe('rejected');
		expect(aggregateClusterStatus(['rejected'])).toBe('rejected');
	});
});

describe('createClusterStyle — Bearbeitungsstand am Ring', () => {
	function clusterStroke(status?: SightingStatus) {
		clearStyleCache();
		const style = createClusterStyle(7, status);
		const image = (style as unknown as { getImage(): unknown }).getImage() as {
			getStroke: () => { getLineDash: () => number[] | null; getLineCap: () => string | undefined };
		};
		return image.getStroke();
	}

	it('zeichnet einen rein freigegebenen Cluster durchgezogen', () => {
		expect(clusterStroke('approved').getLineDash()).toBeNull();
	});

	it('zeichnet einen Cluster ohne Statusangabe durchgezogen', () => {
		// Die öffentliche Karte kennt keinen Status — die Optik dort bleibt gleich.
		expect(clusterStroke(undefined).getLineDash()).toBeNull();
	});

	it('nutzt dieselben Strichmuster wie der Einzelmarker', () => {
		/* Eine Quelle für beide Ebenen: Wer am Marker das Muster ändert, ändert es
		   am Cluster mit — sonst driften die zwei Aussagen derselben Legende. */
		expect(clusterStroke('open').getLineDash()).toEqual([6, 4]);
		expect(clusterStroke('rejected').getLineDash()).toEqual([2, 5]);
		expect(clusterStroke('rejected').getLineCap()).toBe('round');
		expect(clusterStroke('open').getLineCap()).toBe('butt');
	});

	it('cacht Cluster je Status getrennt', () => {
		/* Der Cache-Schlüssel lief bis hierher nur über die Größe. Ohne den Status
		   darin erbte jeder spätere Cluster derselben Größe die Optik des ersten —
		   ein Fehler, der nur bei gemischten Daten sichtbar wird. */
		clearStyleCache();
		const offen = createClusterStyle(7, 'open');
		const freigegeben = createClusterStyle(7, 'approved');
		expect(freigegeben).not.toBe(offen);
		const dashOf = (s: typeof offen) =>
			(
				(s as unknown as { getImage(): { getStroke(): { getLineDash(): number[] | null } } })
					.getImage()
					.getStroke() as { getLineDash(): number[] | null }
			).getLineDash();
		expect(dashOf(offen)).toEqual([6, 4]);
		expect(dashOf(freigegeben)).toBeNull();
	});
});
