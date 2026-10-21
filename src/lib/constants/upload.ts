import * as m from '#lib/paraglide/messages.js';
/**
 * Centralized upload constants and configuration
 * Single source of truth for all upload-related settings
 */

import { MEDIA_FALLBACK_EMAIL } from '#lib/constants/contact.ts';
import { describeFileFormats, isVideoFile } from '#lib/utils/file/fileType.ts';

// File size limits (in bytes)
export const UPLOAD_LIMITS = {
	/** Maximum file size for regular uploads (50MB) */
	MAX_FILE_SIZE: 50 * 1024 * 1024,

	/** Maximum video file size when no runtime configuration is available (100MB) */
	MAX_VIDEO_FILE_SIZE: 100 * 1024 * 1024,

	/** Maximum file size for GPS photos in position step (10MB) */
	PHOTO_GPS_MAX_SIZE: 10 * 1024 * 1024,

	/** Maximum number of files per upload session */
	MAX_FILES: 20,

	/**
	 * Offline-Fallback für die Gesamtgröße einer Meldung. Im Normalbetrieb
	 * entscheidet `security.maxTotalUploadSize` auf dem Server; dieser Wert
	 * greift nur, solange die Konfiguration nicht geladen ist, und muss
	 * deshalb ≤ deren Vorbelegung bleiben.
	 */
	MAX_TOTAL_SIZE: 250 * 1024 * 1024
} as const;

// Allowed MIME types
export const ALLOWED_MIME_TYPES = {
	IMAGES: [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/bmp'
		// Note: image/svg+xml excluded for security reasons
	],

	// Nur MIME-Typen, die Browser tatsächlich melden. `video/mov`, `video/avi`,
	// `video/mkv`, `video/wmv` und `video/flv` standen hier, kommen aber aus
	// keinem Browser — die richtigen Schreibweisen sind video/quicktime,
	// video/x-msvideo, video/x-matroska, video/x-ms-wmv und video/x-flv.
	VIDEOS: ['video/mp4', 'video/quicktime', 'video/webm', 'video/m4v'],

	get MEDIA() {
		return [...this.IMAGES, ...this.VIDEOS];
	},

	get ALL() {
		return this.MEDIA;
	}
} as const;

// File validation presets for different upload contexts
export const FILE_VALIDATION_PRESETS = {
	/** Standard media upload (images and videos) */
	MEDIA: {
		allowedTypes: ALLOWED_MIME_TYPES.MEDIA,
		maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
		maxVideoFileSize: UPLOAD_LIMITS.MAX_VIDEO_FILE_SIZE,
		maxFiles: UPLOAD_LIMITS.MAX_FILES,
		accept: 'image/*,video/*'
	},

	/** GPS photo upload (images only, smaller size limit) */
	GPS_PHOTO: {
		allowedTypes: ALLOWED_MIME_TYPES.IMAGES,
		maxFileSize: UPLOAD_LIMITS.PHOTO_GPS_MAX_SIZE,
		maxVideoFileSize: UPLOAD_LIMITS.PHOTO_GPS_MAX_SIZE,
		maxFiles: 1,
		accept: 'image/*'
	},

	/** Images only upload */
	IMAGES_ONLY: {
		allowedTypes: ALLOWED_MIME_TYPES.IMAGES,
		maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
		maxVideoFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
		maxFiles: UPLOAD_LIMITS.MAX_FILES,
		accept: 'image/*'
	}
} as const;

// Error messages for upload validation
//
// Die Texte nennen bewusst die IST-Größe und einen Ausweg. „Datei zu groß.
// Maximum: 10MB" sagt dem Melder nicht, wie weit er daneben liegt, und rohe
// MIME-Typen („image/jpeg, image/png") sind für ihn keine Formatangabe.
export const UPLOAD_ERROR_MESSAGES = {
	FILE_TOO_LARGE: (
		fileName: string,
		maxSize: number,
		actualSize: number,
		mimeType: string
	): string => {
		const actualMB = Math.round(actualSize / 1024 / 1024);
		const maxMB = Math.round(maxSize / 1024 / 1024);
		// Der MIME-Typ kommt von der Aufrufstelle, nicht aus dem Dateinamen:
		// Ein „.mov" mit HEVC und ein „.mp4" melden sich unterschiedlich, und
		// eine Endung ist ohnehin frei wählbar.
		// Der Zusatz ist ein EIGENER, ganzer Satz und wird angehängt — nicht in
		// den ersten hineingesetzt. Am Satzende lässt sich das ohne
		// Wortstellungsschaden trennen (Muster C).
		const hint = isVideoFile(mimeType)
			? ` ${m.constants_upload_text_nehmen_sie_das_video_in_geringerer_auflo({ email: MEDIA_FALLBACK_EMAIL })}`
			: '';
		return `${m.constants_upload_text_filename_zu_gross_mit_actualmb_mb({ fileName, actualMB, maxMB })}${hint}`;
	},

	INVALID_TYPE: (fileName: string, allowedTypes: readonly string[]) =>
		m.constants_upload_text_filename_dieses_format_koennen_wir_nicht({
			fileName,
			formats: describeFileFormats(allowedTypes)
		}),

	TOO_MANY_FILES: (maxFiles: number) =>
		m.constants_upload_text_zu_viele_dateien_maximum({ maxFiles }),

	TOTAL_SIZE_EXCEEDED: (maxSize: number) =>
		m.constants_upload_text_gesamtgroesse_ueberschritten_maximum({
			maxMB: Math.round(maxSize / 1024 / 1024)
		}),

	EMPTY_FILE: (fileName: string) => m.constants_upload_text_filename_datei_ist_leer({ fileName }),

	INVALID_NAME: (fileName: string) =>
		m.constants_upload_text_filename_unsicherer_dateiname({ fileName }),

	get NO_FILE(): string {
		return m.constants_upload_text_keine_datei_ausgewaehlt();
	},

	// Getter statt Wert: Ein Feld würde beim Modulladen einmal aufgelöst und
	// fröre die Sprache ein (Entwurf 2.3/4.1).
	get UPLOAD_FAILED(): string {
		return m.constants_upload_text_upload_fehlgeschlagen_versuchen_sie_es_e();
	}
} as const;
