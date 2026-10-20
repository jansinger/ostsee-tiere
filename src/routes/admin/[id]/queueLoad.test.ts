/**
 * @fileoverview Laden der Warteschlange in der Detailansicht.
 *
 * Drei Zusagen:
 *
 * 1. Ohne `?from=inbox` wird gar nicht erst gefragt — aus der Tabelle heraus
 *    gibt es keine Warteschlange.
 * 2. Ein Fehlschlag ist nicht dasselbe wie ein leerer Stapel. Beides sähe im
 *    DOM gleich aus, deshalb `queueFailed` als dritter Fall — dieselbe
 *    Konstruktion wie beim Status-Log.
 * 3. Eine Antwort ohne `total` zählt als Fehlschlag und nicht als leerer
 *    Stapel: Sie ist ein Vertragsbruch des Endpunkts.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SightingQueue } from '#lib/components/admin/sightingQueue.ts';
import type { SightingStatusLogEntry } from '#lib/components/admin/sightingStatusLog.ts';
import { load } from './+page';

const QUEUE_BODY = {
	prev: null,
	next: { id: 501, referenceId: 'REF-501' },
	position: 1,
	total: 653
};

/** Der Rückgabetyp von `PageLoad` weitet auf `void | Record<string, any>` —
 *  die Zusicherung holt die Felder zurück, um die es in diesen Tests geht. */
interface LadeErgebnis {
	statusLog: SightingStatusLogEntry[];
	statusLogFailed: boolean;
	queue: SightingQueue | null;
	queueFailed: boolean;
	queueOrder: 'asc' | 'desc';
}

function fetchMock(routen: Record<string, { ok: boolean; body?: unknown }>) {
	return vi.fn(async (pfad: string) => {
		const treffer = Object.entries(routen).find(([teil]) => pfad.includes(teil));
		const antwort = treffer?.[1] ?? { ok: false };
		return {
			ok: antwort.ok,
			json: async () => antwort.body ?? {}
		} as Response;
	});
}

async function ladeDetail(
	suche: string,
	routen: Record<string, { ok: boolean; body?: unknown }>
): Promise<LadeErgebnis> {
	return (await load({
		params: { id: '500' },
		url: new URL(`https://localhost:4000/admin/500${suche}`),
		fetch: fetchMock(routen)
	} as any)) as unknown as LadeErgebnis;
}

describe('Warteschlange im Detail-Load', () => {
	it('fragt aus der Tabelle heraus gar nicht erst', async () => {
		const routen = { '/verify': { ok: true, body: { history: [] } } };
		const daten = await ladeDetail('?verified=open&page=2', routen);

		expect(daten.queue).toBeNull();
		expect(daten.queueFailed).toBe(false);
	});

	it('lädt die Warteschlange bei from=inbox', async () => {
		const routen = {
			'/verify': { ok: true, body: { history: [] } },
			'/queue': { ok: true, body: QUEUE_BODY }
		};
		const fetchSpy = fetchMock(routen);
		const daten = (await load({
			params: { id: '500' },
			url: new URL('https://localhost:4000/admin/500?from=inbox&order=asc'),
			fetch: fetchSpy
		} as any)) as unknown as LadeErgebnis;

		expect(daten.queue).toEqual(QUEUE_BODY);
		expect(daten.queueFailed).toBe(false);
		expect(daten.queueOrder).toBe('asc');
		// Wächter gegen genau die Lücke, die Fix 1 offen ließ: der `fetchMock`
		// oben matcht nur den Substring `/queue` — eine Fassung, die `order`
		// hartcodiert oder weglässt, bliebe ohne diese Zusicherung grün, weil
		// `queueOrder` im Ergebnis unabhängig von der aufgerufenen URL aus
		// `url.searchParams` stammt.
		expect(fetchSpy).toHaveBeenCalledWith('/api/sightings/500/queue?order=asc');
	});

	it('meldet einen Fehlschlag als unbekannt, nicht als leeren Stapel', async () => {
		const daten = await ladeDetail('?from=inbox', {
			'/verify': { ok: true, body: { history: [] } },
			'/queue': { ok: false }
		});

		expect(daten.queue).toBeNull();
		expect(daten.queueFailed).toBe(true);
	});

	it('kennzeichnet einen Netzwerkfehler der Warteschlange als Fehlschlag', async () => {
		// Gegenstück zum Netzwerkfehler-Test der Status-Historie
		// (statusLogLoad.test.ts): `queueFailed` trägt hier zusätzlich den
		// Auto-Advance — ein Reject darf nicht als „Stapel leer" durchgehen.
		const fetchSpy = vi.fn(async (pfad: string) => {
			if (pfad.includes('/verify')) {
				return { ok: true, json: async () => ({ history: [] }) } as Response;
			}
			throw new Error('offline');
		});

		const daten = (await load({
			params: { id: '500' },
			url: new URL('https://localhost:4000/admin/500?from=inbox'),
			fetch: fetchSpy
		} as any)) as unknown as LadeErgebnis;

		expect(daten.queue).toBeNull();
		expect(daten.queueFailed).toBe(true);
	});

	it('fällt bei fehlendem order-Parameter auf desc zurück', async () => {
		const daten = await ladeDetail('?from=inbox', {
			'/verify': { ok: true, body: { history: [] } },
			'/queue': { ok: true, body: QUEUE_BODY }
		});

		expect(daten.queueOrder).toBe('desc');
	});

	it('fällt bei unbekanntem order-Wert auf desc zurück', async () => {
		const daten = await ladeDetail('?from=inbox&order=huch', {
			'/verify': { ok: true, body: { history: [] } },
			'/queue': { ok: true, body: QUEUE_BODY }
		});

		expect(daten.queueOrder).toBe('desc');
	});

	it('wertet eine Antwort ohne total als Vertragsbruch', async () => {
		const daten = await ladeDetail('?from=inbox', {
			'/verify': { ok: true, body: { history: [] } },
			'/queue': { ok: true, body: { prev: null, next: null } }
		});

		expect(daten.queueFailed).toBe(true);
	});

	it('lässt die Sichtung lesbar, wenn nur die Warteschlange fehlschlägt', async () => {
		const daten = await ladeDetail('?from=inbox', {
			'/verify': { ok: true, body: { history: [{ id: 1 }] } },
			'/queue': { ok: false }
		});

		expect(daten.statusLog).toHaveLength(1);
		expect(daten.statusLogFailed).toBe(false);
	});
});
