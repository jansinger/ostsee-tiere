/**
 * Local filesystem storage provider with security hardening
 *
 * Implements path normalization and validation to prevent directory traversal attacks
 */
import { createLogger } from '#lib/logger.server.ts';
import type {
	FileMetadata,
	StorageFileStream,
	StorageProvider,
	UploadedFileInfo,
	UploadOptions
} from '#lib/types/index.ts';
import {
	createReadStream,
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'fs';
import { basename, extname, join, normalize, relative, resolve } from 'path';
import { Readable } from 'stream';

const logger = createLogger('storage:local');

/**
 * Maximum file name length to prevent filesystem issues
 */
const MAX_FILENAME_LENGTH = 255;

export class LocalStorageProvider implements StorageProvider {
	private publicUrlBase: string;
	private resolvedBaseDir: string;

	constructor(baseDir: string = 'uploads', publicUrlBase: string = '/uploads') {
		this.publicUrlBase = publicUrlBase;
		// Resolve base directory to absolute path for security checks
		this.resolvedBaseDir = resolve(baseDir);

		// Ensure base directory exists
		if (!existsSync(this.resolvedBaseDir)) {
			mkdirSync(this.resolvedBaseDir, { recursive: true });
			logger.info({ baseDir: this.resolvedBaseDir }, 'Created base storage directory');
		}
	}

	/**
	 * Sanitizes a filename to prevent security issues
	 *
	 * @param filename - The original filename
	 * @returns Sanitized filename safe for filesystem operations
	 */
	private sanitizeFilename(filename: string): string {
		// Remove any path components (just get the filename)
		let sanitized = basename(filename);

		// Remove null bytes
		sanitized = sanitized.replace(/\0/g, '');

		// Replace unsafe characters with underscores
		sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

		// Remove leading dots to prevent hidden files
		sanitized = sanitized.replace(/^\.+/, '');

		// Limit length
		if (sanitized.length > MAX_FILENAME_LENGTH) {
			const ext = extname(sanitized);
			const nameWithoutExt = sanitized.slice(0, sanitized.length - ext.length);
			sanitized = nameWithoutExt.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
		}

		// Fallback if completely empty
		if (!sanitized) {
			sanitized = 'unnamed_file';
		}

		return sanitized;
	}

	/**
	 * Validates and normalizes a path to ensure it's within the base directory
	 *
	 * @param inputPath - The path to validate
	 * @returns Normalized safe path relative to base directory
	 * @throws Error if path would escape base directory
	 */
	private validatePath(inputPath: string): string {
		// Normalize the path to remove .. and . components
		const normalizedPath = normalize(inputPath);

		// Remove leading slashes to ensure it's relative
		const relativePath = normalizedPath.replace(/^[/\\]+/, '');

		// Construct the full path
		const fullPath = resolve(this.resolvedBaseDir, relativePath);

		// Ensure the resolved path is within the base directory
		const relativeToBase = relative(this.resolvedBaseDir, fullPath);

		// Check if path tries to escape base directory
		if (relativeToBase.startsWith('..')) {
			logger.error(
				{
					inputPath,
					normalizedPath,
					fullPath,
					relativeToBase,
					baseDir: this.resolvedBaseDir
				},
				'Path traversal attempt detected'
			);
			throw new Error('Invalid path: Directory traversal detected');
		}

		return relativePath;
	}

	async upload(file: File, buffer: Buffer, options: UploadOptions): Promise<UploadedFileInfo> {
		const safeUid = this.validatePath(options.uid);

		// Sanitize the original filename
		const sanitizedOriginalName = this.sanitizeFilename(file.name);
		const extension = extname(sanitizedOriginalName);

		// Create safe filename
		const fileName = options.preserveOriginalName
			? `${basename(sanitizedOriginalName, extension)}-${safeUid}${extension}`
			: `${safeUid}${extension}`;

		// Validate and sanitize the reference ID to prevent path traversal
		const safeReferenceId = this.validatePath(options.referenceId);

		// Build safe paths
		const relativePath = join(safeReferenceId, fileName);
		const fullPath = join(this.resolvedBaseDir, relativePath);
		const dir = join(this.resolvedBaseDir, safeReferenceId);

		// Ensure directory exists
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
			logger.debug({ dir }, 'Created upload directory');
		}

		// Write file
		writeFileSync(fullPath, buffer);

		const uploadedFile: UploadedFileInfo = {
			uid: safeUid,
			originalName: file.name,
			fileName,
			filePath: relativePath,
			size: file.size,
			mimeType: file.type,
			url: this.getUrl(relativePath),
			uploadedAt: new Date().toISOString()
		};

		logger.debug({ uploadedFile }, 'File uploaded to local storage');
		return uploadedFile;
	}

	async delete(filePath: string): Promise<void> {
		try {
			// Validate path before deletion
			const safePath = this.validatePath(filePath);
			const fullPath = join(this.resolvedBaseDir, safePath);

			if (existsSync(fullPath)) {
				unlinkSync(fullPath);
				logger.debug({ filePath: safePath }, 'File deleted from local storage');
			} else {
				logger.warn({ filePath: safePath }, 'File not found for deletion');
			}
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to delete file due to invalid path');
			throw error;
		}
	}

	getUrl(filePath: string): string {
		// For URL generation, we assume the path has already been validated
		// when it was stored, but we still normalize it for consistency
		const normalizedPath = filePath.replace(/\\/g, '/');
		return `${this.publicUrlBase}/${normalizedPath}`;
	}

	async getMetadata(filePath: string): Promise<FileMetadata | null> {
		try {
			// Validate path before accessing metadata
			const safePath = this.validatePath(filePath);
			const fullPath = join(this.resolvedBaseDir, safePath);

			if (!existsSync(fullPath)) {
				return null;
			}

			const stats = statSync(fullPath);

			return {
				size: stats.size,
				mimeType: this.getMimeTypeFromExtension(extname(safePath)),
				lastModified: stats.mtime
			};
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to get metadata due to invalid path');
			return null;
		}
	}

	async list(prefix?: string): Promise<UploadedFileInfo[]> {
		try {
			// Validate prefix if provided
			const safePrefix = prefix ? this.validatePath(prefix) : '';
			const searchDir = safePrefix ? join(this.resolvedBaseDir, safePrefix) : this.resolvedBaseDir;

			if (!existsSync(searchDir)) {
				return [];
			}

			const files: UploadedFileInfo[] = [];
			const entries = readdirSync(searchDir, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isFile()) {
					const fullPath = join(searchDir, entry.name);
					const relativePath = safePrefix ? join(safePrefix, entry.name) : entry.name;
					const stats = statSync(fullPath);

					files.push({
						uid: entry.name.split('.')[0] || 'unknown',
						originalName: entry.name,
						fileName: entry.name,
						filePath: relativePath,
						size: stats.size,
						mimeType: this.getMimeTypeFromExtension(extname(entry.name)),
						url: this.getUrl(relativePath),
						uploadedAt: stats.birthtime.toISOString()
					});
				}
			}

			return files;
		} catch (error) {
			logger.error({ error, prefix }, 'Failed to list files due to invalid path');
			return [];
		}
	}

	async exists(filePath: string): Promise<boolean> {
		try {
			// Validate path before checking existence
			const safePath = this.validatePath(filePath);
			const fullPath = join(this.resolvedBaseDir, safePath);
			return existsSync(fullPath);
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to check file existence due to invalid path');
			return false;
		}
	}

	async getFileContent(filePath: string): Promise<Buffer | null> {
		try {
			// Validate path before reading content
			const safePath = this.validatePath(filePath);
			const fullPath = join(this.resolvedBaseDir, safePath);

			if (!existsSync(fullPath)) {
				logger.warn({ filePath: safePath }, 'File not found for content retrieval');
				return null;
			}

			// Import readFileSync dynamically to avoid bundling issues
			const { readFileSync } = await import('fs');
			const content = readFileSync(fullPath);

			logger.debug({ filePath: safePath, size: content.length }, 'File content retrieved');
			return content;
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to get file content');
			return null;
		}
	}

	async getFileStream(
		filePath: string,
		range?: { start: number; end: number }
	): Promise<StorageFileStream | null> {
		try {
			const safePath = this.validatePath(filePath);
			const fullPath = join(this.resolvedBaseDir, safePath);

			if (!existsSync(fullPath)) {
				logger.warn({ filePath: safePath }, 'File not found for stream');
				return null;
			}

			const totalSize = statSync(fullPath).size;
			const nodeStream = range
				? createReadStream(fullPath, { start: range.start, end: range.end })
				: createReadStream(fullPath);

			logger.debug({ filePath: safePath, totalSize, range }, 'File stream opened');

			return {
				stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
				totalSize,
				// createReadStream({ start, end }) hält einen angeforderten Bereich
				// immer ein — anders als ein CDN kann der lokale Provider ihn nicht
				// stillschweigend ignorieren.
				rangeDelivered: true
			};
		} catch (error) {
			logger.error({ error, filePath }, 'Failed to open file stream');
			return null;
		}
	}

	private getMimeTypeFromExtension(ext: string): string {
		const mimeTypes: Record<string, string> = {
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.svg': 'image/svg+xml',
			'.mp4': 'video/mp4',
			'.webm': 'video/webm',
			'.pdf': 'application/pdf',
			'.txt': 'text/plain'
		};

		return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
	}
}
