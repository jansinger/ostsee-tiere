/**
 * Unit Test für die Verdrahtung der Serializer im Server-Logger.
 *
 * `serializers.test.ts` prüft die Serializer selbst — dieser Test stellt
 * sicher, dass sie auch tatsächlich an Pino übergeben werden. Ohne ihn wäre die
 * Wirkung erst wieder beim nächsten Produktionsfehler aufgefallen, und genau
 * das war der Ausgangspunkt (siehe SMTP-Debugging vom 2026-08-19).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/env.ts', () => ({ env: { LOG_LEVEL: 'info' } }));

type PinoOptions = {
	serializers: Record<string, unknown>;
	redact: { paths: string[] };
};

const pinoFactory = vi.fn((_options: PinoOptions) => ({ info: vi.fn() }));

vi.mock('pino', async (importOriginal) => {
	const actual = await importOriginal<typeof import('pino')>();
	const mock = Object.assign((options: PinoOptions) => pinoFactory(options), {
		stdSerializers: actual.stdSerializers
	});
	return { default: mock };
});

import { LOG_SERIALIZERS } from './serializers';
import { createServerLogger } from './serverLogger';

describe('createServerLogger', () => {
	beforeEach(() => {
		pinoFactory.mockClear();
	});

	it('übergibt die Fehler-Serializer an Pino', () => {
		createServerLogger('test');

		expect(pinoFactory).toHaveBeenCalledWith(
			expect.objectContaining({ serializers: LOG_SERIALIZERS })
		);
	});

	it('behält die Redaction personenbezogener Felder', () => {
		// Die Serializer dürfen die Redaction nicht verdrängen — beides muss
		// nebeneinander in der Konfiguration stehen.
		createServerLogger('test');

		const options = pinoFactory.mock.calls[0]?.[0];
		expect(options?.redact.paths).toContain('email');
		expect(options?.redact.paths).toContain('password');
	});
});
