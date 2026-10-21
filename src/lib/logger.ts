// Shared logger — selects the appropriate logger for the execution environment.
// - Browser: Pino browser mode (structured console output)
// - Server: Pino with LOG_LEVEL support and pid context
//
// For server-only code (src/lib/server/**, +server.ts) prefer $lib/logger.server,
// which reads LOG_LEVEL via `#lib/server/env.ts` (Docker-safe at runtime).
// This module uses process.env.LOG_LEVEL to avoid importing server-only env modules
// into shared modules that are bundled for the browser.
import pino from 'pino';
import { createClientLogger } from './logger/clientLogger';
import { LOG_REDACTION } from './logger/redaction';
import { LOG_SERIALIZERS } from './logger/serializers';

const VALID_PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

function resolveLogLevel(value: string | undefined): pino.Level {
	if (value && (VALID_PINO_LEVELS as readonly string[]).includes(value)) {
		return value as pino.Level;
	}
	return 'info';
}

export function createLogger(context: string) {
	if (typeof window === 'undefined') {
		return pino({
			level: resolveLogLevel(process.env.LOG_LEVEL),
			base: { pid: process.pid, context },
			// Siehe `logger/serializers.ts`: ohne die Serializer verliert Pino
			// `message` und `stack` des geloggten Fehlers.
			serializers: LOG_SERIALIZERS,
			// Dieser Zweig läuft auch beim SSR von Komponenten, die `#lib/logger.js`
			// importieren — er braucht dieselbe Redaction wie der dedizierte
			// Server-Logger. Siehe `logger/redaction.ts`.
			redact: LOG_REDACTION
		});
	}
	return createClientLogger(context);
}
