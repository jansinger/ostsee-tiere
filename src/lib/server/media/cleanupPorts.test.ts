/**
 * Der Endpunkt-Test ersetzt `cleanupOrphans` durch einen Mock — die Verdrahtung
 * hier bliebe damit ungetestet. Vor allem die Provider-Weiche und die Frage, ob
 * der Grenzzeitpunkt überhaupt am Scan ankommt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: vi.mock wird über die Importe gehoben und dürfte sonst nicht auf
// diese Bindungen zugreifen.
const { getCurrentStorageProvider, scanLocalUploads } = vi.hoisted(() => ({
	getCurrentStorageProvider: vi.fn(),
	scanLocalUploads: vi.fn()
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getCurrentStorageProvider,
	getStorageProvider: () => ({ delete: vi.fn() })
}));
vi.mock('./scanLocalUploads', () => ({ scanLocalUploads }));
vi.mock('#lib/server/db/index.ts', () => ({ db: {} }));

import { createDbPorts } from './cleanupPorts';

describe('createDbPorts.findOrphanFiles', () => {
	beforeEach(() => vi.clearAllMocks());

	it('sucht nicht im Dateisystem, wenn der Provider keins hat', async () => {
		getCurrentStorageProvider.mockReturnValue('vercel-blob');

		await expect(createDbPorts().findOrphanFiles(new Date())).resolves.toBeNull();
		expect(scanLocalUploads).not.toHaveBeenCalled();
	});

	it('reicht den Grenzzeitpunkt an den Scan durch', async () => {
		// Ohne cutoff gälte die Lücke zwischen geschriebener Datei und noch
		// fehlender DB-Zeile als Waise — ein laufender Upload würde zerstört.
		getCurrentStorageProvider.mockReturnValue('local');
		scanLocalUploads.mockResolvedValue([]);
		const cutoff = new Date('2026-07-27T12:00:00.000Z');

		await createDbPorts().findOrphanFiles(cutoff);

		expect(scanLocalUploads).toHaveBeenCalledWith(cutoff);
	});
});
