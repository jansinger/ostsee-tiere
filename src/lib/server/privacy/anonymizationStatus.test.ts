/**
 * Status der Anonymisierung für Hinweisleiste und Einstellungs-Panel.
 *
 * Fasst Freischaltung, letzten Lauf, Überfällige und die offene
 * Spam-Nachbewertung (Vorbedingung der Freigabe) zusammen und bewertet sie
 * mit derselben Ampel wie die Oberfläche.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { counts, wheres, getActivatedAt, getLastRun } = vi.hoisted(() => ({
	counts: [] as number[],
	wheres: [] as unknown[],
	getActivatedAt: vi.fn(),
	getLastRun: vi.fn()
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					wheres.push(condition);
					return Promise.resolve([{ count: counts.shift() ?? 0 }]);
				}
			})
		})
	}
}));
vi.mock('./anonymizationState', () => ({ getActivatedAt, getLastRun }));

import { getAnonymizationStatus, loadAnonymizationBanner } from './anonymizationStatus';

const NOW = new Date('2026-11-20T10:00:00Z');
const render = (value: unknown): string => new PgDialect().sqlToQuery(value as SQL).sql;

describe('getAnonymizationStatus', () => {
	beforeEach(() => {
		counts.length = 0;
		wheres.length = 0;
		getActivatedAt.mockResolvedValue(null);
		getLastRun.mockResolvedValue(null);
	});

	it('ist vor der Freischaltung inaktiv und nennt die Vorbedingungen', async () => {
		counts.push(19873, 4);

		const status = await getAnonymizationStatus(NOW);

		expect(status).toEqual({
			activatedAt: null,
			lastRun: null,
			overdue: 19873,
			unscoredSpam: 4,
			health: { level: 'inactive', reasons: [] }
		});
	});

	it('zählt Überfällige und unbewertete, nicht anonymisierte Meldungen', async () => {
		await getAnonymizationStatus(NOW);

		expect(render(wheres[0])).toContain(`+ INTERVAL '3 months' <= (NOW() AT TIME ZONE 'UTC')`);
		expect(render(wheres[1])).toContain('"sichtungen"."spam_score" is null');
		expect(render(wheres[1])).toContain('"sichtungen"."anonymisiert_am" is null');
	});

	it('ist rot, wenn nach der Freischaltung Meldungen über der Frist liegen', async () => {
		getActivatedAt.mockResolvedValue(new Date('2026-11-10T10:00:00Z'));
		getLastRun.mockResolvedValue({
			at: '2026-11-20T03:15:00.000Z',
			trigger: 'token',
			skipped: null,
			hashed: 0,
			anonymized: 3,
			remaining: 0
		});
		counts.push(2, 0);

		const status = await getAnonymizationStatus(NOW);

		expect(status.activatedAt).toBe('2026-11-10T10:00:00.000Z');
		expect(status.health).toEqual({ level: 'alert', reasons: ['overdue'] });
	});
});

describe('loadAnonymizationBanner', () => {
	beforeEach(() => {
		counts.length = 0;
		getActivatedAt.mockResolvedValue(new Date('2026-11-10T10:00:00Z'));
		getLastRun.mockResolvedValue({ at: '2026-11-20T03:15:00.000Z' });
	});

	it('liefert nur Ampel, Gründe und die Zahl der Überfälligen', async () => {
		counts.push(2, 7);

		expect(await loadAnonymizationBanner(NOW)).toEqual({
			level: 'alert',
			reasons: ['overdue'],
			overdue: 2
		});
	});

	it('bleibt still, wenn die Abfrage scheitert — der Admin-Bereich bleibt erreichbar', async () => {
		getActivatedAt.mockRejectedValue(new Error('DB weg'));

		expect(await loadAnonymizationBanner(NOW)).toBeNull();
	});
});
