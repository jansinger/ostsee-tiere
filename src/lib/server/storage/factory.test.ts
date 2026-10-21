import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import type { StorageProviderType } from '#lib/types/index.ts';

// Mutable mock environment object
const mockEnv: Record<string, string> = {
	STORAGE_PROVIDER: '',
	VERCEL: '',
	UPLOAD_PATH: ''
};

// Mock the app environment
vi.mock('$app/env', () => ({
	dev: false
}));

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

// Mock the storage providers with class constructors
vi.mock('./local', () => {
	const MockLocalStorageProvider = vi.fn().mockImplementation(function () {
		return {
			uploadFile: vi.fn(),
			deleteFile: vi.fn(),
			getFileUrl: vi.fn()
		};
	});
	return { LocalStorageProvider: MockLocalStorageProvider };
});

vi.mock('./vercel-blob', () => {
	const MockVercelBlobStorageProvider = vi.fn().mockImplementation(function () {
		return {
			uploadFile: vi.fn(),
			deleteFile: vi.fn(),
			getFileUrl: vi.fn()
		};
	});
	return { VercelBlobStorageProvider: MockVercelBlobStorageProvider };
});

// Import after mocks are set up
import {
	getStorageProvider,
	resetStorageProvider,
	isCloudStorage,
	getCurrentStorageProvider
} from './factory';

