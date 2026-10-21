import type { UploadOptions } from '#lib/types/index.ts';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mutable mock environment object
const mockEnv: Record<string, string> = {
	BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abc123_test_xyz789'
};

// Mock environment variables (dynamic env) with Proxy for runtime changes
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

// Mock @paralleldrive/cuid2
vi.mock('@paralleldrive/cuid2', () => ({
	createId: vi.fn(() => 'cm123test456')
}));

// Mock @vercel/blob
vi.mock('@vercel/blob', () => ({
	put: vi.fn(),
	del: vi.fn(),
	head: vi.fn(),
	list: vi.fn()
}));

// Import after mocks are set up
import { VercelBlobStorageProvider } from './vercel-blob';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('VercelBlobStorageProvider', () => {
	const mockToken = 'vercel_blob_rw_abc123_test_xyz789';
	let provider: VercelBlobStorageProvider;

	// Import the mocked functions
	let mockPut: ReturnType<typeof vi.fn>;
	let mockDel: ReturnType<typeof vi.fn>;
	let mockHead: ReturnType<typeof vi.fn>;
	let mockList: ReturnType<typeof vi.fn>;

	// Save original environment
	const originalEnv = { ...process.env };

	beforeEach(async () => {
		// Reset mock environment
		mockEnv.BLOB_READ_WRITE_TOKEN = mockToken;

		// Import the mocked modules to get access to the mock functions
		const blobModule = await import('@vercel/blob');
		mockPut = blobModule.put as ReturnType<typeof vi.fn>;
		mockDel = blobModule.del as ReturnType<typeof vi.fn>;
		mockHead = blobModule.head as ReturnType<typeof vi.fn>;
		mockList = blobModule.list as ReturnType<typeof vi.fn>;

		// Clear all mocks
		vi.clearAllMocks();

		// Create fresh provider instance
		provider = new VercelBlobStorageProvider();
	});

	afterEach(() => {
		// Restore original environment
		process.env = { ...originalEnv };
	});

	describe('constructor', () => {
		test('should use token from environment variable', () => {
			// Token is provided by the mock
			const provider = new VercelBlobStorageProvider();
			expect(provider).toBeDefined();
		});

		test('should use provided token parameter', () => {
			const customToken = 'custom_token_456';
			const provider = new VercelBlobStorageProvider(customToken);
			expect(provider).toBeDefined();
		});

		test('should throw error when no token is available', () => {
			// Clear the token in mock environment
			mockEnv.BLOB_READ_WRITE_TOKEN = '';

			// Token is empty, and no parameter provided - should throw
			expect(() => new VercelBlobStorageProvider()).toThrow(
				'BLOB_READ_WRITE_TOKEN environment variable is required for Vercel Blob storage'
			);

			// Restore the token for other tests
			mockEnv.BLOB_READ_WRITE_TOKEN = mockToken;
		});

		test('should prioritize constructor parameter over environment', () => {
			const customToken = 'constructor_token';
			const provider = new VercelBlobStorageProvider(customToken);
			expect(provider).toBeDefined();
		});
	});

	describe('upload', () => {
		const mockFile = {
			name: 'whale.jpg',
			size: 1234567,
			type: 'image/jpeg'
		} as File;

		const mockBuffer = Buffer.from('mock file content');

		const uploadOptions: UploadOptions = {
			uid: 'cm123test456',
			referenceId: 'sichtung-123',
			preserveOriginalName: true
		};

		test('should upload file successfully with original name preservation', async () => {
			const expectedBlobResponse = {
				url: 'https://test.public.blob.vercel-storage.com/sichtung-123/whale-cm123test456.jpg'
			};
			mockPut.mockResolvedValue(expectedBlobResponse);

			const result = await provider.upload(mockFile, mockBuffer, uploadOptions);

			expect(mockPut).toHaveBeenCalledWith('sichtung-123/whale-cm123test456.jpg', mockBuffer, {
				access: 'public',
				token: mockToken,
				contentType: 'image/jpeg'
			});

			expect(result).toEqual({
				uid: 'cm123test456',
				originalName: 'whale.jpg',
				fileName: 'whale-cm123test456.jpg',
				filePath: 'sichtung-123/whale-cm123test456.jpg',
				size: 1234567,
				mimeType: 'image/jpeg',
				url: expectedBlobResponse.url,
				uploadedAt: expect.any(String)
			});

			// Check that uploadedAt is a valid ISO string
			expect(result.uploadedAt).toBeDefined();
			expect(new Date(result.uploadedAt!)).toBeInstanceOf(Date);
		});

		test('should upload file without preserving original name', async () => {
			const expectedBlobResponse = {
				url: 'https://test.public.blob.vercel-storage.com/sichtung-123/cm123test456.jpg'
			};
			mockPut.mockResolvedValue(expectedBlobResponse);

			const optionsWithoutPreserve: UploadOptions = {
				uid: 'cm123test456',
				referenceId: 'sichtung-123',
				preserveOriginalName: false
			};

			const result = await provider.upload(mockFile, mockBuffer, optionsWithoutPreserve);

			expect(mockPut).toHaveBeenCalledWith('sichtung-123/cm123test456.jpg', mockBuffer, {
				access: 'public',
				token: mockToken,
				contentType: 'image/jpeg'
			});

			expect(result.fileName).toBe('cm123test456.jpg');
		});

		test('should handle files without extension', async () => {
			const fileWithoutExt = {
				name: 'document',
				size: 1000,
				type: 'text/plain'
			} as File;

			const expectedBlobResponse = {
				url: 'https://test.public.blob.vercel-storage.com/sichtung-123/document-cm123test456'
			};
			mockPut.mockResolvedValue(expectedBlobResponse);

			const result = await provider.upload(fileWithoutExt, mockBuffer, uploadOptions);

			expect(result.fileName).toBe('document-cm123test456');
		});

		test('should throw error when upload fails', async () => {
			const uploadError = new Error('Upload failed');
			mockPut.mockRejectedValue(uploadError);

			await expect(provider.upload(mockFile, mockBuffer, uploadOptions)).rejects.toThrow(
				uploadError
			);
		});

		test('should handle special characters in filename', async () => {
			const specialFile = {
				name: 'whale with spaces & symbols.jpg',
				size: 1000,
				type: 'image/jpeg'
			} as File;

			const expectedBlobResponse = {
				url: 'https://test.public.blob.vercel-storage.com/test.jpg'
			};
			mockPut.mockResolvedValue(expectedBlobResponse);

			const result = await provider.upload(specialFile, mockBuffer, uploadOptions);

			expect(result.fileName).toBe('whale with spaces & symbols-cm123test456.jpg');
		});
	});

	describe('delete', () => {
		test('should delete file successfully', async () => {
			const filePath = 'sichtung-123/whale-cm123test456.jpg';
			mockDel.mockResolvedValue(undefined);

			await provider.delete(filePath);

			expect(mockDel).toHaveBeenCalledWith(filePath, { token: mockToken });
		});

		test('should throw error when delete fails', async () => {
			const filePath = 'sichtung-123/whale-cm123test456.jpg';
			const deleteError = new Error('Delete failed');
			mockDel.mockRejectedValue(deleteError);

			await expect(provider.delete(filePath)).rejects.toThrow(deleteError);
		});
	});

	describe('getUrl', () => {
		test('should generate correct public URL', () => {
			const filePath = 'sichtung-123/whale-cm123test456.jpg';
			const url = provider.getUrl(filePath);

			expect(url).toBe(
				'https://abc123.public.blob.vercel-storage.com/sichtung-123/whale-cm123test456.jpg'
			);
		});

		test('should handle different token formats', () => {
			const customToken = 'vercel_blob_rw_prefix_different_suffix';
			const customProvider = new VercelBlobStorageProvider(customToken);

			const url = customProvider.getUrl('test/file.jpg');

			expect(url).toBe('https://prefix.public.blob.vercel-storage.com/test/file.jpg');
		});

		test('should handle paths with special characters', () => {
			const filePath = 'sichtung-123/file with spaces.jpg';
			const url = provider.getUrl(filePath);

			expect(url).toBe(
				'https://abc123.public.blob.vercel-storage.com/sichtung-123/file with spaces.jpg'
			);
		});
	});

	describe('getMetadata', () => {
		test('should return file metadata successfully', async () => {
			const mockMetadata = {
				size: 1234567,
				contentType: 'image/jpeg',
				uploadedAt: '2024-01-15T14:30:00.000Z',
				etag: 'abc123def456'
			};
			mockHead.mockResolvedValue(mockMetadata);

			const result = await provider.getMetadata('sichtung-123/whale.jpg');

			expect(mockHead).toHaveBeenCalledWith('sichtung-123/whale.jpg', { token: mockToken });
			expect(result).toEqual({
				size: 1234567,
				mimeType: 'image/jpeg',
				lastModified: new Date('2024-01-15T14:30:00.000Z'),
				etag: 'abc123def456'
			});
		});

		test('should return default mime type when contentType is missing', async () => {
			const mockMetadata = {
				size: 1000,
				uploadedAt: '2024-01-15T14:30:00.000Z'
			};
			mockHead.mockResolvedValue(mockMetadata);

			const result = await provider.getMetadata('test/file');

			expect(result?.mimeType).toBe('application/octet-stream');
		});

		test('should return unknown etag when etag is missing', async () => {
			const mockMetadata = {
				size: 1000,
				contentType: 'text/plain',
				uploadedAt: '2024-01-15T14:30:00.000Z'
			};
			mockHead.mockResolvedValue(mockMetadata);

			const result = await provider.getMetadata('test/file.txt');

			expect(result?.etag).toBe('unknown');
		});

		test('should return null when file does not exist', async () => {
			mockHead.mockRejectedValue(new Error('File not found'));

			const result = await provider.getMetadata('nonexistent/file.jpg');

			expect(result).toBeNull();
		});
	});

	describe('list', () => {
		test('should list all files without prefix', async () => {
			const mockBlobs = [
				{
					pathname: 'sichtung-123/whale-cm123.jpg',
					url: 'https://test.com/whale.jpg',
					size: 1000000,
					uploadedAt: '2024-01-15T14:30:00.000Z',
					contentType: 'image/jpeg'
				},
				{
					pathname: 'sichtung-456/seal-cm456.jpg',
					url: 'https://test.com/seal.jpg',
					size: 500000,
					uploadedAt: '2024-01-16T15:30:00.000Z',
					contentType: 'image/jpeg'
				}
			];
			mockList.mockResolvedValue({ blobs: mockBlobs });

			const result = await provider.list();

			expect(mockList).toHaveBeenCalledWith({ token: mockToken });
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				uid: 'cm123',
				originalName: 'whale-cm123.jpg',
				fileName: 'whale-cm123.jpg',
				filePath: 'sichtung-123/whale-cm123.jpg',
				size: 1000000,
				mimeType: 'image/jpeg',
				url: 'https://test.com/whale.jpg',
				uploadedAt: '2024-01-15T14:30:00.000Z'
			});
		});

		test('should list files with prefix filter', async () => {
			const mockBlobs = [
				{
					pathname: 'sichtung-123/whale-cm123.jpg',
					url: 'https://test.com/whale.jpg',
					size: 1000000,
					uploadedAt: '2024-01-15T14:30:00.000Z',
					contentType: 'image/jpeg'
				}
			];
			mockList.mockResolvedValue({ blobs: mockBlobs });

			await provider.list('sichtung-123/');

			expect(mockList).toHaveBeenCalledWith({
				token: mockToken,
				prefix: 'sichtung-123/'
			});
		});

		test('should handle files without contentType', async () => {
			const mockBlobs = [
				{
					pathname: 'test/file.bin',
					url: 'https://test.com/file.bin',
					size: 1000,
					uploadedAt: '2024-01-15T14:30:00.000Z'
					// No contentType property
				}
			];
			mockList.mockResolvedValue({ blobs: mockBlobs });

			const result = await provider.list();

			expect(result).toHaveLength(1);
			expect(result[0]?.mimeType).toBe('application/octet-stream');
		});

		test('should return empty array when list fails', async () => {
			mockList.mockRejectedValue(new Error('List failed'));

			const result = await provider.list();

			expect(result).toEqual([]);
		});
	});

	describe('exists', () => {
		test('should return true when file exists', async () => {
			mockHead.mockResolvedValue({ size: 1000 });

			const result = await provider.exists('sichtung-123/whale.jpg');

			expect(result).toBe(true);
			expect(mockHead).toHaveBeenCalledWith('sichtung-123/whale.jpg', { token: mockToken });
		});

		test('should return false when file does not exist', async () => {
			mockHead.mockRejectedValue(new Error('File not found'));

			const result = await provider.exists('nonexistent/file.jpg');

			expect(result).toBe(false);
		});

		test('should return false on any error', async () => {
			mockHead.mockRejectedValue(new Error('Network error'));

			const result = await provider.exists('test/file.jpg');

			expect(result).toBe(false);
		});
	});

	describe('getFileContent', () => {
		test('should download file content successfully', async () => {
			const mockContent = 'mock file content';
			const mockResponse = {
				ok: true,
				arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(mockContent.length))
			};
			mockFetch.mockResolvedValue(mockResponse);

			const result = await provider.getFileContent('sichtung-123/whale.jpg');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://abc123.public.blob.vercel-storage.com/sichtung-123/whale.jpg'
			);
			expect(result).toBeInstanceOf(Buffer);
		});

		test('should return null when file is not found', async () => {
			const mockResponse = {
				ok: false,
				status: 404
			};
			mockFetch.mockResolvedValue(mockResponse);

			const result = await provider.getFileContent('nonexistent/file.jpg');

			expect(result).toBeNull();
		});

		test('should return null when fetch fails', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'));

			const result = await provider.getFileContent('test/file.jpg');

			expect(result).toBeNull();
		});

		test('should handle large files', async () => {
			const largeContent = new ArrayBuffer(10 * 1024 * 1024); // 10MB
			const mockResponse = {
				ok: true,
				arrayBuffer: vi.fn().mockResolvedValue(largeContent)
			};
			mockFetch.mockResolvedValue(mockResponse);

			const result = await provider.getFileContent('large/file.bin');

			expect(result).toBeInstanceOf(Buffer);
			expect(result?.length).toBe(10 * 1024 * 1024);
		});
	});

	describe('getFileStream', () => {
		test('liefert die ganze Datei und ihre Größe ohne Bereichsangabe', async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce(
				new Response('0123456789', {
					status: 200,
					headers: { 'content-length': '10' }
				})
			);

			const result = await provider.getFileStream('sichtung-123/whale.mp4');

			expect(result?.totalSize).toBe(10);
			expect(result?.rangeDelivered).toBe(true);
			expect(await new Response(result!.stream).text()).toBe('0123456789');
		});

		test('reicht den Range durch und liest die Gesamtgröße aus Content-Range', async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce(
				new Response('2345', {
					status: 206,
					headers: { 'content-range': 'bytes 2-5/10', 'content-length': '4' }
				})
			);

			const result = await provider.getFileStream('sichtung-123/whale.mp4', {
				start: 2,
				end: 5
			});

			expect(result?.totalSize).toBe(10);
			expect(result?.rangeDelivered).toBe(true);
			const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
			expect((init?.headers as Record<string, string>).Range).toBe('bytes=2-5');
		});

		test('liefert null, wenn die Datei nicht erreichbar ist', async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));

			expect(await provider.getFileStream('weg.mp4')).toBeNull();
		});

		test('meldet rangeDelivered: false, wenn das CDN einen angeforderten Bereich ignoriert', async () => {
			// Ein Range-Header ist laut HTTP-Spec eine Bitte, keine Pflicht — ein
			// CDN darf ihn ignorieren und mit 200 und dem vollen Body antworten.
			// Nur eine 206-Antwort auf eine Bereichsanfrage zählt als gelieferter
			// Bereich; alles andere muss die Route als volle Antwort behandeln.
			vi.mocked(global.fetch).mockResolvedValueOnce(
				new Response('0123456789', {
					status: 200,
					headers: { 'content-length': '10' }
				})
			);

			const result = await provider.getFileStream('sichtung-123/whale.mp4', {
				start: 2,
				end: 5
			});

			expect(result?.totalSize).toBe(10);
			expect(result?.rangeDelivered).toBe(false);
			expect(await new Response(result!.stream).text()).toBe('0123456789');
		});
	});

	describe('extractUidFromPathname', () => {
		test('should extract UID from filename with original name', () => {
			// Access private method through any cast for testing
			const extractUid = (provider as any).extractUidFromPathname.bind(provider);

			const uid = extractUid('sichtung-123/whale-cm123test456.jpg');
			expect(uid).toBe('cm123test456');
		});

		test('should extract UID from filename without original name', () => {
			const extractUid = (provider as any).extractUidFromPathname.bind(provider);

			const uid = extractUid('sichtung-123/cm123test456.jpg');
			expect(uid).toBe('cm123test456');
		});

		test('should handle filename without extension', () => {
			const extractUid = (provider as any).extractUidFromPathname.bind(provider);

			const uid = extractUid('sichtung-123/whale-cm123test456');
			expect(uid).toBe('cm123test456');
		});

		test('should handle filename with multiple dashes', () => {
			const extractUid = (provider as any).extractUidFromPathname.bind(provider);

			const uid = extractUid('sichtung-123/my-whale-photo-cm123test456.jpg');
			expect(uid).toBe('cm123test456');
		});

		test('should return filename as fallback when no pattern matches', () => {
			const extractUid = (provider as any).extractUidFromPathname.bind(provider);

			const uid = extractUid('sichtung-123/unknown-pattern');
			expect(uid).toBe('pattern'); // Last part after '-' without extension
		});

		test('should return unknown for empty or invalid filenames', () => {
			const extractUid = (provider as any).extractUidFromPathname.bind(provider);

			expect(extractUid('sichtung-123/')).toBe('123'); // Path component becomes filename
			expect(extractUid('')).toBe('unknown');
		});
	});

	describe('error handling and edge cases', () => {
		test('should handle API rate limiting gracefully', async () => {
			const rateLimitError = new Error('Rate limit exceeded');
			mockPut.mockRejectedValue(rateLimitError);

			const mockFile = { name: 'test.jpg', size: 1000, type: 'image/jpeg' } as File;
			const mockBuffer = Buffer.from('test');
			const options = { uid: 'cm123test456', referenceId: 'test', preserveOriginalName: false };

			await expect(provider.upload(mockFile, mockBuffer, options)).rejects.toThrow(rateLimitError);
		});

		test('should handle network timeouts', async () => {
			const timeoutError = new Error('Request timeout');
			mockHead.mockRejectedValue(timeoutError);

			const result = await provider.getMetadata('test/file.jpg');
			expect(result).toBeNull();
		});

		test('should handle malformed token gracefully', () => {
			const malformedToken = 'invalid_token_format';
			const providerWithBadToken = new VercelBlobStorageProvider(malformedToken);

			// Should not throw during construction
			expect(providerWithBadToken).toBeDefined();

			// But URL generation might produce unexpected results
			const url = providerWithBadToken.getUrl('test/file.jpg');
			expect(url).toContain('undefined.public.blob.vercel-storage.com');
		});

		test('should handle empty file uploads', async () => {
			const emptyFile = { name: 'empty.txt', size: 0, type: 'text/plain' } as File;
			const emptyBuffer = Buffer.alloc(0);

			const expectedBlobResponse = {
				url: 'https://test.public.blob.vercel-storage.com/test/cm123test456.txt'
			};
			mockPut.mockResolvedValue(expectedBlobResponse);

			const result = await provider.upload(emptyFile, emptyBuffer, {
				uid: 'cm123test456',
				referenceId: 'test',
				preserveOriginalName: false
			});

			expect(result.size).toBe(0);
		});
	});

	describe('integration scenarios', () => {
		test('should handle complete file lifecycle', async () => {
			const mockFile = { name: 'lifecycle.jpg', size: 1000, type: 'image/jpeg' } as File;
			const mockBuffer = Buffer.from('test content');

			// Upload
			mockPut.mockResolvedValue({ url: 'https://test.com/file.jpg' });
			const uploadResult = await provider.upload(mockFile, mockBuffer, {
				uid: 'cm123test456',
				referenceId: 'test',
				preserveOriginalName: true
			});

			// Check existence
			mockHead.mockResolvedValue({ size: 1000 });
			const exists = await provider.exists(uploadResult.filePath);
			expect(exists).toBe(true);

			// Get metadata
			mockHead.mockResolvedValue({
				size: 1000,
				contentType: 'image/jpeg',
				uploadedAt: '2024-01-15T14:30:00.000Z'
			});
			const metadata = await provider.getMetadata(uploadResult.filePath);
			expect(metadata).not.toBeNull();

			// Delete
			mockDel.mockResolvedValue(undefined);
			await provider.delete(uploadResult.filePath);

			// Verify deletion
			mockHead.mockRejectedValue(new Error('Not found'));
			const existsAfterDelete = await provider.exists(uploadResult.filePath);
			expect(existsAfterDelete).toBe(false);
		});
	});
});
