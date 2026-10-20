/**
 * Client-side configuration store for dynamic settings
 */
import { browser } from '$app/env';
import {
	PUBLIC_UPLOAD_ACCEPT,
	PUBLIC_UPLOAD_ALLOWED_TYPES,
	PUBLIC_UPLOAD_MAX_FILE_SIZE_BYTES,
	PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_BYTES
} from '#lib/constants/uploadDefaults.ts';
import { UPLOAD_LIMITS } from '#lib/constants/upload.ts';
import { createLogger } from '#lib/logger.ts';
import type { ValidationPreset } from '#lib/types/index.ts';

const logger = createLogger('configStore');

/**
 * Fallback, wenn die Server-Konfiguration (noch) nicht vorliegt — bewusst die
 * restriktive öffentliche Variante: Lieber clientseitig zu viel ablehnen als
 * eine Datei annehmen, die der Server anschließend zurückweist.
 */
function publicUploadFallback(): ValidationPreset {
	return {
		allowedTypes: [...PUBLIC_UPLOAD_ALLOWED_TYPES],
		maxFileSize: PUBLIC_UPLOAD_MAX_FILE_SIZE_BYTES,
		maxVideoFileSize: PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_BYTES,
		maxFiles: 20,
		accept: PUBLIC_UPLOAD_ACCEPT,
		// Offline-Fallback fürs Gesamtlimit je Meldung (Befund I4) — im
		// Normalbetrieb kommt der Wert aus maxTotalUploadSizeBytes unten.
		maxTotalSize: UPLOAD_LIMITS.MAX_TOTAL_SIZE
	};
}

// Cache for upload configuration
let uploadConfigCache: ValidationPreset | null = null;
let uploadConfigCacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current upload configuration from server
 */
export async function getUploadConfig(): Promise<ValidationPreset> {
	// Use cache if available and not expired
	if (uploadConfigCache && Date.now() - uploadConfigCacheTimestamp < CACHE_TTL) {
		return uploadConfigCache;
	}

	if (!browser) {
		// Server-side rendering: noch kein Fetch möglich
		return publicUploadFallback();
	}

	try {
		logger.debug('Fetching upload configuration from server');

		const response = await fetch('/api/config/upload');
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const config = await response.json();

		// Transform server response to ValidationPreset format
		const validationPreset: ValidationPreset = {
			allowedTypes: config.allowedTypes,
			maxFileSize: config.maxFileSizeBytes, // ValidationPreset expects bytes
			// Aus der Server-Antwort, nicht aus der Konstanten: Sonst wirkt eine
			// Änderung von security.maxVideoFileSize im Admin auf dem Client nicht.
			maxVideoFileSize: config.maxVideoFileSizeBytes,
			maxFiles: 20, // Keep default for now
			accept: config.accept,
			// Ebenso aus der Server-Antwort (Befund I4) — sonst driftet die
			// Gesamtgrößen-Prüfung fest gegen UPLOAD_LIMITS.MAX_TOTAL_SIZE, auch
			// wenn ein Admin security.maxTotalUploadSize ändert. Fällt die
			// Server-Antwort das Feld nicht mit (ältere Deployments), bleibt der
			// Offline-Fallback aus UPLOAD_LIMITS.MAX_TOTAL_SIZE bestehen.
			maxTotalSize: config.maxTotalUploadSizeBytes ?? UPLOAD_LIMITS.MAX_TOTAL_SIZE
		};

		// Update cache
		uploadConfigCache = validationPreset;
		uploadConfigCacheTimestamp = Date.now();

		logger.debug(
			{
				maxFileSizeMB: config.maxFileSize,
				allowedTypes: config.allowedTypes.length
			},
			'Upload configuration loaded successfully'
		);

		return validationPreset;
	} catch (error) {
		logger.error({ error }, 'Failed to fetch upload configuration, using fallback');

		return publicUploadFallback();
	}
}

/**
 * Clear the upload configuration cache
 * Useful when configuration changes are made in admin panel
 */
export function clearUploadConfigCache(): void {
	uploadConfigCache = null;
	uploadConfigCacheTimestamp = 0;
	logger.debug('Upload configuration cache cleared');
}
