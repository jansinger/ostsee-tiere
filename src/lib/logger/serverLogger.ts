import { env } from '#lib/server/env.ts';
import pino from 'pino';
import { LOG_REDACTION } from './redaction';
import { LOG_SERIALIZERS } from './serializers';

const VALID_PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

function resolveLogLevel(value: string | undefined): pino.Level {
	if (value && (VALID_PINO_LEVELS as readonly string[]).includes(value)) {
		return value as pino.Level;
	}
	return 'info';
}

export const createServerLogger = (context: string) => {
	return pino({
		level: resolveLogLevel(env.LOG_LEVEL),
		base: { pid: process.pid, context },
		// Ohne diese Zeile fällt `logger.error({ error }, ...)` auf die
		// aufzählbaren Eigenschaften zusammen und verliert `message` und
		// `stack` — siehe `serializers.ts`.
		serializers: LOG_SERIALIZERS,
		// Siehe `redaction.ts` — geteilt mit dem Server-Zweig von `#lib/logger.js`.
		redact: LOG_REDACTION
	});
};
