import { createLogger } from '#lib/logger.server.ts';
import type { UploadedFileInfo } from '#lib/types/index.ts';
import { count, eq, sum } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '.';
import { sightingFiles } from './schema';
import type * as schema from './schema';

const logger = createLogger('repository:sightingFiles');

/**
 * Ausführungskontext für DB-Operationen: entweder die reguläre `db`-Instanz
 * oder eine Transaktion (`tx`). Beide teilen die verwendete `update`-API,
 * sodass Aufrufer optional innerhalb einer Transaktion arbeiten können.
 */
type DbExecutor = Pick<PostgresJsDatabase<typeof schema>, 'update'>;

export async function saveUploadedFile(
	uploadedFile: UploadedFileInfo,
	referenceId: string,
	sightingId?: number
) {
	// Speichere verknüpfte Mediendateien, falls vorhanden
	logger.info({ referenceId, sightingId }, 'Speichere hochgeladene Mediendatei');

	// Normalisiere Datei-Metadaten für Datenbank-Insert
	const fileRecord = {
		uid: uploadedFile.uid,
		sightingId: sightingId || null,
		referenceId: referenceId,
		originalName: uploadedFile.originalName,
		fileName: uploadedFile.fileName ?? uploadedFile.originalName,
		filePath: uploadedFile.filePath,
		mimeType: uploadedFile.mimeType,
		size: uploadedFile.size,
		url: uploadedFile.url || null, // Cloud-Storage-URL falls verfügbar
		uploadedAt: uploadedFile.uploadedAt ? new Date(uploadedFile.uploadedAt) : new Date(),
		exifData: uploadedFile.exifData || null // EXIF-Metadaten als JSONB
	};

	await db.insert(sightingFiles).values(fileRecord);
	logger.info({ referenceId, sightingId }, 'Mediendatei erfolgreich gespeichert');
}

export async function deleteFileByPath(filePath: string) {
	logger.info({ filePath }, 'Lösche Mediendatei');

	const result = await db
		.delete(sightingFiles)
		.where(eq(sightingFiles.filePath, filePath))
		.returning({ uid: sightingFiles.uid });
	logger.info({ filePath, count: result.length }, 'Mediendatei erfolgreich gelöscht');
}

/**
 * Summe der bereits für eine Meldung hochgeladenen Dateien, in Bytes.
 *
 * Der Client prüft die Gesamtgröße in `validateFiles()`, aber jeder Upload ist
 * ein eigener Request — ohne diese Prüfung ist die Summe serverseitig
 * unbegrenzt.
 */
export async function sumFileSizesForReference(referenceId: string): Promise<number> {
	const [row] = await db
		.select({ total: sum(sightingFiles.size) })
		.from(sightingFiles)
		.where(eq(sightingFiles.referenceId, referenceId));

	return Number(row?.total ?? 0);
}

/**
 * Anzahl der an einer Sichtung hängenden Dateien.
 *
 * Aufrufer ist die Benachrichtigungs-Mail: Sie entscheidet damit, ob der
 * Hinweis „Foto angekündigt, kommt per E-Mail nach" überhaupt zutrifft
 * (`#lib/utils/media/photoAnnouncement.ts`). Bewusst nicht `loadSightingFiles`
 * — das lädt EXIF-Daten und baut URLs, für eine Zahl ist das der falsche Weg.
 */
export async function countFilesForSighting(sightingId: number): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(sightingFiles)
		.where(eq(sightingFiles.sightingId, sightingId));

	return Number(row?.count ?? 0);
}

export async function setSightingIdForReferenceId(
	referenceId: string,
	sightingId: number,
	executor: DbExecutor = db
) {
	logger.info({ referenceId, sightingId }, 'Aktualisiere Mediendatein');

	const result = await executor
		.update(sightingFiles)
		.set({ sightingId })
		.where(eq(sightingFiles.referenceId, referenceId))
		.returning({ uid: sightingFiles.uid });
	logger.info({ referenceId, count: result.length }, 'Mediendateien erfolgreich aktualisiert');
}
