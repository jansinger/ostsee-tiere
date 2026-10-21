/**
 * Sucht Dateien im lokalen Upload-Verzeichnis, zu denen keine Zeile existiert.
 * Nur für `STORAGE_PROVIDER=local` — der Aufrufer stellt das sicher.
 *
 * Der Verzeichnis-Durchlauf kommt bewusst aus dem Kern (`scanUploadDir`) und
 * wird hier NICHT nachgebaut: Er trägt den Ausschluss von `_old_uploads`, das
 * Überspringen von Punktdateien und die ENOENT-Toleranz.
 */
import { db } from '#lib/server/db/index.ts';
import { sightingFiles, sightings } from '#lib/server/db/schema.ts';
import { resolveUploadBasePath } from '#lib/server/storage/uploadPath.ts';
import { scanUploadDir, selectOrphanedFiles, type DiskEntry } from './orphanCleanup';

export async function scanLocalUploads(cutoff: Date): Promise<DiskEntry[]> {
	const [entries, knownPaths, knownRefs] = await Promise.all([
		scanUploadDir(resolveUploadBasePath()),
		db.select({ filePath: sightingFiles.filePath }).from(sightingFiles),
		db.select({ referenceId: sightings.referenceId }).from(sightings)
	]);

	return selectOrphanedFiles(
		entries,
		{
			paths: knownPaths.map((row) => row.filePath),
			referenceIds: knownRefs.map((row) => row.referenceId).filter((id): id is string => !!id)
		},
		cutoff
	);
}
