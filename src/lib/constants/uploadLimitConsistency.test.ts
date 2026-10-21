/**
 * Die öffentliche Upload-Konfiguration und das, was der Server tatsächlich
 * annimmt, müssen zusammenpassen.
 *
 * `uploadDefaults.ts` formuliert diese Invariante selbst: Weichen die Werte ab,
 * akzeptiert die Dropzone Dateien, die der Server anschließend ablehnt.
 * Das galt bisher nur für die Größe — hier kommt die Typliste dazu, weil
 * `image/gif` genau so auseinandergelaufen ist.
 *
 * Siehe docs/archive/VIDEO_UPLOAD_KONZEPT_2026-07-31.md, Abschnitt 1.3 d.
 */
import { describe, expect, it, vi } from 'vitest';
import {
	PUBLIC_UPLOAD_ALLOWED_TYPES,
	PUBLIC_UPLOAD_MAX_FILE_SIZE_BYTES,
	PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_BYTES
} from './uploadDefaults';
import { getDefaultConfigurationsByCategory } from '#lib/server/services/configInitializer.ts';
import { hasMagicByteSignature } from '#lib/server/validation/magicBytes.ts';
import { DEFAULT_CONFIG_VALUES } from '#lib/services/configService.ts';
import { UPLOAD_LIMITS } from './upload';

// Beide importierten Module hängen über ConfigRepository bzw. direkt an
// `#lib/logger.server.js`. Ohne Mock zieht der Test die Server-Logger-Einrichtung
// mit in die Node-Umgebung — jeder andere Server-Test im Projekt mockt ihn.
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

function seededAllowedFileTypes(): string[] {
	const securityDefaults = getDefaultConfigurationsByCategory()['security'] ?? [];
	const entry = securityDefaults.find((item) => item.key === 'security.allowedFileTypes');
	if (!entry) {
		throw new Error('security.allowedFileTypes fehlt in den Vorbelegungen');
	}
	return entry.value as string[];
}

describe('Upload-Grenzen', () => {
	it('verspricht im Fallback nicht mehr, als die Vorbelegung für Bilder erlaubt', () => {
		const configuredBytes = DEFAULT_CONFIG_VALUES['security.maxFileSize'] * 1024 * 1024;
		expect(PUBLIC_UPLOAD_MAX_FILE_SIZE_BYTES).toBeLessThanOrEqual(configuredBytes);
	});

	it('verspricht im Fallback nicht mehr, als die Vorbelegung für Videos erlaubt', () => {
		const configuredBytes = DEFAULT_CONFIG_VALUES['security.maxVideoFileSize'] * 1024 * 1024;
		expect(PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_BYTES).toBeLessThanOrEqual(configuredBytes);
	});

	it('verspricht im Fallback nicht mehr, als die Vorbelegung insgesamt erlaubt', () => {
		const configuredBytes = DEFAULT_CONFIG_VALUES['security.maxTotalUploadSize'] * 1024 * 1024;
		expect(UPLOAD_LIMITS.MAX_TOTAL_SIZE).toBeLessThanOrEqual(configuredBytes);
	});
});

describe('Upload-Typlisten', () => {
	it('bietet öffentlich keinen Typ an, den die Serverliste nicht kennt', () => {
		const serverTypes = seededAllowedFileTypes();
		for (const type of PUBLIC_UPLOAD_ALLOWED_TYPES) {
			expect(serverTypes, `${type} fehlt in security.allowedFileTypes`).toContain(type);
		}
	});

	it('bietet öffentlich keinen Typ an, dessen Inhalt nicht prüfbar ist', () => {
		for (const type of PUBLIC_UPLOAD_ALLOWED_TYPES) {
			expect(hasMagicByteSignature(type), `${type} hat keine Magic-Bytes-Signatur`).toBe(true);
		}
	});
});
