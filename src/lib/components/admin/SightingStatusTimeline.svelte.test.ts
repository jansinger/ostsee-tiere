import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import SightingStatusTimeline from './SightingStatusTimeline.svelte';
import type { SightingStatusLogEntry } from './sightingStatusLog';

const eintrag = (
	id: number,
	verdict: SightingStatusLogEntry['verdict'],
	recordedAt: string,
	editor: string | null = 'pruefer@example.com'
): SightingStatusLogEntry => ({ id, verdict, editor, recordedAt });

describe('SightingStatusTimeline', () => {
	it('zeigt jeden Eintrag mit dem Wort des Zustands, den er hergestellt hat', async () => {
		const screen = await render(SightingStatusTimeline, {
			entries: [
				eintrag(1, 'reject', '2026-08-01T10:00:00Z'),
				eintrag(2, 'approve', '2026-08-02T10:00:00Z')
			]
		});

		await expect.element(screen.getByText('Abgelehnt')).toBeVisible();
		await expect.element(screen.getByText('Freigegeben')).toBeVisible();
	});

	it('nennt den Bearbeiter, wenn einer bekannt ist', async () => {
		const screen = await render(SightingStatusTimeline, {
			entries: [eintrag(1, 'approve', '2026-08-02T10:00:00Z', 'anna@example.com')]
		});

		await expect.element(screen.getByText(/anna@example\.com/)).toBeVisible();
	});

	/* Kein „durch null": Ohne angemeldete Identität bleibt `bearbeiter` NULL —
	   dieselbe Lage wie beim Altbestand in `freigegeben_von`. Ein Platzhalter
	   behauptete eine Person, die es nie gab. */
	it('behauptet ohne bekannten Bearbeiter keine Person', async () => {
		const screen = await render(SightingStatusTimeline, {
			entries: [eintrag(1, 'approve', '2026-08-02T10:00:00Z', null)]
		});

		await expect.element(screen.getByText(/null|undefined/)).not.toBeInTheDocument();
	});

	/* Die Aufzeichnung beginnt mit der Tabelle, nicht mit der Sichtung. Ohne
	   diesen Hinweis liest sich eine leere Liste als „nie bearbeitet" — falsch
	   für 19.262 Freigaben aus dem Altsystem. */
	it('erklärt eine leere Historie, statt sie wortlos zu zeigen', async () => {
		const screen = await render(SightingStatusTimeline, { entries: [] });

		await expect.element(screen.getByText(/Aufzeichnung/)).toBeVisible();
	});

	/* Der wichtigste Fall des Bauteils. Fällt das Laden aus, ist die leere Liste
	   nicht dieselbe Aussage wie „Altbestand": Sie behauptete, es habe keine
	   Entscheidungen gegeben, während in Wahrheit unbekannt ist, ob es welche
	   gab. Genau der Fehlermodus, gegen den das Feature selbst antritt — eine
	   Zeitleiste mit Lücke sieht vollständig aus und ist es nicht. */
	it('unterscheidet einen Ladefehler von einer leeren Historie', async () => {
		const screen = await render(SightingStatusTimeline, { entries: [], failed: true });

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect.element(screen.getByText(/konnte nicht geladen/)).toBeVisible();
		await expect.element(screen.getByText(/Aufzeichnung beginnt/)).not.toBeInTheDocument();
	});

	it('ist eine Liste — Screenreader melden die Anzahl der Einträge', async () => {
		const screen = await render(SightingStatusTimeline, {
			entries: [
				eintrag(1, 'approve', '2026-08-01T10:00:00Z'),
				eintrag(2, 'reset', '2026-08-02T10:00:00Z')
			]
		});

		await expect.element(screen.getByRole('list')).toBeInTheDocument();
		expect(screen.getByRole('listitem').elements()).toHaveLength(2);
	});

	/* Ohne den Eintrag liest sich die leere Kontakt-Karte wie eine Meldung ohne
	   Kontaktangaben. Der Zeitpunkt kommt aus der Zeile, nicht aus dem Log. */
	describe('Anonymisierung', () => {
		it('zeigt sie als eigenen Eintrag mit Datum, ohne Bearbeiter', async () => {
			const screen = await render(SightingStatusTimeline, {
				entries: [eintrag(1, 'approve', '2026-08-01T10:00:00Z', 'anna@example.com')],
				anonymizedAt: '2026-11-09T03:15:00Z'
			});

			await expect.element(screen.getByText('Kontaktdaten anonymisiert')).toBeVisible();
			expect(screen.getByRole('listitem').elements()).toHaveLength(2);
			expect(screen.getByText(/durch/).elements()).toHaveLength(1);
		});

		it('steht beim Altbestand neben dem Hinweis, dass Entscheidungen fehlen', async () => {
			const screen = await render(SightingStatusTimeline, {
				entries: [],
				anonymizedAt: '2026-11-09T03:15:00Z'
			});

			await expect.element(screen.getByText('Kontaktdaten anonymisiert')).toBeVisible();
			await expect.element(screen.getByText(/Aufzeichnung beginnt/)).toBeVisible();
		});

		it('bleibt sichtbar, wenn die Entscheidungen nicht geladen werden konnten', async () => {
			// Die Anonymisierung kommt aus der Zeile selbst — der Ladefehler betrifft sie nicht.
			const screen = await render(SightingStatusTimeline, {
				entries: [],
				failed: true,
				anonymizedAt: '2026-11-09T03:15:00Z'
			});

			await expect.element(screen.getByRole('alert')).toBeVisible();
			await expect.element(screen.getByText('Kontaktdaten anonymisiert')).toBeVisible();
		});
	});
});
