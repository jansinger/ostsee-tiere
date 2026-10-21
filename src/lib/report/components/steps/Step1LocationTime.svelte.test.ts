import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import Step1LocationTime from './Step1LocationTime.svelte';

/**
 * B6 (Abschlussreview) hatte die Rückmeldung „Sie melden: … · [Ändern]" an den
 * Kopf von Schritt 1 gestellt, damit es dort überhaupt einen Korrekturweg
 * zurück zur Einstiegsseite gibt. Der Weg bleibt — die Zeile steht nur nicht
 * mehr hier oben, wo sie vor dem ersten Feld Platz kostet, sondern einmal in
 * der Aktionszeile unter dem Formular (`form/FormActions.svelte`) und gilt von
 * dort für alle vier Schritte.
 *
 * Der Test prüft die Abwesenheit, weil das die eigentliche Aussage ist: Ein
 * Test über die neue Stelle allein (`FormActions.svelte.test.ts`) bliebe grün,
 * wenn die Zeile zusätzlich wieder nach oben wanderte.
 */
function renderStep1(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(Step1LocationTime, { overrides });
}

describe('Step1LocationTime — Rückmeldung steht nicht mehr im Schritt-Kopf', () => {
	it('rendert die Zeile „Sie melden" nicht', () => {
		renderStep1({ isDead: false });

		expect(document.body.textContent).not.toContain('Sie melden');
	});

	it('rendert keinen „Ändern"-Knopf im Schritt', () => {
		renderStep1({ isDead: true });

		expect(document.querySelector('[data-testid="report-kind-change"]')).toBeNull();
	});
});
