#!/usr/bin/env tsx
/**
 * Migration script to move old uploads from sichtungen.aufnahme to sichtung_files table
 *
 * This script:
 * 1. Reads all rows from sichtungen where aufnahme is not null/empty
 * 2. Ensures aufnahmeHochladen is set to "1" for all found rows
 * 3. Creates new entries in sichtung_files table with complete metadata
 * 4. Extracts EXIF data from image files (GPS, camera info, etc.)
 * 5. Copies files from <UPLOAD_PATH>/_old_uploads/ to <UPLOAD_PATH>/{referenz_id}/
 *    (preserves originals; UPLOAD_PATH defaults to `uploads` relative to the working directory)
 */

import type { ExifData } from '#lib/types/index.ts';
import type { SightingFileInsert } from '#lib/types/sightingFile.ts';
import { createId } from '@paralleldrive/cuid2';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Stats } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import * as schema from '../lib/server/db/schema';
import { sightingFiles, sightings } from '../lib/server/db/schema';

// Simple logger interface for standalone script
interface Logger {
	debug: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
}

// Create simple standalone logger
function createStandaloneLogger(_context: string): Logger {
	return {
		debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
		info: (msg: string) => console.log(`[INFO] ${msg}`),
		warn: (msg: string) => console.warn(`[WARN] ${msg}`),
		error: (msg: string) => console.error(`[ERROR] ${msg}`)
	};
}

// Colors for console output
const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m'
};

