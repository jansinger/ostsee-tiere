import path from 'path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mutable mock environment object
const mockEnv: Record<string, string> = {
	UPLOAD_PATH: ''
};

// Mock environment variables (dynamic env) with getter to allow runtime changes
vi.mock('#lib/server/env.ts', () => ({
	env: new Proxy({} as Record<string, string>, {
		get: (_target, prop: string) => mockEnv[prop] ?? '',
		set: (_target, prop: string, value: string) => {
			mockEnv[prop] = value;
			return true;
		}
	})
}));

// Mock the logger
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

// Mock fs functions
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	statSync: vi.fn()
}));

// Import after mocks are set up
import {
	ALLOWED_UPLOAD_MIME_TYPES,
	getFileInfo,
	getMimeTypeFromExtension,
	getUploadPath,
	isAllowedMimeType,
	isValidUploadPath
} from './uploads';

describe('uploads utilities', () => {
	let mockExistsSync: any;
	let mockStatSync: any;

	beforeEach(async () => {
		// Import the mocked fs functions
		const fsModule = await import('fs');
		mockExistsSync = fsModule.existsSync;
		mockStatSync = fsModule.statSync;

		vi.clearAllMocks();
	});

	describe('isValidUploadPath (Security Critical)', () => {
		describe('safe paths (should return true)', () => {
			test('should allow simple filename', () => {
				expect(isValidUploadPath('photo.jpg')).toBe(true);
			});

			test('should allow simple subdirectory path', () => {
				expect(isValidUploadPath('user123/photo.jpg')).toBe(true);
			});

			test('should allow nested subdirectories', () => {
				expect(isValidUploadPath('sichtung/123/media/photo.jpg')).toBe(true);
			});

			test('should allow paths with special characters', () => {
				expect(isValidUploadPath('user_123/photo-name.jpg')).toBe(true);
				expect(isValidUploadPath('folder with spaces/file.jpg')).toBe(true);
			});

			test('should allow current directory reference when safe', () => {
				expect(isValidUploadPath('folder/./file.jpg')).toBe(true);
			});
		});

		describe('dangerous paths (should return false)', () => {
			test('should block parent directory traversal', () => {
				expect(isValidUploadPath('../sensitive.txt')).toBe(false);
				expect(isValidUploadPath('../../etc/passwd')).toBe(false);
				expect(isValidUploadPath('../../../etc/shadow')).toBe(false);
			});

			test('should block traversal in middle of path', () => {
				expect(isValidUploadPath('uploads/../../../etc/passwd')).toBe(false);
				expect(isValidUploadPath('safe/../../../dangerous.txt')).toBe(false);
			});

			test('should block complex traversal attempts', () => {
				expect(isValidUploadPath('folder/./../../etc/passwd')).toBe(false);
				expect(isValidUploadPath('a/b/../../../c/d')).toBe(false);
			});

			test('should block absolute paths', () => {
				expect(isValidUploadPath('/etc/passwd')).toBe(false);
				expect(isValidUploadPath('/home/user/file.txt')).toBe(false);
			});

			test('should block Windows absolute paths', () => {
				expect(isValidUploadPath('C:\\Windows\\System32\\file.exe')).toBe(false);
				expect(isValidUploadPath('D:\\secrets\\file.txt')).toBe(false);
			});

			test('should block UNC paths', () => {
				expect(isValidUploadPath('\\\\server\\share\\file.txt')).toBe(false);
				expect(isValidUploadPath('//server/share/file.txt')).toBe(false);
			});

			test('should block null byte injection attempts', () => {
				expect(isValidUploadPath('file.jpg\0.exe')).toBe(false);
				expect(isValidUploadPath('\0')).toBe(false);
			});
		});

		describe('edge cases', () => {
			test('should handle empty string', () => {
				expect(isValidUploadPath('')).toBe(true);
			});

			test('should handle just filename with dots', () => {
				expect(isValidUploadPath('file.with.many.dots.jpg')).toBe(true);
			});

			test('should handle very long paths', () => {
				const longPath = 'a/'.repeat(100) + 'file.jpg';
				expect(isValidUploadPath(longPath)).toBe(true);
			});

			test('should handle mixed slashes', () => {
				expect(isValidUploadPath('folder\\file.jpg')).toBe(true);
			});
		});

		describe('sophisticated attack attempts', () => {
			test('should block URL-encoded traversal', () => {
				// %2e%2e%2f decodes to "../" — must be blocked
				expect(isValidUploadPath('%2e%2e%2f%2e%2e%2fpasswd')).toBe(false);
			});

			test('should block double URL-encoded traversal', () => {
				// %252e decodes to %2e, which then decodes to "." — recursive decoding catches it
				// The implementation decodes recursively until stable, so this is correctly blocked
				expect(isValidUploadPath('%252e%252e%252fpasswd')).toBe(false);
			});

			test('should handle Unicode normalization attacks', () => {
				// These contain ".." so they get blocked by the current implementation
				expect(isValidUploadPath('..%c0%af..%c0%afpasswd')).toBe(false); // Blocked due to ".."
			});

			test('should handle various traversal encodings', () => {
				// These contain ".." so they get blocked by the current implementation
				expect(isValidUploadPath('..%255c..%255cpasswd')).toBe(false); // Blocked due to ".."
				expect(isValidUploadPath('..%c1%9c..%c1%9cpasswd')).toBe(false); // Blocked due to ".."
			});
		});
	});

	describe('getMimeTypeFromExtension', () => {
		describe('image files', () => {
			test('should return correct MIME types for images', () => {
				expect(getMimeTypeFromExtension('photo.jpg')).toBe('image/jpeg');
				expect(getMimeTypeFromExtension('photo.jpeg')).toBe('image/jpeg');
				expect(getMimeTypeFromExtension('image.png')).toBe('image/png');
				expect(getMimeTypeFromExtension('animation.gif')).toBe('image/gif');
				expect(getMimeTypeFromExtension('modern.webp')).toBe('image/webp');
				expect(getMimeTypeFromExtension('bitmap.bmp')).toBe('image/bmp');
				expect(getMimeTypeFromExtension('vector.svg')).toBe('image/svg+xml');
			});

			test('should handle uppercase extensions', () => {
				expect(getMimeTypeFromExtension('PHOTO.JPG')).toBe('image/jpeg');
				expect(getMimeTypeFromExtension('Image.PNG')).toBe('image/png');
			});

			test('should handle mixed case extensions', () => {
				expect(getMimeTypeFromExtension('photo.JpG')).toBe('image/jpeg');
				expect(getMimeTypeFromExtension('image.PnG')).toBe('image/png');
			});
		});

		describe('video files', () => {
			test('should return correct MIME types for videos', () => {
				expect(getMimeTypeFromExtension('video.mp4')).toBe('video/mp4');
				expect(getMimeTypeFromExtension('clip.mov')).toBe('video/quicktime');
				expect(getMimeTypeFromExtension('old.avi')).toBe('video/x-msvideo');
				expect(getMimeTypeFromExtension('web.webm')).toBe('video/webm');
				expect(getMimeTypeFromExtension('movie.mkv')).toBe('video/x-matroska');
				expect(getMimeTypeFromExtension('windows.wmv')).toBe('video/x-ms-wmv');
			});
		});

		describe('document files', () => {
			test('should return correct MIME types for documents', () => {
				expect(getMimeTypeFromExtension('document.pdf')).toBe('application/pdf');
				expect(getMimeTypeFromExtension('notes.txt')).toBe('text/plain');
				expect(getMimeTypeFromExtension('data.csv')).toBe('text/csv');
			});
		});

		describe('unknown files', () => {
			test('should return default MIME type for unknown extensions', () => {
				expect(getMimeTypeFromExtension('file.unknown')).toBe('application/octet-stream');
				expect(getMimeTypeFromExtension('virus.exe')).toBe('application/octet-stream');
				expect(getMimeTypeFromExtension('script.js')).toBe('application/octet-stream');
			});

			test('should handle files without extension', () => {
				expect(getMimeTypeFromExtension('README')).toBe('application/octet-stream');
				expect(getMimeTypeFromExtension('Makefile')).toBe('application/octet-stream');
			});

			test('should handle empty strings and edge cases', () => {
				expect(getMimeTypeFromExtension('')).toBe('application/octet-stream');
				expect(getMimeTypeFromExtension('.')).toBe('application/octet-stream');
				expect(getMimeTypeFromExtension('..')).toBe('application/octet-stream');
			});
		});

		describe('path handling', () => {
			test('should work with full paths', () => {
				expect(getMimeTypeFromExtension('/path/to/file.jpg')).toBe('image/jpeg');
				expect(getMimeTypeFromExtension('../../folder/image.png')).toBe('image/png');
			});

			test('should handle complex filenames', () => {
				expect(getMimeTypeFromExtension('file.name.with.dots.jpg')).toBe('image/jpeg');
				expect(getMimeTypeFromExtension('file-with-dashes.png')).toBe('image/png');
			});
		});
	});

	describe('isAllowedMimeType', () => {
		describe('allowed MIME types', () => {
			test('should allow all image MIME types', () => {
				expect(isAllowedMimeType('image/jpeg')).toBe(true);
				expect(isAllowedMimeType('image/png')).toBe(true);
				expect(isAllowedMimeType('image/gif')).toBe(true);
				expect(isAllowedMimeType('image/webp')).toBe(true);
				expect(isAllowedMimeType('image/bmp')).toBe(true);
			});

			test('should allow allowed video MIME types', () => {
				expect(isAllowedMimeType('video/mp4')).toBe(true);
				expect(isAllowedMimeType('video/quicktime')).toBe(true);
				expect(isAllowedMimeType('video/x-msvideo')).toBe(true);
				expect(isAllowedMimeType('video/webm')).toBe(true);
			});

			test('should allow PDF', () => {
				expect(isAllowedMimeType('application/pdf')).toBe(true);
			});
		});

		describe('blocked MIME types (security)', () => {
			test('should block executable files', () => {
				expect(isAllowedMimeType('application/x-executable')).toBe(false);
				expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
				expect(isAllowedMimeType('application/octet-stream')).toBe(false);
			});

			test('should block script files', () => {
				expect(isAllowedMimeType('text/javascript')).toBe(false);
				expect(isAllowedMimeType('application/javascript')).toBe(false);
				expect(isAllowedMimeType('text/html')).toBe(false);
				expect(isAllowedMimeType('application/x-php')).toBe(false);
			});

			test('should block dangerous document types', () => {
				expect(isAllowedMimeType('application/vnd.ms-excel.sheet.macroEnabled.12')).toBe(false);
				expect(isAllowedMimeType('application/vnd.ms-word.document.macroEnabled.12')).toBe(false);
			});

			test('should block archive files', () => {
				expect(isAllowedMimeType('application/zip')).toBe(false);
				expect(isAllowedMimeType('application/x-rar')).toBe(false);
				expect(isAllowedMimeType('application/x-tar')).toBe(false);
			});

			test('should block unknown/unlisted types', () => {
				expect(isAllowedMimeType('application/unknown')).toBe(false);
				expect(isAllowedMimeType('text/x-custom')).toBe(false);
				expect(isAllowedMimeType('')).toBe(false);
			});
		});

		describe('case sensitivity', () => {
			test('should be case sensitive (security feature)', () => {
				expect(isAllowedMimeType('IMAGE/JPEG')).toBe(false);
				expect(isAllowedMimeType('Image/Png')).toBe(false);
				expect(isAllowedMimeType('VIDEO/MP4')).toBe(false);
			});
		});
	});

	describe('getUploadPath', () => {
		beforeEach(() => {
			mockEnv.UPLOAD_PATH = '';
		});

		test('should use UPLOAD_PATH as base directory when set', () => {
			mockEnv.UPLOAD_PATH = '/srv/ostsee/uploads';

			expect(getUploadPath('user123/photo.jpg')).toBe('/srv/ostsee/uploads/user123/photo.jpg');
		});

		test('should resolve a relative UPLOAD_PATH against the working directory', () => {
			mockEnv.UPLOAD_PATH = 'data/uploads';

			expect(getUploadPath('photo.jpg')).toBe(
				path.join(process.cwd(), 'data/uploads', 'photo.jpg')
			);
		});

		test('should fall back to "uploads" when UPLOAD_PATH is not set', () => {
			mockEnv.UPLOAD_PATH = '';

			expect(getUploadPath('photo.jpg')).toBe(path.join(process.cwd(), 'uploads', 'photo.jpg'));
		});

		test('should reflect UPLOAD_PATH changes at runtime', () => {
			mockEnv.UPLOAD_PATH = '/mnt/a';
			expect(getUploadPath('x.jpg')).toBe('/mnt/a/x.jpg');

			mockEnv.UPLOAD_PATH = '/mnt/b';
			expect(getUploadPath('x.jpg')).toBe('/mnt/b/x.jpg');
		});

		test('should construct correct upload path', () => {
			const expectedPath = path.join(process.cwd(), 'uploads', 'user123/photo.jpg');
			expect(getUploadPath('user123/photo.jpg')).toBe(expectedPath);
		});

		test('should handle simple filenames', () => {
			const expectedPath = path.join(process.cwd(), 'uploads', 'photo.jpg');
			expect(getUploadPath('photo.jpg')).toBe(expectedPath);
		});

		test('should handle nested paths', () => {
			const expectedPath = path.join(process.cwd(), 'uploads', 'a/b/c/file.jpg');
			expect(getUploadPath('a/b/c/file.jpg')).toBe(expectedPath);
		});

		test('should handle empty path', () => {
			const expectedPath = path.join(process.cwd(), 'uploads', '');
			expect(getUploadPath('')).toBe(expectedPath);
		});

		test('should handle Windows-style paths correctly', () => {
			const expectedPath = path.join(process.cwd(), 'uploads', 'folder\\file.jpg');
			expect(getUploadPath('folder\\file.jpg')).toBe(expectedPath);
		});
	});

	describe('getFileInfo', () => {
		const mockFilePath = '/app/uploads/test/photo.jpg';

		beforeEach(() => {
			// Reset mocks
			mockExistsSync.mockReset();
			mockStatSync.mockReset();
		});

		describe('successful file info retrieval', () => {
			test('should return complete file info for existing file', () => {
				const mockStats = {
					size: 1234567,
					mtime: new Date('2024-01-15T14:30:00.000Z'),
					isFile: () => true
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo(mockFilePath);

				expect(mockExistsSync).toHaveBeenCalledWith(mockFilePath);
				expect(mockStatSync).toHaveBeenCalledWith(mockFilePath);

				expect(result).toEqual({
					size: 1234567,
					mimeType: 'image/jpeg',
					lastModified: new Date('2024-01-15T14:30:00.000Z'),
					isAllowed: true
				});
			});

			test('should handle allowed video file', () => {
				const videoPath = '/app/uploads/video.mp4';
				const mockStats = {
					size: 5000000,
					mtime: new Date('2024-01-15T14:30:00.000Z'),
					isFile: () => true
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo(videoPath);

				expect(result).toEqual({
					size: 5000000,
					mimeType: 'video/mp4',
					lastModified: new Date('2024-01-15T14:30:00.000Z'),
					isAllowed: true
				});
			});

			test('should handle disallowed file type', () => {
				const executablePath = '/app/uploads/virus.exe';
				const mockStats = {
					size: 666,
					mtime: new Date('2024-01-15T14:30:00.000Z'),
					isFile: () => true
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo(executablePath);

				expect(result).toEqual({
					size: 666,
					mimeType: 'application/octet-stream',
					lastModified: new Date('2024-01-15T14:30:00.000Z'),
					isAllowed: false
				});
			});
		});

		describe('file not found cases', () => {
			test('should return null for non-existent file', () => {
				mockExistsSync.mockReturnValue(false);

				const result = getFileInfo(mockFilePath);

				expect(mockExistsSync).toHaveBeenCalledWith(mockFilePath);
				expect(mockStatSync).not.toHaveBeenCalled();
				expect(result).toBeNull();
			});

			test('should return null for directory instead of file', () => {
				const mockStats = {
					isFile: () => false
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo('/app/uploads/directory/');

				expect(result).toBeNull();
			});
		});

		describe('edge cases', () => {
			test('should handle zero-byte files', () => {
				const mockStats = {
					size: 0,
					mtime: new Date('2024-01-15T14:30:00.000Z'),
					isFile: () => true
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo(mockFilePath);

				expect(result?.size).toBe(0);
			});

			test('should handle very large files', () => {
				const mockStats = {
					size: Number.MAX_SAFE_INTEGER,
					mtime: new Date('2024-01-15T14:30:00.000Z'),
					isFile: () => true
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo(mockFilePath);

				expect(result?.size).toBe(Number.MAX_SAFE_INTEGER);
			});

			test('should handle files with unusual timestamps', () => {
				const veryOldDate = new Date('1970-01-01T00:00:00.000Z');
				const mockStats = {
					size: 1000,
					mtime: veryOldDate,
					isFile: () => true
				};

				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockReturnValue(mockStats);

				const result = getFileInfo(mockFilePath);

				expect(result?.lastModified).toEqual(veryOldDate);
			});
		});

		describe('error handling', () => {
			test('should handle statSync throwing error', () => {
				mockExistsSync.mockReturnValue(true);
				mockStatSync.mockImplementation(() => {
					throw new Error('Permission denied');
				});

				expect(() => getFileInfo(mockFilePath)).toThrow('Permission denied');
			});

			test('should handle existsSync throwing error', () => {
				mockExistsSync.mockImplementation(() => {
					throw new Error('Path too long');
				});

				expect(() => getFileInfo(mockFilePath)).toThrow('Path too long');
			});
		});
	});

	describe('ALLOWED_UPLOAD_MIME_TYPES constant', () => {
		test('should be properly defined and readonly', () => {
			expect(ALLOWED_UPLOAD_MIME_TYPES).toBeDefined();
			expect(Array.isArray(ALLOWED_UPLOAD_MIME_TYPES)).toBe(true);
			expect(ALLOWED_UPLOAD_MIME_TYPES.length).toBeGreaterThan(0);
		});

		test('should contain expected mime types', () => {
			expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('image/jpeg');
			expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('image/png');
			expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('video/mp4');
			expect(ALLOWED_UPLOAD_MIME_TYPES).toContain('application/pdf');
		});

		test('should not contain dangerous mime types', () => {
			expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('application/x-executable');
			expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('text/javascript');
			expect(ALLOWED_UPLOAD_MIME_TYPES).not.toContain('application/octet-stream');
		});
	});

	describe('security integration tests', () => {
		test('should handle complete security validation chain', () => {
			const safePath = 'user123/photo.jpg';
			const dangerousPath = '../../../etc/passwd';

			// Safe path should pass all validations
			expect(isValidUploadPath(safePath)).toBe(true);
			expect(getMimeTypeFromExtension(safePath)).toBe('image/jpeg');
			expect(isAllowedMimeType('image/jpeg')).toBe(true);

			// Dangerous path should fail validation
			expect(isValidUploadPath(dangerousPath)).toBe(false);
		});

		test('should properly categorize various file types', () => {
			const testFiles = [
				{ path: 'image.jpg', mimeType: 'image/jpeg', allowed: true },
				{ path: 'video.mp4', mimeType: 'video/mp4', allowed: true },
				{ path: 'document.pdf', mimeType: 'application/pdf', allowed: true },
				{ path: 'script.js', mimeType: 'application/octet-stream', allowed: false },
				{ path: 'executable.exe', mimeType: 'application/octet-stream', allowed: false }
			];

			testFiles.forEach(({ path, mimeType, allowed }) => {
				expect(getMimeTypeFromExtension(path)).toBe(mimeType);
				expect(isAllowedMimeType(mimeType)).toBe(allowed);
			});
		});

		test('should handle complex attack scenarios', () => {
			const blockedAttacks = [
				'../../../etc/passwd', // Blocked by .. detection
				'..\\..\\..\\windows\\system32\\config\\SAM', // Blocked by .. detection
				'/etc/shadow' // Blocked by absolute path detection
			];

			const additionallyBlocked = [
				'C:\\Windows\\System32\\drivers\\etc\\hosts', // Windows absolute path
				'file.jpg\0.exe', // Null byte injection
				'%2e%2e%2f%2e%2e%2fpasswd', // URL-encoded traversal
				'..%c0%af..%c0%afetc%c0%afpasswd' // Contains ".." so also blocked
			];

			// All attacks must be blocked
			blockedAttacks.forEach((attack) => {
				expect(isValidUploadPath(attack)).toBe(false);
			});

			additionallyBlocked.forEach((attack) => {
				expect(isValidUploadPath(attack)).toBe(false);
			});
		});
	});
});
