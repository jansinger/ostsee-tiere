import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';
import { resetByteBudgets } from '#lib/server/middleware/byteBudget.ts';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

const sumFileSizesForReference = vi.fn().mockResolvedValue(0);

vi.mock('#lib/server/db/sightingFilesRepository.ts', () => ({
	saveUploadedFile: vi.fn().mockResolvedValue({ id: 1 }),
	sumFileSizesForReference: (...args: [string]) => sumFileSizesForReference(...args)
}));

vi.mock('#lib/server/media/exifUtils.ts', () => ({
	readImageExifData: vi.fn().mockResolvedValue(null)
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	getStorageProvider: () => ({
		upload: vi.fn().mockResolvedValue({
			uid: 'test-uid',
			filePath: '/uploads/test.jpg',
			originalName: 'test.jpg',
			fileName: 'abc123.jpg',
			mimeType: 'image/jpeg',
			size: 1024,
			url: '/uploads/test.jpg'
		})
	})
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getUploadConfig: vi.fn().mockResolvedValue({
			allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
			maxFileSize: 10,
			maxFileSizeBytes: 10 * 1024 * 1024,
			maxVideoFileSize: 100,
			maxVideoFileSizeBytes: 100 * 1024 * 1024,
			maxTotalUploadSize: 250,
			maxTotalUploadSizeBytes: 250 * 1024 * 1024
		})
	}
}));

vi.mock('#lib/server/validation/magicBytes.ts', () => ({
	validateMagicBytes: vi.fn().mockReturnValue({ isValid: true }),
	isDangerousFileType: vi.fn().mockReturnValue(false)
}));

// Valid CUID for testing
const VALID_CUID = 'clh4z9z0b0000356gkzfh6a2i';
const VALID_UID = 'clh4z9z0b0001356gkzfh6a2j';

function createMockRequest(
	overrides: {
		contentType?: string;
		file?: File | null;
		referenceId?: string;
		uid?: string;
		authenticated?: boolean;
	} = {}
) {
	const file =
		overrides.file !== undefined
			? overrides.file
			: new File(['test-content'], 'test.jpg', { type: 'image/jpeg' });

	const formData = new FormData();
	if (file) formData.append('file', file);
	if (overrides.referenceId !== undefined) formData.append('referenceId', overrides.referenceId);
	else formData.append('referenceId', VALID_CUID);
	if (overrides.uid !== undefined) formData.append('uid', overrides.uid);
	else formData.append('uid', VALID_UID);

	return {
		request: {
			headers: {
				get: vi.fn((name: string) => {
					if (name === 'content-type')
						return overrides.contentType ?? 'multipart/form-data; boundary=----';
					if (name === 'x-forwarded-for') return '127.0.0.1';
					if (name === 'x-real-ip') return '127.0.0.1';
					if (name === 'user-agent') return 'vitest';
					return null;
				})
			},
			formData: async () => formData
		} as unknown as Request,
		locals: overrides.authenticated === false ? {} : { user: { sub: 'test-user' } },
		params: {},
		route: { id: '/api/files/upload' },
		url: new URL('http://localhost/api/files/upload'),
		setHeaders: vi.fn(),
		cookies: { get: vi.fn(), set: vi.fn() } as any,
		fetch: fetch,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false
	} as any;
}

describe('/api/files/upload POST', () => {
	it('weist Request ohne multipart/form-data ab', async () => {
		const event = createMockRequest({ contentType: 'application/json' });

		await expect(POST(event)).rejects.toMatchObject({
			status: 400
		});
	});

	it('weist Request ohne Datei ab', async () => {
		const event = createMockRequest({ file: null });

		await expect(POST(event)).rejects.toMatchObject({
			status: 400
		});
	});

	it('weist ungültige referenceId ab', async () => {
		const event = createMockRequest({ referenceId: 'not-a-cuid' });

		await expect(POST(event)).rejects.toMatchObject({
			status: 400
		});
	});

	it('weist ungültige uid ab', async () => {
		const event = createMockRequest({ uid: 'not-a-cuid' });

		await expect(POST(event)).rejects.toMatchObject({
			status: 400
		});
	});

	it('weist leere referenceId ab', async () => {
		const event = createMockRequest({ referenceId: '' });

		await expect(POST(event)).rejects.toMatchObject({
			status: 400
		});
	});

	it('weist ein Bild über der Bildgrenze mit 413 ab', async () => {
		const oversized = new File([new Uint8Array(11 * 1024 * 1024)], 'gross.jpg', {
			type: 'image/jpeg'
		});
		const event = createMockRequest({ file: oversized });

		await expect(POST(event)).rejects.toMatchObject({ status: 413 });
	});

	it('lässt ein Video über der Bildgrenze, aber unter der Videogrenze durch', async () => {
		const video = new File([new Uint8Array(20 * 1024 * 1024)], 'wal.mp4', {
			type: 'video/mp4'
		});
		const event = createMockRequest({ file: video });

		const response = await POST(event);
		expect(response.status).toBe(200);
	});

	it('weist ein Video über der Videogrenze mit 413 ab', async () => {
		const video = new File([new Uint8Array(101 * 1024 * 1024)], 'lang.mp4', {
			type: 'video/mp4'
		});
		const event = createMockRequest({ file: video });

		await expect(POST(event)).rejects.toMatchObject({ status: 413 });
	});

	it('weist eine Datei ab, die das Gesamtlimit der Meldung sprengt', async () => {
		sumFileSizesForReference.mockResolvedValueOnce(245 * 1024 * 1024);
		const video = new File([new Uint8Array(20 * 1024 * 1024)], 'noch-eins.mp4', {
			type: 'video/mp4'
		});
		const event = createMockRequest({ file: video });

		await expect(POST(event)).rejects.toMatchObject({ status: 413 });
	});

	it('lässt eine Datei durch, die unter dem Gesamtlimit bleibt', async () => {
		sumFileSizesForReference.mockResolvedValueOnce(100 * 1024 * 1024);
		const video = new File([new Uint8Array(20 * 1024 * 1024)], 'passt.mp4', {
			type: 'video/mp4'
		});
		const event = createMockRequest({ file: video });

		const response = await POST(event);
		expect(response.status).toBe(200);
	});

	it('lehnt weitere Uploads ab, sobald das Byte-Budget erschöpft ist', async () => {
		resetByteBudgets();
		const event = () =>
			createMockRequest({
				file: new File([new Uint8Array(100 * 1024 * 1024)], 'wal.mp4', { type: 'video/mp4' }),
				authenticated: false
			});

		// 3 × 100 MB passen in die 300 MB des anonymen Budgets.
		expect((await POST(event())).status).toBe(200);
		expect((await POST(event())).status).toBe(200);
		expect((await POST(event())).status).toBe(200);

		// Das vierte Video sprengt es.
		await expect(POST(event())).rejects.toMatchObject({ status: 429 });
	});
});
