/**
 * Unit Tests für configRepository.ts
 *
 * Fokus: In-Memory-Cache-Verhalten von `get()`, Kurzschluss bei fehlender
 * Datenbank, der bewusste Fehler-Vertrag von `set()` für unbekannte Keys,
 * Bulk-Operationen (`upsertMany`, `insertManyIfAbsent`) sowie die typisierten
 * Helper (`getString`/`getNumber`/`getBoolean`/`getObject`/`getArray`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, isDatabaseAvailable } from './index';
import { ConfigRepository, type ConfigItem } from './configRepository';

// Mock dependencies - siehe sightingRepository.test.ts für das Grundpattern.
// Hier zusätzlich isDatabaseAvailable und getDb, da configRepository beide nutzt.
// configRepository.ts importiert relativ aus './index' - daher wird hier
// derselbe Modulspezifizierer gemockt (kein zusätzlicher '#lib/server/db/index.ts'-Mock nötig).
vi.mock('./index', () => {
	const db: Record<string, any> = {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn()
	};
	return {
		db,
		getDb: vi.fn(() => db),
		isDatabaseAvailable: vi.fn(() => true)
	};
});

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

describe('ConfigRepository', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isDatabaseAvailable).mockReturnValue(true);
		vi.mocked(getDb).mockReturnValue(db as any);
		ConfigRepository.clearCache();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		ConfigRepository.clearCache();
	});

	describe('get', () => {
		it('gibt null zurück ohne DB-Query wenn die Datenbank nicht konfiguriert ist', async () => {
			vi.mocked(isDatabaseAvailable).mockReturnValue(false);
			const mockDb = db as any;

			const result = await ConfigRepository.get('some.key');

			expect(result).toBeNull();
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('lädt den Wert aus der Datenbank wenn kein Cache-Eintrag existiert', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ value: 'hello' }])
					})
				})
			});

			const result = await ConfigRepository.get('greeting');

			expect(result).toBe('hello');
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('gibt null zurück wenn der Key nicht existiert', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([])
					})
				})
			});

			const result = await ConfigRepository.get('missing.key');

			expect(result).toBeNull();
		});

		it('fragt innerhalb der Cache-TTL nicht erneut die Datenbank ab', async () => {
			vi.useFakeTimers();
			try {
				const mockDb = db as any;
				mockDb.select.mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ value: 'cached-value' }])
						})
					})
				});

				const first = await ConfigRepository.get('cached.key');
				expect(first).toBe('cached-value');
				expect(mockDb.select).toHaveBeenCalledTimes(1);

				// 30s später - noch innerhalb der 60s TTL
				vi.advanceTimersByTime(30_000);

				const second = await ConfigRepository.get('cached.key');
				expect(second).toBe('cached-value');
				// Kein zweiter DB-Aufruf
				expect(mockDb.select).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it('fragt nach Ablauf der Cache-TTL erneut die Datenbank ab', async () => {
			vi.useFakeTimers();
			try {
				const mockDb = db as any;
				mockDb.select.mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ value: 'stale-value' }])
						})
					})
				});

				await ConfigRepository.get('ttl.key');
				expect(mockDb.select).toHaveBeenCalledTimes(1);

				// 60.001ms später - TTL abgelaufen
				vi.advanceTimersByTime(60_001);

				await ConfigRepository.get('ttl.key');
				expect(mockDb.select).toHaveBeenCalledTimes(2);
			} finally {
				vi.useRealTimers();
			}
		});

		it('fragt nach clearCache() erneut die Datenbank ab', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ value: 'v1' }])
					})
				})
			});

			await ConfigRepository.get('clear.key');
			expect(mockDb.select).toHaveBeenCalledTimes(1);

			ConfigRepository.clearCache();

			await ConfigRepository.get('clear.key');
			expect(mockDb.select).toHaveBeenCalledTimes(2);
		});

		it('fragt nach set() für denselben Key erneut die Datenbank ab (Cache-Invalidierung)', async () => {
			const mockDb = db as any;
			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ value: 'before' }])
						})
					})
				})
				// set() prüft zunächst per select ob der Key existiert
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: 1 }])
						})
					})
				})
				// erneuter get() nach dem Update
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ value: 'after' }])
						})
					})
				});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined)
				})
			});

			const before = await ConfigRepository.get('invalidate.key');
			expect(before).toBe('before');

			await ConfigRepository.set('invalidate.key', 'after');

			const after = await ConfigRepository.get('invalidate.key');
			expect(after).toBe('after');
			expect(mockDb.select).toHaveBeenCalledTimes(3);
		});

		it('loggt den Fehler und wirft ihn erneut wenn die DB-Query fehlschlägt', async () => {
			const mockDb = db as any;
			const dbError = new Error('connection lost');
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockRejectedValue(dbError)
					})
				})
			});

			await expect(ConfigRepository.get('error.key')).rejects.toThrow('connection lost');
		});
	});

	describe('set', () => {
		it('aktualisiert einen bestehenden Eintrag', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: 5 }])
					})
				})
			});
			const setMock = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined)
			});
			mockDb.update.mockReturnValue({ set: setMock });

			await ConfigRepository.set('existing.key', 'new-value', 'user-1');

			expect(mockDb.update).toHaveBeenCalledTimes(1);
			expect(setMock).toHaveBeenCalledWith(
				expect.objectContaining({ value: 'new-value', updatedBy: 'user-1' })
			);
		});

		it('wirft einen Fehler wenn der Key noch nicht existiert - set() legt keine neuen Keys an', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([])
					})
				})
			});

			await expect(ConfigRepository.set('unknown.key', 'value')).rejects.toThrow(
				"Configuration key 'unknown.key' does not exist. Use upsert() to create new configurations."
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('loggt den Fehler und wirft ihn erneut wenn das Update fehlschlägt', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: 1 }])
					})
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error('update failed'))
				})
			});

			await expect(ConfigRepository.set('broken.key', 'value')).rejects.toThrow('update failed');
		});
	});

	describe('upsert', () => {
		it('fügt einen neuen Eintrag ein wenn der Key nicht existiert', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([])
					})
				})
			});
			const valuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const item: ConfigItem = {
				key: 'new.key',
				value: 'value',
				category: 'display'
			};

			await ConfigRepository.upsert(item, 'user-1');

			expect(mockDb.insert).toHaveBeenCalledTimes(1);
			expect(valuesMock).toHaveBeenCalledWith(
				expect.objectContaining({ key: 'new.key', value: 'value', category: 'display' })
			);
		});

		it('aktualisiert einen bestehenden Eintrag', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: 9 }])
					})
				})
			});
			const setMock = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined)
			});
			mockDb.update.mockReturnValue({ set: setMock });

			const item: ConfigItem = {
				key: 'existing.key',
				value: 'updated',
				category: 'security'
			};

			await ConfigRepository.upsert(item);

			expect(mockDb.update).toHaveBeenCalledTimes(1);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('loggt den Fehler und wirft ihn erneut wenn der Upsert fehlschlägt', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([])
					})
				})
			});
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockRejectedValue(new Error('upsert insert failed'))
			});

			await expect(
				ConfigRepository.upsert({ key: 'broken', value: 'v', category: 'display' })
			).rejects.toThrow('upsert insert failed');
		});
	});

	describe('upsertMany', () => {
		it('kehrt bei leerem Array früh zurück ohne DB-Call', async () => {
			const mockDb = db as any;

			await ConfigRepository.upsertMany([]);

			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('ruft insert().values().onConflictDoUpdate() mit der erwarteten Struktur auf', async () => {
			const mockDb = db as any;
			const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
			const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const items: ConfigItem[] = [
				{ key: 'a', value: 'va', category: 'display' },
				{ key: 'b', value: 'vb', category: 'security' }
			];

			await ConfigRepository.upsertMany(items, 'user-1');

			expect(mockDb.insert).toHaveBeenCalledTimes(1);
			expect(valuesMock).toHaveBeenCalledWith([
				expect.objectContaining({
					key: 'a',
					value: 'va',
					category: 'display',
					updatedBy: 'user-1'
				}),
				expect.objectContaining({
					key: 'b',
					value: 'vb',
					category: 'security',
					updatedBy: 'user-1'
				})
			]);
			expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					target: expect.anything(),
					set: expect.objectContaining({
						value: expect.anything(),
						description: expect.anything(),
						category: expect.anything(),
						updatedAt: expect.anything(),
						updatedBy: expect.anything()
					})
				})
			);
		});

		it('loggt den Fehler und wirft ihn erneut wenn der Bulk-Upsert fehlschlägt', async () => {
			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('bulk failed'))
				})
			});

			await expect(
				ConfigRepository.upsertMany([{ key: 'a', value: 'v', category: 'display' }])
			).rejects.toThrow('bulk failed');
		});
	});

	describe('insertManyIfAbsent', () => {
		it('kehrt bei leerem Array früh zurück ohne DB-Call und liefert 0', async () => {
			const mockDb = db as any;

			const result = await ConfigRepository.insertManyIfAbsent([]);

			expect(result).toBe(0);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('gibt die Anzahl tatsächlich eingefügter Zeilen zurück (Teil-Konflikt)', async () => {
			const mockDb = db as any;
			// 3 Items werden übergeben, aber nur 1 wird tatsächlich eingefügt (2 existierten schon)
			const returningMock = vi.fn().mockResolvedValue([{ key: 'c' }]);
			const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
			const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			const items: ConfigItem[] = [
				{ key: 'a', value: 'va', category: 'display' },
				{ key: 'b', value: 'vb', category: 'display' },
				{ key: 'c', value: 'vc', category: 'display' }
			];

			const result = await ConfigRepository.insertManyIfAbsent(items);

			expect(result).toBe(1);
			expect(onConflictDoNothingMock).toHaveBeenCalled();
		});

		it('loggt den Fehler und wirft ihn erneut wenn der Bulk-Insert fehlschlägt', async () => {
			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(new Error('insert failed'))
					})
				})
			});

			await expect(
				ConfigRepository.insertManyIfAbsent([{ key: 'a', value: 'v', category: 'display' }])
			).rejects.toThrow('insert failed');
		});
	});

	describe('getByCategory', () => {
		it('lädt Konfigurationen einer Kategorie', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: 1,
							key: 'a',
							value: 'va',
							description: null,
							category: 'display',
							updatedAt: new Date(),
							updatedBy: null
						}
					])
				})
			});

			const result = await ConfigRepository.getByCategory('display');

			expect(result).toHaveLength(1);
			expect(result[0]?.key).toBe('a');
		});

		it('loggt den Fehler und wirft ihn erneut bei DB-Fehler', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error('category query failed'))
				})
			});

			await expect(ConfigRepository.getByCategory('display')).rejects.toThrow(
				'category query failed'
			);
		});
	});

	describe('getAll', () => {
		it('lädt alle Konfigurationen sortiert nach Kategorie und Key', async () => {
			const mockDb = db as any;
			const orderByMock = vi.fn().mockResolvedValue([
				{
					id: 1,
					key: 'a',
					value: 'va',
					description: null,
					category: 'display',
					updatedAt: new Date(),
					updatedBy: null
				}
			]);
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({ orderBy: orderByMock })
			});

			const result = await ConfigRepository.getAll();

			expect(result).toHaveLength(1);
			expect(orderByMock).toHaveBeenCalled();
		});

		it('loggt den Fehler und wirft ihn erneut bei DB-Fehler', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockRejectedValue(new Error('getAll failed'))
				})
			});

			await expect(ConfigRepository.getAll()).rejects.toThrow('getAll failed');
		});
	});

	describe('delete', () => {
		it('löscht einen Eintrag und den zugehörigen Cache-Eintrag', async () => {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ value: 'v' }])
					})
				})
			});
			mockDb.delete.mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined)
			});

			// Cache befüllen
			await ConfigRepository.get('delete.key');
			expect(mockDb.select).toHaveBeenCalledTimes(1);

			await ConfigRepository.delete('delete.key');

			// Nach delete() muss get() erneut die DB treffen
			await ConfigRepository.get('delete.key');
			expect(mockDb.select).toHaveBeenCalledTimes(2);
		});

		it('loggt den Fehler und wirft ihn erneut bei DB-Fehler', async () => {
			const mockDb = db as any;
			mockDb.delete.mockReturnValue({
				where: vi.fn().mockRejectedValue(new Error('delete failed'))
			});

			await expect(ConfigRepository.delete('broken.key')).rejects.toThrow('delete failed');
		});
	});

	describe('typisierte Helper', () => {
		function mockGetOnce(value: unknown) {
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(value === null ? [] : [{ value }])
					})
				})
			});
		}

		describe('getString', () => {
			it('gibt den Default zurück wenn kein Wert existiert', async () => {
				mockGetOnce(null);
				const result = await ConfigRepository.getString('missing', 'default-value');
				expect(result).toBe('default-value');
			});

			it('konvertiert einen vorhandenen Wert zu String', async () => {
				mockGetOnce(42);
				const result = await ConfigRepository.getString('present', 'default-value');
				expect(result).toBe('42');
			});
		});

		describe('getNumber', () => {
			it('gibt den Default zurück wenn kein Wert existiert', async () => {
				mockGetOnce(null);
				const result = await ConfigRepository.getNumber('missing', 7);
				expect(result).toBe(7);
			});

			it('konvertiert einen vorhandenen Wert zu Number', async () => {
				mockGetOnce('123');
				const result = await ConfigRepository.getNumber('present', 7);
				expect(result).toBe(123);
			});
		});

		describe('getBoolean', () => {
			it('gibt den Default zurück wenn kein Wert existiert', async () => {
				mockGetOnce(null);
				const result = await ConfigRepository.getBoolean('missing', true);
				expect(result).toBe(true);
			});

			it('konvertiert einen vorhandenen Wert zu Boolean', async () => {
				mockGetOnce(false);
				const result = await ConfigRepository.getBoolean('present', true);
				expect(result).toBe(false);
			});

			it.each(['false', 'False', 'FALSE', '0', 'no', 'off', ''])(
				'liest %o als false statt als true',
				async (stored) => {
					// `Boolean('false')` ist `true` — jeder nichtleere String war damit
					// eingeschaltet. Die Spalte ist zwar `jsonb` und die Oberfläche
					// schreibt echte Booleans, aber `PUT /api/config` nimmt jeden
					// JSON-Wert entgegen, und Altbestand sowie SQL von Hand ebenso.
					// Bei `email.smtp.secure` hätte das den Transport auf sofortiges
					// TLS gestellt und den Versand mit einem Fehler abbrechen lassen,
					// der wie ein Netzwerkproblem aussieht.
					mockGetOnce(stored);
					const result = await ConfigRepository.getBoolean('present', true);
					expect(result).toBe(false);
				}
			);

			it.each(['true', 'True', '1', 'yes', 'on'])('liest %o als true', async (stored) => {
				mockGetOnce(stored);
				const result = await ConfigRepository.getBoolean('present', false);
				expect(result).toBe(true);
			});

			it('fällt bei unverständlichen Werten auf den Default zurück', async () => {
				// Weder wahr noch falsch: „irgendwas" als `true` zu lesen wäre die
				// gleiche stille Fehlinterpretation, die hier gerade behoben wird.
				// Unterschiedliche Schlüssel je Aufruf: `get()` cacht pro Schlüssel,
				// ein zweiter Aufruf mit demselben Namen käme nie an der Mock-Zeile an.
				mockGetOnce('vielleicht');
				expect(await ConfigRepository.getBoolean('unklar-a', false)).toBe(false);
				mockGetOnce('vielleicht');
				expect(await ConfigRepository.getBoolean('unklar-b', true)).toBe(true);
			});

			it('liest Zahlen weiterhin nach JavaScript-Regel', async () => {
				mockGetOnce(1);
				expect(await ConfigRepository.getBoolean('zahl-eins', false)).toBe(true);
				mockGetOnce(0);
				expect(await ConfigRepository.getBoolean('zahl-null', true)).toBe(false);
			});
		});

		describe('getObject', () => {
			it('gibt den Default zurück wenn kein Wert existiert', async () => {
				mockGetOnce(null);
				const result = await ConfigRepository.getObject('missing', { foo: 'bar' });
				expect(result).toEqual({ foo: 'bar' });
			});

			it('gibt den vorhandenen Wert zurück wenn er ein Objekt ist', async () => {
				mockGetOnce({ foo: 'baz' });
				const result = await ConfigRepository.getObject('present', { foo: 'bar' });
				expect(result).toEqual({ foo: 'baz' });
			});

			it('lehnt Arrays ab und gibt den Default zurück', async () => {
				mockGetOnce(['not', 'an', 'object']);
				const result = await ConfigRepository.getObject('present', { foo: 'bar' });
				expect(result).toEqual({ foo: 'bar' });
			});
		});

		describe('getArray', () => {
			it('gibt den Default zurück wenn kein Wert existiert', async () => {
				mockGetOnce(null);
				const result = await ConfigRepository.getArray('missing', [1, 2, 3]);
				expect(result).toEqual([1, 2, 3]);
			});

			it('gibt den vorhandenen Wert zurück wenn er ein Array ist', async () => {
				mockGetOnce(['a', 'b']);
				const result = await ConfigRepository.getArray('present', [1, 2, 3]);
				expect(result).toEqual(['a', 'b']);
			});

			it('gibt den Default zurück wenn der Wert kein Array ist', async () => {
				mockGetOnce({ not: 'an array' });
				const result = await ConfigRepository.getArray('present', [1, 2, 3]);
				expect(result).toEqual([1, 2, 3]);
			});
		});
	});
});
