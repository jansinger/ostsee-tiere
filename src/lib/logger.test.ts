/**
 * Unit Test für den gemeinsamen Logger.
 *
 * `#lib/logger` wird von Komponenten importiert, deren `<script>`-Block beim
 * SSR **auf dem Server** läuft — der Server-Zweig hier ist also kein
 * Randfall. Er hatte bis zum 2026-08-19 keine Redaction, anders als
 * `logger/serverLogger.ts`: Ein `logger.error({ email })` aus einer
 * SSR-gerenderten Komponente landete unredigiert im Log.
 *
 * Aufgefallen ist das erst, als die Fehler-Serializer dazukamen und die Frage
 * aufwarfen, was dieser Zweig eigentlich alles schreibt (Review zu PR #897).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PinoOptions = {
	serializers: Record<string, unknown>;
	redact: { paths: string[]; remove: boolean };
};

const pinoFactory = vi.fn((_options: PinoOptions) => ({ info: vi.fn() }));

vi.mock('pino', async (importOriginal) => {
	const actual = await importOriginal<typeof import('pino')>();
	const mock = Object.assign((options: PinoOptions) => pinoFactory(options), {
		stdSerializers: actual.stdSerializers
	});
	return { default: mock };
});

import { createLogger } from './logger';
import { LOG_REDACTION } from './logger/redaction';
import { LOG_SERIALIZERS } from './logger/serializers';

describe('createLogger (gemeinsamer Logger, Server-Zweig)', () => {
	beforeEach(() => {
		pinoFactory.mockClear();
	});

	it('übergibt die Fehler-Serializer an Pino', () => {
		createLogger('test');

		expect(pinoFactory).toHaveBeenCalledWith(
			expect.objectContaining({ serializers: LOG_SERIALIZERS })
		);
	});

	it('redigiert personenbezogene Felder wie der Server-Logger', () => {
		// Ohne diese Zusicherung schreibt der SSR-Pfad mehr ins Log als der
		// dedizierte Server-Logger — und zwar unbemerkt, weil beide Dateien
		// getrennt gepflegt werden.
		createLogger('test');

		expect(pinoFactory).toHaveBeenCalledWith(expect.objectContaining({ redact: LOG_REDACTION }));
	});
});
