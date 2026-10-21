/**
 * @fileoverview Stufen der Melder-Historie — Schwellen und Wortlaut.
 *
 * Die Schwellen (3 / 10 / ⅓) sind eine Produktentscheidung (Jan, 2026-08-10)
 * und stehen deshalb hier als Test und nicht nur als Konstante: Eine Zahl, die
 * niemand nachrechnet, verschiebt sich beim nächsten Umbau unbemerkt.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';
import {
	REPORTER_ESTABLISHED_THRESHOLD,
	REPORTER_FLAGGED_RATIO,
	REPORTER_KNOWN_THRESHOLD,
	REPORTER_LEVEL_PRESENTATION,
	getReporterLevel,
	reporterBadgeText
} from './reporterHistoryPresentation';

function historie(overrides: Partial<ReporterHistory> = {}): ReporterHistory {
	return { approved: 0, rejected: 0, open: 0, since: '2019-03-04T08:00:00Z', ...overrides };
}

describe('getReporterLevel', () => {
	it('liefert null ohne Daten — dann gibt es nichts zu behaupten', () => {
		expect(getReporterLevel(null)).toBeNull();
		expect(getReporterLevel(undefined)).toBeNull();
	});

	it('nennt einen Melder ohne jede weitere Meldung „first"', () => {
		expect(getReporterLevel(historie())).toBe('first');
	});

	/* „Nur offene Meldungen" ist nicht dasselbe wie „Erstmeldung": Ein Schwall
	   von fünf Meldungen einer unbekannten Adresse ist genau der Fall, den die
	   Triage sehen muss. Offen zählt trotzdem nirgends negativ. */
	it('unterscheidet unbearbeitete Vorgeschichte von der Erstmeldung', () => {
		expect(getReporterLevel(historie({ open: 4 }))).toBe('pending');
	});

	it('steigt bei 3 Freigaben auf „known" und bei 10 auf „established"', () => {
		expect(getReporterLevel(historie({ approved: REPORTER_KNOWN_THRESHOLD - 1 }))).toBe('new');
		expect(getReporterLevel(historie({ approved: REPORTER_KNOWN_THRESHOLD }))).toBe('known');
		expect(getReporterLevel(historie({ approved: REPORTER_ESTABLISHED_THRESHOLD - 1 }))).toBe(
			'known'
		);
		expect(getReporterLevel(historie({ approved: REPORTER_ESTABLISHED_THRESHOLD }))).toBe(
			'established'
		);
	});

	/* Der Fall oben prüft nur die Ordnung der Schwellen (Konstante - 1 / Konstante) —
	   er bliebe grün, wenn jemand REPORTER_KNOWN_THRESHOLD versehentlich auf 5 setzt.
	   Dieser Fall nagelt stattdessen die tatsächlichen Produktentscheidungs-Werte fest,
	   damit eine verschobene Konstante hier sichtbar bricht und nicht erst beim nächsten
	   Umbau unbemerkt durchrutscht. */
	it('legt die Schwellenwerte selbst fest — nicht nur ihre Ordnung', () => {
		expect(REPORTER_KNOWN_THRESHOLD).toBe(3);
		expect(REPORTER_ESTABLISHED_THRESHOLD).toBe(10);
		expect(REPORTER_FLAGGED_RATIO).toBe(1 / 3);
	});

	/* Eine einzelne Ablehnung unter vielen Freigaben ist kein Warnsignal —
	   sonst trüge jeder langjährige Melder nach einem Fehlgriff dauerhaft ein
	   gelbes Badge. Ausschlaggebend ist der Anteil, nicht das Vorkommen. */
	it('warnt erst ab einem Drittel abgelehnter Meldungen', () => {
		expect(getReporterLevel(historie({ approved: 29, rejected: 1 }))).toBe('established');
		/* Nächstliegender realistischer Wert unterhalb der Schwelle (1/4 = 0,25 < 1/3):
		   deckt die Richtung ab, die 29/1, 2/1 und 0/1 offenlassen — mit
		   REPORTER_FLAGGED_RATIO = 1/4 bliebe sonst jeder Fixture-Wert grün. */
		expect(getReporterLevel(historie({ approved: 3, rejected: 1 }))).toBe('known');
		expect(getReporterLevel(historie({ approved: 2, rejected: 1 }))).toBe('flagged');
		expect(getReporterLevel(historie({ approved: 0, rejected: 1 }))).toBe('flagged');
	});

	/* Offene Meldungen gehen in den Anteil nicht ein: Bis 2026-08 gab es die
	   Ablehnung gar nicht, unbearbeitete Altmeldungen sind Bearbeitungsstau.
	   1 von 3 bearbeiteten Meldungen liegt genau an der Drittel-Schwelle und
	   ergibt `flagged` — zählten die 40 offenen mit, läge der Anteil bei 1/43
	   und der Test schlüge fehl. */
	it('rechnet offene Meldungen nicht in den Anteil ein', () => {
		expect(getReporterLevel(historie({ approved: 2, rejected: 1, open: 40 }))).toBe('flagged');
	});
});

