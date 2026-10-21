import { describe, expect, it, vi } from 'vitest';
import type { SightingStatusLogEntry } from '#lib/components/admin/sightingStatusLog.ts';
import { load } from './+page';

/**
 * @fileoverview Der Lade-Fallback der Status-Historie muss unterscheidbar sein.
 *
 * **Warum dieser Test existiert.** Der `load` fängt jeden Fehler ab, damit ein
 * Ausfall der Historie nicht die ganze Detailansicht kostet. Genau dabei
 * entsteht die Falle: Fällt er stumm auf `[]` zurück, rendert die Zeitleiste
 * den Altbestands-Satz („Die Aufzeichnung beginnt mit der Einführung…") — eine
 * Tatsachenbehauptung über einen Datensatz, der sehr wohl Einträge haben kann.
 * Das ist derselbe Fehlermodus, gegen den das Feature antritt: Eine Zeitleiste
 * mit Lücke sieht vollständig aus und ist es nicht.
 *
 * Der Unterschied zwischen „leer" und „unbekannt" hängt damit an einem
 * einzigen Flag, und der E2E-Test deckt nur den Erfolgsfall ab.
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
		statusLog: SightingStatusLogEntry[];
		statusLogFailed: boolean;
	};

describe('load der Status-Historie', () => {
	it('reicht die Einträge des Endpunkts durch', async () => {
		const eintraege = [
			{ id: 1, verdict: 'approve', editor: 'a@example.com', recordedAt: '2026-08-01T10:00:00Z' }
		];

		const result = await laden(antwort({ history: eintraege }));

		expect(result).toEqual(
			expect.objectContaining({ statusLog: eintraege, statusLogFailed: false })
		);
	});

	it('meldet einen leeren Altbestand als Erfolg, nicht als Fehler', async () => {
		const result = await laden(antwort({ history: [] }));

		expect(result).toEqual(expect.objectContaining({ statusLog: [], statusLogFailed: false }));
	});

	it('kennzeichnet eine Fehlerantwort als Fehlschlag', async () => {
		const result = await laden(antwort({}, false));

		expect(result.statusLogFailed).toBe(true);
		expect(result.statusLog).toEqual([]);
	});

	it('kennzeichnet einen Netzwerkfehler als Fehlschlag', async () => {
		const kaputt = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

		const result = await laden(kaputt);

		expect(result.statusLogFailed).toBe(true);
		expect(result.statusLog).toEqual([]);
	});

	/* Eine Antwort ohne `history` ist ein Vertragsbruch des Endpunkts, kein
	   Altbestand — sie darf nicht als „nie bearbeitet" durchgehen. */
	it('behandelt eine Antwort ohne history-Feld als Fehlschlag', async () => {
		const result = await laden(antwort({ id: 42, verified: 1 }));

		expect(result.statusLogFailed).toBe(true);
		expect(result.statusLog).toEqual([]);
	});
});
