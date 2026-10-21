/**
 * Unit Tests für exifUtils.ts
 *
 * Testet die EXIF-Datenextraktion aus Bildern
 * mit Fokus auf Fehlerbehandlung und Edge Cases
 */
import type { ExifData } from '#lib/types/index.ts';
import { isImageFile } from '#lib/utils/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasGPSData, readImageExifData } from './exifUtils';

// Mock dependencies
vi.mock('exifr', () => ({
	default: {
		parse: vi.fn()
	}
}));

vi.mock('fs', () => ({
	readFileSync: vi.fn()
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

describe('exifUtils', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('readImageExifData', () => {
		/**
		 * Test: Erfolgreiche EXIF-Extraktion aus Buffer
		 */
		it('sollte EXIF-Daten aus Buffer erfolgreich extrahieren', async () => {
			// Arrange
			const mockBuffer = Buffer.from('fake image data');
			const mockExifData = {
				latitude: 54.321,
				longitude: 12.789,
				Make: 'Canon',
				Model: 'EOS R5',
				ImageWidth: 4000,
				ImageHeight: 3000,
				Orientation: 1,
				DateTimeOriginal: '2024-01-15T14:30:00',
				ExposureTime: 0.001,
				FNumber: 2.8,
				ISO: 400,
				FocalLength: 50,
				Flash: 1
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result).toEqual({
				latitude: 54.321,
				longitude: 12.789,
				altitude: null,
				make: 'Canon',
				model: 'EOS R5',
				width: 4000,
				height: 3000,
				orientation: 1,
				dateTimeOriginal: new Date('2024-01-15T13:30:00Z'),
				exposureTime: '1/1000',
				fNumber: 2.8,
				iso: 400,
				focalLength: 50,
				flash: true
			});
		});

		/**
		 * Test: EXIF-Extraktion aus Dateipfad
		 */
		it('sollte EXIF-Daten aus Dateipfad extrahieren', async () => {
			// Arrange
			const filePath = '/path/to/image.jpg';
			const mockFileBuffer = Buffer.from('image content');
			const mockExifData = {
				latitude: 52.5,
				longitude: 13.4,
				Make: 'Nikon',
				Model: 'D850'
			};

			const fs = await import('fs');
			(fs.readFileSync as any).mockReturnValue(mockFileBuffer);

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(filePath);

			// Assert
			expect(result).toMatchObject({
				latitude: 52.5,
				longitude: 13.4,
				make: 'Nikon',
				model: 'D850'
			});
			expect(fs.readFileSync).toHaveBeenCalledWith(filePath);
		});

		/**
		 * Test: Altitude mit GPSAltitudeRef (über Meeresspiegel)
		 */
		it('sollte positive Altitude korrekt verarbeiten', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image');
			const mockExifData = {
				GPSAltitude: 150,
				GPSAltitudeRef: 0 // Über Meeresspiegel
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result?.altitude).toBe(150);
		});

		/**
		 * Test: Altitude mit GPSAltitudeRef (unter Meeresspiegel)
		 */
		it('sollte negative Altitude korrekt verarbeiten', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image');
			const mockExifData = {
				GPSAltitude: 50,
				GPSAltitudeRef: 1 // Unter Meeresspiegel
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result?.altitude).toBe(-50);
		});

		/**
		 * Test: Verschiedene Belichtungszeiten
		 */
		it('sollte verschiedene Belichtungszeiten korrekt formatieren', async () => {
			// Arrange & Act & Assert
			const testCases = [
				{ exposure: 0.001, expected: '1/1000' },
				{ exposure: 0.01, expected: '1/100' },
				{ exposure: 0.5, expected: '1/2' },
				{ exposure: 1, expected: '1s' },
				{ exposure: 2, expected: '2s' },
				{ exposure: 30, expected: '30s' }
			];

			const { default: exifr } = await import('exifr');

			for (const testCase of testCases) {
				(exifr.parse as any).mockResolvedValue({
					ExposureTime: testCase.exposure
				});

				const result = await readImageExifData(Buffer.from('image'));
				expect(result?.exposureTime).toBe(testCase.expected);
			}
		});

		/**
		 * Test: Fallback von DateTimeOriginal zu DateTime
		 */
		it('sollte DateTime verwenden wenn DateTimeOriginal fehlt', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image');
			const mockExifData = {
				DateTime: '2024-02-20T10:00:00' // Nur DateTime, kein DateTimeOriginal
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result?.dateTimeOriginal).toEqual(new Date('2024-02-20T09:00:00Z'));
		});

		/**
		 * Test: Keine EXIF-Daten vorhanden
		 */
		it('sollte null zurückgeben wenn keine EXIF-Daten vorhanden', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image without exif');
			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(null);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result).toBeNull();
		});

		/**
		 * Test: Teilweise EXIF-Daten
		 */
		it('sollte mit teilweisen EXIF-Daten umgehen können', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image');
			const mockExifData = {
				Make: 'Sony'
				// Keine GPS-Daten, kein Model, etc.
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result).toMatchObject({
				latitude: null,
				longitude: null,
				altitude: null,
				make: 'Sony',
				model: undefined,
				width: undefined,
				height: undefined
			});
		});

		/**
		 * Test: Fehlerbehandlung bei Parse-Fehler
		 */
		it('sollte null zurückgeben bei Parse-Fehler', async () => {
			// Arrange
			const mockBuffer = Buffer.from('corrupt image');
			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockRejectedValue(new Error('Invalid JPEG'));

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result).toBeNull();
		});

		/**
		 * Test: F-Number Rundung
		 */
		it('sollte F-Number auf eine Dezimalstelle runden', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image');
			const mockExifData = {
				FNumber: 2.8571428 // Sollte zu 2.9 gerundet werden
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result?.fNumber).toBe(2.9);
		});

		/**
		 * Test: Focal Length Rundung
		 */
		it('sollte Focal Length auf ganze Zahl runden', async () => {
			// Arrange
			const mockBuffer = Buffer.from('image');
			const mockExifData = {
				FocalLength: 85.7 // Sollte zu 86 gerundet werden
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(mockBuffer);

			// Assert
			expect(result?.focalLength).toBe(86);
		});

		/**
		 * Test: Flash-Wert Interpretation
		 */
		it('sollte Flash-Werte korrekt interpretieren', async () => {
			// Arrange & Act & Assert
			const testCases = [
				{ flash: 0, expected: false }, // Kein Blitz
				{ flash: 1, expected: true }, // Blitz ausgelöst
				{ flash: 5, expected: true }, // Blitz ausgelöst (andere Modi)
				{ flash: 16, expected: false } // Blitz nicht ausgelöst
			];

			const { default: exifr } = await import('exifr');

			for (const testCase of testCases) {
				(exifr.parse as any).mockResolvedValue({
					Flash: testCase.flash
				});

				const result = await readImageExifData(Buffer.from('image'));
				expect(result?.flash).toBe(testCase.expected);
			}
		});

		/**
		 * Test: Edge Case - Sehr große Buffer
		 */
		it('sollte mit großen Buffern umgehen können', async () => {
			// Arrange
			const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
			const mockExifData = {
				Make: 'TestCamera'
			};

			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(mockExifData);

			// Act
			const result = await readImageExifData(largeBuffer);

			// Assert
			expect(result).toBeDefined();
			expect(result?.make).toBe('TestCamera');
		});

		/**
		 * Test: Edge Case - Leerer Buffer
		 */
		it('sollte mit leerem Buffer umgehen', async () => {
			// Arrange
			const emptyBuffer = Buffer.from('');
			const { default: exifr } = await import('exifr');
			(exifr.parse as any).mockResolvedValue(null);

			// Act
			const result = await readImageExifData(emptyBuffer);

			// Assert
			expect(result).toBeNull();
		});
	});

	describe('hasGPSData', () => {
		/**
		 * Test: GPS-Daten vorhanden
		 */
		it('sollte true zurückgeben wenn GPS-Daten vorhanden', () => {
			// Arrange
			const exifData: ExifData = {
				latitude: 54.123,
				longitude: 12.456,
				altitude: null,
				make: 'Camera',
				model: 'Model'
			};

			// Act
			const result = hasGPSData(exifData);

			// Assert
			expect(result).toBe(true);
		});

		/**
		 * Test: Keine GPS-Daten
		 */
		it('sollte false zurückgeben wenn keine GPS-Daten vorhanden', () => {
			// Arrange
			const exifData: ExifData = {
				latitude: null,
				longitude: null,
				altitude: 100,
				make: 'Camera',
				model: 'Model'
			};

			// Act
			const result = hasGPSData(exifData);

			// Assert
			expect(result).toBe(false);
		});

		/**
		 * Test: Nur Latitude vorhanden
		 */
		it('sollte false zurückgeben wenn nur Latitude vorhanden', () => {
			// Arrange
			const exifData: ExifData = {
				latitude: 54.123,
				longitude: null,
				altitude: null,
				make: 'Camera',
				model: 'Model'
			};

			// Act
			const result = hasGPSData(exifData);

			// Assert
			expect(result).toBe(false);
		});

		/**
		 * Test: Nur Longitude vorhanden
		 */
		it('sollte false zurückgeben wenn nur Longitude vorhanden', () => {
			// Arrange
			const exifData: ExifData = {
				latitude: null,
				longitude: 12.456,
				altitude: null,
				make: 'Camera',
				model: 'Model'
			};

			// Act
			const result = hasGPSData(exifData);

			// Assert
			expect(result).toBe(false);
		});

		/**
		 * Test: Null EXIF-Daten
		 */
		it('sollte false zurückgeben für null EXIF-Daten', () => {
			// Act
			const result = hasGPSData(null);

			// Assert
			expect(result).toBe(false);
		});

		/**
		 * Test: GPS-Koordinaten bei 0,0
		 */
		it('sollte false zurückgeben für 0,0 Koordinaten (Null Island)', () => {
			// Arrange
			const exifData: ExifData = {
				latitude: 0,
				longitude: 0,
				altitude: null,
				make: 'Camera',
				model: 'Model'
			};

			// Act
			const result = hasGPSData(exifData);

			// Assert
			expect(result).toBe(false); // 0,0 wird als "keine Daten" interpretiert
		});
	});

	describe('isImageFile', () => {
		/**
		 * Test: Verschiedene Bild-MIME-Types
		 */
		it('sollte true für Bild-MIME-Types zurückgeben', () => {
			const imageMimeTypes = [
				'image/jpeg',
				'image/jpg',
				'image/png',
				'image/gif',
				'image/webp',
				'image/bmp',
				'image/tiff'
			];

			for (const mimeType of imageMimeTypes) {
				expect(isImageFile(mimeType)).toBe(true);
			}
		});

		/**
		 * Test: SVG sollte als nicht-Bild behandelt werden
		 */
		it('sollte false für SVG zurückgeben', () => {
			// SVG ist technisch ein Bild, hat aber keine EXIF-Daten
			expect(isImageFile('image/svg+xml')).toBe(false);
		});

		/**
		 * Test: Nicht-Bild MIME-Types
		 */
		it('sollte false für Nicht-Bild-MIME-Types zurückgeben', () => {
			const nonImageMimeTypes = [
				'application/pdf',
				'text/plain',
				'video/mp4',
				'audio/mpeg',
				'application/json',
				'text/html'
			];

			for (const mimeType of nonImageMimeTypes) {
				expect(isImageFile(mimeType)).toBe(false);
			}
		});

		/**
		 * Test: Edge Cases
		 */
		it('sollte Edge Cases korrekt behandeln', () => {
			expect(isImageFile('')).toBe(false);
			expect(isImageFile('image/')).toBe(true); // Beginnt mit "image/"
			expect(isImageFile('IMAGE/JPEG')).toBe(false); // Case-sensitive
			// Diese Fälle würden in Produktion einen Fehler werfen
			// Die Funktion erwartet einen String
		});
	});
});
