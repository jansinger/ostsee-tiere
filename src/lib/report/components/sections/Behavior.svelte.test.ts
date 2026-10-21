import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import Behavior from './Behavior.svelte';

/**
 * Task 11: „Reaktion auf Ihr Boot" ist für einen Landbeobachter unbeantwortbar
 * — er hat kein Boot, auf das die Tiere reagieren könnten. `behavior`/
 * `behaviorText` bleiben stehen: Sie fragen nach dem Verhalten der Tiere
 * allgemein, nicht nach der Reaktion auf ein Wasserfahrzeug.
 *
 * `Behavior` wird von der Admin-Maske mitgenutzt (`AdminSightingEditForm.svelte`,
 * `adminMode={true}`) — die Bedingung greift deshalb nur außerhalb des
 * Admin-Modus, sonst verlöre die Sachbearbeitung die Möglichkeit, `reaction`
 * an einem Altbestands-Datensatz mit `vonwo = Land` zu korrigieren.
 */
function renderBehavior(
	overrides: Partial<SightingFormData> = {},
	props: { adminMode?: boolean } = {}
): void {
	renderWithFormContext(Behavior, { overrides, props });
}

function field(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-testid="field-${name}"]`);
}

describe('sections/Behavior — Reaktion aufs Boot entfällt bei Land', () => {
	it('blendet reaction aus, wenn von Land gemeldet wird', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.LAND });

		expect(field('reaction')).toBeNull();
	});

	it('zeigt reaction, wenn von einem Boot gemeldet wird', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.SAILBOAT });

		expect(field('reaction')).not.toBeNull();
	});

	it('zeigt reaction bei „Sonstiges" — 0 ist Default UND „Sonstiges", nicht Land', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.OTHER });

		expect(field('reaction')).not.toBeNull();
	});

	it('lässt behavior und behaviorText auch bei Land stehen', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.LAND, behavior: 1 });

		expect(field('behavior')).not.toBeNull();
	});

	// Gegenprobe: Die Admin-Maske editiert auch Land-Altbestand mit `reaction`
	// (813 Bestandszeilen, siehe Behavior.svelte). Die Bedingung darf ihr das
	// Feld nicht nehmen.
	it('zeigt reaction in der Admin-Maske trotz Land', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.LAND }, { adminMode: true });

		expect(field('reaction')).not.toBeNull();
	});
});

/**
 * UX-Review (2026-08-06, Punkt 4): `isFromLand` greift bewusst nur bei einem
 * ausdrücklichen „Land", weil `sightingFrom = 0` gleichzeitig „Sonstiges" und
 * „noch nicht beantwortet" bedeutet (Begründung an `isFromLand` in
 * `formConfig.ts`). Das ist richtig — bedeutet aber, dass die Frage auch dem
 * Kajakfahrer, dem SUP-Paddler und dem Besucher auf der Seebrücke gestellt
 * wird. „Ihr Boot" ist für die drei schlicht falsch; die Frage selbst bleibt
 * sinnvoll.
 *
 * Verallgemeinert wird das Label ausschließlich im Meldeformular, über den
 * `label`-Override von `FormField` — den es genau für diesen Fall gibt
 * („dieselbe Schema-Spalte in zwei Kontexten unterschiedlich gefragt",
 * Präzedenz: `species` in `AnimalInfo.svelte`). Die Admin-Maske behält das
 * Schema-Label „Reaktion auf Ihr Boot"; sie ist ausdrücklich unverändert zu
 * lassen.
 *
 * Beide Richtungen gehören deshalb geprüft: Ein Override, der versehentlich
 * auch im Admin-Zweig gesetzt wird, fiele sonst nicht auf — und ein
 * versehentlich entfernter Override im Meldeformular genauso wenig.
 */
describe('sections/Behavior — die Reaktionsfrage setzt kein Boot voraus (UX-Review Punkt 4)', () => {
	/**
	 * `.fieldset` ist hier die DaisyUI-KLASSE am Wrapper-`div`, das
	 * `FieldRenderer` um jedes Feld legt — nicht das Element `<fieldset>`. Das
	 * gibt es nur bei Radiogruppen; `reaction` ist ein Textfeld und trägt sein
	 * `<label for>` als Geschwister des Controls.
	 */
	function reactionLabel(): string {
		return field('reaction')?.closest('.fieldset')?.querySelector('label')?.textContent ?? '';
	}

	it('spricht im Meldeformular von „Sie oder Ihr Fahrzeug", nicht von „Ihr Boot"', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.OTHER });

		expect(reactionLabel()).toMatch(/Reaktion auf Sie oder Ihr Fahrzeug/i);
		expect(reactionLabel()).not.toMatch(/Ihr Boot/i);
	});

	// Gegenprobe: Die Admin-Maske bleibt beim Schema-Label. Ohne diese
	// Feststellung könnte der Override unbemerkt in beide Zweige rutschen.
	it('lässt die Admin-Maske beim Schema-Label „Reaktion auf Ihr Boot"', () => {
		renderBehavior({ sightingFrom: SightingFromEnum.LAND }, { adminMode: true });

		expect(reactionLabel()).toMatch(/Reaktion auf Ihr Boot/i);
	});
});
