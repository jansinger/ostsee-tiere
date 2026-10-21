import type { FormStep } from '#lib/types/index.ts';

/**
 * Bestimmt, zu welchem Schritt navigiert werden muss, wenn eine Validierung
 * gegen das VOLLE Formular-Schema fehlschlägt (z.B. beim Absenden), während
 * der Nutzer sich gerade auf einem anderen Schritt befindet.
 *
 * Liefert den Index des frühesten Schritts, der eines der übergebenen
 * Fehlerfelder enthält. Liegt der früheste betroffene Schritt bereits auf
 * `currentStep` (die Fehler sind also schon sichtbar), ist kein Sprung nötig
 * → `null`. Felder, die keinem Schritt zugeordnet werden können, werden
 * ignoriert; sind ausschließlich solche unbekannten Felder betroffen, gibt es
 * kein sinnvolles Sprungziel → ebenfalls `null` (Fallback: auf dem aktuellen
 * Schritt bleiben).
 *
 * Reine Funktion ohne Svelte-/Store-Abhängigkeit — leicht in Node testbar.
 */
export function findStepForErrors(
	errorFields: string[],
	steps: FormStep[],
	currentStep: number
): number | null {
	let earliestStep: number | null = null;

	for (const field of errorFields) {
		const stepIndex = steps.findIndex((step) => step.fields.includes(field));
		if (stepIndex === -1) {
			continue;
		}
		if (earliestStep === null || stepIndex < earliestStep) {
			earliestStep = stepIndex;
		}
	}

	if (earliestStep === null || earliestStep === currentStep) {
		return null;
	}

	return earliestStep;
}