describe('Storage Factory', () => {
	// Save original environment
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Reset storage provider before each test
		resetStorageProvider();

		// Reset mock environment variables
		mockEnv.STORAGE_PROVIDER = '';
		mockEnv.VERCEL = '';
		mockEnv.UPLOAD_PATH = '';

		// Clear all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Restore original environment
		process.env = { ...originalEnv };
	});

	describe('getStorageProvider', () => {
		test('should return singleton instance on subsequent calls', () => {
			const provider1 = getStorageProvider();
			const provider2 = getStorageProvider();

			expect(provider1).toBe(provider2);
		});

		test('should create LocalStorageProvider in development', async () => {
			// Mock development environment
			vi.doMock('$app/env', () => ({
				dev: true
			}));

			// Reset to pick up new environment
			resetStorageProvider();

			const provider = getStorageProvider();
			expect(provider).toBeDefined();
		});

		test('should create VercelBlobStorageProvider when VERCEL env is set', () => {
			mockEnv.VERCEL = '1';

			const provider = getStorageProvider();
			expect(provider).toBeDefined();
		});

		test('should respect STORAGE_PROVIDER environment variable', () => {
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';

			const provider = getStorageProvider();
			expect(provider).toBeDefined();
		});

		test('should throw error for unimplemented S3 provider', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 's3';
			mockEnv.VERCEL = '';

			expect(() => getStorageProvider()).toThrow('S3 storage provider not implemented yet');
		});

		test('should throw error for unimplemented GCS provider', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 'gcs';
			mockEnv.VERCEL = '';

			expect(() => getStorageProvider()).toThrow(
				'Google Cloud Storage provider not implemented yet'
			);
		});

		test('should throw error for unknown provider', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 'unknown-provider';
			mockEnv.VERCEL = '';

			expect(() => getStorageProvider()).toThrow('Unknown storage provider: unknown-provider');
		});

		test('should default to local storage for unknown environments', () => {
			// No special environment variables set
			mockEnv.VERCEL = '';
			mockEnv.STORAGE_PROVIDER = '';

			const provider = getStorageProvider();
			expect(provider).toBeDefined();
		});
	});

	describe('resetStorageProvider', () => {
		test('should allow creating different providers after reset', () => {
			// First provider
			mockEnv.STORAGE_PROVIDER = 'local';
			const provider1 = getStorageProvider();

			// Reset and change environment
			resetStorageProvider();
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';
			const provider2 = getStorageProvider();

			// Should be different instances
			expect(provider1).not.toBe(provider2);
		});

		test('should not affect subsequent calls to the same configuration', () => {
			mockEnv.STORAGE_PROVIDER = 'local';

			// Get initial provider
			const provider1 = getStorageProvider();

			// Reset but keep same configuration
			resetStorageProvider();
			const provider2 = getStorageProvider();

			// Should be different instances but same configuration
			expect(provider1).not.toBe(provider2);
			expect(typeof provider1).toBe(typeof provider2);
		});
	});

	describe('isCloudStorage', () => {
		test('should return false for local storage', () => {
			mockEnv.STORAGE_PROVIDER = 'local';

			expect(isCloudStorage()).toBe(false);
		});

		test('should return true for vercel-blob storage', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';
			mockEnv.VERCEL = '';

			expect(isCloudStorage()).toBe(true);
		});

		test('should return true for S3 storage (even though not implemented)', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 's3';
			mockEnv.VERCEL = '';

			expect(isCloudStorage()).toBe(true);
		});

		test('should return true for GCS storage (even though not implemented)', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 'gcs';
			mockEnv.VERCEL = '';

			expect(isCloudStorage()).toBe(true);
		});

		test('should return false for local storage explicit', () => {
			// Set the mock environment variable
			mockEnv.STORAGE_PROVIDER = 'local';
			mockEnv.VERCEL = '';

			expect(isCloudStorage()).toBe(false);
		});

		test('should return false for empty storage provider (defaults to local)', () => {
			// Set the mock environment variables to empty values
			mockEnv.STORAGE_PROVIDER = '';
			mockEnv.VERCEL = '';

			expect(isCloudStorage()).toBe(false);
		});
	});

	describe('getCurrentStorageProvider', () => {
		test('should return local for default configuration', () => {
			expect(getCurrentStorageProvider()).toBe('local');
		});

		test('should return vercel-blob when explicitly configured', () => {
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';

			expect(getCurrentStorageProvider()).toBe('vercel-blob');
		});

		test('should return vercel-blob when VERCEL environment is detected', () => {
			mockEnv.VERCEL = '1';

			expect(getCurrentStorageProvider()).toBe('vercel-blob');
		});

		test('should prioritize explicit STORAGE_PROVIDER over VERCEL detection', () => {
			mockEnv.VERCEL = '1';
			mockEnv.STORAGE_PROVIDER = 'local';

			expect(getCurrentStorageProvider()).toBe('local');
		});

		test('should return local in development mode', async () => {
			// Mock development environment
			vi.doMock('$app/env', () => ({
				dev: true
			}));

			// Dynamically import to get updated environment
			const { getCurrentStorageProvider: getCurrentProvider } = await import('./factory');

			expect(getCurrentProvider()).toBe('local');
		});
	});

	describe('environment detection logic', () => {
		test('should respect environment variable priority order', () => {
			// Test priority: STORAGE_PROVIDER > VERCEL > dev > default

			// 1. Default (no special environment)
			expect(getCurrentStorageProvider()).toBe('local');

			// 2. Vercel environment
			mockEnv.VERCEL = '1';
			expect(getCurrentStorageProvider()).toBe('vercel-blob');

			// 3. Explicit storage provider overrides Vercel
			mockEnv.STORAGE_PROVIDER = 'local';
			expect(getCurrentStorageProvider()).toBe('local');

			// 4. Different explicit provider
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';
			expect(getCurrentStorageProvider()).toBe('vercel-blob');
		});

		test('should handle edge cases in environment variables', () => {
			// Empty string should be falsy
			mockEnv.STORAGE_PROVIDER = '';
			mockEnv.VERCEL = '1';
			expect(getCurrentStorageProvider()).toBe('vercel-blob');

			// Undefined should be falsy
			mockEnv.STORAGE_PROVIDER = '';
			mockEnv.VERCEL = '1';
			expect(getCurrentStorageProvider()).toBe('vercel-blob');

			// Any truthy value for VERCEL should work
			mockEnv.VERCEL = '';
			mockEnv.VERCEL = 'true';
			expect(getCurrentStorageProvider()).toBe('vercel-blob');
		});
	});

	describe('provider instantiation', () => {
		test('should create LocalStorageProvider with correct parameters', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';

			getStorageProvider();

			// Access the mocked module
			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledWith('uploads', '/uploads');
		});

		test('should use UPLOAD_PATH as base directory for LocalStorageProvider', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';
			mockEnv.UPLOAD_PATH = '/srv/ostsee/uploads';

			getStorageProvider();

			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledWith(
				'/srv/ostsee/uploads',
				'/uploads'
			);
		});

		test('should fall back to "uploads" when UPLOAD_PATH is not set', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';
			mockEnv.UPLOAD_PATH = '';

			getStorageProvider();

			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledWith('uploads', '/uploads');
		});

		test('should fall back to "uploads" when UPLOAD_PATH contains only whitespace', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';
			mockEnv.UPLOAD_PATH = '   ';

			getStorageProvider();

			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledWith('uploads', '/uploads');
		});

		test('should trim surrounding whitespace from UPLOAD_PATH', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';
			mockEnv.UPLOAD_PATH = '  /app/uploads  ';

			getStorageProvider();

			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledWith('/app/uploads', '/uploads');
		});

		test('should create VercelBlobStorageProvider with no parameters', async () => {
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';

			getStorageProvider();

			// Access the mocked module
			const vercelModule = await import('./vercel-blob');
			expect(vercelModule.VercelBlobStorageProvider).toHaveBeenCalledWith();
		});

		test('should only instantiate provider once per configuration', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';

			// Call multiple times
			getStorageProvider();
			getStorageProvider();
			getStorageProvider();

			// Access the mocked module
			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledTimes(1);
		});

		test('should create new instance after reset', async () => {
			mockEnv.STORAGE_PROVIDER = 'local';

			// First call
			getStorageProvider();

			// Reset and call again
			resetStorageProvider();
			getStorageProvider();

			// Access the mocked module
			const localModule = await import('./local');
			expect(localModule.LocalStorageProvider).toHaveBeenCalledTimes(2);
		});
	});

	describe('error handling', () => {
		test('should provide clear error messages for unimplemented providers', () => {
			const testCases: Array<[StorageProviderType, string]> = [
				['s3', 'S3 storage provider not implemented yet'],
				['gcs', 'Google Cloud Storage provider not implemented yet']
			];

			testCases.forEach(([provider, expectedMessage]) => {
				resetStorageProvider();
				mockEnv.STORAGE_PROVIDER = provider;

				expect(() => getStorageProvider()).toThrow(expectedMessage);
			});
		});

		test('should provide clear error message for unknown providers', () => {
			resetStorageProvider();
			mockEnv.STORAGE_PROVIDER = 'invalid-provider' as StorageProviderType;

			expect(() => getStorageProvider()).toThrow('Unknown storage provider: invalid-provider');
		});

		test('should not throw when checking provider type for unimplemented providers', () => {
			mockEnv.STORAGE_PROVIDER = 's3';

			// These should not throw
			expect(() => getCurrentStorageProvider()).not.toThrow();
			expect(() => isCloudStorage()).not.toThrow();

			// But getStorageProvider should throw
			expect(() => getStorageProvider()).toThrow();
		});
	});

	describe('integration scenarios', () => {
		test('should work correctly in simulated production environment', () => {
			// Simulate production deployment on Vercel
			process.env.NODE_ENV = 'production';
			mockEnv.VERCEL = '1';
			mockEnv.STORAGE_PROVIDER = '';

			expect(getCurrentStorageProvider()).toBe('vercel-blob');
			expect(isCloudStorage()).toBe(true);

			const provider = getStorageProvider();
			expect(provider).toBeDefined();
		});

		test('should work correctly in simulated development environment', async () => {
			// Mock development environment
			vi.doMock('$app/env', () => ({
				dev: true
			}));

			mockEnv.VERCEL = '';
			mockEnv.STORAGE_PROVIDER = '';

			// Dynamically import to get updated environment
			const factory = await import('./factory');

			expect(factory.getCurrentStorageProvider()).toBe('local');
			expect(factory.isCloudStorage()).toBe(false);
		});

		test('should handle configuration changes during runtime', () => {
			// Start with one configuration
			mockEnv.STORAGE_PROVIDER = 'local';
			const provider1 = getStorageProvider();
			expect(getCurrentStorageProvider()).toBe('local');

			// Change configuration (requires reset to take effect)
			mockEnv.STORAGE_PROVIDER = 'vercel-blob';
			// Without reset, should still return the same provider
			const provider2 = getStorageProvider();
			expect(provider1).toBe(provider2);

			// After reset, should use new configuration
			resetStorageProvider();
			const provider3 = getStorageProvider();
			expect(provider1).not.toBe(provider3);
			expect(getCurrentStorageProvider()).toBe('vercel-blob');
		});
	});
});
