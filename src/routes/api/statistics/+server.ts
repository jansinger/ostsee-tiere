/**
 * @fileoverview API-Endpunkt für Sichtungs-Statistiken
 *
 * Dieser Endpunkt stellt statistische Daten über Sichtungen bereit,
 * die in der FormHelp-Komponente angezeigt werden.
 * Implementiert server-seitiges In-Memory-Caching für 1 Stunde.
 *
 * ÖFFENTLICHER BEREICH: Es zählen ausschließlich **freigegebene** Sichtungen
 * (`scope: 'approved'`) — dieselbe Grundmenge wie die öffentliche Karte unter
 * `/sichtungen/showreports.json`. Ohne diesen Filter nannte der Hilfetext im
 * Formular mehr Sichtungen, als die Karte Marker zeigt.
 */

import { createLogger } from '#lib/logger.server.ts';
import { getSightingStatistics } from '#lib/server/db/sightingRepository.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SightingStatistics } from '#lib/server/db/sightingRepository.ts';

const logger = createLogger('api:statistics');

interface CachedStatistics {
	data: SightingStatistics;
	timestamp: number;
}

// Server-seitiger Cache (1 Stunde = 3600000 ms)
let cachedStatistics: CachedStatistics | null = null;
const CACHE_DURATION = 3600000; // 1 Stunde in Millisekunden

/**
 * Fallback-Statistiken für Fehlerfälle
 *
 * Werden ausschließlich zusammen mit HTTP 500 ausgeliefert, damit die
 * dokumentierte Response-Form erhalten bleibt. Die Anzeige (`FormHelp.svelte`)
 * wertet nur `response.ok` aus und zeigt bei 500 „Statistiken konnten nicht
 * geladen werden" — diese Platzhalterzahlen erreichen also keine Bürger:innen.
 */
const FALLBACK_STATISTICS: SightingStatistics = {
	totalSightings: 2847,
	completionRate: 89,
	averageOptionalFields: 8,
	yearsOfService: 15,
	uniqueUsers: 150,
	sightingsWithMedia: 1200,
	deadAnimalsFound: 25
};

/**
 * Prüft, ob die gecachten Daten noch gültig sind
 */
function isCacheValid(): boolean {
	if (!cachedStatistics) return false;
	return Date.now() - cachedStatistics.timestamp < CACHE_DURATION;
}

/**
 * GET /api/statistics
 *
 * Gibt statistische Daten über Sichtungen zurück
 * Nutzt server-seitiges Caching für 1 Stunde
 */
export const GET: RequestHandler = async () => {
	try {
		// Prüfe Cache zuerst
		if (isCacheValid()) {
			return json(cachedStatistics!.data, {
				headers: {
					'Cache-Control': 'public, max-age=3600', // Client-seitiges Caching
					'X-Cache-Status': 'HIT' // Debug-Header
				}
			});
		}

		// Cache abgelaufen oder nicht vorhanden - neue Daten laden.
		// `'approved'` ist explizit gesetzt, obwohl es der Default ist: Dieser
		// Endpunkt ist öffentlich, der Freigabebezug soll an der Aufrufstelle
		// sichtbar sein.
		const statistics = await getSightingStatistics('approved');

		// Cache aktualisieren
		cachedStatistics = {
			data: statistics,
			timestamp: Date.now()
		};

		return json(statistics, {
			headers: {
				'Cache-Control': 'public, max-age=3600', // Client-seitiges Caching
				'X-Cache-Status': 'MISS' // Debug-Header
			}
		});
	} catch (error) {
		logger.error(
			{ error: error instanceof Error ? error.message : error },
			'Error fetching statistics'
		);

		// Bei Fehlern: Fallback-Statistiken zurückgeben
		return json(FALLBACK_STATISTICS, {
			status: 500,
			headers: {
				'Cache-Control': 'public, max-age=300', // Kürzeres Caching bei Fehlern
				'X-Cache-Status': 'ERROR' // Debug-Header
			}
		});
	}
};
