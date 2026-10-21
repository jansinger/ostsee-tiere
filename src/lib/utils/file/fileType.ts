/**
 * Shared utilities for file type detection and validation
 * Consolidates multiple implementations across the codebase
 */

/**
 * Checks if a file or mime type represents an image
 * @param fileOrMimeType - File object or mime type string
 * @returns True if the file is an image
 */
export function isImageFile(fileOrMimeType: File | string): boolean {
	const mimeType = typeof fileOrMimeType === 'string' ? fileOrMimeType : fileOrMimeType.type;

	return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml';
}

/**
 * Checks if a file or mime type represents a video
 * @param fileOrMimeType - File object or mime type string
 * @returns True if the file is a video
 */
export function isVideoFile(fileOrMimeType: File | string): boolean {
	const mimeType = typeof fileOrMimeType === 'string' ? fileOrMimeType : fileOrMimeType.type;

	return mimeType.startsWith('video/');
}

/**
 * Checks if a file or mime type represents a supported media file
 * @param fileOrMimeType - File object or mime type string
 * @returns True if the file is a supported media file
 */
export function isMediaFile(fileOrMimeType: File | string): boolean {
	return isImageFile(fileOrMimeType) || isVideoFile(fileOrMimeType);
}

/**
 * Gets an appropriate icon name for a file type
 * @param mimeType - The file's mime type
 * @returns Lucide icon name representing the file type
 * @deprecated Use getFileIconName instead for better icon support
 */
export function getFileIcon(mimeType: string): string {
	return getFileIconName(mimeType);
}

/**
 * Gets an appropriate @iconify/svelte icon name for a file type
 * @param mimeType - The file's mime type
 * @returns Iconify icon name string for use with @iconify/svelte
 */
export function getFileIconName(mimeType: string): string {
	if (isImageFile(mimeType)) return 'lucide:images';
	if (isVideoFile(mimeType)) return 'lucide:video';
	if (mimeType.includes('pdf')) return 'lucide:file-text';
	if (mimeType.includes('audio')) return 'lucide:music';
	if (mimeType.includes('text')) return 'lucide:file-text';
	if (mimeType.includes('zip') || mimeType.includes('archive')) return 'lucide:archive';
	return 'lucide:file';
}

/**
 * Gets file extension from filename or mime type
 * @param fileNameOrMimeType - File name or mime type
 * @returns File extension with dot (e.g., '.jpg')
 */
export function getFileExtension(fileNameOrMimeType: string): string {
	// If it looks like a mime type
	if (fileNameOrMimeType.includes('/')) {
		const extensionMap: Record<string, string> = {
			'image/jpeg': '.jpg',
			'image/png': '.png',
			'image/gif': '.gif',
			'image/webp': '.webp',
			'image/bmp': '.bmp',
			'video/mp4': '.mp4',
			'video/webm': '.webm',
			'video/avi': '.avi',
			'video/mov': '.mov',
			'application/pdf': '.pdf'
		};
		return extensionMap[fileNameOrMimeType] || '';
	}

	// If it's a filename
	const lastDot = fileNameOrMimeType.lastIndexOf('.');
	return lastDot !== -1 ? fileNameOrMimeType.substring(lastDot) : '';
}

/**
 * Sonderfälle für die Übersetzung von MIME-Typ in einen für Melder lesbaren
 * Formatnamen. Ohne diese Tabelle würde aus `image/jpeg` „JPEG" (Melder
 * kennen „JPG") und aus `video/quicktime` „QUICKTIME" statt „MOV".
 *
 * Einzige Quelle für diese Zuordnung — vormals dupliziert in
 * `#lib/constants/upload.ts` (`describeFormats`) und
 * `#lib/utils/validation/fileValidation.ts` (`getFileTypeDescription`).
 * Diese Datei importiert selbst nichts, ist also für beide zyklusfrei
 * erreichbar.
 */
const FILE_FORMAT_NAMES: Record<string, string> = {
	'image/jpeg': 'JPG',
	'video/quicktime': 'MOV',
	'video/x-msvideo': 'AVI',
	'video/x-matroska': 'MKV'
};

/**
 * Übersetzt einen einzelnen MIME-Typ in seinen für Melder lesbaren Formatnamen.
 * @param mimeType - Der zu übersetzende MIME-Typ
 * @returns Lesbarer Formatname (z. B. "JPG", "MOV") oder, mangels Sonderfall,
 *   der großgeschriebene Subtyp; bei fehlerhaften MIME-Typen der MIME-Typ selbst.
 */
export function getFormatName(mimeType: string): string {
	return FILE_FORMAT_NAMES[mimeType] ?? mimeType.split('/')[1]?.toUpperCase() ?? mimeType;
}

/**
 * Erzeugt eine benutzerfreundliche, entdoppelte Liste von Formatnamen aus
 * einer Liste von MIME-Typen. "image/jpeg, image/jpg" → "JPG" (nicht "JPG, JPG").
 * @param mimeTypes - Liste von MIME-Typen
 * @returns Kommagetrennte, entdoppelte Liste lesbarer Formatnamen
 */
export function describeFileFormats(mimeTypes: readonly string[]): string {
	const names = mimeTypes.map(getFormatName);
	return [...new Set(names)].join(', ');
}

/**
 * Gets mime type from file extension
 * @param extension - File extension (with or without dot)
 * @returns Mime type string
 */
export function getMimeTypeFromExtension(extension: string): string {
	const ext = extension.startsWith('.') ? extension : `.${extension}`;

	const mimeTypes: Record<string, string> = {
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.png': 'image/png',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.bmp': 'image/bmp',
		'.svg': 'image/svg+xml',
		'.mp4': 'video/mp4',
		'.webm': 'video/webm',
		'.avi': 'video/avi',
		'.mov': 'video/mov',
		'.wmv': 'video/wmv',
		'.flv': 'video/flv',
		'.mkv': 'video/mkv',
		'.m4v': 'video/m4v',
		'.pdf': 'application/pdf'
	};

	return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}
