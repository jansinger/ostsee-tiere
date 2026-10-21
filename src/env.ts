import { defineEnvVars } from '@sveltejs/kit/env';

const asIs = (input: string | undefined): string | undefined => input;

/**
 * Alle Umgebungsvariablen, die die App über SvelteKit liest.
 *
 * Seit SvelteKit 3 Pflicht: `$env/dynamic/*` liefert nur noch, was hier
 * deklariert ist. Ohne diese Datei kam `DATABASE_POSTGRES_URL` leer an — der
 * Build lief durch, jede Seite meldete „Database is not configured".
 *
 * `asIs` statt des vom Migrationswerkzeug vorgeschlagenen `input ?? ''`: Eine
 * fehlende Variable bleibt `undefined` wie unter `$env/dynamic/private`. Ein
 * Leerstring würde jeden Rückfall `env.X ?? …` still aushebeln (Beispiel:
 * `getDatabaseUrl()` in `server/db/index.ts` fällt auf `process.env` zurück).
 *
 * Eine neue Variable gehört hier eingetragen, sonst ist sie in der App
 * `undefined` — auch wenn sie in der Umgebung gesetzt ist.
 */
export const variables = defineEnvVars({
	NODE_ENV: { schema: asIs },
	ENCRYPTION_KEY: { schema: asIs },
	BODY_SIZE_LIMIT: { schema: asIs },
	AUTH0_DOMAIN: { schema: asIs },
	AUTH0_CLIENT_ID: { schema: asIs },
	PUBLIC_SITE_URL: { public: true, schema: asIs },
	API_AUDIENCE: { schema: asIs },
	CLEANUP_TOKEN: { schema: asIs },
	STORAGE_PROVIDER: { schema: asIs },
	VERCEL: { schema: asIs },
	UPLOAD_PATH: { schema: asIs },
	BLOB_READ_WRITE_TOKEN: { schema: asIs },
	APP_GIT_SHA: { schema: asIs },
	APP_VERSION: { schema: asIs },
	APP_BUILD_DATE: { schema: asIs },
	SMTP_HOST: { schema: asIs },
	SMTP_PORT: { schema: asIs },
	SMTP_USER: { schema: asIs },
	SMTP_PASSWORD: { schema: asIs },
	SKIP_DB_CHECK: { schema: asIs },
	DATABASE_POSTGRES_URL: { schema: asIs },
	AUTH0_CLIENT_SECRET: { schema: asIs },
	JWKS_URL: { schema: asIs },
	COOKIE_NAME: { schema: asIs },
	LOG_LEVEL: { schema: asIs }
});
