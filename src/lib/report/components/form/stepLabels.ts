import * as m from '#lib/paraglide/messages.js';
/**
 * Beschriftung der Schaltflächen in beiden Fortschrittsanzeigen
 * (`FormSteps.svelte` am Seitenkopf, `StepProgressCompact.svelte` im
 * ortsfesten Balken).
 *
 * Warum das eine eigene Funktion ist und nicht zweimal im Markup steht: Es ist
 * dieselbe Entscheidung wie bei `canNavigateToStep` — beide Anzeigen zeigen
 * denselben Zustand, und ein zweites Regelwerk würde irgendwann auseinander
 * laufen. Der bisherige `aria-label` in `FormSteps.svelte` war wortgleich mit
 * dem sichtbaren Titel; für eine Schaltfläche, deren Bedienbarkeit ohnehin
 * schwer zu erkennen ist, war das die verschenkte Gelegenheit, die Aktion zu
 * benennen.
 *
 * Die Richtung steht bewusst nur an den anderen Schritten: Dass man beim
 * aktuellen ist, sagt bereits `aria-current="step"`. Ein „Zurück zu" am
 * aktuellen Schritt würde dem widersprechen.
 */
export function stepNavigationLabel(index: number, currentStep: number, title: string): string {
	const step = m.report_form_steplabels_text_schritt_index_title({ index: index + 1, title });
	if (index < currentStep) return m.report_form_steplabels_text_zurueck_zu_step({ step });
	if (index > currentStep) return m.report_form_steplabels_text_weiter_zu_step({ step });
	return step;
}
