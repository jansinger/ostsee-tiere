/**
 * Storage Factory - Abstrakte Speicher-Providererstellung und -verwaltung
 *
 * Diese Datei implementiert das Factory-Pattern für Speicher-Provider und ermöglicht
 * die dynamische Auswahl des geeigneten Speicher-Backends basierend auf der
 * Laufzeitumgebung und Konfiguration.
 *
 * Das System unterstützt verschiedene Speicher-Provider:
 * - Local: Lokaler Dateisystem-Speicher (Entwicklung)
 * - Vercel Blob: Vercel's Cloud-Speicher (Produktion auf Vercel)
 * - S3: Amazon S3 (geplant)
 * - GCS: Google Cloud Storage (geplant)
 *
 * Die Auswahl erfolgt automatisch oder über Umgebungsvariablen.
 */
import { dev } from '$app/env';
import { createLogger } from '#lib/logger.server.ts';
import type { StorageProvider, StorageProviderType } from '#lib/types/index.ts';
import { env } from '#lib/server/env.ts';
import { LocalStorageProvider } from './local';
import { getUploadBasePath, resolveUploadBasePath } from './uploadPath';
import { VercelBlobStorageProvider } from './vercel-blob';

const logger = createLogger('storage:factory');

/**
 * Öffentliche URL-Basis für lokal gespeicherte Dateien.
 * Unabhängig vom Ablageort auf der Platte — die Route `/uploads/[...path]`
 * liefert die Dateien aus, egal wo sie liegen.
 */
const LOCAL_PUBLIC_URL_BASE = '/uploads';

/**
 * Singleton-Instanz des aktuell aktiven Speicher-Providers.
 * Wird beim ersten Aufruf von getStorageProvider() initialisiert.
 */
let storageProvider: StorageProvider | null = null;

/**
 * Erstellt oder gibt den konfigurierten Speicher-Provider zurück.
 *
 * Diese Funktion implementiert das Singleton-Pattern und stellt sicher,
 * dass immer derselbe Provider verwendet wird. Die Auswahl des Providers
 * erfolgt basierend auf:
 *
 * 1. STORAGE_PROVIDER Umgebungsvariable (explizite Konfiguration)
 * 2. Automatische Erkennung der Laufzeitumgebung:
 *    - Vercel-Umgebung → vercel-blob
 *    - Entwicklungsmodus → local
 *    - Andere Umgebungen → local (Fallback)
 *
 * @returns Konfigurierter und betriebsbereiter StorageProvider
 * @throws {Error} Wenn ein unbekannter oder nicht implementierter Provider angefordert wird
 *
 * @example
 * ```typescript
 * // Automatische Provider-Auswahl
 * const storage = getStorageProvider();
 *
 * // Datei hochladen
 * const result = await storage.uploadFile(
 *   Buffer.from('Hello World'),
 *   'test.txt',
 *   'text/plain'
 * );
 * ```
 */
export function getStorageProvider(): StorageProvider {
	// Singleton-Check: Provider bereits initialisiert?
	if (storageProvider) {
		return storageProvider;
	}

	// Provider-Typ basierend auf Umgebung ermitteln
	const providerType = getStorageProviderType();

	// Provider-spezifische Initialisierung
	switch (providerType) {
		case 'local': {
			// Lokaler Speicher mit konfigurierten Pfaden
			const uploadPath = getUploadBasePath();
			storageProvider = new LocalStorageProvider(uploadPath, LOCAL_PUBLIC_URL_BASE);
			// Beide Werte loggen: konfiguriert (evtl. relativ) und das tatsächliche Zielverzeichnis
			logger.info(
				{ uploadPath, resolvedUploadPath: resolveUploadBasePath() },
				'Using local file storage'
			);
			break;
		}

		case 'vercel-blob':
			// Vercel Blob Storage (Standardkonfiguration aus Umgebungsvariablen)
			storageProvider = new VercelBlobStorageProvider();
			logger.info('Using Vercel Blob storage');
			break;

		case 's3':
			// Amazon S3 - Noch nicht implementiert
			throw new Error('S3 storage provider not implemented yet');

		case 'gcs':
			// Google Cloud Storage - Noch nicht implementiert
			throw new Error('Google Cloud Storage provider not implemented yet');

		default:
			// Unbekannter Provider-Typ
			throw new Error(`Unknown storage provider: ${providerType}`);
	}

	return storageProvider;
}

