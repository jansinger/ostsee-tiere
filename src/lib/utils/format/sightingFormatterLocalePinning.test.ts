/**
 * @fileoverview Guard-Test: Die DMM-Benachrichtigungsmail bleibt deutsch,
 * egal welche Locale gerade aktiv ist.
 *
 * Hintergrund: `formatSightingForDisplay()` reicht seit dem Paraglide-Umbau
 * einen optionalen `locale`-Parameter mit Default `getLocale()` an
 * `getSpeciesLabel()`, `getAnimalBehaviorLabel()`, `getDistanceLabel()` und
 * `getAnimalConditionLabel()` durch. `emailService.ts` ruft die Funktion seit
 * der Pinnung mit explizitem `baseLocale` auf (siehe Kommentar dort und
 * docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md, Abschnitt 5.4) — die Mail geht
 * ans Deutsche Meeresmuseum, nicht an den Melder, und bleibt deshalb von
 * jedem Sprachwechsel ausgenommen.
 *
 * Ein Test, der sich auf den heutigen Wortlaut von `messages/en.json`
 * verlässt, wäre nutzlos: die Datei trägt vorerst denselben deutschen Text
 * wie `de.json`, ein ungepinnter Aufruf sähe also identisch aus. Deshalb wird
 * die englische Botschaftsfunktion für die Dauer des Tests durch einen Wert
 * ersetzt, der sich sichtbar vom deutschen unterscheidet — nur so kann der
 * Test tatsächlich rot werden, wenn die Pinnung verschwindet. Muster wie
 * `src/routes/rest_sichtungen/antworten.json/localePinning.test.ts`.
 *
 * `behavior`/`deadCondition` werden in `formatSightingForDisplay()` nur bei
 * einem wahrheitswertigen Rohwert übersetzt (0 = `OTHER`/`UNKNOWN` wird
 * bewusst übersprungen, siehe Kommentar dort) — die Tests unten wählen
 * deshalb einen von 0 verschiedenen Enum-Wert je Feld.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeciesEnum } from '#lib/report/formOptions/species.ts';
import { AnimalBehaviorEnum } from '#lib/report/formOptions/animalBehavior.ts';
import { DistanceEnum } from '#lib/report/formOptions/distance.ts';
import { AnimalConditionEnum } from '#lib/report/formOptions/animalCondition.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';

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
		formoptions_animalbehavior_constant_course: divergeInEnglish(
			actual.formoptions_animalbehavior_constant_course
		),
		formoptions_distance_less_than_10m: divergeInEnglish(actual.formoptions_distance_less_than_10m),
		formoptions_animalcondition_extremely_fresh: divergeInEnglish(
			actual.formoptions_animalcondition_extremely_fresh
		)
	};
});

function makeSighting(overrides: Partial<SightingFormValues> = {}): SightingFormValues {
	return {
		species: SpeciesEnum.HARBOR_PORPOISE,
		firstName: 'Max',
		lastName: 'Mustermann',
		email: 'max@example.com',
		privacyConsent: true,
		totalCount: 1,
		...overrides
	} as SightingFormValues;
}

describe('formatSightingForDisplay() — Locale-Pinnung für die DMM-Mail', () => {
	afterEach(async () => {
		// overwriteGetLocale() überschreibt die Modul-Funktion dauerhaft ohne
		// eingebauten Reset — auf den echten Default zurückschalten, damit
		// andere Tests im selben Prozess nicht die englische Locale erben.
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => baseLocale);
	});

	it('liefert das deutsche Species-Label bei explizitem baseLocale, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		// Simuliert eine Anfrage, deren Locale-Kontext auf Englisch steht — genau
		// der Fall, den ein ungepinnter Aufruf aus emailService.ts übernehmen würde.
		overwriteGetLocale(() => 'en');

		const { formatSightingForDisplay } = await import('./sightingFormatter');
		const result = formatSightingForDisplay(
			makeSighting({ species: SpeciesEnum.HARBOR_PORPOISE }),
			baseLocale
		);

		expect(result.species).toBe('Schweinswal');
		expect(result.species).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert das deutsche Verhaltens-Label bei explizitem baseLocale, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		const { formatSightingForDisplay } = await import('./sightingFormatter');
		const result = formatSightingForDisplay(
			makeSighting({ behavior: AnimalBehaviorEnum.CONSTANT_COURSE }),
			baseLocale
		);

		expect(result.behavior).toBe('Konstanter Kurs, regelmäßiges Tauchen (schwimmen, ziehen)');
		expect(result.behavior).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert das deutsche Entfernungs-Label bei explizitem baseLocale, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		const { formatSightingForDisplay } = await import('./sightingFormatter');
		const result = formatSightingForDisplay(
			makeSighting({ distance: DistanceEnum.LESS_THAN_10M }),
			baseLocale
		);

		expect(result.distance).toBe('weniger als 10 Meter');
		expect(result.distance).not.toBe(DIVERGED_EN_LABEL);
	});

	it('liefert das deutsche Totfund-Zustand-Label bei explizitem baseLocale, obwohl die aktive Locale Englisch ist und die englische Botschaft nachweislich abweicht', async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		const { formatSightingForDisplay } = await import('./sightingFormatter');
		const result = formatSightingForDisplay(
			makeSighting({ deadCondition: AnimalConditionEnum.EXTREMELY_FRESH }),
			baseLocale
		);

		expect(result.deadCondition).toBe('Extrem frisch');
		expect(result.deadCondition).not.toBe(DIVERGED_EN_LABEL);
	});
});
