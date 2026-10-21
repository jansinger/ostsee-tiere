import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import DeadAnimal from './DeadAnimal.svelte';

/**
 * `deadSex` (Geschlecht beim Totfund) verlässt das Meldeformular — das Museum hat
 * es am 2026-08-04 abbestellt (Analyse-Punkt C4,
 * docs/MEERESMUSEUM_FORMULAR_PLAN_2026-08-04.md, PR 2 Teil b). Anders als bei
 * `distribution`/`OptionalSightingDetails.svelte` bleiben die drei übrigen Felder
 * dieser Section (`deadCondition`, `deadSize`, `deadPhoneContact`) in **beiden**
 * Modi sichtbar — nur `deadSex` verschwindet ohne `adminMode`.
 *
 * `DeadAnimal` bekommt dafür wie `OptionalSightingDetails` eine `adminMode`-Prop
 * (Default `false`); `AnimalInfo` reicht sie durch, `AdminSightingEditForm.svelte`
 * setzt `adminMode={true}`.
 */
function renderDeadAnimal(props: { adminMode?: boolean } = {}): void {
	renderWithFormContext(DeadAnimal, { overrides: { isDead: true }, props });
}

function field(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-testid="field-${name}"]`);
}

/** Das Pflicht-Sternchen der Feld-Pipeline, auf ein Feld eingegrenzt. */
function requiredMark(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-field="${name}"] [aria-label="Pflichtfeld"]`);
}

describe('sections/DeadAnimal — Geschlecht nur im Admin-Modus', () => {
	it('zeigt das Geschlecht-Feld NICHT im Meldeformular (ohne adminMode)', () => {
		renderDeadAnimal();

		expect(field('deadSex')).toBeNull();
	});

	it('zeigt das Geschlecht-Feld in der Admin-Maske (adminMode)', () => {
		renderDeadAnimal({ adminMode: true });

		expect(field('deadSex')).not.toBeNull();
	});

	/**
	 * Abgrenzung zum Präzedenzfall PR #669 (siehe Location.svelte.test.ts,
	 * OptionalSightingDetails.svelte.test.ts): Dort verschwand ein Feld komplett
	 * hinter `adminMode`. Hier gilt das NUR für `deadSex` — die übrigen drei
	 * Felder der Section sind für Melder unverändert Pflicht bzw. sichtbar und
	 * dürfen durch die Prop nicht mitgenommen werden.
	 */
	it.each(['deadCondition', 'deadSize', 'deadPhoneContact'])(
		'zeigt %s weiterhin OHNE adminMode',
		(name) => {
			renderDeadAnimal();

			expect(field(name)).not.toBeNull();
		}
	);

	it.each(['deadCondition', 'deadSize', 'deadPhoneContact'])(
		'zeigt %s auch MIT adminMode',
		(name) => {
			renderDeadAnimal({ adminMode: true });

			expect(field(name)).not.toBeNull();
		}
	);
});

/**
 * `deadCondition` ist laut Schema Pflicht, sobald `isDead` gesetzt ist
 * (`.when('isDead', { is: true, then: … required(…) })`). `FieldRenderer` sieht
 * das nicht: Es liest `required` aus `sightingSchema.describe()`, und dort ist
 * ein `when()` nicht abgebildet. Ohne den `required`-Override an `FormField`
 * steht das Feld ohne Sternchen und ohne `aria-required` da — bis der Melder
 * „Weiter" drückt und „Bitte geben Sie den Zustand des toten Tieres an."
 * bekommt.
 *
 * Der Override ist hier unbedingt `true`: Diese Section rendert ausschließlich
 * innerhalb von `{#if $form.isDead}` (`AnimalInfo.svelte`), also genau unter der
 * Bedingung, die das Schema prüft. Und sie gilt in **beiden** Masken —
 * `adminSightingSchema` lockert `deadCondition` nicht.
 */
describe('sections/DeadAnimal — Zustand als konditionales Pflichtfeld', () => {
	it.each([
		['Meldeformular', undefined],
		['Admin-Maske', true]
	])('markiert den Zustand im %s als Pflichtfeld', (_label, adminMode) => {
		renderDeadAnimal(adminMode === undefined ? {} : { adminMode });

		expect(requiredMark('deadCondition')).not.toBeNull();
		expect(field('deadCondition')?.getAttribute('aria-required')).toBe('true');
	});

	/**
	 * Gegenprobe: Die beiden Nachbarfelder sind unter denselben Bedingungen
	 * ausdrücklich optional (`deadSize` ist im Schema unbedingt optional;
	 * `deadSex` hat das Museum am 2026-08-04 samt Pflicht abbestellt). Ein
	 * pauschal auf die Section gesetzter Override fiele hier auf.
	 */
	it.each(['deadSize', 'deadSex'])('markiert %s weiterhin NICHT als Pflichtfeld', (name) => {
		renderDeadAnimal({ adminMode: true });

		expect(requiredMark(name)).toBeNull();
	});
});
