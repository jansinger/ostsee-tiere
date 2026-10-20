/**
 * @fileoverview Positiver Nachweis: Der Sprachwechsel wirkt tatsächlich.
 *
 * Alle bisherigen `*LocalePinning.test.ts` (siehe
 * `src/routes/rest_sichtungen/antworten.json/localePinning.test.ts`,
 * `src/routes/sichtungen/showreports.json/localePinning.test.ts`,
 * `src/lib/utils/format/sightingFormatterLocalePinning.test.ts`) sind
 * NEGATIV formuliert: Sie belegen, dass Deutsch dort erhalten bleibt, wo es
 * erhalten bleiben muss (Legacy-API, Export, Museums-Mail). Keiner von ihnen
 * belegt, dass Englisch unter `locale: 'en'` überhaupt ankommt. Würde
 * `memoizePerLocale` sein Locale-Argument ignorieren, oder würden
 * `getSpeciesLabel`/`getSeaStateLabel`/`getSpeciesOptions` das `locale`-Argument
 * verwerfen, blieben alle bisherigen Tests unverändert grün — sie prüfen nur
 * die deutsche Seite.
 *
 * Dieser Test schließt die Lücke: dieselbe Divergenz-Mechanik wie in den
 * Pinning-Tests (englische Botschaft auf einen Sentinel), aber mit
 * `toBe(SENTINEL)` statt `not.toBe(SENTINEL)` — und in beide Richtungen
 * (`de` bleibt deutsch, `en` weicht sichtbar ab). Erst beide Richtungen
 * zusammen belegen einen echten Schalter statt eines toten Parameters.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as yup from 'yup';
import {
	getSpeciesLabel,
	getSpeciesOptions,
	SpeciesEnum
} from '#lib/report/formOptions/species.ts';
import { getSeaStateLabel, SeaStateEnum } from '#lib/report/formOptions/seaState.ts';
import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';

const DIVERGED_EN_LABEL = 'TEST-ONLY-DIVERGED-ENGLISH-LABEL';

function divergeInEnglish(
	actualFn: (inputs?: Record<string, never>, options?: { locale?: 'de' | 'en' }) => string
) {
	return (inputs?: Record<string, never>, options?: { locale?: 'de' | 'en' }) =>
		options?.locale === 'en' ? DIVERGED_EN_LABEL : actualFn(inputs, options);
}

vi.mock('#lib/paraglide/messages.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/paraglide/messages.js')>();
	return {
		...actual,
		// Zwingt die englischen Botschaften auseinander, egal was
		// messages/en.json heute tatsächlich enthält (siehe Docblock oben).
		formoptions_species_harbor_porpoise: divergeInEnglish(
			actual.formoptions_species_harbor_porpoise
		),
		formoptions_seastate_smooth: divergeInEnglish(actual.formoptions_seastate_smooth),
		// Schicht A (Aufgabe 4.2): dieselbe Divergenz-Mechanik für eine
		// Schema-Botschaft aus sightingSchema.ts.
		sighting_latitude_label: divergeInEnglish(actual.sighting_latitude_label)
	};
});

describe('Sprachwechsel wirkt wirklich (positiver Gegenbeweis zu den Pinning-Tests)', () => {
	it('getSpeciesLabel: liefert unter "en" die abweichende englische Botschaft, unter "de" weiterhin die deutsche', () => {
		expect(getSpeciesLabel(SpeciesEnum.HARBOR_PORPOISE, 'en')).toBe(DIVERGED_EN_LABEL);
		expect(getSpeciesLabel(SpeciesEnum.HARBOR_PORPOISE, 'de')).toBe('Schweinswal');
	});

	it('getSeaStateLabel: liefert unter "en" die abweichende englische Botschaft, unter "de" weiterhin die deutsche', () => {
		expect(getSeaStateLabel(SeaStateEnum.SMOOTH, 'en')).toBe(DIVERGED_EN_LABEL);
		expect(getSeaStateLabel(SeaStateEnum.SMOOTH, 'de')).toBe('Glatte See, keine Wellen');
	});

	it('getSpeciesOptions: die Options-Liste trägt unter "en" den abweichenden Sentinel, unter "de" weiterhin das deutsche Label', () => {
		const optionsEn = getSpeciesOptions(false, 'en');
		const optionsDe = getSpeciesOptions(false, 'de');

		const porpoiseEn = optionsEn.find(
			(option) => option.value === String(SpeciesEnum.HARBOR_PORPOISE)
		);
		const porpoiseDe = optionsDe.find(
			(option) => option.value === String(SpeciesEnum.HARBOR_PORPOISE)
		);

		expect(porpoiseEn?.label).toBe(DIVERGED_EN_LABEL);
		expect(porpoiseDe?.label).toBe('Schweinswal');
	});

	// Schicht A (Aufgabe 4.2): getSightingSchema(locale) baut das Yup-Schema
	// je Locale — derselbe Gegenbeweis wie oben, jetzt für eine Schema-Botschaft
	// statt eine formOptions-Botschaft.
	it('getSightingSchema: liefert unter "en" die abweichende englische Schema-Botschaft, unter "de" weiterhin die deutsche', () => {
		const latitudeEn = getSightingSchema('en').describe().fields.latitude as yup.SchemaDescription;
		const latitudeDe = getSightingSchema('de').describe().fields.latitude as yup.SchemaDescription;

		expect(latitudeEn.label).toBe(DIVERGED_EN_LABEL);
		expect(latitudeDe.label).toBe('Breitengrad');
	});
});