/**
 * Ermittelt den zu verwendenden Speicher-Provider-Typ.
 *
 * Diese interne Funktion implementiert die Logik zur automatischen
 * Provider-Auswahl. Die Priorität ist:
 *
 * 1. **Explizite Konfiguration**: STORAGE_PROVIDER Umgebungsvariable
 * 2. **Vercel-Erkennung**: VERCEL Umgebungsvariable vorhanden
 * 3. **Entwicklungsmodus**: SvelteKit dev-Flag aktiv
 * 4. **Fallback**: Lokaler Speicher als sicherer Standard
 *
 * @returns Der ermittelte StorageProviderType
 * @internal
 *
 * @example
 * ```typescript
 * // Umgebungsvariable setzen
 * process.env.STORAGE_PROVIDER = 'vercel-blob';
 * const type = getStorageProviderType(); // 'vercel-blob'
 *
 * // Automatische Vercel-Erkennung
 * process.env.VERCEL = '1';
 * const type = getStorageProviderType(); // 'vercel-blob'
 * ```
 */
function getStorageProviderType(): StorageProviderType {
	// Read environment variables dynamically (for Docker runtime and test mocking)
	const storageProviderEnv = env.STORAGE_PROVIDER ?? '';
	const vercelEnv = env.VERCEL ?? '';

	// SCHRITT 1: Explizite Konfiguration über Umgebungsvariable
	if (storageProviderEnv) {
		logger.debug({ provider: storageProviderEnv }, 'Storage provider from environment');
		return storageProviderEnv as StorageProviderType;
	}

	// SCHRITT 2: Automatische Vercel-Erkennung
	// Vercel setzt automatisch die VERCEL Umgebungsvariable
	if (vercelEnv) {
		logger.debug('Detected Vercel environment, using vercel-blob');
		return 'vercel-blob';
	}

	// SCHRITT 3: Entwicklungsmodus-Erkennung
	// SvelteKit's dev-Flag für lokale Entwicklung
	if (dev) {
		logger.debug('Development environment, using local storage');
		return 'local';
	}

	// SCHRITT 4: Sicherer Fallback
	// Für unbekannte Produktionsumgebungen lokalen Speicher verwenden
	logger.debug('Unknown environment, defaulting to local storage');
	return 'local';
}

/**
 * Setzt den Storage-Provider zurück (hauptsächlich für Tests).
 *
 * Diese Funktion ermöglicht es, den Singleton-Provider zu resetten,
 * um in Tests verschiedene Provider-Konfigurationen zu testen.
 *
 * **Achtung**: Diese Funktion sollte nur in Tests verwendet werden,
 * da ein Reset während der Laufzeit zu inkonsistentem Verhalten führen kann.
 *
 * @example
 * ```typescript
 * // In Tests
 * beforeEach(() => {
 *   resetStorageProvider();
 *   process.env.STORAGE_PROVIDER = 'local';
 * });
 * ```
 */
export function resetStorageProvider(): void {
	storageProvider = null;
}

/**
 * Prüft, ob ein Cloud-basierter Speicher-Provider verwendet wird.
 *
 * Diese Hilfsfunktion ermöglicht es, unterschiedliche Verhaltensweisen
 * für lokale und Cloud-Speicher zu implementieren, z.B.:
 * - Verschiedene URL-Generierung
 * - Unterschiedliche Caching-Strategien
 * - Verschiedene Fehlerbehandlung
 *
 * @returns `true` wenn ein Cloud-Provider aktiv ist, `false` für lokalen Speicher
 *
 * @example
 * ```typescript
 * if (isCloudStorage()) {
 *   // Cloud-spezifische Logik (CDN URLs, etc.)
 *   return generateCloudUrl(fileId);
 * } else {
 *   // Lokale Datei-URLs
 *   return `/uploads/${filename}`;
 * }
 * ```
 */
export function isCloudStorage(): boolean {
	const providerType = getStorageProviderType();
	return providerType !== 'local';
}

/**
 * Gibt den aktuell konfigurierten Storage-Provider-Typ zurück.
 *
 * Diese Funktion ermöglicht es anderen Modulen, den aktiven Provider-Typ
 * zu ermitteln, ohne den Provider selbst zu instanziieren. Nützlich für:
 * - Conditional Logic basierend auf Provider-Typ
 * - Debugging und Logging
 * - Konfigurationsprüfungen
 *
 * @returns Der aktuell konfigurierte StorageProviderType
 *
 * @example
 * ```typescript
 * const currentProvider = getCurrentStorageProvider();
 * logger.info(`Active storage provider: ${currentProvider}`);
 *
 * if (currentProvider === 'vercel-blob') {
 *   // Vercel-spezifische Konfiguration
 * }
 * ```
 */
export function getCurrentStorageProvider(): StorageProviderType {
	return getStorageProviderType();
}
