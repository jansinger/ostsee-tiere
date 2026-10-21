import type { FormStep } from '#lib/types/index.ts';
import { findStepForErrors } from './findStepForErrors';

/** Das Sprungziel einer Server-Ablehnung, fertig zum Anwenden. */
export interface ServerFieldErrorTarget {
	/** Die benannten Felder, reduziert auf die, die das Formular tatsächlich zeigt. */
	fields: Record<string, string>;
	/** Schritt, zu dem gesprungen werden muss — `null`, wenn kein Sprung nötig ist. */
	targetStep: number | null;
	/** Feldreihenfolge des Schritts, in dem der Sprung landet. */
	fieldOrder: string[];
}

/**
 * Bereitet die Feldkarte einer Server-Ablehnung für die Anzeige auf.
 *
 * Reine Funktion ohne Svelte-/Store-Abhängigkeit — die eigentliche Anwendung
 * (Fehler in den Store schreiben, Schritt wechseln, scrollen) bleibt in
 * `ModernReportForm.svelte`, die Entscheidungen stehen hier und sind in Node
 * testbar.
 *
 * **Warum gefiltert wird.** Der Server kann Felder benennen, die in keinem
 * Schritt stehen: `POST /api/sightings` fällt bei unerwarteter Fehlerstruktur
 * auf den Schlüssel `allgemein` zurück, und `referenceId`, `entryChannel` oder
 * `weatherData.*` gehören zum Schema, aber zu keinem Formularschritt. Ein
 * solcher Eintrag hätte kein Element zum Anspringen (`scrollToFirstError`
 * fände nichts), kein Sprungziel (`findStepForErrors` ignoriert ihn ohnehin)
 * — und vor allem kein Bedienelement, das ihn wieder löscht: `updateField`
 * entfernt nur den Fehler des *geänderten* Feldes. Er bliebe bis zum nächsten
 * Absenden im Store hängen. Was niemand sehen und niemand beheben kann, gehört
 * nicht hinein; die Meldung selbst bleibt in `SubmitStatus` sichtbar.
 */
export function resolveServerFieldErrors(
	fields: Record<string, string>,
	steps: FormStep[],
	currentStep: number
): ServerFieldErrorTarget {
	const knownFields = new Set(steps.flatMap((step) => step.fields));
	const visibleFields = Object.fromEntries(
		Object.entries(fields).filter(([field]) => knownFields.has(field))
	);

	const targetStep = findStepForErrors(Object.keys(visibleFields), steps, currentStep);

	return {
		fields: visibleFields,
		targetStep,
		// `targetStep ?? currentStep`: Ohne Sprung bleibt der aktuelle Schritt das
		// Ziel — dort stehen die Felder dann bereits.
		fieldOrder: steps[targetStep ?? currentStep]?.fields ?? []
	};
}
