/**
 * Freischaltung und letzter Lauf des Anonymisierungs-Jobs in `app_config`.
 *
 * Die Freischaltung ist die technische Sperre vor dem ersten, nicht
 * umkehrbaren Lauf: einmal gesetzt, nie überschrieben
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, „Freigabe des ersten Laufs").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectRows, insertCalls, conflictTargets, insertReturning, upsertSets } = vi.hoisted(
	() => ({
		selectRows: vi.fn((): Array<{ value: unknown }> => []),
		insertCalls: [] as Array<Record<string, unknown>>,
		conflictTargets: [] as string[],
		insertReturning: vi.fn((): Array<{ id: number }> => [{ id: 1 }]),
		upsertSets: [] as Array<Record<string, unknown>>
	})
);

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: () => Promise.resolve(selectRows()) }) })
		}),
		insert: () => ({
			values: (values: Record<string, unknown>) => {
				insertCalls.push(values);
				return {
					onConflictDoNothing: () => {
						conflictTargets.push('nothing');
						return { returning: () => Promise.resolve(insertReturning()) };
					},
					onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
						conflictTargets.push('update');
						upsertSets.push(config.set);
						return Promise.resolve();
					}
				};
			}
		})
	}
}));

import {
	ACTIVATED_AT_KEY,
	activateAnonymization,
	getActivatedAt,
	getLastRun,
	LAST_RUN_KEY,
	recordLastRun
} from './anonymizationState';

describe('anonymizationState', () => {
	beforeEach(() => {
		insertCalls.length = 0;
		conflictTargets.length = 0;
		upsertSets.length = 0;
		selectRows.mockReset();
		selectRows.mockReturnValue([]);
		insertReturning.mockReset();
		insertReturning.mockReturnValue([{ id: 1 }]);
	});

	it('ist ohne Eintrag nicht freigeschaltet', async () => {
		expect(await getActivatedAt()).toBeNull();
	});

	it('liest den gespeicherten Zeitpunkt der Freischaltung', async () => {
		selectRows.mockReturnValue([{ value: { at: '2026-11-01T10:00:00.000Z', by: 'x', due: 5 } }]);

		expect(await getActivatedAt()).toEqual(new Date('2026-11-01T10:00:00.000Z'));
	});

	it('hält einen unlesbaren Eintrag für nicht freigeschaltet', async () => {
		// Lieber kein Lauf als einer auf Grundlage eines kaputten Werts.
		selectRows.mockReturnValue([{ value: 'irgendwas' }]);

		expect(await getActivatedAt()).toBeNull();
	});

	it('schaltet einmal frei und hält fest, wer bei welcher Anzahl', async () => {
		const at = new Date('2026-11-09T09:00:00Z');

		const result = await activateAnonymization({ by: 'admin-sub', confirmedDue: 19873, now: at });

		expect(result).toEqual({ activated: true });
		expect(insertCalls[0]).toMatchObject({
			key: ACTIVATED_AT_KEY,
			value: { at: at.toISOString(), by: 'admin-sub', confirmedDue: 19873 },
			updatedBy: 'admin-sub'
		});
		expect(conflictTargets).toEqual(['nothing']);
	});

	it('überschreibt eine bestehende Freischaltung nie', async () => {
		insertReturning.mockReturnValue([]);

		const result = await activateAnonymization({
			by: 'admin-sub',
			confirmedDue: 1,
			now: new Date()
		});

		expect(result).toEqual({ activated: false });
		expect(conflictTargets).toEqual(['nothing']);
	});

	it('schreibt den letzten Lauf als Upsert', async () => {
		const run = {
			at: '2026-11-09T03:15:00.000Z',
			trigger: 'token' as const,
			skipped: null,
			hashed: 0,
			anonymized: 4,
			remaining: 0
		};

		await recordLastRun(run);

		expect(insertCalls[0]).toMatchObject({ key: LAST_RUN_KEY, value: run });
		expect(upsertSets[0]).toMatchObject({ value: run });
	});

	it('liest den letzten Lauf zurück', async () => {
		const run = { at: '2026-11-09T03:15:00.000Z', anonymized: 4 };
		selectRows.mockReturnValue([{ value: run }]);

		expect(await getLastRun()).toEqual(run);
	});
});
