/**
 * Validation-related type definitions
 */

/**
 * Result of a file validation operation
 */
export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	validFiles?: File[];
	invalidFiles?: File[];
}

/**
 * Configuration preset for file validation
 */
export interface ValidationPreset {
	allowedTypes: readonly string[];
	/** Grenze für Bilder und alles Übrige, in Bytes */
	maxFileSize: number;
	/** Grenze für `video/*`, in Bytes. Siehe $lib/constants/uploadLimits */
	maxVideoFileSize: number;
	maxFiles: number;
	accept: string;
	/**
	 * Gesamtlimit je Meldung, in Bytes (`security.maxTotalUploadSize`).
	 * Optional: fehlt es, fällt `validateFiles()` auf `UPLOAD_LIMITS.MAX_TOTAL_SIZE`
	 * zurück (Offline-Fallback, siehe `#lib/constants/upload.ts`) — Befund I4.
	 */
	maxTotalSize?: number;
}

/**
 * Legacy file validation configuration
 * @deprecated Use ValidationPreset instead
 */
export interface FileValidationConfig {
	allowedTypes: readonly string[];
	maxFileSize?: number; // in bytes
	maxFiles?: number;
	accept?: string;
}
