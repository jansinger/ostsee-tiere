/**
 * Vercel Blob Storage Provider - Cloud-basierter Dateispeicher für Produktion
 *
 * Diese Implementierung des StorageProvider-Interfaces nutzt Vercel's
 * Blob Storage Service für skalierbaren, globalen Dateispeicher.
 *
 * **Funktionen:**
 * - Öffentlich zugängliche Datei-URLs über CDN
 * - Automatische Skalierung und globale Verteilung
 * - Token-basierte Authentifizierung
 * - Eindeutige Dateinamen mit CUID2-IDs
 * - Vollständige CRUD-Operationen
 *
 * **Konfiguration:**
 * - Benötigt BLOB_READ_WRITE_TOKEN Umgebungsvariable
 * - Token-Format: vercel_blob_rw_[prefix]_[suffix]
 * - Alle Dateien sind öffentlich zugänglich
 *
 * **URL-Struktur:**
 * - Upload-Pfad: `${referenceId}/${filename}`
 * - Öffentliche URLs: `https://[prefix].public.blob.vercel-storage.com/[path]`
 */
import { createLogger } from '#lib/logger.server.ts';
import type {
	FileMetadata,
	StorageFileStream,
	StorageProvider,
	UploadedFileInfo,
	UploadOptions
} from '#lib/types/index.ts';
import { env } from '#lib/server/env.ts';
import { del, head, list, put } from '@vercel/blob';
import { basename, extname } from 'path';

const logger = createLogger('storage:vercel-blob');

/**
 * Vercel Blob Storage Provider Implementierung.
 *
 * Diese Klasse stellt eine vollständige Integration mit Vercel's
 * Blob Storage Service bereit und implementiert alle StorageProvider-Methoden.
 */
export class VercelBlobStorageProvider implements StorageProvider {
	/**
	 * Vercel Blob API-Token für Authentifizierung.
	 * Format: vercel_blob_rw_[prefix]_[suffix]
	 */
	private token: string;

	/**
	 * Erstellt eine neue Vercel Blob Storage Provider Instanz.
	 *
	 * Der Provider benötigt einen gültigen Vercel Blob API-Token für
	 * alle Operationen. Der Token wird aus folgenden Quellen gelesen:
	 *
	 * 1. Constructor-Parameter (für Tests/manuelle Konfiguration)
	 * 2. BLOB_READ_WRITE_TOKEN Umgebungsvariable (Standard)
	 *
	 * @param token - Optionaler Vercel Blob API-Token
	 * @throws {Error} Wenn kein gültiger Token verfügbar ist
	 *
	 * @example
	 * ```typescript
	 * // Standardkonfiguration über Umgebungsvariable
	 * const provider = new VercelBlobStorageProvider();
	 *
	 * // Explizite Token-Konfiguration (für Tests)
	 * const provider = new VercelBlobStorageProvider('vercel_blob_rw_...');
	 * ```
	 */
	constructor(token?: string) {
		// Read environment variable dynamically (for Docker runtime and test mocking)
		this.token = token || env.BLOB_READ_WRITE_TOKEN || '';
		if (!this.token) {
			throw new Error(
				'BLOB_READ_WRITE_TOKEN environment variable is required for Vercel Blob storage'
			);
		}
	}