describe('reporterBadgeText', () => {
	it('nennt die Zahl, auf die es je Stufe ankommt', () => {
		expect(reporterBadgeText('first', historie())).toBe('Erstmeldung');
		expect(reporterBadgeText('pending', historie({ open: 4 }))).toBe('Melder: 4 offen');
		expect(reporterBadgeText('new', historie({ approved: 2 }))).toBe('Melder: 2 freigegeben');
		expect(reporterBadgeText('known', historie({ approved: 5 }))).toBe('Melder: 5 freigegeben');
		expect(reporterBadgeText('established', historie({ approved: 23 }))).toBe(
			'Melder: 23 freigegeben'
		);
		expect(reporterBadgeText('flagged', historie({ approved: 2, rejected: 2 }))).toBe(
			'Melder: 2 von 4 abgelehnt'
		);
	});
});

describe('REPORTER_LEVEL_PRESENTATION', () => {
	/* Die Farbwahl ist eine Produktentscheidung (Jan, 2026-08-10) und steht
	   deshalb als Test da. Die Leiter läuft von „nichts bekannt" zu „bewährt":
	   dunkelgrau, hellgrau, zweimal blassgrün, grün — plus Gelb als Warnung.

	   `new` und `known` teilen sich bewusst dieselbe Fläche: Drei
	   unterscheidbare Grüntöne gibt das Theme nicht her, und die Zahl im Text
	   trennt sie ohnehin („2 freigegeben" gegen „5 freigegeben"). */
	it('bildet eine Leiter von neutral über blassgrün nach grün', () => {
		expect(REPORTER_LEVEL_PRESENTATION.first.badgeClass).toBe('badge-neutral');
		expect(REPORTER_LEVEL_PRESENTATION.pending.badgeClass).toBe('badge-ghost');
		expect(REPORTER_LEVEL_PRESENTATION.new.badgeClass).toBe('badge-soft badge-success');
		expect(REPORTER_LEVEL_PRESENTATION.known.badgeClass).toBe('badge-soft badge-success');
		expect(REPORTER_LEVEL_PRESENTATION.established.badgeClass).toBe('badge-success');
		expect(REPORTER_LEVEL_PRESENTATION.flagged.badgeClass).toBe('badge-warning');
	});

	/* `badge-soft` färbt bei DaisyUI den *Text* in der Statusfarbe — auf diesem
	   Theme 3,81:1 für Grün und damit unter WCAG 1.4.3. Der Override in
	   `src/app.css` zieht ihn auf `base-content`. Wer die Klasse hier verwendet,
	   verlässt sich darauf; der Test hält die Abhängigkeit fest, damit ein
	   entfernter Override nicht nur optisch auffällt. */
	it('nutzt badge-soft nur zusammen mit dem Kontrast-Override aus app.css', async () => {
		const appCss = await readFile('src/app.css', 'utf-8');
		const nutztSoft = Object.values(REPORTER_LEVEL_PRESENTATION).some((p) =>
			p.badgeClass.includes('badge-soft')
		);

		if (nutztSoft) {
			expect(appCss).toMatch(/\.badge-soft\s*\{[^}]*color:\s*var\(--color-base-content\)/);
		}
	});

	it('gibt jeder Stufe ein Icon — Farbe trägt die Bedeutung nicht allein', () => {
		for (const presentation of Object.values(REPORTER_LEVEL_PRESENTATION)) {
			expect(presentation.icon).toMatch(/^lucide:/);
			expect(presentation.description.length).toBeGreaterThan(0);
		}
	});
});
