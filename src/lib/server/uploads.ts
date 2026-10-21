/**
 * Server-seitige Upload-Utilities - Sicherheitskritische Datei-Verarbeitung
 *
 * Diese Datei stellt grundlegende Sicherheitsfunktionen für Datei-Uploads bereit.
 * Alle Funktionen sind darauf ausgelegt, typische Sicherheitslücken zu verhindern:
 *
 * **Sicherheitsmaßnahmen:**
 * - Directory Traversal Schutz (../ Angriffe)
 * - MIME-Type Validierung basierend auf Dateierweiterungen
 * - Dateigrößen- und Typen-Einschränkungen
 * - Sichere Pfad-Konstruktion
 * - Umfassende Eingabe-Validierung
 *
 * **Unterstützte Dateitypen:**
 * - Bilder: JPEG, PNG, GIF, WebP, BMP, SVG
 * - Videos: MP4, MOV, AVI, WebM, MKV, WMV
 * - Dokumente: PDF, TXT, CSV
 *
 * **Wichtiger Sicherheitshinweis:**
 * Diese Funktionen sind sicherheitskritisch und sollten bei Änderungen
 * ausführlich getestet werden. Jeder Fehler kann zu Sicherheitslücken führen.
 */
import { createLogger } from '#lib/logger.server.ts';
import { resolveUploadBasePath } from '#lib/server/storage/uploadPath.ts';
import { existsSync, statSync } from 'fs';
import path from 'path';

const logger = createLogger('server:uploads');

/**
 * Validiert Upload-Pfade gegen Directory Traversal Angriffe.
 *
 * Diese sicherheitskritische Funktion verhindert Path Traversal Angriffe,
 * bei denen Angreifer versuchen, über Pfade wie "../../../etc/passwd"
 * auf Dateien außerhalb des vorgesehenen Upload-Bereichs zuzugreifen.
 *
 * **Sicherheitsprüfungen:**
 * - Normalisiert Pfade um versteckte Traversal-Versuche zu erkennen
 * - Blockiert absolute Pfade (beginnend mit / oder C:\)
 * - Verhindert ".." Sequenzen in normalisierten Pfaden
 * - Loggt blockierte Versuche für Security Monitoring
 *
 * @param filePath - Zu validierender Dateipfad (relativ erwartet)
 * @returns `true` wenn Pfad sicher ist, `false` bei Sicherheitsrisiko
 *
 * @example
 * ```typescript
 * // Sichere Pfade
 * isValidUploadPath('folder/file.jpg')        // ✓ true
 * isValidUploadPath('user123/image.png')      // ✓ true
 *
 * // Gefährliche Pfade (blockiert)
 * isValidUploadPath('../../../etc/passwd')    // ✗ false
 * isValidUploadPath('/etc/passwd')           // ✗ false
 * isValidUploadPath('folder/../../../secret') // ✗ false
 * ```
 */
