/**
 * @fileoverview Legacy REST API endpoint - PDF specification compliance
 *
 * GET /rest_sichtungen/antworten.json
 *
 * Returns dropdown options in EXACT legacy format from PDF specification.
 * This endpoint MUST maintain 100% compatibility with original schweinswalsichtung.de API.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import { createLogger } from '#lib/logger.server.ts';
import {
	AnimalBehaviorEnum,
	getAnimalBehaviorLabel
} from '#lib/report/formOptions/animalBehavior.ts';
import {
	AnimalConditionEnum,
	getAnimalConditionLabel
} from '#lib/report/formOptions/animalCondition.ts';
import { BoatDriveEnum, getBoatDriveLabel } from '#lib/report/formOptions/boatDrive.ts';
import { DistanceEnum, getDistanceLabel } from '#lib/report/formOptions/distance.ts';
import { DistributionEnum, getDistributionLabel } from '#lib/report/formOptions/distribution.ts';
import { EntryChannelEnum, getEntryChannelLabel } from '#lib/report/formOptions/entryChannel.ts';
import { getSeaStateLabel, SeaStateEnum } from '#lib/report/formOptions/seaState.ts';
import { getSexLabel, SexEnum } from '#lib/report/formOptions/sex.ts';
import { getSightingFromLabel, SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import { getSpeciesLabel, SpeciesEnum } from '#lib/report/formOptions/species.ts';
import { getVisibilityLabel, VisibilityEnum } from '#lib/report/formOptions/visibility.ts';
import { getWindDirectionLabel, WindDirectionEnum } from '#lib/report/formOptions/windDirection.ts';
import { getWindStrengthLabel, WindStrengthEnum } from '#lib/report/formOptions/windStrength.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { baseLocale } from '#lib/paraglide/runtime.js';
import { json, type RequestEvent } from '@sveltejs/kit';

const logger = createLogger('api:legacy:antworten:pdf-compliant');

/**
 * GET handler for PDF-compliant response options
 *
 * Returns options in the EXACT format specified in the PDF documentation.
 * Format: { "fieldname": { "value": "label" } } NOT array format!
 */
