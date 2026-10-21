/**
 * Bindet den Aufräum-Kern an Datenbank und Storage der laufenden Anwendung.
 *
 * Klasse B (Datei ohne Zeile) setzt ein Dateisystem voraus. Bei jedem anderen
 * Provider liefert `findOrphanFiles` `null` — der Lauf gilt dann als
 * erfolgreich und meldet die Klasse als nicht anwendbar, statt zu scheitern.
 */
import { db } from '#lib/server/db/index.ts';
import { sightingFiles } from '#lib/server/db/schema.ts';
import { getCurrentStorageProvider, getStorageProvider } from '#lib/server/storage/factory.ts';
import { and, eq, isNull, lt } from 'drizzle-orm';
import {
	normalizeRelativePath,
	selectOrphanedRows,
	type CleanupPorts,
	type OrphanRow
} from './orphanCleanup';

export function createDbPorts(): CleanupPorts {
	return {
		findOrphanRows: async (cutoff: Date): Promise<OrphanRow[]> => {
			const rows = await db
				.select({
					id: sightingFiles.id,
					filePath: sightingFiles.filePath,
					uploadedAt: sightingFiles.uploadedAt
				})
				.from(sightingFiles)
				.where(and(isNull(sightingFiles.sightingId), lt(sightingFiles.uploadedAt, cutoff)));
			// Doppelt gefiltert und bewusst so: Die SQL-Seite hält die Menge klein,
			// die reine Funktion ist die Stelle, an der die Grenze getestet ist.
			return selectOrphanedRows(rows, cutoff);
		},

		findOrphanFiles: async (cutoff: Date) => {
			// Ohne lokales Dateisystem gibt es nichts zu durchsuchen.
			if (getCurrentStorageProvider() !== 'local') return null;
			const { scanLocalUploads } = await import('./scanLocalUploads');
			return scanLocalUploads(cutoff);
		},

		deleteRow: async (id: number) => {
			await db.delete(sightingFiles).where(eq(sightingFiles.id, id));
		},

		deleteFile: async (relativePath: string) => {
			await getStorageProvider().delete(normalizeRelativePath(relativePath));
		}
	};
}