export function isValidUploadPath(filePath: string): boolean {
	// SCHRITT 1: Null-Byte-Injection verhindern
	// Null-Bytes können Pfade auf C-Ebene terminieren und Sicherheitsprüfungen umgehen
	if (filePath.includes('\0')) {
		logger.warn({ filePath }, 'Null-Byte-Injection im Upload-Pfad blockiert');
		return false;
	}

	// SCHRITT 2: Windows absolute Pfade blockieren (C:\ oder c:/)
	// path.isAbsolute() erkennt diese auf Unix-Systemen nicht zuverlässig
	if (/^[a-zA-Z]:[/\\]/.test(filePath)) {
		logger.warn({ filePath }, 'Windows-absoluter Upload-Pfad blockiert');
		return false;
	}

	// SCHRITT 3: UNC-Pfade blockieren (\\server\share oder //server/share)
	if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
		logger.warn({ filePath }, 'UNC-Pfad im Upload blockiert');
		return false;
	}

	// SCHRITT 4: URL-encoded Traversal blockieren (%2e%2e = "..")
	// Iterativ dekodieren bis stabil (max. 5 Runden genügen für legitime Pfade).
	// Nach dem Dekodieren auch den normalisierten Pfad prüfen, damit "%2e%2e%2f"
	// genauso blockiert wird wie "../".
	try {
		let current = filePath;
		for (let i = 0; i < 5; i++) {
			const decoded = decodeURIComponent(current);
			if (decoded === current) break; // stabil — keine weiteren Encoding-Schichten
			// Basisprüfungen am dekodiertem String
			if (
				decoded.includes('\0') ||
				/^[a-zA-Z]:[/\\]/.test(decoded) ||
				decoded.startsWith('\\\\') ||
				decoded.startsWith('//')
			) {
				logger.warn({ filePath, decoded }, 'URL-enkodierter Traversal-Versuch blockiert');
				return false;
			}
			// Pfad-Traversal im dekodiertem Wert prüfen (z.B. %2e%2e%2f → ../)
			const normalizedDecoded = path.normalize(decoded);
			if (normalizedDecoded.startsWith('..') || normalizedDecoded.includes(`${path.sep}..`)) {
				logger.warn({ filePath, decoded }, 'URL-enkodierter Traversal-Versuch blockiert');
				return false;
			}
			current = decoded;
		}
	} catch {
		// Ungültige URL-Enkodierung (z.B. allein stehendes %) → blockieren
		logger.warn({ filePath }, 'Ungültige URL-Enkodierung im Upload-Pfad blockiert');
		return false;
	}

	// SCHRITT 5: Pfad normalisieren um versteckte Traversal-Versuche zu erkennen
	// Beispiel: "folder/.//../other" → "other"
	const normalizedPath = path.normalize(filePath);

	// SCHRITT 6: Verbleibende Sicherheitsprüfungen durchführen
	const isValid = !normalizedPath.includes('..') && !path.isAbsolute(normalizedPath);

	// SCHRITT 7: Sicherheitsverletzungen loggen für Monitoring
	if (!isValid) {
		logger.warn({ filePath, normalizedPath }, 'Ungültiger Upload-Pfad blockiert');
	}

	return isValid;
}

/**
 * MIME-Type Mapping für unterstützte Dateierweiterungen.
 *
 * Diese Konstante definiert alle erlaubten Dateitypen basierend auf
 * ihren Dateierweiterungen. Die MIME-Types werden für:
 * - HTTP Content-Type Header
 * - Browser-Download-Verhalten
 * - Sicherheitsvalidierung
 * verwendet.
 *
 * **Sicherheitshinweis:**
 * Die Zuordnung basiert auf Dateierweiterungen, nicht auf tatsächlichem
 * Dateiinhalt. Für maximale Sicherheit sollte zusätzliche Content-Validierung
 * implementiert werden.
 */
const MIME_TYPE_MAP = {
	// Bilder
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.svg': 'image/svg+xml',
	// Videos
	'.mp4': 'video/mp4',
	'.mov': 'video/quicktime',
	'.avi': 'video/x-msvideo',
	'.webm': 'video/webm',
	'.mkv': 'video/x-matroska',
	'.wmv': 'video/x-ms-wmv',
	// Dokumente
	'.pdf': 'application/pdf',
	'.txt': 'text/plain',
	'.csv': 'text/csv'
} as const;

/**
 * Liste aller für Upload erlaubten MIME-Types.
 *
 * Diese Whitelist definiert explizit alle zulässigen Dateitypen.
 * Nur Dateien mit diesen MIME-Types werden vom System akzeptiert.
 *
 * **Sicherheitsprinzip: Whitelist über Blacklist**
 * - Explizite Erlaubnis statt Verbot
 * - Reduziert Risiko durch unbekannte Dateitypen
 * - Einfachere Sicherheitsüberprüfung
 *
 * **Hinweis:** Diese Liste muss bei Bedarf an neue Dateitypen angepasst werden.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/bmp',
	'video/mp4',
	'video/quicktime',
	'video/x-msvideo',
	'video/webm',
	'application/pdf'
] as const;

/**
 * Ermittelt MIME-Type basierend auf Dateierweiterung.
 *
 * Diese Funktion extrahiert die Dateierweiterung und mappt sie auf
 * den entsprechenden MIME-Type. Unbekannte Erweiterungen werden als
 * 'application/octet-stream' klassifiziert.
 *
 * @param filePath - Pfad oder Dateiname mit Erweiterung
 * @returns Entsprechender MIME-Type oder 'application/octet-stream'
 *
 * @example
 * ```typescript
 * getMimeTypeFromExtension('photo.jpg')      // 'image/jpeg'
 * getMimeTypeFromExtension('video.mp4')      // 'video/mp4'
 * getMimeTypeFromExtension('unknown.xyz')    // 'application/octet-stream'
 * ```
 */