	/**
	 * Lädt eine Datei in den Vercel Blob Storage hoch.
	 *
	 * Diese Methode implementiert den Datei-Upload mit folgenden Funktionen:
	 * - **Eindeutige Dateinamen**: CUID2-basierte IDs zur Kollisionsvermeidung
	 * - **Organisierte Struktur**: Gruppierung nach referenceId
	 * - **Originalname-Erhaltung**: Optional mit preserveOriginalName
	 * - **Öffentlicher Zugriff**: Alle Dateien sind über CDN zugänglich
	 * - **Content-Type-Erhaltung**: MIME-Type wird korrekt gesetzt
	 *
	 * **Dateiname-Schema:**
	 * - Mit Original: `originalname-${uid}.ext`
	 * - Ohne Original: `${uid}.ext`
	 *
	 * **Upload-Pfad:**
	 * - `${referenceId}/${filename}`
	 *
	 * @param file - Browser File-Objekt mit Metadaten
	 * @param buffer - Datei-Inhalt als Buffer
	 * @param options - Upload-Konfiguration
	 * @returns Promise mit vollständigen Upload-Informationen
	 * @throws {Error} Bei Upload-Fehlern oder API-Problemen
	 *
	 * @example
	 * ```typescript
	 * const uploadInfo = await provider.upload(
	 *   file,
	 *   buffer,
	 *   {
	 *     referenceId: 'sichtung-123',
	 *     preserveOriginalName: true
	 *   }
	 * );
	 *
	 * // Resultat: {
	 * //   uid: 'cm123...',
	 * //   originalName: 'whale.jpg',
	 * //   fileName: 'whale-cm123....jpg',
	 * //   filePath: 'sichtung-123/whale-cm123....jpg',
	 * //   url: 'https://xyz.public.blob.vercel-storage.com/...',
	 * //   size: 1234567,
	 * //   mimeType: 'image/jpeg'
	 * // }
	 * ```
	 */
	async upload(file: File, buffer: Buffer, options: UploadOptions): Promise<UploadedFileInfo> {
		// SCHRITT 1: Eindeutige Datei-ID generieren
		const uid = options.uid;
		const extension = extname(file.name);

		// SCHRITT 2: Dateinamen basierend auf Konfiguration erstellen
		const fileName = options.preserveOriginalName
			? `${basename(file.name, extension)}-${uid}${extension}`
			: `${uid}${extension}`;

		// SCHRITT 3: Vollständigen Speicherpfad konstruieren
		const filePath = `${options.referenceId}/${fileName}`;

		try {
			// SCHRITT 4: Upload zu Vercel Blob ausführen
			const blob = await put(filePath, buffer, {
				access: 'public', // Alle Dateien sind öffentlich zugänglich
				token: this.token,
				contentType: file.type // MIME-Type für korrekte Browser-Behandlung
			});

			// SCHRITT 5: Upload-Informationen strukturieren
			const uploadedFile: UploadedFileInfo = {
				uid, // Eindeutige ID für Datenbankzuordnung
				originalName: file.name, // Original Browser-Dateiname
				fileName, // Generierter Dateiname im Storage
				filePath, // Vollständiger Pfad im Storage
				size: file.size, // Dateigröße in Bytes
				mimeType: file.type, // MIME-Type für Download-Header
				url: blob.url, // Direkte CDN-URL für Browser-Zugriff
				uploadedAt: new Date().toISOString() // Upload-Zeitstempel
			};

			logger.debug({ uploadedFile, blobUrl: blob.url }, 'File uploaded to Vercel Blob');
			return uploadedFile;
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to upload to Vercel Blob');
			throw error;
		}
	}

	/**
	 * Löscht eine Datei aus dem Vercel Blob Storage.
	 *
	 * Diese Methode entfernt eine Datei permanent aus dem Storage.
	 * Nach dem Löschen sind die Datei und ihre CDN-URL nicht mehr zugänglich.
	 *
	 * **Wichtige Hinweise:**
	 * - Löschung ist irreversibel
	 * - CDN-URLs werden ungültig
	 * - Keine Fehler wenn Datei bereits gelöscht
	 *
	 * @param filePath - Vollständiger Pfad der zu löschenden Datei
	 * @throws {Error} Bei API-Fehlern oder Netzwerkproblemen
	 *
	 * @example
	 * ```typescript
	 * await provider.delete('sichtung-123/whale-cm123....jpg');
	 * // Datei und CDN-URL sind nicht mehr verfügbar
	 * ```
	 */
	async delete(filePath: string): Promise<void> {
		try {
			// API-Aufruf zum permanenten Löschen der Datei
			await del(filePath, { token: this.token });
			logger.debug({ filePath }, 'File deleted from Vercel Blob');
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to delete from Vercel Blob');
			throw error;
		}
	}

