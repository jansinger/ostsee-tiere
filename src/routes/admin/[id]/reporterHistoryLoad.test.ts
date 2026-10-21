import { describe, expect, it, vi } from 'vitest';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';
import { load } from './+page';

/**
 * @fileoverview Der Lade-Fallback der Melder-Historie muss die drei Zustände
 * auseinanderhalten.
 *
 * **Warum dieser Test existiert.** `ladeMelderHistorie` prüft seit Commit
 * `b0a81d7d` die Gestalt von `history`, bevor sie durchgereicht wird — und
 * genau diese Prüfung war ungetestet. Ohne sie fiele ein kaputtes `history`
 * (ein Nicht-Objekt wie `"kaputt"`, oder ein Objekt ohne die Zählfelder) in
 * `getReporterLevel` auf `undefined`-Vergleiche zurück und läge auf der Stufe
 * `'first'` — die Oberfläche behauptete dann „Erstmeldung", wo tatsächlich ein
 * Vertragsbruch des Endpunkts vorliegt. Das ist dieselbe Verwechslung, gegen
 * die das ganze Feature antritt: ein Fehlschlag, der wie ein Befund aussieht.
 *
 * Die drei Zustände bleiben nur unterscheidbar, solange `{ history: null }`
 * (nicht ermittelbar, kein Fehler) und ein echtes Nullaggregat (kein
 * Vorgeschichte, aber ein gültiger Befund) beide durchkommen, während jede
 * andere Abweichung von der zugesagten Gestalt als Fehlschlag markiert wird.
 */

/** Minimaler Load-Event — mehr liest die Funktion nicht. */
const ladeEvent = (fetchImpl: typeof fetch) =>
	({
		params: { id: '42' },
		fetch: fetchImpl,
		url: new URL('https://localhost:4000/admin/42')
	}) as unknown as Parameters<typeof load>[0];

const antwort = (body: unknown, ok = true) =>
	vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }) as unknown as typeof fetch;

/* SvelteKits `PageLoad` weitet den Rückgabetyp auf `void | Record<string, any>`
   — die Zusicherung holt die zwei Felder zurück, um die es hier geht. */
const laden = async (fetchImpl: typeof fetch) =>
	(await load(ladeEvent(fetchImpl))) as unknown as {
		reporterHistory: ReporterHistory | null;
		reporterHistoryFailed: boolean;
	};

describe('load der Melder-Historie', () => {
	it('reicht eine gültige Historie durch', async () => {
		const historie: ReporterHistory = {
			approved: 3,
			rejected: 1,
			open: 2,
			since: '2025-01-01T00:00:00Z'
		};

		const result = await laden(antwort({ history: historie }));

		expect(result).toEqual(
			expect.objectContaining({ reporterHistory: historie, reporterHistoryFailed: false })
		);
	});

	/* Der Endpunkt sagt `history: null` ausdrücklich als „nicht ermittelbar"
	   zu (keine Adresse hinterlegt, oder die Abfrage ist fail-open gescheitert)
	   — das ist kein Fehlschlag der Ladefunktion. */
	it('behandelt history: null als nicht ermittelbar, nicht als Fehlschlag', async () => {
		const result = await laden(antwort({ history: null }));

		expect(result).toEqual(
			expect.objectContaining({ reporterHistory: null, reporterHistoryFailed: false })
		);
	});

	/* Eine Antwort ohne `history` ist ein Vertragsbruch des Endpunkts, kein
	   Altbestand — sie darf nicht als „nicht ermittelbar" durchgehen. */
	it('behandelt eine Antwort ohne history-Feld als Fehlschlag', async () => {
		const result = await laden(antwort({ id: 42 }));

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	it('behandelt ein history in falscher Gestalt (Nicht-Objekt) als Fehlschlag', async () => {
		const result = await laden(antwort({ history: 'kaputt' }));

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	it('behandelt ein history-Objekt mit fehlendem Zählfeld als Fehlschlag', async () => {
		const result = await laden(antwort({ history: { approved: 1, rejected: 0 } }));

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	it('behandelt ein history-Objekt mit falschem Feldtyp als Fehlschlag', async () => {
		const result = await laden(
			antwort({ history: { approved: '1', rejected: 0, open: 0, since: null } })
		);

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	/* `static/openapi.yml` führt `since` als `required` (Typ `string`,
	   `nullable`). Ohne diese Prüfung passierte `{ approved: 0, rejected: 0,
	   open: 0 }` die Gestaltprüfung und landete als Stufe `'first'` in der
	   Oberfläche — ein Vertragsbruch, der als „Erstmeldung" durchgeht. Genau
	   die Verwechslung, gegen die die Prüfung antritt. */
	it('behandelt ein history-Objekt mit fehlendem since als Fehlschlag', async () => {
		const result = await laden(antwort({ history: { approved: 0, rejected: 0, open: 0 } }));

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	it('behandelt ein history-Objekt mit since in falschem Typ als Fehlschlag', async () => {
		const result = await laden(
			antwort({ history: { approved: 0, rejected: 0, open: 0, since: 12345 } })
		);

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	/* Die Gegenprobe zu den beiden Fällen oben: `since: null` ist ein
	   legitimer Wert (Sichtung ohne verwertbares Meldedatum), kein
	   Vertragsbruch — er muss durchkommen wie jede andere gültige Historie. */
	it('lässt since: null durch', async () => {
		const historie: ReporterHistory = { approved: 0, rejected: 0, open: 0, since: null };

		const result = await laden(antwort({ history: historie }));

		expect(result).toEqual(
			expect.objectContaining({ reporterHistory: historie, reporterHistoryFailed: false })
		);
	});

	it('kennzeichnet eine Fehlerantwort als Fehlschlag', async () => {
		const result = await laden(antwort({}, false));

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	it('kennzeichnet einen Netzwerkfehler als Fehlschlag', async () => {
		const kaputt = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

		const result = await laden(kaputt);

		expect(result.reporterHistoryFailed).toBe(true);
		expect(result.reporterHistory).toBeNull();
	});

	/* Die Gegenprobe zur Kernaussage: Ein echtes Nullaggregat ist ein
	   gültiger Befund („keine Vorgeschichte"), kein fehlender Befund — es muss
	   durchkommen wie jede andere gültige Historie. */
	it('lässt ein echtes Nullaggregat durch, ohne es als Fehlschlag zu werten', async () => {
		const nullaggregat: ReporterHistory = {
			approved: 0,
			rejected: 0,
			open: 0,
			since: '2026-08-10T00:00:00Z'
		};

		const result = await laden(antwort({ history: nullaggregat }));

		expect(result).toEqual(
			expect.objectContaining({ reporterHistory: nullaggregat, reporterHistoryFailed: false })
		);
	});
});
