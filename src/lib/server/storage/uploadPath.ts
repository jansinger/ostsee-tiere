/**
 * Auflösung des Basisverzeichnisses für den lokalen Datei-Speicher.
 *
 * Einzige Stelle, an der `UPLOAD_PATH` ausgewertet wird. Sowohl der
 * Schreibpfad (`LocalStorageProvider` über die Storage-Factory) als auch
 * der Lesepfad (`getUploadPath()` in `#lib/server/uploads.js`) leiten ihr
 * Verzeichnis hierüber ab — andernfalls würden Uploads an einer Stelle
 * geschrieben und an einer anderen gesucht.
 *
 * `UPLOAD_PATH` ist dieselbe Variable, die der Docker-Entrypoint vor dem
 * Start auf Existenz und Schreibrechte prüft.
 */
import { env } from '#lib/server/env.ts';
import { resolve } from 'path';

/**
 * Basisverzeichnis, wenn `UPLOAD_PATH` nicht gesetzt ist.
 * Relativ — wird gegen das Arbeitsverzeichnis des Prozesses aufgelöst
 * (im Container `/app`, also `/app/uploads`).
 */
const DEFAULT_UPLOAD_PATH = 'uploads';

/**
 * Gibt das konfigurierte Upload-Basisverzeichnis zurück, so wie es in
 * `UPLOAD_PATH` steht (kann relativ sein).
 *
 * @returns Wert aus `UPLOAD_PATH` oder `uploads` als Standard
 *
 * @example
 * ```typescript
 * // UPLOAD_PATH=/app/uploads
 * getUploadBasePath(); // '/app/uploads'
 *
 * // UPLOAD_PATH nicht gesetzt
 * getUploadBasePath(); // 'uploads'
 * ```
 */
export function getUploadBasePath(): string {
	// Whitespace tolerieren: .env-Dateien liefern gelegentlich gepolsterte Werte
	const configuredPath = (env.UPLOAD_PATH ?? '').trim();
	return configuredPath || DEFAULT_UPLOAD_PATH;
}

/**
 * Gibt das Upload-Basisverzeichnis als absoluten Pfad zurück.
 *
 * Relative Werte werden gegen das Arbeitsverzeichnis des Prozesses
 * aufgelöst, absolute Werte unverändert übernommen.
 *
 * @returns Absoluter Pfad zum Upload-Verzeichnis
 *
 * @example
 * ```typescript
 * // UPLOAD_PATH=/srv/uploads
 * resolveUploadBasePath(); // '/srv/uploads'
 *
 * // UPLOAD_PATH=data/uploads, cwd=/app
 * resolveUploadBasePath(); // '/app/data/uploads'
 * ```
 */
export function resolveUploadBasePath(): string {
	return resolve(getUploadBasePath());
}