	/**
	 * Generiert eine öffentliche URL für eine gespeicherte Datei.
	 *
	 * Diese Methode konstruiert eine CDN-URL basierend auf dem Vercel Blob
	 * Token-Format. Die URLs sind öffentlich zugänglich und über das
	 * globale CDN optimiert.
	 *
	 * **URL-Konstruktion:**
	 * 1. Token-Prefix aus BLOB_READ_WRITE_TOKEN extrahieren
	 * 2. CDN-Subdomain generieren: `[prefix].public.blob.vercel-storage.com`
	 * 3. Vollständige URL zusammensetzen
	 *
	 * **Token-Format:**
	 * - `vercel_blob_rw_[prefix]_[suffix]`
	 * - Prefix wird für URL-Generierung verwendet
	 *
	 * @param filePath - Pfad der Datei im Storage
	 * @returns Öffentliche CDN-URL für direkten Browser-Zugriff
	 *
	 * @example
	 * ```typescript
	 * const url = provider.getUrl('sichtung-123/whale-cm123....jpg');
	 * // Returns: 'https://xyz123.public.blob.vercel-storage.com/sichtung-123/whale-cm123....jpg'
	 *
	 * // URL kann direkt im Browser verwendet werden
	 * <img src={url} alt="Whale sighting" />
	 * ```
	 */
	getUrl(filePath: string): string {
		// SCHRITT 1: Token-Struktur analysieren
		// Format: vercel_blob_rw_[prefix]_[suffix]
		// Index:  0           1 2   3      4
		const tokenParts = this.token.split('_');
		const tokenPrefix = tokenParts[3]; // Prefix für CDN-Subdomain

		// SCHRITT 2: Öffentliche CDN-URL konstruieren
		// Schema: https://[prefix].public.blob.vercel-storage.com/[filepath]
		return `https://${tokenPrefix}.public.blob.vercel-storage.com/${filePath}`;
	}

	/**
	 * Ruft Metadaten einer gespeicherten Datei ab.
	 *
	 * Diese Methode verwendet die Vercel Blob HEAD-API um Dateimetadaten
	 * ohne Download des Inhalts abzurufen. Nützlich für:
	 * - Größenprüfungen vor Download
	 * - Content-Type-Validierung
	 * - Existenz-Checks
	 * - Last-Modified-Informationen
	 *
	 * @param filePath - Pfad der Datei im Storage
	 * @returns Metadaten-Objekt oder null wenn Datei nicht existiert
	 *
	 * @example
	 * ```typescript
	 * const metadata = await provider.getMetadata('sichtung-123/whale.jpg');
	 * if (metadata) {
	 *   console.log(`Size: ${metadata.size} bytes`);
	 *   console.log(`Type: ${metadata.mimeType}`);
	 *   console.log(`Modified: ${metadata.lastModified}`);
	 * }
	 * ```
	 */
	async getMetadata(filePath: string): Promise<FileMetadata | null> {
		try {
			// API-Aufruf für Metadaten ohne Inhalts-Download
			const metadata = await head(filePath, { token: this.token });

			// Standardisierte Metadaten-Struktur zurückgeben
			return {
				size: metadata.size, // Dateigröße in Bytes
				mimeType: metadata.contentType || 'application/octet-stream', // MIME-Type
				lastModified: new Date(metadata.uploadedAt), // Upload-Zeitpunkt als Last-Modified
				etag: 'etag' in metadata && typeof metadata.etag === 'string' ? metadata.etag : 'unknown' // Eindeutige Versionskennung
			};
		} catch (error) {
			logger.warn({ error, filePath }, 'Failed to get metadata from Vercel Blob');
			return null; // Datei existiert nicht oder API-Fehler
		}
	}

