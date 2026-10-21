import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';
import type { SpamCheckResponse, SpamDetectionInput, SpamStoredFinding } from '#lib/types/spam.ts';
import { toStoredIndicators } from '#lib/types/spam.ts';
import { error, isHttpError, json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const logger = createLogger('api:sightings:spam-check');

export const GET: RequestHandler = async ({ params, locals, url }) => {
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { id } = params;

	if (!id || isNaN(Number(id))) {
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		const sightingResult = await db
			.select()
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		if (!sightingResult || sightingResult.length === 0) {
			throw error(404, 'Sichtung nicht gefunden');
		}

		const sighting = sightingResult[0]!;

		// Map only the fields used by detectSpamIndicators.
		// Use ?? (nullish coalescing) to preserve valid 0 values (e.g. species: 0 = Schweinswal).
		// Pass null for missing coordinates so the position heuristic is skipped rather than
		// evaluating (0, 0) as "outside the Baltic Sea".
		const parsedLatitude = sighting.latitude != null ? parseFloat(sighting.latitude) : null;
		const parsedLongitude = sighting.longitude != null ? parseFloat(sighting.longitude) : null;
		const spamInput: SpamDetectionInput = {
			latitude: parsedLatitude,
			longitude: parsedLongitude,
			species: sighting.species ?? 0,
			firstName: sighting.firstName ?? undefined,
			lastName: sighting.lastName ?? undefined,
			email: sighting.email ?? undefined,
			waterway: sighting.waterway ?? undefined,
			seaMark: sighting.seaMark ?? undefined,
			notes: sighting.notes ?? undefined,
			// DB-Wert statt eigener Geografie-Rechnung (ostsee_geo, >0 = drin)
			inBalticSeaGeo: sighting.inBalticSeaGeo
		};

		const recomputed = await detectSpamIndicators(spamInput);

		// Der persistierte Erstbefund kommt mit — ohne ihn stünde die
		// Neuberechnung unerklärt gegen die Zahl in Tabelle und Eingang
		// (`SpamCheckResponse`). `spam_indicators` ist untypisiertes `jsonb`;
		// `toStoredIndicators` macht daraus verlässlich die Liste, die das
		// OpenAPI-Schema zusagt. Ein unbrauchbarer Wert dort reißt den Score
		// nicht mit — der steht in einer eigenen Spalte und bleibt gültig.
		const stored: SpamStoredFinding | null =
			sighting.spamScore != null
				? {
						score: sighting.spamScore,
						indicators: toStoredIndicators(sighting.spamIndicators)
					}
				: null;

		logger.info(
			{
				id,
				storedScore: stored?.score ?? null,
				score: recomputed.score,
				isHighRisk: recomputed.isHighRisk
			},
			'Spam-Check für Sichtung durchgeführt'
		);

		return json({ stored, recomputed } satisfies SpamCheckResponse, {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (err) {
		if (isHttpError(err)) {
			throw err;
		}
		logger.error({ err, id }, 'Fehler beim Spam-Check');
		throw error(500, 'Interner Serverfehler beim Spam-Check');
	}
};
