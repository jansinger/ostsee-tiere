import { createLogger } from '#lib/logger.server.ts';
import type { StorageProvider } from '#lib/types/index.ts';
import { getStorageProvider } from './factory';

const logger = createLogger('storage:deleteStoredFiles');

/**
 * Entfernt Dateien aus dem Storage, deren `sichtungen_dateien`-Zeilen bereits
 * gelöscht wurden.
 *
 * **Reihenfolge:** Erst die DB-Zeilen löschen, dann diese Funktion aufrufen.
 * Bleibt eine Datei liegen, ist sie ein verwaistes Objekt im Upload-Verzeichnis:
 * ärgerlich, aber für die Anwendung folgenlos, weil niemand mehr darauf zeigt.
 * In der umgekehrten Reihenfolge entstünde eine DB-Zeile, die auf eine nicht
 * mehr vorhandene Datei verweist — und die sieht der Nutzer als kaputtes Bild.
 *
 * Fehler einzelner Löschvorgänge werden deshalb nur geloggt und nicht
 * weitergeworfen: Der aufrufende Vorgang ist zu diesem Zeitpunkt bereits
 * committet und darf nicht nachträglich scheitern.
 *
 * Verwaiste Dateien müssen separat aufgeräumt werden — ein Werkzeug dafür ist
 * entworfen, aber noch nicht gebaut. Bis dahin ist die Log-Zeile
 * `Datei konnte nicht aus dem Storage gelöscht werden` der einzige Hinweis.
 *
 * @param filePaths Storage-Pfade (`sichtungen_dateien.datei_pfad`)
 */
export async function deleteStoredFiles(filePaths: string[]): Promise<void> {
	// Dieselbe Datei kann an mehreren Zeilen hängen — ein Löschversuch genügt
	const uniquePaths = [...new Set(filePaths)];
	if (uniquePaths.length === 0) return;

	let storageProvider: StorageProvider;
	try {
		storageProvider = getStorageProvider();
	} catch (err) {
		logger.error({ err, fileCount: uniquePaths.length }, 'Storage-Provider nicht verfügbar');
		return;
	}

	const results = await Promise.all(
		uniquePaths.map(async (filePath) => {
			try {
				await storageProvider.delete(filePath);
				return true;
			} catch (err) {
				logger.warn({ err, filePath }, 'Datei konnte nicht aus dem Storage gelöscht werden');
				return false;
			}
		})
	);

	const deleted = results.filter(Boolean).length;
	logger.info({ deleted, failed: results.length - deleted }, 'Storage-Dateien aufgeräumt');
}
