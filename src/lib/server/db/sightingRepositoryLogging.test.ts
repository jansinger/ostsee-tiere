/**
 * `saveSighting` und `updateSighting` dürfen keine Kontaktdaten an den Logger
 * übergeben.
 *
 * Die Redaction (`src/lib/logger/redaction.ts`) ist die zweite Linie. Die
 * erste ist, personenbezogene Werte gar nicht erst zu loggen: Eine Pfadliste
 * kennt nur die Schlüssel, die jemand bedacht hat — bis 2026-11 fehlte darin
 * die halbe Anschrift. Hier wird deshalb gegen die übergebenen **Werte**
 * geprüft, nicht gegen Schlüsselnamen.
 */
import { db } from '#lib/server/db/index.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSighting, updateSighting } from './sightingRepository';

const { logCalls } = vi.hoisted(() => ({ logCalls: [] as unknown[][] }));

vi.mock('#lib/logger.server.ts', () => {
	const record =
		() =>
		(...args: unknown[]): void => {
			logCalls.push(args);
		};
	return {
		createLogger: vi.fn(() => ({
			info: record(),
			debug: record(),
			warn: record(),
			error: record()
		}))
	};
});

vi.mock('#lib/server/db/index.ts', () => {
	const db: Record<string, unknown> = {
		insert: vi.fn(),
		// setSightingIdForReferenceId verknüpft die Mediendateien per Update
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) }))
		})),
		transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db))
	};
	return { db };
});

const CONTACT = {
	firstName: 'Erika',
	lastName: 'Mustermann',
	email: 'erika@example.invalid',
	phone: '0381 111111',
	street: 'Hafenstraße 1',
	zipCode: '18055',
	city: 'Rostock',
	shipName: 'Seeschwalbe',
	homePort: 'Warnemünde'
};

vi.mock('./mapFormToSighting', () => ({
	mapFormToSighting: vi.fn(() => ({
		...CONTACT,
		fax: '0381 222222',
		species: 1,
		entryChannel: 0,
		sightingDate: new Date('2026-10-01T10:00:00Z'),
		created: new Date('2026-10-01T10:05:00Z')
	}))
}));

describe('saveSighting — Logging', () => {
	beforeEach(() => {
		logCalls.length = 0;
		const mockDb = db as unknown as { insert: ReturnType<typeof vi.fn> };
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: 42 }])
			})
		});
	});

	const weatherData = {
		provider: 'open-meteo',
		data_type: 'historical',
		api_version: 'v1',
		fetched_at: '2026-10-01T10:05:00Z'
	};

	it.each([
		['ohne Wetterdaten', undefined],
		['mit Wetterdaten', weatherData]
	])('übergibt %s keine Kontaktdaten an den Logger', async (_label, weather) => {
		// Die Wetterdaten sind für diesen Test nur ein Schalter für den zweiten
		// Log-Zweig; ihre Form spielt keine Rolle.
		await saveSighting({} as never, weather as never);

		const logged = JSON.stringify(logCalls);
		for (const value of [...Object.values(CONTACT), '0381 222222']) {
			expect(logged).not.toContain(value);
		}
		expect(logCalls.length).toBeGreaterThan(0);
	});

	it('übergibt auch im Fehlerfall keine Kontaktdaten an den Logger', async () => {
		const mockDb = db as unknown as { insert: ReturnType<typeof vi.fn> };
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) })
		});

		await expect(saveSighting({} as never)).rejects.toThrow();

		const logged = JSON.stringify(logCalls);
		for (const value of [...Object.values(CONTACT), '0381 222222']) {
			expect(logged).not.toContain(value);
		}
	});

	it('übergibt beim Aktualisieren keine Kontaktdaten an den Logger', async () => {
		// Das Update liefert die ganze Zeile zurück — genau die landete im Log.
		const mockDb = db as unknown as { update: ReturnType<typeof vi.fn> };
		mockDb.update.mockReturnValue({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn().mockResolvedValue([{ id: 42, ...CONTACT, fax: '0381 222222' }])
				}))
			}))
		});

		await updateSighting(42, {} as never);

		const logged = JSON.stringify(logCalls);
		for (const value of [...Object.values(CONTACT), '0381 222222']) {
			expect(logged).not.toContain(value);
		}
		expect(logCalls.length).toBeGreaterThan(0);
	});
});
