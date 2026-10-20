import {
	getAnimalBehaviorLabel,
	type AnimalBehaviorEnum
} from '#lib/report/formOptions/animalBehavior.ts';
import {
	getAnimalConditionLabel,
	type AnimalConditionEnum
} from '#lib/report/formOptions/animalCondition.ts';
import { getDistanceLabel, type DistanceEnum } from '#lib/report/formOptions/distance.ts';
import {
	getSpeciesLabel,
	isValidSpecies,
	type SpeciesEnum
} from '#lib/report/formOptions/species.ts';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';
import type { SightingFormValues } from '#lib/types/Form.ts';
import { formatLocalDateTime } from './dateTime';
import { formatLocation } from './formatLocation';

/**
 * Enhanced sighting data with translated enum values for display
 */
export interface FormattedSightingData extends Omit<
	SightingFormValues,
	'species' | 'behavior' | 'distance' | 'deadCondition'
> {
	species: string;
	speciesRaw?: SpeciesEnum | number;
	behavior?: string;
	behaviorRaw?: AnimalBehaviorEnum | number;
	distance?: string;
	distanceRaw?: DistanceEnum | number;
	deadCondition?: string;
	deadConditionRaw?: AnimalConditionEnum | number;
	sightingDate: string;
	coordinatesFormatted: string | null;
}

/**
 * Formats sighting data for email templates and display
 * Translates enum values to human-readable labels
 *
 * @param sighting - Die zu formatierende Sichtung
 * @param locale - Locale für die Label-Übersetzung; Default die aktuelle
 *   Locale. Der einzige Verbraucher außerhalb der Tests ist die DMM-
 *   Benachrichtigungsmail (`emailService.ts`), die hier ausdrücklich
 *   `baseLocale` übergibt (siehe Docblock dort und
 *   docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md, Abschnitt 5.4) — dieser
 *   Default gilt also nur für etwaige künftige, nutzersichtbare Aufrufer.
 */
export function formatSightingForDisplay(
	sighting: SightingFormValues,
	locale: Locale = getLocale()
): FormattedSightingData {
	// Destructure and omit the properties we'll replace
	const { species, behavior, distance, deadCondition, ...restSighting } = sighting;

	const formatted: FormattedSightingData = {
		...restSighting,
		// Translate species enum to label
		species: getSpeciesLabel(species as SpeciesEnum, locale),
		speciesRaw: species as SpeciesEnum,

		// Format date for display
		sightingDate: sighting.sightingDatetime ? formatLocalDateTime(sighting.sightingDatetime) : '',

		// Format coordinates for display
		coordinatesFormatted:
			sighting.longitude && sighting.latitude
				? formatLocation(sighting.longitude, sighting.latitude)
				: null
	};

	// Translate behavior enum to label if present
	if (behavior) {
		formatted.behavior = getAnimalBehaviorLabel(behavior as AnimalBehaviorEnum, locale);
		formatted.behaviorRaw = behavior as AnimalBehaviorEnum;
	}

	// Translate distance enum to label if present
	if (distance) {
		formatted.distance = getDistanceLabel(distance as DistanceEnum, locale);
		formatted.distanceRaw = distance as DistanceEnum;
	}

	// Zustand eines Totfunds. Wie oben nur bei gesetztem Wert: 0 ist
	// `UNKNOWN` und liefert „Unbekannt" — eine Zeile, die nichts aussagt.
	if (deadCondition) {
		formatted.deadCondition = getAnimalConditionLabel(deadCondition as AnimalConditionEnum, locale);
		formatted.deadConditionRaw = deadCondition as AnimalConditionEnum;
	}

	return formatted;
}

/**
 * Checks if species value indicates unknown or missing species for spam detection
 */
export function isUnknownOrMissingSpecies(species: unknown): boolean {
	if (!species && species !== 0) return true;

	const numericValue = typeof species === 'string' ? parseInt(species, 10) : species;

	// Check if it's a valid species enum
	if (!isValidSpecies(numericValue)) return true;

	// Check if it's one of the "unknown" species values
	const unknownSpeciesValues = [8, 10]; // UNKNOWN_WHALE, UNKNOWN_SEAL
	return unknownSpeciesValues.includes(numericValue as number);
}
