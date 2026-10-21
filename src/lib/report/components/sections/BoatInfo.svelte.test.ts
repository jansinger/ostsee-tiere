import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import BoatInfo from './BoatInfo.svelte';

/**
 * Task 11: Wer ausdrücklich „Land" als Beobachtungsort meldet, bekommt keine
 * Fragen zum eigenen Boot mehr gestellt — `shipName`, `homePort` und `boatType`
 * betreffen ein Wasserfahrzeug, das ein Landbeobachter nicht hat.
 *
 * Task 12: `shipCount` ist ausgezogen (jetzt `Environment.svelte` — es fragt
 * nach ANDEREN Schiffen, Störungskontext, nicht nach dem eigenen Boot). Damit
 * blieb für Land-Melder kein Feld mehr in dieser Karte übrig; die ganze Karte
 * hängt seither an derselben `isFromLand`-Bedingung wie zuvor nur ihr Inhalt,
 * statt mit Titel und Einleitung leer stehenzubleiben.
 *
 * `BoatInfo` wird ausschließlich vom Meldeformular eingebunden
 * (`Step3Observations.svelte`), nicht von der Admin-Maske — anders als
 * `SightingDetails`/`Behavior` gibt es hier keinen `adminMode`-Zweig zu prüfen.
 */
function renderBoatInfo(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(BoatInfo, { overrides });
}

function field(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-testid="field-${name}"]`);
}

describe('sections/BoatInfo — Bootsfelder entfallen bei Land', () => {
	it.each(['shipName', 'homePort', 'boatType'])(
		'blendet %s aus, wenn von Land gemeldet wird',
		(name) => {
			renderBoatInfo({ sightingFrom: SightingFromEnum.LAND });

			expect(field(name)).toBeNull();
		}
	);

	it.each(['shipName', 'homePort', 'boatType'])(
		'zeigt %s, wenn von einem Boot gemeldet wird',
		(name) => {
			renderBoatInfo({ sightingFrom: SightingFromEnum.SAILBOAT });

			expect(field(name)).not.toBeNull();
		}
	);

	it.each(['shipName', 'homePort', 'boatType'])(
		'zeigt %s bei „Sonstiges" — 0 ist Default UND „Sonstiges", nicht Land',
		(name) => {
			renderBoatInfo({ sightingFrom: SightingFromEnum.OTHER });

			expect(field(name)).not.toBeNull();
		}
	);

	it('zeigt shipCount nicht mehr — das Feld steht seit Task 12 in Environment.svelte', () => {
		renderBoatInfo({ sightingFrom: SightingFromEnum.SAILBOAT });

		expect(field('shipCount')).toBeNull();
	});

	it('blendet die ganze Karte aus, wenn von Land gemeldet wird — sonst bliebe sie leer', () => {
		renderBoatInfo({ sightingFrom: SightingFromEnum.LAND });

		expect(document.querySelector('.card')).toBeNull();
	});
});
