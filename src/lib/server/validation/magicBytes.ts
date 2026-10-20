/**
 * Magic bytes validation for file type verification
 * Checks if the actual file content matches the declared MIME type
 */

import { createLogger } from '#lib/logger.server.ts';

const logger = createLogger('MagicBytesValidator');

/**
 * Magic byte signatures for common file types.
 *
 * Structure: outer array = variants (OR logic, any one valid variant accepts the file).
 *            inner array = required signatures for a single variant (AND logic, all must match).
 *
 * Examples:
 *  - GIF has two variants (GIF87a OR GIF89a), each with one signature.
 *  - WebP has one variant that requires two signatures (RIFF AND WEBP).
 */
const MAGIC_BYTES: Record<string, Array<Array<{ bytes: number[]; offset: number }>>> = {
	// Image formats
	'image/jpeg': [
		[{ bytes: [0xff, 0xd8, 0xff], offset: 0 }] // JPEG/JPG
	],
	'image/jpg': [
		[{ bytes: [0xff, 0xd8, 0xff], offset: 0 }] // Same as JPEG
	],
	'image/png': [
		[{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }] // PNG
	],
	'image/gif': [
		[{ bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 }], // GIF87a
		[{ bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 }] // GIF89a
	],
	'image/webp': [
		[
			{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF (required)
			{ bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } // WEBP (required)
		]
	],
	'image/bmp': [
		[{ bytes: [0x42, 0x4d], offset: 0 }] // BM
	],

	// Document formats
	'application/pdf': [
		[{ bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0 }] // %PDF-
	],

	// Video formats
	//
	// MP4, QuickTime und M4V sind alle ISO Base Media File Format: eine
	// "ftyp"-Box bei Offset 4, danach die Brand. Die Brand zu prüfen wäre
	// falsche Genauigkeit — iPhones schreiben je nach Aufnahmemodus mp42 in
	// eine .mov und qt in eine .mp4, und der Browser meldet dazu den MIME-Typ
	// nach Dateiendung. Ein "ftypqt"-Zwang hat solche Dateien grundlos mit 400
	// abgewiesen. Was hier zählt, ist die Abgrenzung gegen Nicht-Video —
	// und die leistet die ftyp-Box.
	'video/mp4': [[{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }]],
	'video/avi': [
		[
			{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF (required)
			{ bytes: [0x41, 0x56, 0x49, 0x20], offset: 8 } // AVI  (required)
		]
	],
	// Browsers report AVI files as video/x-msvideo — map to same signature
	'video/x-msvideo': [
		[
			{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF (required)
			{ bytes: [0x41, 0x56, 0x49, 0x20], offset: 8 } // AVI  (required)
		]
	],
	'video/mov': [[{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }]],
	'video/quicktime': [[{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }]],
	'video/webm': [
		[{ bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 }] // EBML header
	],
	'video/mkv': [
		[{ bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 }] // EBML header (same as WebM)
	],
	'video/x-matroska': [
		[{ bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 }] // EBML header
	],
	'video/wmv': [
		[{ bytes: [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11], offset: 0 }] // ASF
	],
	'video/x-ms-wmv': [
		[{ bytes: [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11], offset: 0 }] // ASF
	],
	'video/flv': [
		[{ bytes: [0x46, 0x4c, 0x56, 0x01], offset: 0 }] // FLV
	],
	'video/x-flv': [
		[{ bytes: [0x46, 0x4c, 0x56, 0x01], offset: 0 }] // FLV
	],
	'video/m4v': [[{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }]]
};

/**
 * Prüft, ob für einen MIME-Typ überhaupt eine Signatur hinterlegt ist.
 *
 * `validateMagicBytes()` lässt unbekannte Typen bewusst durch (konservativer
 * Ansatz). Wer einen Typ öffentlich anbietet, muss ihn aber prüfen können —
 * sonst ist die Inhaltsprüfung für genau diesen Typ wirkungslos.
 */
export function hasMagicByteSignature(mimeType: string): boolean {
	return Object.prototype.hasOwnProperty.call(MAGIC_BYTES, mimeType.toLowerCase());
}

/**
 * Validates if the buffer matches the expected magic bytes for the given MIME type
 * @param buffer - The file buffer to check
 * @param declaredMimeType - The MIME type declared by the client
 * @returns Object with validation result and details
 */
export function validateMagicBytes(
	buffer: Buffer,
	declaredMimeType: string
): { isValid: boolean; actualType?: string; message?: string } {
	// Check if we have magic bytes defined for this MIME type
	const expectedSignatures = MAGIC_BYTES[declaredMimeType.toLowerCase()];

	if (!expectedSignatures) {
		// No signature defined for this type, allow it (conservative approach)
		logger.debug(
			{ mimeType: declaredMimeType },
			'No magic bytes signature defined for MIME type, skipping validation'
		);
		return { isValid: true, message: 'No signature validation available for this type' };
	}

	// Check if any variant matches (OR across variants, AND within each variant)
	const matches = expectedSignatures.some((variant) =>
		variant.every((signature) => {
			// Check if buffer is large enough
			if (buffer.length < signature.offset + signature.bytes.length) {
				return false;
			}

			// Check if bytes match at the specified offset
			return signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte);
		})
	);

	if (matches) {
		logger.debug({ mimeType: declaredMimeType }, 'File signature matches declared MIME type');
		return { isValid: true };
	}

	// Try to detect the actual file type
	const actualType = detectFileType(buffer);

	logger.warn(
		{
			declaredType: declaredMimeType,
			detectedType: actualType,
			firstBytes: buffer.slice(0, 20).toString('hex')
		},
		'File signature does not match declared MIME type'
	);

	return {
		isValid: false,
		...(actualType && { actualType }),
		message: `Dateiinhalt stimmt nicht mit dem angegebenen Typ überein. Erwartet: ${declaredMimeType}, Erkannt: ${actualType || 'unbekannt'}`
	};
}

/**
 * Attempts to detect the actual file type from the buffer
 * @param buffer - The file buffer to analyze
 * @returns The detected MIME type or undefined
 */
function detectFileType(buffer: Buffer): string | undefined {
	// Check against all known signatures (same OR/AND logic as validateMagicBytes)
	for (const [mimeType, variants] of Object.entries(MAGIC_BYTES)) {
		const matches = variants.some((variant) =>
			variant.every((signature) => {
				if (buffer.length < signature.offset + signature.bytes.length) {
					return false;
				}
				return signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte);
			})
		);

		if (matches) {
			return mimeType;
		}
	}

	return undefined;
}

/**
 * Checks if a file type is potentially dangerous
 * @param mimeType - The MIME type to check
 * @returns true if the type is considered dangerous
 */
export function isDangerousFileType(mimeType: string): boolean {
	const dangerousTypes = [
		'application/x-msdownload',
		'application/x-msdos-program',
		'application/x-executable',
		'application/x-sharedlib',
		'application/x-sh',
		'application/x-bat',
		'text/x-script',
		'application/octet-stream' // Generic binary, could be anything
	];

	return dangerousTypes.includes(mimeType.toLowerCase());
}
