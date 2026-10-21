import { describe, expect, it } from 'vitest';
import {
	getFileTypeDescription,
	getValidationPreset,
	quickValidation,
	sanitizeFileName,
	validateFile,
	validateFiles,
	validateGPSPhotos
} from './fileValidation';
import { ALLOWED_MIME_TYPES, UPLOAD_LIMITS } from '#lib/constants/upload.ts';
import type { ValidationPreset } from '#lib/types/index.ts';

describe('fileValidation', () => {
	// Helper function to create mock File objects
	const createMockFile = (name: string, size: number, type: string): File => {
		// Create a proper File object with exact size
		const buffer = new ArrayBuffer(size);
		const blob = new Blob([buffer], { type });
		const file = new File([blob], name, { type });

		// Override size property to match expected size
		Object.defineProperty(file, 'size', {
			value: size,
			writable: false,
			configurable: true
		});

		return file;
	};

	describe('validateFile', () => {
		const defaultPreset: ValidationPreset = {
			allowedTypes: ALLOWED_MIME_TYPES.IMAGES,
			maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
			maxVideoFileSize: UPLOAD_LIMITS.MAX_VIDEO_FILE_SIZE,
			maxFiles: UPLOAD_LIMITS.MAX_FILES,
			accept: 'image/*'
		};

		it('should accept valid image files', () => {
			const file = createMockFile('test.jpg', 1000, 'image/jpeg');
			const result = validateFile(file, defaultPreset);

			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should reject non-File objects', () => {
			const notAFile = { name: 'test.jpg', size: 1000 } as any;
			const result = validateFile(notAFile, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Ungültiges Dateiformat empfangen.');
		});

		it('should reject files with empty names', () => {
			const file = createMockFile('', 1000, 'image/jpeg');
			const result = validateFile(file, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Datei ohne Namen'))).toBe(true);
		});

		it('should reject files with dangerous characters in filename', () => {
			const dangerousNames = [
				'../../../etc/passwd',
				'file/with/slashes.jpg',
				'file\\with\\backslashes.jpg',
				'..\\..\\windows\\system32\\config.sys'
			];

			dangerousNames.forEach((name) => {
				const file = createMockFile(name, 1000, 'image/jpeg');
				const result = validateFile(file, defaultPreset);

				expect(result.isValid).toBe(false);
				expect(result.errors.some((e) => e.includes('Unsicherer Dateiname'))).toBe(true);
			});
		});

		it('should reject empty files', () => {
			const file = createMockFile('empty.jpg', 0, 'image/jpeg');
			const result = validateFile(file, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Datei ist leer'))).toBe(true);
		});

		it('should reject files exceeding size limit', () => {
			const file = createMockFile('large.jpg', UPLOAD_LIMITS.MAX_FILE_SIZE + 1, 'image/jpeg');
			const result = validateFile(file, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('zu groß'))).toBe(true);
		});

		it('should reject files with invalid MIME types', () => {
			const file = createMockFile('test.exe', 1000, 'application/x-msdownload');
			const result = validateFile(file, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Dieses Format können wir nicht annehmen'))).toBe(
				true
			);
		});

		it('should accept all configured image types', () => {
			const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

			imageTypes.forEach((type) => {
				const file = createMockFile(`test.${type.split('/')[1]}`, 1000, type);
				const result = validateFile(file, defaultPreset);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});
		});

		it('should work with video preset', () => {
			const videoPreset: ValidationPreset = {
				allowedTypes: ALLOWED_MIME_TYPES.VIDEOS,
				maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
				maxVideoFileSize: UPLOAD_LIMITS.MAX_VIDEO_FILE_SIZE,
				maxFiles: UPLOAD_LIMITS.MAX_FILES,
				accept: 'video/*'
			};

			const videoFile = createMockFile('test.mp4', 1000, 'video/mp4');
			const result = validateFile(videoFile, videoPreset);

			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});
	});

	describe('validateFiles', () => {
		const defaultPreset: ValidationPreset = {
			allowedTypes: ALLOWED_MIME_TYPES.MEDIA,
			maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
			maxVideoFileSize: UPLOAD_LIMITS.MAX_VIDEO_FILE_SIZE,
			maxFiles: 5,
			accept: 'image/*,video/*'
		};

		it('should accept multiple valid files', () => {
			const files = [
				createMockFile('test1.jpg', 1000, 'image/jpeg'),
				createMockFile('test2.png', 2000, 'image/png'),
				createMockFile('test3.mp4', 3000, 'video/mp4')
			];

			const result = validateFiles(files, defaultPreset);

			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.validFiles).toHaveLength(3);
		});

		it('should reject when exceeding file count limit', () => {
			const files = Array.from({ length: 6 }, (_, i) =>
				createMockFile(`test${i}.jpg`, 1000, 'image/jpeg')
			);

			const result = validateFiles(files, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Zu viele Dateien'))).toBe(true);
		});

		it('should reject when total size exceeds limit', () => {
			const files = [
				createMockFile('test1.jpg', UPLOAD_LIMITS.MAX_TOTAL_SIZE / 2, 'image/jpeg'),
				createMockFile('test2.jpg', UPLOAD_LIMITS.MAX_TOTAL_SIZE / 2 + 1, 'image/jpeg')
			];

			const result = validateFiles(files, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Gesamtgröße überschritten'))).toBe(true);
		});

		it('nutzt preset.maxTotalSize statt der statischen Konstante, wenn gesetzt (Befund I4)', () => {
			// Die Konstante UPLOAD_LIMITS.MAX_TOTAL_SIZE (250 MB) ist nur noch der
			// Offline-Fallback. Liefert der Server ein kleineres Gesamtlimit (z. B.
			// weil ein Admin es auf 50 MB gesenkt hat), muss die Validierung GEGEN
			// DIESEN Wert prüfen — sonst verspricht die Dropzone weiterhin 250 MB.
			const presetWithLowerTotal: ValidationPreset = {
				...defaultPreset,
				maxTotalSize: 50 * 1024 * 1024
			};
			const files = [
				createMockFile('test1.jpg', 30 * 1024 * 1024, 'image/jpeg'),
				createMockFile('test2.jpg', 30 * 1024 * 1024, 'image/jpeg')
			];

			const result = validateFiles(files, presetWithLowerTotal);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('Gesamtgröße überschritten'))).toBe(true);
			expect(result.errors.some((e) => e.includes('50MB'))).toBe(true);
		});

		it('erlaubt eine Gesamtgröße unter UPLOAD_LIMITS.MAX_TOTAL_SIZE, wenn preset.maxTotalSize sie zulässt', () => {
			// Gegenprobe: Ein höheres preset.maxTotalSize darf nicht durch die
			// statische Konstante eingeschränkt werden — Grenzfall knapp unter
			// UPLOAD_LIMITS.MAX_TOTAL_SIZE, der ohne preset.maxTotalSize ebenfalls
			// durchginge, hier aber bewusst mit einem höheren Wert geprüft.
			const presetWithHigherTotal: ValidationPreset = {
				...defaultPreset,
				maxTotalSize: 260 * 1024 * 1024
			};
			const files = [
				createMockFile('test1.jpg', 129 * 1024 * 1024, 'image/jpeg'),
				createMockFile('test2.jpg', 129 * 1024 * 1024, 'image/jpeg')
			];

			const result = validateFiles(files, presetWithHigherTotal);

			expect(result.errors.some((e) => e.includes('Gesamtgröße überschritten'))).toBe(false);
		});

		it('should collect errors from individual file validations', () => {
			const files = [
				createMockFile('valid.jpg', 1000, 'image/jpeg'),
				createMockFile('empty.jpg', 0, 'image/jpeg'),
				createMockFile('invalid.exe', 1000, 'application/x-msdownload')
			];

			const result = validateFiles(files, defaultPreset);

			expect(result.isValid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.validFiles).toBeDefined();
			expect(result.validFiles).toHaveLength(1);
			expect(result.validFiles?.[0]?.name).toBe('valid.jpg');
		});

		it('should handle empty file array', () => {
			const result = validateFiles([], defaultPreset);

			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.validFiles).toHaveLength(0);
		});
	});

	describe('validateGPSPhotos', () => {
		it('should accept single GPS photo', () => {
			const file = createMockFile('gps.jpg', 1000, 'image/jpeg');
			const result = validateGPSPhotos([file]);

			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should reject non-image files for GPS', () => {
			const file = createMockFile('video.mp4', 1000, 'video/mp4');
			const result = validateGPSPhotos([file]);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('GPS-Upload erfordert Bilddateien'))).toBe(true);
		});

		it('should reject multiple files for GPS upload', () => {
			const files = [
				createMockFile('gps1.jpg', 1000, 'image/jpeg'),
				createMockFile('gps2.jpg', 1000, 'image/jpeg')
			];

			const result = validateGPSPhotos(files);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('GPS-Upload erlaubt nur eine Datei'))).toBe(true);
		});

		it('should enforce GPS photo size limit', () => {
			const file = createMockFile(
				'large-gps.jpg',
				UPLOAD_LIMITS.PHOTO_GPS_MAX_SIZE + 1,
				'image/jpeg'
			);
			const result = validateGPSPhotos([file]);

			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('zu groß'))).toBe(true);
		});
	});

	describe('quickValidation', () => {
		describe('isValidImage', () => {
			it('should return true for valid image types', () => {
				const validImages = [
					createMockFile('test.jpg', 1000, 'image/jpeg'),
					createMockFile('test.png', 1000, 'image/png'),
					createMockFile('test.gif', 1000, 'image/gif')
				];

				validImages.forEach((file) => {
					expect(quickValidation.isValidImage(file)).toBe(true);
				});
			});

			it('should return false for non-image types', () => {
				const invalidImages = [
					createMockFile('test.mp4', 1000, 'video/mp4'),
					createMockFile('test.pdf', 1000, 'application/pdf'),
					createMockFile('test.txt', 1000, 'text/plain')
				];

				invalidImages.forEach((file) => {
					expect(quickValidation.isValidImage(file)).toBe(false);
				});
			});
		});

		describe('isValidVideo', () => {
			it('should return true for valid video types', () => {
				const validVideos = [
					createMockFile('test.mp4', 1000, 'video/mp4'),
					createMockFile('test.mov', 1000, 'video/quicktime'),
					createMockFile('test.webm', 1000, 'video/webm')
				];

				validVideos.forEach((file) => {
					expect(quickValidation.isValidVideo(file)).toBe(true);
				});
			});

			it('should return false for non-video types', () => {
				const invalidVideos = [
					createMockFile('test.jpg', 1000, 'image/jpeg'),
					createMockFile('test.pdf', 1000, 'application/pdf')
				];

				invalidVideos.forEach((file) => {
					expect(quickValidation.isValidVideo(file)).toBe(false);
				});
			});
		});

		describe('isValidMedia', () => {
			it('should return true for both images and videos', () => {
				const validMedia = [
					createMockFile('test.jpg', 1000, 'image/jpeg'),
					createMockFile('test.mp4', 1000, 'video/mp4'),
					createMockFile('test.png', 1000, 'image/png'),
					createMockFile('test.webm', 1000, 'video/webm')
				];

				validMedia.forEach((file) => {
					expect(quickValidation.isValidMedia(file)).toBe(true);
				});
			});

			it('should return false for non-media types', () => {
				const invalidMedia = [
					createMockFile('test.pdf', 1000, 'application/pdf'),
					createMockFile('test.txt', 1000, 'text/plain'),
					createMockFile('test.exe', 1000, 'application/x-msdownload')
				];

				invalidMedia.forEach((file) => {
					expect(quickValidation.isValidMedia(file)).toBe(false);
				});
			});
		});

		describe('isValidSize', () => {
			it('should return true for files within size limit', () => {
				const file = createMockFile('test.jpg', 1000, 'image/jpeg');
				expect(quickValidation.isValidSize(file)).toBe(true);
			});

			it('should return false for empty files', () => {
				const file = createMockFile('empty.jpg', 0, 'image/jpeg');
				expect(quickValidation.isValidSize(file)).toBe(false);
			});

			it('should return false for files exceeding size limit', () => {
				const file = createMockFile('large.jpg', UPLOAD_LIMITS.MAX_FILE_SIZE + 1, 'image/jpeg');
				expect(quickValidation.isValidSize(file)).toBe(false);
			});

			it('should respect custom size limit', () => {
				const file = createMockFile('test.jpg', 5000, 'image/jpeg');
				expect(quickValidation.isValidSize(file, 10000)).toBe(true);
				expect(quickValidation.isValidSize(file, 4000)).toBe(false);
			});
		});

		describe('isSafeFilename', () => {
			it('should return true for safe filenames', () => {
				const safeNames = [
					'test.jpg',
					'my-photo.png',
					'file_123.gif',
					'document.pdf',
					'2024-08-21-photo.jpg'
				];

				safeNames.forEach((name) => {
					expect(quickValidation.isSafeFilename(name)).toBe(true);
				});
			});

			it('should return false for unsafe filenames', () => {
				const unsafeNames = [
					'../../../etc/passwd',
					'file/with/slashes.jpg',
					'file\\with\\backslashes.jpg',
					'',
					'   ',
					'..hidden',
					'..',
					'.../'
				];

				unsafeNames.forEach((name) => {
					expect(quickValidation.isSafeFilename(name)).toBe(false);
				});
			});
		});
	});

	describe('sanitizeFileName', () => {
		it('should replace unsafe characters with underscores', () => {
			expect(sanitizeFileName('file name.jpg')).toBe('file_name.jpg');
			expect(sanitizeFileName('file/with/slashes.jpg')).toBe('file_with_slashes.jpg');
			expect(sanitizeFileName('file\\with\\backslashes.jpg')).toBe('file_with_backslashes.jpg');
			expect(sanitizeFileName('file@#$%.jpg')).toBe('file____.jpg');
		});

		it('should prevent multiple dots', () => {
			expect(sanitizeFileName('file...jpg')).toBe('file.jpg');
			expect(sanitizeFileName('file....test....jpg')).toBe('file.test.jpg');
		});

		it('should remove leading dots', () => {
			expect(sanitizeFileName('.hidden.jpg')).toBe('hidden.jpg');
			expect(sanitizeFileName('..hidden.jpg')).toBe('hidden.jpg');
		});

		it('should limit filename length to 100 characters', () => {
			const longName = 'a'.repeat(150) + '.jpg';
			const sanitized = sanitizeFileName(longName);
			expect(sanitized.length).toBe(100);
		});

		it('should preserve valid characters', () => {
			expect(sanitizeFileName('valid-file_123.jpg')).toBe('valid-file_123.jpg');
			expect(sanitizeFileName('Test.File.2024.jpg')).toBe('Test.File.2024.jpg');
		});

		it('should handle special characters from different languages', () => {
			expect(sanitizeFileName('ÄÖÜäöü.jpg')).toBe('______.jpg');
			expect(sanitizeFileName('файл.jpg')).toBe('____.jpg');
			expect(sanitizeFileName('文件.jpg')).toBe('__.jpg');
		});
	});

	describe('getValidationPreset', () => {
		it('should return a validation preset with correct structure', () => {
			const preset = getValidationPreset('MEDIA' as any);

			expect(preset).toHaveProperty('allowedTypes');
			expect(preset).toHaveProperty('maxFileSize');
			expect(preset).toHaveProperty('maxFiles');
			expect(preset).toHaveProperty('accept');
			expect(Array.isArray(preset.allowedTypes)).toBe(true);
			expect(typeof preset.maxFileSize).toBe('number');
			expect(typeof preset.maxFiles).toBe('number');
			expect(typeof preset.accept).toBe('string');
		});

		it('should return media preset by default', () => {
			const preset = getValidationPreset('UNKNOWN' as any);

			expect(preset.allowedTypes).toEqual(ALLOWED_MIME_TYPES.MEDIA);
			expect(preset.maxFileSize).toBe(UPLOAD_LIMITS.MAX_FILE_SIZE);
			expect(preset.maxFiles).toBe(UPLOAD_LIMITS.MAX_FILES);
		});
	});

	describe('getFileTypeDescription', () => {
		it('should generate readable file type descriptions', () => {
			const imageTypes = ['image/jpeg', 'image/png', 'image/gif'];
			const description = getFileTypeDescription(imageTypes);

			expect(description).toBe('JPG, PNG, GIF');
		});

		it('should handle JPEG special case', () => {
			const types = ['image/jpeg'];
			const description = getFileTypeDescription(types);

			expect(description).toBe('JPG');
		});

		it('should handle video types', () => {
			const videoTypes = ['video/mp4', 'video/webm', 'video/avi'];
			const description = getFileTypeDescription(videoTypes);

			expect(description).toBe('MP4, WEBM, AVI');
		});

		it('should handle mixed media types', () => {
			const mixedTypes = ['image/jpeg', 'video/mp4', 'image/png'];
			const description = getFileTypeDescription(mixedTypes);

			expect(description).toBe('JPG, MP4, PNG');
		});

		it('should handle empty array', () => {
			const description = getFileTypeDescription([]);
			expect(description).toBe('');
		});

		it('should handle malformed MIME types', () => {
			const types = ['image', 'text/plain', 'invalid'];
			const description = getFileTypeDescription(types);

			expect(description).toContain('PLAIN');
		});

		// Der Grund, warum diese Funktion überhaupt Sonderfälle kennt: Aus dem
		// MIME-Subtyp abgeleitet hieße video/quicktime für den Melder
		// "QUICKTIME" — ein Wort, das auf keinem Telefon steht. Er kennt "MOV".
		it('nennt QuickTime beim Namen, den Melder kennen', () => {
			expect(getFileTypeDescription(['video/quicktime'])).toBe('MOV');
		});

		it('beschreibt die öffentlich angebotene Liste vollständig lesbar', () => {
			const description = getFileTypeDescription([
				'image/jpeg',
				'image/png',
				'image/gif',
				'image/webp',
				'video/mp4',
				'video/quicktime'
			]);

			expect(description).toBe('JPG, PNG, GIF, WEBP, MP4, MOV');
		});

		it('nennt ein Format nicht doppelt, wenn zwei MIME-Typen darauf zeigen', () => {
			// image/jpeg und image/jpg sind beide JPG.
			expect(getFileTypeDescription(['image/jpeg', 'image/jpg'])).toBe('JPG');
		});
	});

	describe('Edge cases and error handling', () => {
		it('should handle null and undefined gracefully', () => {
			const preset: ValidationPreset = {
				allowedTypes: ALLOWED_MIME_TYPES.IMAGES,
				maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
				maxVideoFileSize: UPLOAD_LIMITS.MAX_VIDEO_FILE_SIZE,
				maxFiles: UPLOAD_LIMITS.MAX_FILES,
				accept: 'image/*'
			};

			const nullResult = validateFile(null as any, preset);
			expect(nullResult.isValid).toBe(false);

			const undefinedResult = validateFile(undefined as any, preset);
			expect(undefinedResult.isValid).toBe(false);
		});

		it('should handle files with whitespace-only names', () => {
			const file = createMockFile('   ', 1000, 'image/jpeg');
			const preset: ValidationPreset = {
				allowedTypes: ALLOWED_MIME_TYPES.IMAGES,
				maxFileSize: UPLOAD_LIMITS.MAX_FILE_SIZE,
				maxVideoFileSize: UPLOAD_LIMITS.MAX_VIDEO_FILE_SIZE,
				maxFiles: UPLOAD_LIMITS.MAX_FILES,
				accept: 'image/*'
			};

			const result = validateFile(file, preset);
			expect(result.isValid).toBe(false);
		});

		it('should validate boundary values for file size', () => {
			const preset: ValidationPreset = {
				allowedTypes: ALLOWED_MIME_TYPES.IMAGES,
				maxFileSize: 1000,
				maxVideoFileSize: 1000,
				maxFiles: 1,
				accept: 'image/*'
			};

			// Exactly at limit
			const fileAtLimit = createMockFile('test.jpg', 1000, 'image/jpeg');
			expect(validateFile(fileAtLimit, preset).isValid).toBe(true);

			// Just over limit
			const fileOverLimit = createMockFile('test.jpg', 1001, 'image/jpeg');
			expect(validateFile(fileOverLimit, preset).isValid).toBe(false);

			// Just under limit
			const fileUnderLimit = createMockFile('test.jpg', 999, 'image/jpeg');
			expect(validateFile(fileUnderLimit, preset).isValid).toBe(true);
		});
	});
});
