/**
 * Media-related type definitions
 */

import type { MediaFile } from '#lib/utils/media/MediaFile.svelte.ts';
import type { ExifData } from './ExifData';
import type { UploadedFileInfo } from './UploadedFile';

/**
 * Media store type for managing media files
 */
export interface MediaStore {
	mediaFiles: MediaFile[];
}

/**
 * Media file class interface
 */
export interface MediaFileData {
	id: string;
	uid: string;
	name: string;
	fileName?: string;
	size: number;
	type: string;
	url: string;
	thumbnail?: string;
	timestamp?: Date | null;
	exifData?: ExifData | null;
	hasPosition(): boolean;
}

/**
 * Media file types
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'unknown';

/**
 * Media processing options
 */
export interface MediaProcessingOptions {
	extractExif?: boolean;
	generateThumbnail?: boolean;
	validateLocation?: boolean;
	maxSize?: number;
	allowedTypes?: string[];
}

/**
 * Media upload result
 */
export interface MediaUploadResult {
	success: boolean;
	fileInfo?: UploadedFileInfo;
	error?: string;
	exifData?: ExifData;
}