const log = {
	info: (msg: string) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
	success: (msg: string) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
	warning: (msg: string) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
	error: (msg: string) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`)
};

// Initialize logger for EXIF utilities (they expect a global logger)
// Mock the SvelteKit logger module for standalone execution
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).logger = createStandaloneLogger('migration:old-uploads');

/**
 * Überprüft ob die Datei ein Bild ist (für EXIF-Verarbeitung)
 */
function isImageFile(mimeType: string): boolean {
	return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml';
}

/**
 * Erkennt eine 0-Byte-Quelldatei. `_old_uploads/` enthält vereinzelt bereits
 * leere Dateien aus dem Altsystem — ungeprüft übernommen landen sie als
 * kaputte Medien an veröffentlichten Sichtungen (Befund vom 2026-07-31).
 */
export function isEmptySourceFile(size: number): boolean {
	return size === 0;
}

/**
 * Liest EXIF-Daten aus einer Datei
 */
async function readImageExifData(filePath: string): Promise<ExifData | null> {
	try {
		// Dynamically import exifr library
		const { default: exifr } = await import('exifr');

		// Read file as buffer
		const buffer = await fs.readFile(filePath);

		// Parse EXIF data with comprehensive options
		const exifData = await exifr.parse(buffer, {
			gps: true,
			exif: true,
			iptc: false,
			icc: false,
			jfif: false,
			ihdr: true,
			pick: [
				// GPS
				'GPSLatitude',
				'GPSLongitude',
				'GPSAltitude',
				'GPSAltitudeRef',
				// Camera
				'Make',
				'Model',
				'DateTimeOriginal',
				'DateTime',
				'ExposureTime',
				'FNumber',
				'ISO',
				'FocalLength',
				'Flash',
				// Image
				'ImageWidth',
				'ImageHeight',
				'Orientation'
			]
		});

		if (!exifData) {
			return null;
		}

		// Extract and format data
		const result: ExifData = {
			latitude: exifData.latitude || null,
			longitude: exifData.longitude || null,
			altitude: null,
			make: exifData.Make,
			model: exifData.Model,
			width: exifData.ImageWidth,
			height: exifData.ImageHeight,
			orientation: exifData.Orientation
		};

		// Handle altitude with reference
		if (exifData.GPSAltitude !== undefined) {
			result.altitude = exifData.GPSAltitude;
			// GPSAltitudeRef: 0 = above sea level, 1 = below sea level
			if (exifData.GPSAltitudeRef === 1 && result.altitude) {
				result.altitude = -result.altitude;
			}
		}

		// Handle timestamp
		if (exifData.DateTimeOriginal) {
			result.dateTimeOriginal = new Date(exifData.DateTimeOriginal);
		} else if (exifData.DateTime) {
			result.dateTimeOriginal = new Date(exifData.DateTime);
		}

		// Handle exposure time
		if (exifData.ExposureTime) {
			if (exifData.ExposureTime < 1) {
				result.exposureTime = `1/${Math.round(1 / exifData.ExposureTime)}`;
			} else {
				result.exposureTime = `${exifData.ExposureTime}s`;
			}
		}

		// Handle f-number
		if (exifData.FNumber) {
			result.fNumber = Math.round(exifData.FNumber * 10) / 10;
		}

		// Handle ISO
		if (exifData.ISO) {
			result.iso = exifData.ISO;
		}

		// Handle focal length
		if (exifData.FocalLength) {
			result.focalLength = Math.round(exifData.FocalLength);
		}

		// Handle flash
		if (exifData.Flash !== undefined) {
			result.flash = (exifData.Flash & 1) === 1; // Flash fired
		}

		return result;
	} catch (error) {
		log.warning(`Error reading EXIF data from ${path.basename(filePath)}: ${error}`);
		return null;
	}
}

interface SightingWithUpload {
	id: number;
	uid: string;
	mediaFile: string;
	mediaUpload: number;
	sightingDate: Date | null;
	referenceId?: string;
}

async function getFileInfo(filePath: string): Promise<{
	mimeType: string;
	size: number;
	exifData: ExifData | null;
	url?: string;
}> {
	try {
		const stats = await fs.stat(filePath);
		// Determine MIME type from file extension
		const ext = path.extname(filePath).toLowerCase();
		const mimeTypes: Record<string, string> = {
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.mp4': 'video/mp4',
			'.mov': 'video/quicktime',
			'.avi': 'video/x-msvideo',
			'.pdf': 'application/pdf'
		};
		const mimeType = mimeTypes[ext] || 'application/octet-stream';

		// Extract EXIF data for images
		let exifData: ExifData | null = null;
		if (isImageFile(mimeType)) {
			log.info(`Extracting EXIF data from ${path.basename(filePath)}...`);
			try {
				exifData = await readImageExifData(filePath);
				if (exifData) {
					log.success(
						`EXIF data extracted: GPS=${!!(exifData.latitude && exifData.longitude)}, Camera=${!!(exifData.make || exifData.model)}`
					);
				} else {
					log.warning(`No EXIF data found in ${path.basename(filePath)}`);
				}
			} catch (exifError) {
				log.warning(`Failed to extract EXIF data from ${path.basename(filePath)}: ${exifError}`);
			}
		}

		return { mimeType, size: stats.size, exifData };
	} catch (error) {
		log.error(`Failed to get file info: ${error}`);
		throw error;
	}
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		await fs.access(dirPath);
	} catch {
		await fs.mkdir(dirPath, { recursive: true });
	}
}

async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
	try {
		// Ensure target directory exists
		const targetDir = path.dirname(targetPath);
		await ensureDirectoryExists(targetDir);

		// Copy the file (preserve original)
		await fs.copyFile(sourcePath, targetPath);
		log.success(`Copied file: ${sourcePath} -> ${targetPath}`);
	} catch (error) {
		log.error(`Failed to copy file: ${error}`);
		throw error;
	}
}

async function main() {
	log.info('Starting migration of old uploads...');

	// Initialize database connection with environment variables
	const databaseUrl = process.env.DATABASE_POSTGRES_URL;
	if (!databaseUrl) {
		log.error('DATABASE_POSTGRES_URL environment variable is not set');
		process.exit(1);
	}

	const client = postgres(databaseUrl);
	const db = drizzle(client, { schema });

	// Same UPLOAD_PATH contract as the app (src/lib/server/storage/uploadPath.ts).
	// Standalone script — cannot use SvelteKit's env modules, so read process.env directly.
	const baseUploadPath = path.resolve((process.env.UPLOAD_PATH ?? '').trim() || 'uploads');
	const oldUploadPath = path.join(baseUploadPath, '_old_uploads');

	try {
		// Check if old uploads directory exists
		try {
			await fs.access(oldUploadPath);
		} catch {
			log.error(`Old uploads directory not found: ${oldUploadPath}`);
			log.info('Please ensure the _old_uploads directory exists in the uploads folder');
			process.exit(1);
		}

		// 1. Find all sightings with aufnahme field populated
		log.info('Fetching sightings with uploads...');

		const sightingsWithUploads = (await db
			.select({
				id: sightings.id,
				mediaFile: sightings.mediaFile,
				mediaUpload: sightings.mediaUpload,
				sightingDate: sightings.sightingDate,
				referenceId: sightings.referenceId
			})
			.from(sightings)
			.where(
				and(isNotNull(sightings.mediaFile), ne(sightings.mediaFile, ''))
			)) as SightingWithUpload[];

		log.info(`Found ${sightingsWithUploads.length} sightings with uploads`);

		if (sightingsWithUploads.length === 0) {
			log.info('No sightings with uploads found. Migration complete.');
			return;
		}

		// Process each sighting
		let successCount = 0;
		let errorCount = 0;
		let emptySkippedCount = 0;

		for (const sighting of sightingsWithUploads) {
			try {
				log.info(`Processing sighting ID ${sighting.id}: ${sighting.mediaFile}`);

				// 2. Ensure mediaUpload is set to 1
				if (sighting.mediaUpload !== 1) {
					log.info(`Setting mediaUpload to 1 for sighting ${sighting.id}`);
					await db.update(sightings).set({ mediaUpload: 1 }).where(eq(sightings.id, sighting.id));
				}

				// Parse the mediaFile field (could be multiple files separated by comma)
				const fileNames = sighting.mediaFile
					.split(',')
					.map((f) => f.trim())
					.filter((f) => f);

				for (const fileName of fileNames) {
					try {
						// Generate new reference ID
						const referenzId = sighting.referenceId || createId();

						// Build paths
						const sourcePath = path.join(oldUploadPath, fileName);
						const targetDir = path.join(baseUploadPath, referenzId);
						const targetPath = path.join(targetDir, fileName);

						// Check if source file exists
						let sourceStats: Stats;
						try {
							sourceStats = await fs.stat(sourcePath);
						} catch {
							log.warning(`Source file not found, skipping: ${sourcePath}`);
							continue;
						}

						if (isEmptySourceFile(sourceStats.size)) {
							log.warning(`Source file is empty (0 bytes), skipping: ${sourcePath}`);
							emptySkippedCount++;
							continue;
						}

						// Get file info with EXIF data
						const { mimeType, size, exifData } = await getFileInfo(sourcePath);

						// Copy the file
						await copyFile(sourcePath, targetPath);

						// 3. Create entry in sichtung_files table
						const uploadDate = sighting.sightingDate || new Date().toISOString();

						// Create URL path for the file
						const fileUrl = `/uploads/${referenzId}/${fileName}`;

						// Generate a unique identifier for the file
						const uid = createId();

						await db.insert(sightingFiles).values({
							uid: uid,
							sightingId: sighting.id,
							referenceId: referenzId,
							originalName: fileName,
							fileName: fileName,
							filePath: `${referenzId}/${fileName}`,
							mimeType: mimeType,
							size: size,
							url: fileUrl,
							exifData: exifData,
							uploadedAt: uploadDate,
							createdAt: uploadDate
						} as SightingFileInsert);

						const hasExif = exifData ? 'with EXIF' : 'no EXIF';
						log.success(`Copied file: ${fileName} for sighting ${sighting.id} (${hasExif})`);
					} catch (fileError) {
						log.error(`Failed to process file ${fileName}: ${fileError}`);
						errorCount++;
					}
				}

				successCount++;
			} catch (error) {
				log.error(`Failed to process sighting ${sighting.id}: ${error}`);
				errorCount++;
			}
		}

		// Summary
		log.info('='.repeat(50));
		log.success(`Migration completed!`);
		log.info(`Successfully processed: ${successCount} sightings`);
		if (errorCount > 0) {
			log.warning(`Errors encountered: ${errorCount}`);
		}
		if (emptySkippedCount > 0) {
			log.warning(`Skipped empty (0-byte) source files: ${emptySkippedCount}`);
		}

		// Summary: Files are preserved in _old_uploads for safety
		const totalFiles = await fs.readdir(oldUploadPath);
		log.info(`Original files preserved in _old_uploads directory: ${totalFiles.length} files`);
		log.info('Files have been copied (not moved) - originals are safely preserved.');
		log.info(
			'You can manually review and remove _old_uploads directory when satisfied with migration.'
		);
	} catch (error) {
		log.error(`Migration failed: ${error}`);
		process.exit(1);
	} finally {
		// Close database connection
		await client.end();
		process.exit(0);
	}
}

// `pathToFileURL` statt Zeichenkettenbau, gleiches Muster wie in
// cleanup-orphaned-uploads.ts: verhindert, dass ein Test-Import von
// `isEmptySourceFile` die komplette Migration ausführt.
const isDirectRun =
	typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	// Run the migration
	main().catch((error) => {
		log.error(`Unhandled error: ${error}`);
		process.exit(1);
	});
}
