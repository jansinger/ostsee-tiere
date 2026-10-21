/**
 * Health Check Endpoint for Docker Container Monitoring
 *
 * This endpoint provides basic health status information for load balancers,
 * Docker health checks, and monitoring systems (Prometheus, Kubernetes).
 *
 * Returns:
 * - HTTP 200: Service is healthy
 * - HTTP 503: Service is unhealthy (database down, etc.)
 */

import { env } from '#lib/server/env.ts';
import { testDatabaseConnection } from '#lib/server/db/index.ts';
import { getBuildInfo } from '#lib/server/startup/versionInfo.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const NO_CACHE_HEADERS = {
	'Cache-Control': 'no-cache, no-store, must-revalidate',
	'Content-Type': 'application/json'
} as const;

export const GET: RequestHandler = async () => {
	const startTime = Date.now();

	// Herkunft von version/gitSha/buildDate ist in versionInfo.ts dokumentiert
	// (getBuildInfo()). Gecacht — läuft hier auf jedem Docker-Healthcheck-Poll (alle 30s).
	const buildInfo = getBuildInfo();

	// Basis-Status
	const health: Record<string, unknown> = {
		status: 'healthy',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		environment: env.NODE_ENV ?? process.env.NODE_ENV ?? 'unknown',
		version: buildInfo.version,
		gitSha: buildInfo.shortGitSha,
		buildDate: buildInfo.buildDate ?? 'unknown'
	};

	// Readiness: echte DB-Konnektivität prüfen. Docker/compose fragt nur `/health`
	// ab, daher prüft dieser Endpoint die Datenbank und liefert 503 bei Ausfall.
	// testDatabaseConnection() fängt Fehler bereits intern ab und cached das
	// Ergebnis kurz, um die DB nicht zu überlasten.
	let databaseHealthy = false;
	try {
		databaseHealthy = await testDatabaseConnection();
	} catch {
		databaseHealthy = false;
	}

	if (!databaseHealthy) {
		health.status = 'unhealthy';
		health.database = 'disconnected';

		const responseTime = Date.now() - startTime;
		return json(
			{ ...health, responseTime: `${responseTime}ms` },
			{ status: 503, headers: NO_CACHE_HEADERS }
		);
	}

	health.database = 'connected';
	const responseTime = Date.now() - startTime;

	return json(
		{ ...health, responseTime: `${responseTime}ms` },
		{ status: 200, headers: NO_CACHE_HEADERS }
	);
};

// Also support HEAD requests for minimal health checks
export const HEAD: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