	/**
	 * Listet alle Dateien im Storage auf, optional gefiltert nach Prefix.
	 *
	 * Diese Methode verwendet die Vercel Blob LIST-API um alle verfügbaren
	 * Dateien abzurufen. Der optionale Prefix ermöglicht das Filtern nach
	 * Ordnern oder Sichtungs-IDs.
	 *
	 * **Performance-Hinweise:**
	 * - Kann bei vielen Dateien langsam werden
	 * - Verwendet Paging wenn verfügbar
	 * - Nur Metadaten, kein Dateiinhalt
	 *
	 * @param prefix - Optionaler Pfad-Prefix zum Filtern (z.B. 'sichtung-123/')
	 * @returns Array mit Informationen aller gefundenen Dateien
	 *
	 * @example
	 * ```typescript
	 * // Alle Dateien auflisten
	 * const allFiles = await provider.list();
	 *
	 * // Dateien einer bestimmten Sichtung
	 * const sichtungFiles = await provider.list('sichtung-123/');
	 *
	 * // Ergebnis: [
	 * //   {
	 * //     uid: 'cm123...',
	 * //     fileName: 'whale.jpg',
	 * //     filePath: 'sichtung-123/whale.jpg',
	 * //     url: 'https://...',
	 * //     size: 1234567
	 * //   }
	 * // ]
	 * ```
	 */
	async list(prefix?: string): Promise<UploadedFileInfo[]> {
		try {
			// API-Optionen basierend auf Prefix konfigurieren
			const listOptions: { token: string; prefix?: string } = { token: this.token };
			if (prefix) {
				listOptions.prefix = prefix; // Nur Dateien mit diesem Prefix
			}

			// Liste aller Blobs vom API abrufen
			const result = await list(listOptions);

			// API-Response in standardisierte UploadedFileInfo konvertieren
			return result.blobs.map((blob) => ({
				uid: this.extractUidFromPathname(blob.pathname), // UID aus Dateiname extrahieren
				originalName: basename(blob.pathname), // Nur Dateiname ohne Pfad
				fileName: basename(blob.pathname), // Aktueller Dateiname
				filePath: blob.pathname, // Vollständiger Pfad im Storage
				size: blob.size, // Dateigröße
				mimeType:
					'contentType' in blob
						? (blob as { contentType: string }).contentType
						: 'application/octet-stream', // MIME-Type oder Fallback
				url: blob.url, // Direkte CDN-URL
				uploadedAt: new Date(blob.uploadedAt).toISOString() // Upload-Zeitstempel
			}));
		} catch (error) {
			logger.error({ error, prefix }, 'Failed to list files from Vercel Blob');
			return []; // Leeres Array bei Fehlern
		}
	}

	/**
	 * Prüft, ob eine Datei im Storage existiert.
	 *
	 * Diese Methode führt einen effizienten HEAD-Request durch,
	 * um die Existenz einer Datei zu prüfen, ohne den Inhalt
	 * herunterzuladen.
	 *
	 * @param filePath - Pfad der zu prüfenden Datei
	 * @returns `true` wenn Datei existiert, `false` andernfalls
	 *
	 * @example
	 * ```typescript
	 * const exists = await provider.exists('sichtung-123/whale.jpg');
	 * if (exists) {
	 *   console.log('Datei gefunden!');
	 * } else {
	 *   console.log('Datei nicht vorhanden.');
	 * }
	 * ```
	 */
	async exists(filePath: string): Promise<boolean> {
		try {
			// HEAD-Request ohne Inhalt-Download
			await head(filePath, { token: this.token });
			return true; // Datei existiert
		} catch (_error) {
			// Alle Fehler bedeuten: Datei existiert nicht
			return false;
		}
	}

	/**
	 * Lädt den Inhalt einer Datei als Buffer herunter.
	 *
	 * Diese Methode verwendet die öffentliche CDN-URL um den
	 * vollständigen Dateiinhalt herunterzuladen. Geeignet für:
	 * - Datei-Verarbeitung auf dem Server
	 * - EXIF-Daten-Extraktion
	 * - Bildtransformation
	 * - Backup-Operationen
	 *
	 * **Performance-Hinweise:**
	 * - Lädt gesamte Datei in Speicher
	 * - Nutzt CDN für optimale Performance
	 * - Kann bei großen Dateien speicherintensiv sein
	 *
	 * @param filePath - Pfad der herunterzuladenden Datei
	 * @returns Buffer mit Dateiinhalt oder null bei Fehlern
	 *
	 * @example
	 * ```typescript
	 * const content = await provider.getFileContent('sichtung-123/whale.jpg');
	 * if (content) {
	 *   console.log(`Downloaded ${content.length} bytes`);
	 *   // Weitere Verarbeitung mit dem Buffer
	 * }
	 * ```
	 */
	async getFileContent(filePath: string): Promise<Buffer | null> {
		try {
			// SCHRITT 1: CDN-URL generieren und HTTP-Request ausführen
			const response = await fetch(this.getUrl(filePath));

			// SCHRITT 2: HTTP-Status prüfen
			if (!response.ok) {
				logger.warn(
					{ filePath, status: response.status },
					'File not found for content retrieval from Vercel Blob'
				);
				return null; // Datei nicht gefunden oder nicht zugänglich
			}

			// SCHRITT 3: Response-Body als ArrayBuffer lesen
			const arrayBuffer = await response.arrayBuffer();

			// SCHRITT 4: ArrayBuffer zu Node.js Buffer konvertieren
			const buffer = Buffer.from(arrayBuffer);

			logger.debug({ filePath, size: buffer.length }, 'File content retrieved from Vercel Blob');
			return buffer;
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to get file content from Vercel Blob');
			return null; // Netzwerk- oder andere Fehler
		}
	}

