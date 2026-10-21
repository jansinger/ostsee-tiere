import { describe, expect, it } from 'vitest';
import { BALTIC_SEA_STATUS_PRESENTATION } from '#lib/utils/geo/balticSeaStatus.ts';
import { balticSeaEmailContext, BALTIC_SEA_STATUS_EMAIL_COLORS } from './balticSeaEmailContext';

const ALL_STATUSES = ['baltic', 'edge', 'outside', 'noPosition'] as const;

/** Lübecker Bucht — eine Position, die das Polygon *und* die Box trifft. */
const inTheBay = { latitude: '54.020000', longitude: '11.100000' };

describe('balticSeaEmailContext', () => {
	// Der eigentliche Befund, aus dem diese Datei entstanden ist: die Vorlage
	// verzweigte über `inBalticSeaGeo` (die Bounding Box) und zeigte dafür ein
	// grünes „Ostsee ✓". Eine Meldung aus dem Hamburger Hafen liegt in der Box,
	// aber nicht im Polygon — sie ist nachweislich NICHT in der Ostsee.
	// Dieselbe Zusicherung hält `balticSeaStatus.test.ts` für die Übersicht;
	// beide Stellen dürfen nicht wieder auseinanderlaufen.
	it('weist eine Sichtung in der Box, aber außerhalb des Polygons NICHT als Ostsee aus', () => {
		const context = balticSeaEmailContext({
			inBalticSea: 0,
			inBalticSeaGeo: 1,
			...inTheBay
		});

		expect(context.status).toBe('outside');
		expect(context.label).not.toMatch(/Ostsee/);
		expect(context.needsAttention).toBe(true);
	});

	it('zeigt für eine echte Ostsee-Sichtung dasselbe Label wie die Übersicht', () => {
		const context = balticSeaEmailContext({ inBalticSea: 1, inBalticSeaGeo: 1, ...inTheBay });

		expect(context.status).toBe('baltic');
		expect(context.label).toBe(BALTIC_SEA_STATUS_PRESENTATION.baltic.label);
		// Nur dieser Zustand braucht keinen Hinweiskasten in der Mail.
		expect(context.needsAttention).toBe(false);
	});

	// Der Altsystem-Wert 2 bedeutet dasselbe wie 1. Die Mail darf ihn nicht
	// anders behandeln als die Übersicht (dort per `> 0` geprüft).
	it('behandelt den Altsystem-Wert 2 in ostsee_geo wie 1', () => {
		expect(balticSeaEmailContext({ inBalticSea: 1, inBalticSeaGeo: 2, ...inTheBay }).status).toBe(
			'baltic'
		);
		expect(balticSeaEmailContext({ inBalticSea: 0, inBalticSeaGeo: 2, ...inTheBay }).status).toBe(
			'outside'
		);
	});

	// Ohne Koordinaten darf die Mail keine Aussage über eine Position treffen.
	// Die Vorlagendatei tat das bis zum 2026-07-30: ihr Block hing an
	// `{{#if sighting.inBalticSea}}` ohne Koordinaten-Guard und behauptete
	// „Position liegt deutlich außerhalb der Ostsee" — ohne Position.
	it('trifft ohne Koordinaten keine Positionsaussage', () => {
		const context = balticSeaEmailContext({ inBalticSea: 0, inBalticSeaGeo: 0 });

		expect(context.status).toBe('noPosition');
		expect(context.title).not.toMatch(/außerhalb/i);
		expect(context.needsAttention).toBe(true);
	});

	it('übernimmt Label und Text unverändert aus der gemeinsamen Präsentation', () => {
		for (const status of ALL_STATUSES) {
			// Flags so wählen, dass genau dieser Status entsteht.
			const flags = {
				baltic: { inBalticSea: 1, inBalticSeaGeo: 1, ...inTheBay },
				edge: { inBalticSea: 1, inBalticSeaGeo: 0, ...inTheBay },
				outside: { inBalticSea: 0, inBalticSeaGeo: 0, ...inTheBay },
				noPosition: { inBalticSea: 1, inBalticSeaGeo: 1 }
			}[status];

			const context = balticSeaEmailContext(flags);
			expect(context.status).toBe(status);
			expect(context.label).toBe(BALTIC_SEA_STATUS_PRESENTATION[status].label);
			expect(context.title).toBe(BALTIC_SEA_STATUS_PRESENTATION[status].title);
		}
	});
});

describe('BALTIC_SEA_STATUS_EMAIL_COLORS', () => {
	// E-Mail-Clients kennen weder oklch() noch die DaisyUI-Badge-Klassen der
	// Admin-Seite — die Farben müssen als sRGB-Hex im Kontext liegen. Der
	// Record-Typ erzwingt dabei Vollständigkeit; der Test fängt einen leeren
	// oder nicht-hex Wert.
	it('liefert für jeden Status sRGB-Hex-Werte', () => {
		for (const status of ALL_STATUSES) {
			const { surface, strong } = BALTIC_SEA_STATUS_EMAIL_COLORS[status];
			expect(surface).toMatch(/^#[0-9a-f]{6}$/);
			expect(strong).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('unterscheidet die Fläche des Ostsee-Zustands von der der Auffälligkeiten', () => {
		const baltic = BALTIC_SEA_STATUS_EMAIL_COLORS.baltic.surface;
		expect(BALTIC_SEA_STATUS_EMAIL_COLORS.outside.surface).not.toBe(baltic);
		expect(BALTIC_SEA_STATUS_EMAIL_COLORS.edge.surface).not.toBe(baltic);
	});
});
