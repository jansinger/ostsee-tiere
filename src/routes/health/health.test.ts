/**
 * Unit-Tests für den /health-Endpoint.
 *
 * Prüft die Readiness-Semantik: DB erreichbar → 200 healthy,
 * DB nicht erreichbar oder Fehler → 503 unhealthy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { version as packageVersion } from '../../../package.json';

const testDatabaseConnection = vi.fn();

vi.mock('#lib/server/env.ts', () => ({
	env: { NODE_ENV: 'test', APP_GIT_SHA: 'abcdef1234567890', APP_BUILD_DATE: '2026-07-31T10:00:00Z' }
}));

vi.mock('#lib/server/db/index.ts', () => ({
	testDatabaseConnection: (...args: unknown[]) => testDatabaseConnection(...args)
}));

import { GET } from './+server';

// Minimales RequestEvent-Mock (GET nutzt keine Event-Argumente)
const event = {} as Parameters<typeof GET>[0];

describe('GET /health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('liefert 200 und status "healthy" wenn die DB erreichbar ist', async () => {
		testDatabaseConnection.mockResolvedValue(true);

		const res = await GET(event);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.status).toBe('healthy');
		expect(body.database).toBe('connected');
	});

	it('liefert Version, Commit (gekürzt auf 7 Stellen) und Build-Datum', async () => {
		testDatabaseConnection.mockResolvedValue(true);

		const res = await GET(event);
		const body = await res.json();

		expect(body.version).toBe(packageVersion);
		expect(body.gitSha).toBe('abcdef1');
		expect(body.buildDate).toBe('2026-07-31T10:00:00Z');
	});

	it('liefert 503 und status "unhealthy" wenn die DB nicht erreichbar ist', async () => {
		testDatabaseConnection.mockResolvedValue(false);

		const res = await GET(event);
		const body = await res.json();

		expect(res.status).toBe(503);
		expect(body.status).toBe('unhealthy');
		expect(body.database).toBe('disconnected');
	});

	it('liefert 503 wenn der DB-Check eine Exception wirft', async () => {
		testDatabaseConnection.mockRejectedValue(new Error('connection refused'));

		const res = await GET(event);
		const body = await res.json();

		expect(res.status).toBe(503);
		expect(body.status).toBe('unhealthy');
	});

	it('setzt no-cache Header auch im Fehlerfall', async () => {
		testDatabaseConnection.mockResolvedValue(false);

		const res = await GET(event);

		expect(res.headers.get('cache-control')).toContain('no-cache');
	});
});
