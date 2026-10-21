/**
 * Client-side file analysis utilities
 * Diese funktionen nutzen die browser APIs für basic file validation und analysis
 */
import type { BrowserFileMetadata, ExifData } from '#lib/types/index.ts';
import { berlinWallClockToInstant } from '#lib/utils/format/berlinWallClock.ts';
import * as exifr from 'exifr';

/** EXIF-Zeitstempel, wie exifr sie liefert: entweder roher String oder belebtes Date. */
type ExifTimestamp = Date | string;

/** Rohes EXIF-Format: "YYYY:MM:DD HH:MM:SS". */
const EXIF_DATETIME_PATTERN = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Wandelt einen EXIF-Zeitstempel in den echten Zeitpunkt der Aufnahme um.
 *
 * EXIF speichert reine Wanduhrzeit ohne Zonenangabe. Konvention im Projekt:
 * Die Kamera stand auf deutscher Zeit (so normalisiert es auch `exifUtils.ts`
 * serverseitig). `exifr` belebt den Zeitstempel dagegen in der Zeitzone des
 * Browsers — der abgelesene Wert wandert dadurch für Melder außerhalb
 * Deutschlands um den Zonenunterschied. Deshalb werden hier die **lokalen**
 * Felder gelesen (sie tragen die Wanduhrzeit verbatim) und anschließend als
 * deutsche Zeit verankert.
 *
 * @param value - EXIF-Zeitstempel als Date oder als roher "YYYY:MM:DD HH:MM:SS"-String
 * @returns Der Aufnahmezeitpunkt in UTC, oder `undefined` bei unlesbarer Angabe
 */
function exifWallClockToInstant(value: ExifTimestamp): Date | undefined {
	if (typeof value === 'string') {
		const match = EXIF_DATETIME_PATTERN.exec(value);
		if (!match) {
			return undefined;
		}
		return berlinWallClockToInstant({
			year: Number(match[1]),
			month: Number(match[2]),
			day: Number(match[3]),
			hours: Number(match[4]),
			minutes: Number(match[5]),
			seconds: Number(match[6] ?? 0)
		});
	}

	if (isNaN(value.getTime())) {
		return undefined;
	}

	return berlinWallClockToInstant({
		year: value.getFullYear(),
		month: value.getMonth() + 1,
		day: value.getDate(),
		hours: value.getHours(),
		minutes: value.getMinutes(),
		seconds: value.getSeconds()
	});
}

/**
 * Extrahiert EXIF-Daten client-seitig aus einem Bild
 */
async function extractExifData(file: File): Promise<ExifData> {
	try {
		if (!file.type.startsWith('image/')) {
			return {};
		}

		const result: ExifData = {};

		// Try GPS-specific extraction first (more reliable for GPS data)
		const gpsData = await exifr.gps(file);

		// Also get general EXIF data for timestamps and altitude
		const exifData = await exifr.parse(file, {
			gps: true,
			pick: ['latitude', 'longitude', 'altitude', 'DateTimeOriginal', 'DateTime']
		});

		if (!exifData && !gpsData) {
			return result;
		}

		// Extract GPS coordinates

		result.latitude = gpsData?.latitude ?? exifData.latitude;
		result.longitude = gpsData?.longitude ?? exifData.longitude;
		result.altitude = exifData.altitude;

		// Extract timestamp
		result.dateTime = exifData.DateTime;

		const wallClock = exifData.DateTimeOriginal ?? exifData.DateTime;
		if (wallClock) {
			result.dateTimeOriginal = exifWallClockToInstant(wallClock);
		}

		return result;
	} catch (_error) {
		return {};
	}
}

/**
 * Analysiert eine Datei client-seitig (mit EXIF-Daten wenn möglich)
 */
export async function analyzeClientFile(file: File): Promise<BrowserFileMetadata> {
	// Extract EXIF data first (for images)
	const exifData = await extractExifData(file);

	const metadata: BrowserFileMetadata = {
		fileName: file.name,
		size: file.size,
		mimeType: file.type,
		lastModified: new Date(file.lastModified),
		exifData: exifData
	};

	// Erstelle Thumbnail für Bilder
	if (file.type.startsWith('image/')) {
		try {
			metadata.thumbnail = await createImageThumbnail(file);
		} catch (_error) {
			// Ignore thumbnail creation errors
		}
	} else if (file.type.startsWith('video/')) {
		try {
			metadata.thumbnail = await createVideoThumbnail(file);
		} catch (_error) {
			// Ignore thumbnail creation errors
		}
	}

	return metadata;
}

/**
 * Erstellt ein Thumbnail für eine Bilddatei
 */
async function createImageThumbnail(file: File, maxSize: number = 200): Promise<string> {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		const img = new Image();

		img.onload = () => {
			// Berechne die Thumbnail-Dimensionen
			let { width, height } = img;

			if (width > height) {
				if (width > maxSize) {
					height = (height * maxSize) / width;
					width = maxSize;
				}
			} else {
				if (height > maxSize) {
					width = (width * maxSize) / height;
					height = maxSize;
				}
			}

			canvas.width = width;
			canvas.height = height;

			// Zeichne das verkleinerte Bild
			ctx?.drawImage(img, 0, 0, width, height);

			// Konvertiere zu Data URL
			resolve(canvas.toDataURL('image/jpeg', 0.7));
		};

		img.onerror = () => reject(new Error('Failed to load image'));
		img.src = URL.createObjectURL(file);
	});
}

/**
 * Erstellt ein Thumbnail für eine Videodatei
 */
async function createVideoThumbnail(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		video.addEventListener('loadedmetadata', () => {
			// Setze die Videozeit auf die erste Sekunde
			video.currentTime = 1;
		});

		video.addEventListener('seeked', () => {
			// Canvas-Größe auf Video-Dimensionen setzen (max. 200px)
			const maxSize = 200;
			let { videoWidth: width, videoHeight: height } = video;

			if (width > height) {
				if (width > maxSize) {
					height = (height * maxSize) / width;
					width = maxSize;
				}
			} else {
				if (height > maxSize) {
					width = (width * maxSize) / height;
					height = maxSize;
				}
			}

			canvas.width = width;
			canvas.height = height;

			// Zeichne den aktuellen Frame
			ctx?.drawImage(video, 0, 0, width, height);

			// Konvertiere zu Data URL
			resolve(canvas.toDataURL('image/jpeg', 0.7));

			// Cleanup
			URL.revokeObjectURL(video.src);
		});

		video.onerror = () => reject(new Error('Failed to load video'));
		video.src = URL.createObjectURL(file);
	});
}