export function getMimeTypeFromExtension(filePath: string): string {
	// Dateierweiterung extrahieren und normalisieren
	const ext = path.extname(filePath).toLowerCase() as keyof typeof MIME_TYPE_MAP;

	// MIME-Type aus Mapping oder Fallback zurückgeben
	return MIME_TYPE_MAP[ext] || 'application/octet-stream';
}

/**
 * Prüft, ob ein MIME-Type für Uploads erlaubt ist.
 *
 * Diese Sicherheitsfunktion validiert MIME-Types gegen die
 * Whitelist erlaubter Dateitypen. Nur explizit erlaubte
 * Types werden akzeptiert.
 *
 * @param mimeType - Zu prüfender MIME-Type
 * @returns `true` wenn erlaubt, `false` wenn blockiert
 *
 * @example
 * ```typescript
 * isAllowedMimeType('image/jpeg')           // ✓ true
 * isAllowedMimeType('application/x-exe')    // ✗ false
 * isAllowedMimeType('text/javascript')      // ✗ false
 * ```
 */
export function isAllowedMimeType(mimeType: string): boolean {
	// Whitelist-basierte Validierung für maximale Sicherheit
	return ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number]);
}

/**
 * Konstruiert sicheren absoluten Pfad für Upload-Dateien.
 *
 * Das Basisverzeichnis stammt aus `UPLOAD_PATH` (Standard: `uploads`
 * relativ zum Arbeitsverzeichnis) — dieselbe Quelle, aus der auch der
 * `LocalStorageProvider` beim Schreiben sein Verzeichnis bezieht.
 * Lesen und Schreiben zeigen dadurch immer auf denselben Ort.
 *
 * **Sicherheitshinweis:**
 * Der Input sollte bereits mit `isValidUploadPath()` validiert sein.
 *
 * @param filePath - Relativer Pfad innerhalb des Upload-Verzeichnisses
 * @returns Absoluter Pfad zur Datei im Upload-Verzeichnis
 *
 * @example
 * ```typescript
 * // Annahme: UPLOAD_PATH nicht gesetzt, process.cwd() = '/app'
 * getUploadPath('user123/photo.jpg')
 * // Returns: '/app/uploads/user123/photo.jpg'
 *
 * // Annahme: UPLOAD_PATH=/srv/ostsee/uploads
 * getUploadPath('user123/photo.jpg')
 * // Returns: '/srv/ostsee/uploads/user123/photo.jpg'
 * ```
 */
export function getUploadPath(filePath: string): string {
	// Sicheren absoluten Pfad zum konfigurierten Upload-Verzeichnis konstruieren
	return path.join(resolveUploadBasePath(), filePath);
}

/**
 * Ruft umfassende Informationen über eine Datei ab.
 *
 * Diese Utility-Funktion kombiniert Dateisystem-Metadaten mit
 * MIME-Type-Erkennung und Sicherheitsvalidierung. Sie prüft:
 * - Existenz der Datei
 * - Dateisystem-Statistiken (Größe, Änderungsdatum)
 * - MIME-Type basierend auf Erweiterung
 * - Erlaubnis-Status für Uploads
 *
 * @param fullPath - Absoluter Pfad zur zu prüfenden Datei
 * @returns Datei-Informationen oder `null` wenn nicht vorhanden/ungültig
 *
 * @example
 * ```typescript
 * const info = getFileInfo('/app/uploads/photo.jpg');
 * if (info) {
 *   console.log(`Size: ${info.size} bytes`);
 *   console.log(`Type: ${info.mimeType}`);
 *   console.log(`Allowed: ${info.isAllowed}`);
 *   console.log(`Modified: ${info.lastModified}`);
 * }
 * ```
 */
export function getFileInfo(fullPath: string) {
	// SCHRITT 1: Existenz prüfen
	if (!existsSync(fullPath)) {
		return null; // Datei existiert nicht
	}

	// SCHRITT 2: Dateisystem-Statistiken abrufen
	const stats = statSync(fullPath);
	if (!stats.isFile()) {
		return null; // Pfad zeigt auf Verzeichnis, nicht auf Datei
	}

	// SCHRITT 3: MIME-Type ermitteln
	const mimeType = getMimeTypeFromExtension(fullPath);

	// SCHRITT 4: Vollständige Datei-Informationen zusammenstellen
	return {
		size: stats.size, // Dateigröße in Bytes
		mimeType, // Ermittelter MIME-Type
		lastModified: stats.mtime, // Letzte Änderung als Date-Objekt
		isAllowed: isAllowedMimeType(mimeType) // Sicherheitsstatus
	};
}
