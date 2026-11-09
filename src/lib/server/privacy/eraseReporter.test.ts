/**
 * Löschersuchen (Art. 17 DSGVO) über eine genannte Adresse.
 *
 * Die Treffer werden sofort anonymisiert und verlieren den Hash. Nur den Hash
 * zu leeren reichte nicht: Solange die Adresse da ist, rechnet der Backfill ihn
 * beim nächsten Lauf neu aus. Anonymisierte Zeilen nimmt er dagegen aus
 * (docs/ANONYMISIERUNG_KONZEPT.md, 6.2).
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'k'.repeat(32);

const { mockEnv, selectRows, countRows, updateSets, updateWheres, transaction } = vi.hoisted(
	() => ({
		mockEnv: {} as { REPORTER_HASH_KEY?: string },
		selectRows: vi.fn(
			(): Array<{ id: number; nameConsent: number; shipNameConsent: number }> => []
		),
		countRows: vi.fn((): Array<{ matched: number; alreadyAnonymized: number }> => []),
		updateSets: [] as Array<Record<string, unknown>>,
		updateWheres: [] as unknown[],
		transaction: vi.fn()
	})
);

let matchWhere: SQL | undefined;

vi.mock('#lib/server/env.ts', () => ({ env: mockEnv }));
vi.mock('#lib/server/db/index.ts', () => {
	const tx = {
		select: () => ({
			from: () => ({
				where: (condition: SQL) => {
					matchWhere = condition;
					return { for: () => Promise.resolve(selectRows()) };
				}
			})
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => {
				updateSets.push(values);
				return {
					where: (condition: unknown) => {
						updateWheres.push(condition);
						return {
							returning: () => Promise.resolve(selectRows().map((row) => ({ id: row.id })))
						};
					}
				};
			}
		})
	};
	transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) =>
		callback(tx)
	);
	return {
		db: {
			select: () => ({
				from: () => ({
					where: (condition: SQL) => {
						matchWhere = condition;
						return Promise.resolve(countRows());
					}
				})
			}),
			transaction
		}
	};
});

import { computeReporterHash } from './reporterHash';
import { ReporterHashKeyMissingError } from './hashReporters';
import { eraseReporter, InvalidErasureAddressError } from './eraseReporter';

const NOW = new Date('2026-11-09T12:00:00Z');
const render = (value: unknown) => new PgDialect().sqlToQuery(value as SQL);

describe('eraseReporter', () => {
	beforeEach(() => {
		mockEnv.REPORTER_HASH_KEY = KEY;
		matchWhere = undefined;
		updateSets.length = 0;
		updateWheres.length = 0;
		transaction.mockClear();
		selectRows.mockReset();
		selectRows.mockReturnValue([]);
		countRows.mockReset();
		countRows.mockReturnValue([{ matched: 3, alreadyAnonymized: 1 }]);
	});

	it('bricht ohne Schlüssel ab, bevor es etwas liest', async () => {
		// Ohne Schlüssel fände die Suche nur Meldungen, deren Adresse noch da
		// ist — die anonymisierten derselben Person blieben verknüpft.
		delete mockEnv.REPORTER_HASH_KEY;

		await expect(eraseReporter({ email: 'a@example.invalid', now: NOW })).rejects.toBeInstanceOf(
			ReporterHashKeyMissingError
		);
		expect(matchWhere).toBeUndefined();
	});

	it('weist eine leere Adresse ab', async () => {
		await expect(eraseReporter({ email: ' \t ', now: NOW })).rejects.toBeInstanceOf(
			InvalidErasureAddressError
		);
	});

	it('findet über den Hash und über die noch vorhandene Adresse, normalisiert', async () => {
		await eraseReporter({ email: ' Erika@Example.invalid ', now: NOW });

		const { sql, params } = render(matchWhere);
		expect(sql).toContain('"sichtungen"."melder_hash" = $1');
		expect(params[0]).toBe(computeReporterHash('erika@example.invalid', KEY));
		expect(params).toContain('erika@example.invalid');
		expect(sql).toMatch(/lower\(btrim\("sichtungen"\."email"/i);
	});

	it('zeigt in der Vorschau nur Zahlen und ändert nichts', async () => {
		const report = await eraseReporter({ email: 'a@example.invalid', now: NOW });

		expect(report).toEqual({ mode: 'preview', matched: 3, alreadyAnonymized: 1, erased: 0 });
		expect(transaction).not.toHaveBeenCalled();
	});

	it('anonymisiert die Treffer sofort und leert den Hash', async () => {
		selectRows.mockReturnValue([
			{ id: 1, nameConsent: 0, shipNameConsent: 0 },
			{ id: 2, nameConsent: 0, shipNameConsent: 0 }
		]);

		const report = await eraseReporter({ email: 'a@example.invalid', now: NOW, mode: 'execute' });

		expect(report).toMatchObject({ mode: 'execute', erased: 2 });
		expect(updateSets).toHaveLength(1);
		expect(updateSets[0]).toMatchObject({
			email: null,
			firstName: null,
			shipName: null,
			reporterHash: null
		});
		// Wer schon anonymisiert war, behält das ursprüngliche Datum.
		expect(render(updateSets[0]!.anonymizedAt).sql).toBe(
			'COALESCE("sichtungen"."anonymisiert_am", $1)'
		);
	});

	it('wendet die Feld-Matrix je Einwilligungslage an', async () => {
		selectRows.mockReturnValue([
			{ id: 1, nameConsent: 0, shipNameConsent: 0 },
			{ id: 2, nameConsent: 1, shipNameConsent: 1 }
		]);

		await eraseReporter({ email: 'a@example.invalid', now: NOW, mode: 'execute' });

		expect(updateSets).toHaveLength(2);
		expect(updateSets[1]).not.toHaveProperty('firstName');
		expect(updateSets[1]).toMatchObject({ email: null, reporterHash: null });
	});
});
