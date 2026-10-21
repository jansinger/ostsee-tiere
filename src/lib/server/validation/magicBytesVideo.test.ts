import { describe, expect, it, vi } from 'vitest';
import { validateMagicBytes } from './magicBytes';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

/** Baut einen ISO-BMFF-Kopf: 4 Byte Boxgröße, "ftyp", dann die Brand. */
function isoBmffHeader(brand: string): Buffer {
	return Buffer.concat([
		Buffer.from([0x00, 0x00, 0x00, 0x20]),
		Buffer.from('ftyp', 'ascii'),
		Buffer.from(brand, 'ascii')
	]);
}

describe('validateMagicBytes für ISO-BMFF-Videos', () => {
	it('akzeptiert eine QuickTime-Datei mit qt-Brand', () => {
		expect(validateMagicBytes(isoBmffHeader('qt  '), 'video/quicktime').isValid).toBe(true);
	});

	it('akzeptiert eine als QuickTime gemeldete Datei mit mp42-Brand', () => {
		expect(validateMagicBytes(isoBmffHeader('mp42'), 'video/quicktime').isValid).toBe(true);
	});

	it('akzeptiert eine MP4-Datei mit isom-Brand', () => {
		expect(validateMagicBytes(isoBmffHeader('isom'), 'video/mp4').isValid).toBe(true);
	});

	it('akzeptiert eine als MP4 gemeldete Datei mit qt-Brand', () => {
		expect(validateMagicBytes(isoBmffHeader('qt  '), 'video/mp4').isValid).toBe(true);
	});

	it('weist ein als Video getarntes JPEG weiterhin ab', () => {
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
		const result = validateMagicBytes(jpeg, 'video/mp4');

		expect(result.isValid).toBe(false);
		expect(result.actualType).toBe('image/jpeg');
	});

	it('weist eine Datei ohne ftyp-Box ab', () => {
		const junk = Buffer.from('nichtsdergleichen', 'ascii');
		expect(validateMagicBytes(junk, 'video/mp4').isValid).toBe(false);
	});
});