	/**
	 * Liest die Gesamtgröße aus der Antwort.
	 *
	 * Bei 206 steht sie hinter dem Schrägstrich in `Content-Range`
	 * ("bytes 2-5/10"), bei 200 im `Content-Length`.
	 */
	private totalSizeFromResponse(response: Response): number {
		const contentRange = response.headers.get('content-range');
		if (contentRange) {
			const total = contentRange.split('/')[1];
			if (total && total !== '*') {
				return Number(total);
			}
		}
		return Number(response.headers.get('content-length') ?? 0);
	}

	/**
	 * Liefert den Dateiinhalt als Stream, optional begrenzt auf einen Byte-Bereich.
	 *
	 * Im Gegensatz zu `getFileContent()` wird die Datei nicht vollständig in den
	 * Speicher geladen: Der `Range`-Header wird direkt an Vercel Blob durchgereicht,
	 * sodass auch bei großen Videos nur der angeforderte Ausschnitt übertragen wird.
	 *
	 * Das CDN vor Vercel Blob darf den `Range`-Header ignorieren und stattdessen
	 * mit `200` und dem vollen Body antworten — deshalb steht im Ergebnis
	 * `rangeDelivered`, das anhand des tatsächlichen Antwortstatus bestimmt wird,
	 * nicht anhand der Anfrage.
	 *
	 * @param range Inklusiver Bereich; `end` ist das letzte gelieferte Byte.
	 */
	async getFileStream(
		filePath: string,
		range?: { start: number; end: number }
	): Promise<StorageFileStream | null> {
		try {
			const response = await fetch(
				this.getUrl(filePath),
				range ? { headers: { Range: `bytes=${range.start}-${range.end}` } } : {}
			);

			if (!response.ok || !response.body) {
				logger.warn(
					{ filePath, status: response.status },
					'File not available for streaming from Vercel Blob'
				);
				return null;
			}

			const totalSize = this.totalSizeFromResponse(response);
			// Ein CDN darf einen Range-Header ignorieren und mit 200 und dem vollen
			// Body antworten (RFC 9110). Nur eine 206-Antwort auf eine angeforderte
			// Bereichsanfrage ist ein tatsächlich gelieferter Bereich.
			const rangeDelivered = range ? response.status === 206 : true;
			logger.debug(
				{ filePath, totalSize, range, rangeDelivered, status: response.status },
				'File stream opened from Vercel Blob'
			);

			return { stream: response.body as ReadableStream<Uint8Array>, totalSize, rangeDelivered };
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to open file stream from Vercel Blob');
			return null;
		}
	}

	/**
	 * Extrahiert die eindeutige ID (UID) aus einem Dateipfad.
	 *
	 * Diese private Hilfsmethode analysiert den Dateinamen um die
	 * CUID2-basierte UID zu extrahieren, die beim Upload generiert wurde.
	 *
	 * **Erwartete Dateimuster:**
	 * - Mit Original: `originalname-${uid}.ext` → UID ist nach letztem `-`
	 * - Ohne Original: `${uid}.ext` → UID ist vor erstem `.`
	 *
	 * @param pathname - Vollständiger Pfad der Datei
	 * @returns Extrahierte UID oder 'unknown' als Fallback
	 * @internal
	 *
	 * @example
	 * ```typescript
	 * extractUidFromPathname('sichtung-123/whale-cm123abc.jpg');
	 * // Returns: 'cm123abc'
	 *
	 * extractUidFromPathname('sichtung-123/cm456def.jpg');
	 * // Returns: 'cm456def'
	 * ```
	 */
	private extractUidFromPathname(pathname: string): string {
		// SCHRITT 1: Nur Dateiname ohne Pfad extrahieren
		const filename = basename(pathname);

		// SCHRITT 2: Prüfen ob Dateiname `-` enthält (originalname-uid.ext)
		const parts = filename.split('-');
		if (parts.length > 1) {
			// Fall 1: originalname-uid.ext → UID nach letztem `-`
			const uidWithExt = parts[parts.length - 1];
			if (uidWithExt) {
				// Extension entfernen: uid.ext → uid
				return uidWithExt.split('.')[0] || 'unknown';
			}
		}

		// Fall 2: uid.ext → UID vor erstem `.`
		return filename.split('.')[0] || 'unknown';
	}
}