export async function GET(event: RequestEvent): Promise<Response> {
	const clientIp = getClientIp(() => event.getClientAddress());

	logger.debug({ ip: clientIp }, 'PDF-compliant legacy response options requested');

	try {
		// Build response options in EXACT PDF format (value-label object format)
		const responseOptions = {
			// Species mapping (tierart) - Note: PDF shows 0-10 range
			//
			// Locale bewusst auf baseLocale ('de') gepinnt statt getSpeciesLabel()
			// die aktive Anfrage-Locale wählen zu lassen: Dieser Endpunkt ist Teil
			// der Legacy-API (CLAUDE.md, "Legacy REST API — 100 % Kompatibilität"),
			// an die ein iOS-Client (OstSeeTiere/8) fest gebunden ist. Der
			// Wertevertrag ist deutsch, unabhängig vom /de/- oder /en/-Präfix, mit
			// dem dieser Pfad laut .claude/rules/legacy-api.md erreichbar ist —
			// das Präfix ist Routenkosmetik, keine Übersetzung. messages/en.json
			// trägt heute noch denselben deutschen Wortlaut wie de.json; sobald
			// echte englische Artnamen eingepflegt werden, würde ein ungepinnter
			// Aufruf hier sonst unbemerkt von der deutschen Antwort abweichen.
			tierart: Object.entries(SpeciesEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getSpeciesLabel(value as SpeciesEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Observation location mapping (vonwo) - Note: PDF uses "vonwo" not "beobachtungsort"
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			vonwo: Object.entries(SightingFromEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getSightingFromLabel(value as SightingFromEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Distance mapping (entfernung) - Note: PDF shows 1-5 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			entfernung: Object.entries(DistanceEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getDistanceLabel(value as DistanceEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Distribution mapping (verteilung) - Note: PDF shows 0-3 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			verteilung: Object.entries(DistributionEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getDistributionLabel(value as DistributionEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Animal behavior mapping (verhalten) - Note: PDF shows 0-3 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			verhalten: Object.entries(AnimalBehaviorEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getAnimalBehaviorLabel(value as AnimalBehaviorEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Sea state mapping (seegang) - Note: PDF shows 0-5 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			seegang: Object.entries(SeaStateEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getSeaStateLabel(value as SeaStateEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Wind direction mapping (windrichtung) - Note: PDF specifies exact values including 'SO'
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			windrichtung: (() => {
				const validDirections = ['', 'N', 'NW', 'W', 'SW', 'S', 'SO', 'O', 'NO'];
				const result: Record<string, string> = {};

				validDirections.forEach((dir) => {
					if (Object.values(WindDirectionEnum).includes(dir as WindDirectionEnum)) {
						result[dir] = getWindDirectionLabel(dir as WindDirectionEnum, baseLocale);
					}
				});

				return result;
			})(),

			// Wind strength mapping (windstaerke) - Note: PDF shows 1-12 range as strings
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			windstaerke: Object.entries(WindStrengthEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getWindStrengthLabel(value as WindStrengthEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Visibility mapping (sichtweite) - Note: PDF shows 1-4 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			sichtweite: Object.entries(VisibilityEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getVisibilityLabel(value as VisibilityEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Boat drive mapping (bootsantrieb) - Note: PDF shows 0-4 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			bootsantrieb: Object.entries(BoatDriveEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getBoatDriveLabel(value as BoatDriveEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Entry channel mapping (eingangskanal) - Note: PDF shows 0-5 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			eingangskanal: Object.entries(EntryChannelEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getEntryChannelLabel(value as EntryChannelEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				),

			// Dead animal condition mapping (totfund_zustand) - Note: PDF shows 0-5 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			totfund_zustand: Object.entries(AnimalConditionEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getAnimalConditionLabel(
							value as AnimalConditionEnum,
							baseLocale
						);
						return acc;
					},
					{} as Record<string, string>
				),

			// Dead animal sex mapping (totfund_geschlecht) - Note: PDF shows 0-2 range
			// Locale bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
			// `tierart` oben (Legacy-API-Vertrag, iOS-Client OstSeeTiere/8).
			totfund_geschlecht: Object.entries(SexEnum)
				.filter(([_key, value]) => typeof value === 'number')
				.reduce(
					(acc, [_key, value]) => {
						acc[value.toString()] = getSexLabel(value as SexEnum, baseLocale);
						return acc;
					},
					{} as Record<string, string>
				)
		};

		logger.info(
			{
				optionCounts: {
					tierart: Object.keys(responseOptions.tierart).length,
					vonwo: Object.keys(responseOptions.vonwo).length,
					entfernung: Object.keys(responseOptions.entfernung).length,
					verteilung: Object.keys(responseOptions.verteilung).length,
					verhalten: Object.keys(responseOptions.verhalten).length,
					seegang: Object.keys(responseOptions.seegang).length,
					windrichtung: Object.keys(responseOptions.windrichtung).length,
					windstaerke: Object.keys(responseOptions.windstaerke).length,
					sichtweite: Object.keys(responseOptions.sichtweite).length,
					bootsantrieb: Object.keys(responseOptions.bootsantrieb).length,
					eingangskanal: Object.keys(responseOptions.eingangskanal).length,
					totfund_zustand: Object.keys(responseOptions.totfund_zustand).length,
					totfund_geschlecht: Object.keys(responseOptions.totfund_geschlecht).length
				},
				ip: clientIp
			},
			'PDF-compliant legacy response options generated successfully'
		);

		return json(responseOptions, {
			headers: {
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour as per PDF
				'Content-Type': 'application/json'
			}
		});
	} catch (error: unknown) {
		const isError = error instanceof Error;
		logger.error(
			{
				error: isError ? error.message : 'Unknown error',
				stack: isError ? error.stack : undefined,
				ip: clientIp
			},
			'Failed to generate PDF-compliant legacy response options'
		);

		const errorResponse = {
			error: 'InternalServerError',
			message: 'Failed to retrieve response options'
		};

		return json(errorResponse, { status: 500 });
	}
}

/**
 * Handle unsupported HTTP methods
 */
export async function POST() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}

export async function PUT() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}

export async function DELETE() {
	return json(
		{
			error: 'MethodNotAllowed',
			message: 'Only GET method is supported for this endpoint'
		},
		{ status: 405 }
	);
}
