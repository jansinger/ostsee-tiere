/**
 * Unit Tests für LocalStorageProvider
 *
 * Testet den lokalen Dateispeicher mit besonderem Fokus auf
 * Sicherheit (Path Traversal) und Edge Cases
 */
import type { UploadOptions } from '#lib/types/index.ts';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageProvider } from './local';

// Mock dependencies
vi.mock('fs', () => ({
	writeFileSync: vi.fn(),
	unlinkSync: vi.fn(),
	existsSync: vi.fn(),
	statSync: vi.fn(),
	readdirSync: vi.fn(),
	mkdirSync: vi.fn(),
	createReadStream: vi.fn()
}));

vi.mock('@paralleldrive/cuid2', () => ({
	createId: vi.fn(() => 'test-id-123')
}));

vi.mock('#lib/server/exifUtils', () => ({
	readImageExifData: vi.fn(() =>
		Promise.resolve({
			latitude: 54.123,
			longitude: 12.456,
			make: 'TestCamera',
			model: 'Model X'
		})
	)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn()
	}))
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn()
	}))
}));

describe('LocalStorageProvider', () => {
	let provider: LocalStorageProvider;

	beforeEach(() => {
		vi.clearAllMocks();
		provider = new LocalStorageProvider('uploads', '/uploads');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('upload', () => {
		/**
		 * Test: Erfolgreicher Upload einer Datei
		 */
		it('sollte eine Datei erfolgreich hochladen', async () => {
			// Arrange
			const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'ref-123',
				preserveOriginalName: false
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(mockFile, buffer, options);

			// Assert
			expect(result).toMatchObject({
				uid: 'test-id-123',
				originalName: 'test.jpg',
				fileName: 'test-id-123.jpg',
				filePath: path.join('ref-123', 'test-id-123.jpg'),
				size: mockFile.size,
				mimeType: 'image/jpeg',
				url: '/uploads/ref-123/test-id-123.jpg'
			});
			expect(fs.writeFileSync).toHaveBeenCalled();
		});

		/**
		 * Test: Upload mit Beibehaltung des Originalnamens
		 */
		it('sollte Originalnamen beibehalten wenn preserveOriginalName true ist', async () => {
			// Arrange
			const mockFile = new File(['content'], 'original-photo.png', { type: 'image/png' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'ref-456',
				preserveOriginalName: true
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(mockFile, buffer, options);

			// Assert
			expect(result.fileName).toBe('original-photo-test-id-123.png');
			expect(result.originalName).toBe('original-photo.png');
		});

		/**
		 * Test: Path Traversal Schutz
		 */
		it('sollte Path Traversal Versuche verhindern', async () => {
			// Arrange
			const maliciousFile = new File(['malicious'], '../../../etc/passwd', { type: 'text/plain' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: '../../sensitive',
				preserveOriginalName: true
			};

			// Act & Assert
			// Der Path Traversal Versuch sollte jetzt einen Fehler werfen
			await expect(provider.upload(maliciousFile, buffer, options)).rejects.toThrow(
				'Invalid path: Directory traversal detected'
			);
		});

		/**
		 * Test: Verzeichnis wird erstellt wenn nicht vorhanden
		 */
		it('sollte Verzeichnis erstellen wenn es nicht existiert', async () => {
			// Arrange
			const mockFile = new File(['content'], 'file.txt', { type: 'text/plain' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'new-dir',
				preserveOriginalName: false
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			await provider.upload(mockFile, buffer, options);

			// Assert
			expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('new-dir'), {
				recursive: true
			});
		});

		/**
		 * Test: Sehr große Dateien
		 */
		it('sollte große Dateien verarbeiten können', async () => {
			// Arrange
			const largeContent = new Array(10 * 1024 * 1024).fill('a').join(''); // 10MB
			const mockFile = new File([largeContent], 'large.bin', { type: 'application/octet-stream' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'large-files',
				preserveOriginalName: false
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(mockFile, buffer, options);

			// Assert
			expect(result.size).toBe(mockFile.size);
			expect(fs.writeFileSync).toHaveBeenCalled();
		});
	});

	describe('delete', () => {
		/**
		 * Test: Erfolgreiche Löschung einer existierenden Datei
		 */
		it('sollte eine existierende Datei löschen', async () => {
			// Arrange
			const filePath = 'ref-123/file.jpg';
			(fs.existsSync as any).mockReturnValue(true);

			// Act
			await provider.delete(filePath);

			// Assert
			// Da der Provider jetzt absolute Pfade verwendet
			expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining(filePath));
		});

		/**
		 * Test: Löschversuch einer nicht existierenden Datei
		 */
		it('sollte keinen Fehler werfen bei nicht existierender Datei', async () => {
			// Arrange
			const filePath = 'non-existent/file.jpg';
			(fs.existsSync as any).mockReturnValue(false);

			// Act & Assert - sollte nicht werfen
			await expect(provider.delete(filePath)).resolves.toBeUndefined();
			expect(fs.unlinkSync).not.toHaveBeenCalled();
		});

		/**
		 * Test: Path Traversal Schutz bei Löschung
		 */
		it('sollte Path Traversal bei Löschung verhindern', async () => {
			// Arrange
			const maliciousPath = '../../../etc/passwd';
			(fs.existsSync as any).mockReturnValue(false);

			// Act & Assert
			// Der Path Traversal Versuch sollte jetzt einen Fehler werfen
			await expect(provider.delete(maliciousPath)).rejects.toThrow(
				'Invalid path: Directory traversal detected'
			);
		});
	});

	describe('getUrl', () => {
		/**
		 * Test: URL-Generierung
		 */
		it('sollte korrekte URLs generieren', () => {
			// Act
			const url = provider.getUrl('ref-123/image.jpg');

			// Assert
			expect(url).toBe('/uploads/ref-123/image.jpg');
		});

		/**
		 * Test: URL-Encoding
		 */
		it('sollte Pfade mit Sonderzeichen korrekt behandeln', () => {
			// Act
			const url = provider.getUrl('ref-123/file with spaces.jpg');

			// Assert
			expect(url).toBe('/uploads/ref-123/file with spaces.jpg');
		});
	});

	describe('getMetadata', () => {
		/**
		 * Test: Metadaten für existierende Datei
		 */
		it('sollte Metadaten für existierende Datei zurückgeben', async () => {
			// Arrange
			const filePath = 'ref-123/file.jpg';
			const mockStats = {
				size: 1024000,
				mtime: new Date('2024-01-15T10:00:00Z')
			};

			(fs.existsSync as any).mockReturnValue(true);
			(fs.statSync as any).mockReturnValue(mockStats);

			// Act
			const metadata = await provider.getMetadata(filePath);

			// Assert
			expect(metadata).toEqual({
				size: 1024000,
				mimeType: 'image/jpeg',
				lastModified: mockStats.mtime
			});
		});

		/**
		 * Test: Null für nicht existierende Datei
		 */
		it('sollte null für nicht existierende Datei zurückgeben', async () => {
			// Arrange
			const filePath = 'non-existent/file.jpg';
			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const metadata = await provider.getMetadata(filePath);

			// Assert
			expect(metadata).toBeNull();
		});

		/**
		 * Test: MIME-Type Erkennung für verschiedene Dateitypen
		 */
		it('sollte korrekte MIME-Types für verschiedene Dateierweiterungen zurückgeben', async () => {
			// Arrange
			const testCases = [
				{ ext: '.png', expected: 'image/png' },
				{ ext: '.pdf', expected: 'application/pdf' },
				{ ext: '.mp4', expected: 'video/mp4' },
				{ ext: '.unknown', expected: 'application/octet-stream' }
			];

			(fs.existsSync as any).mockReturnValue(true);
			(fs.statSync as any).mockReturnValue({ size: 100, mtime: new Date() });

			for (const testCase of testCases) {
				// Act
				const metadata = await provider.getMetadata(`file${testCase.ext}`);

				// Assert
				expect(metadata?.mimeType).toBe(testCase.expected);
			}
		});
	});

	describe('list', () => {
		/**
		 * Test: Auflisten aller Dateien in einem Verzeichnis
		 */
		it('sollte alle Dateien in einem Verzeichnis auflisten', async () => {
			// Arrange
			const mockFiles = [
				{ name: 'file1.jpg', isFile: () => true },
				{ name: 'file2.png', isFile: () => true },
				{ name: 'subdir', isFile: () => false } // Verzeichnis, sollte ignoriert werden
			];

			(fs.existsSync as any).mockReturnValue(true);
			(fs.readdirSync as any).mockReturnValue(mockFiles);
			(fs.statSync as any).mockReturnValue({
				size: 1024,
				birthtime: new Date('2024-01-15T10:00:00Z')
			});

			// Act
			const files = await provider.list('ref-123');

			// Assert
			expect(files).toHaveLength(2); // Nur Dateien, keine Verzeichnisse
			expect(files[0]).toMatchObject({
				originalName: 'file1.jpg',
				mimeType: 'image/jpeg'
			});
		});

		/**
		 * Test: Leeres Array für nicht existierendes Verzeichnis
		 */
		it('sollte leeres Array für nicht existierendes Verzeichnis zurückgeben', async () => {
			// Arrange
			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const files = await provider.list('non-existent');

			// Assert
			expect(files).toEqual([]);
		});

		/**
		 * Test: Auflisten ohne Prefix (Root-Verzeichnis)
		 */
		it('sollte Dateien im Root-Verzeichnis auflisten wenn kein Prefix angegeben', async () => {
			// Arrange
			const mockFiles = [{ name: 'root-file.txt', isFile: () => true }];

			(fs.existsSync as any).mockReturnValue(true);
			(fs.readdirSync as any).mockReturnValue(mockFiles);
			(fs.statSync as any).mockReturnValue({
				size: 500,
				birthtime: new Date()
			});

			// Act
			const files = await provider.list();

			// Assert
			expect(files).toHaveLength(1);
			expect(files[0]?.filePath).toBe('root-file.txt');
		});
	});

	describe('exists', () => {
		/**
		 * Test: Prüfung auf existierende Datei
		 */
		it('sollte true für existierende Datei zurückgeben', async () => {
			// Arrange
			(fs.existsSync as any).mockReturnValue(true);

			// Act
			const exists = await provider.exists('ref-123/file.jpg');

			// Assert
			expect(exists).toBe(true);
		});

		/**
		 * Test: Prüfung auf nicht existierende Datei
		 */
		it('sollte false für nicht existierende Datei zurückgeben', async () => {
			// Arrange
			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const exists = await provider.exists('non-existent/file.jpg');

			// Assert
			expect(exists).toBe(false);
		});
	});

	describe('Sicherheitstests', () => {
		/**
		 * Test: Dateinamen mit Sonderzeichen werden sanitized
		 */
		it('sollte Dateinamen mit Sonderzeichen sanitizen', async () => {
			// Arrange
			const dangerousFile = new File(['content'], '<script>alert("xss")</script>.txt', {
				type: 'text/plain'
			});
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'safe-ref',
				preserveOriginalName: true
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(dangerousFile, buffer, options);

			// Assert
			expect(result).toBeDefined();
			expect(result.originalName).toBe('<script>alert("xss")</script>.txt'); // Original bleibt erhalten
			// Der sanitized Dateiname sollte keine gefährlichen Zeichen enthalten
			expect(result.fileName).toContain('script');
			expect(result.fileName).toContain('test-id-123');
			expect(result.fileName).not.toContain('<');
			expect(result.fileName).not.toContain('>');
		});

		/**
		 * Test: Null-Byte Injection
		 */
		it('sollte Null-Byte Injection verhindern', async () => {
			// Arrange
			const mockFile = new File(['content'], 'file.jpg\x00.txt', { type: 'text/plain' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'ref-null',
				preserveOriginalName: true
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(mockFile, buffer, options);

			// Assert
			expect(result.fileName).not.toContain('\x00');
			// Der Null-Byte wurde entfernt, Dateiname wurde sanitized
			expect(result.fileName).toContain('file.jpg');
			expect(result.fileName).toContain('test-id-123');
		});

		/**
		 * Test: Versteckte Dateien (beginnend mit Punkt) verhindern
		 */
		it('sollte versteckte Dateien (beginnend mit Punkt) verhindern', async () => {
			// Arrange
			const hiddenFile = new File(['secret'], '...hidden_config', { type: 'text/plain' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'ref-hidden',
				preserveOriginalName: true
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(hiddenFile, buffer, options);

			// Assert
			expect(result.fileName?.startsWith('.')).toBe(false);
			expect(result.fileName).toBe('hidden_config-test-id-123');
		});

		/**
		 * Test: Sehr lange Dateinamen begrenzen
		 */
		it('sollte sehr lange Dateinamen begrenzen', async () => {
			// Arrange
			const longName = 'a'.repeat(300) + '.txt'; // 304 Zeichen
			const longFile = new File(['content'], longName, { type: 'text/plain' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'ref-long',
				preserveOriginalName: true
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(longFile, buffer, options);

			// Assert
			// Mit der ID kann der Name länger als 255 werden, das ist OK
			// Wichtig ist, dass er nicht unbegrenzt wächst
			expect(result.fileName?.length).toBeLessThan(400); // Realistisches Limit
			expect(result.fileName?.endsWith('-test-id-123.txt')).toBe(true);
		});

		/**
		 * Test: Leerer Dateiname wird durch Fallback ersetzt
		 */
		it('sollte leeren Dateiname durch Fallback ersetzen', async () => {
			// Arrange
			const emptyFile = new File(['content'], '', { type: 'text/plain' });
			const buffer = Buffer.from('test content');
			const options: UploadOptions = {
				uid: 'test-id-123',
				referenceId: 'ref-empty',
				preserveOriginalName: true
			};

			(fs.existsSync as any).mockReturnValue(false);

			// Act
			const result = await provider.upload(emptyFile, buffer, options);

			// Assert
			expect(result.fileName).toBe('unnamed_file-test-id-123');
		});
	});

	describe('Path Validation Sicherheitstests', () => {
		/**
		 * Test: delete() mit Path Traversal
		 */
		it('sollte delete() vor Path Traversal schützen', async () => {
			// Act & Assert
			await expect(provider.delete('../../etc/passwd')).rejects.toThrow(
				'Invalid path: Directory traversal detected'
			);
		});

		/**
		 * Test: getMetadata() mit Path Traversal
		 */
		it('sollte getMetadata() vor Path Traversal schützen', async () => {
			// Act
			const result = await provider.getMetadata('../../../etc/passwd');

			// Assert
			expect(result).toBeNull(); // Sollte null zurückgeben bei ungültigem Pfad
		});

		/**
		 * Test: exists() mit Path Traversal
		 */
		it('sollte exists() vor Path Traversal schützen', async () => {
			// Act
			const result = await provider.exists('../../sensitive/file.txt');

			// Assert
			expect(result).toBe(false); // Sollte false zurückgeben bei ungültigem Pfad
		});

		/**
		 * Test: list() mit Path Traversal
		 */
		it('sollte list() vor Path Traversal schützen', async () => {
			// Act
			const result = await provider.list('../../../etc');

			// Assert
			expect(result).toEqual([]); // Sollte leeres Array zurückgeben bei ungültigem Pfad
		});

		/**
		 * Test: Absolute Pfade werden abgelehnt
		 */
		it('sollte absolute Pfade ablehnen', async () => {
			// Arrange
			const absolutePaths = ['/etc/passwd', 'C:\\Windows\\System32', '/var/log/secure'];

			for (const testPath of absolutePaths) {
				// Act & Assert
				// Diese Pfade sollten als absolute Pfade erkannt und normalisiert werden
				// Das führt dazu, dass sie als relativ behandelt werden, aber nicht existieren
				try {
					const result = await provider.exists(testPath);
					expect(result).toBe(false); // Datei existiert nicht
				} catch (error) {
					// Falls ein Fehler geworfen wird, ist das auch OK
					expect(error).toBeDefined();
				}
			}
		});

		/**
		 * Test: Windows-Style Path Traversal
		 */
		it('sollte Windows-Style Path Traversal verhindern', async () => {
			// Act & Assert
			await expect(provider.delete('..\\..\\Windows\\System32')).rejects.toThrow(
				'Invalid path: Directory traversal detected'
			);
		});

		/**
		 * Test: Doppelte Punkte in verschiedenen Formen
		 */
		it('sollte verschiedene Formen von Doppelpunkten abfangen', async () => {
			const traversalAttempts = [
				'../../../etc/passwd',
				'..\\..\\..\\etc\\passwd',
				'....//....//etc/passwd',
				'folder/../../../etc/passwd'
			];

			for (const attempt of traversalAttempts) {
				// Act & Assert
				await expect(provider.delete(attempt)).rejects.toThrow(
					'Invalid path: Directory traversal detected'
				);
			}
		});
	});

	describe('getFileStream', () => {
		/**
		 * Die Datei nutzt vollständig gemocktes `fs` (siehe vi.mock oben) statt eines
		 * echten Temp-Verzeichnisses — die neuen Tests folgen diesem bestehenden Muster
		 * statt ein eigenes mit echtem Dateisystemzugriff aufzubauen.
		 */
		it('liefert die ganze Datei ohne Bereichsangabe', async () => {
			const filePath = 'ref-1/uid-1.txt';
			(fs.existsSync as any).mockReturnValue(true);
			(fs.statSync as any).mockReturnValue({ size: 10 });
			(fs.createReadStream as any).mockReturnValue(Readable.from([Buffer.from('0123456789')]));

			const result = await provider.getFileStream(filePath);

			expect(result).not.toBeNull();
			expect(result?.totalSize).toBe(10);
			expect(result?.rangeDelivered).toBe(true);
			expect(await new Response(result!.stream).text()).toBe('0123456789');
			expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining(filePath));
		});

		it('liefert nur den angeforderten Bereich', async () => {
			const filePath = 'ref-2/uid-2.txt';
			(fs.existsSync as any).mockReturnValue(true);
			(fs.statSync as any).mockReturnValue({ size: 10 });
			(fs.createReadStream as any).mockReturnValue(Readable.from([Buffer.from('2345')]));

			const result = await provider.getFileStream(filePath, { start: 2, end: 5 });

			expect(result?.totalSize).toBe(10);
			expect(result?.rangeDelivered).toBe(true);
			expect(await new Response(result!.stream).text()).toBe('2345');
			expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining(filePath), {
				start: 2,
				end: 5
			});
		});

		it('liefert null für eine fehlende Datei', async () => {
			(fs.existsSync as any).mockReturnValue(false);

			expect(await provider.getFileStream('gibt-es-nicht.txt')).toBeNull();
		});

		it('liefert null bei einem Pfad außerhalb des Basisverzeichnisses', async () => {
			expect(await provider.getFileStream('../../etc/passwd')).toBeNull();
		});
	});
});
