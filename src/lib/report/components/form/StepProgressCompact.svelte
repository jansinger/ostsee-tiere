<script lang="ts">
	import ConnectionBadge from '$lib/components/ConnectionBadge.svelte';
	import { canNavigateToStep } from '$lib/form/validation/stepNavigation';
	import { getFormContext } from '$lib/report/formContext';
	import type { FormStep } from '$lib/report/types';

	/**
	 * Kompakte Fortschrittsanzeige für den ortsfesten Balken unterhalb `md`.
	 *
	 * Der ausgeschriebene Stepper aus `FormSteps.svelte` steht am Seitenkopf und
	 * ist dort ab `md` sichtbar. Auf dem Telefon ist er zweimal im Weg: er kostet
	 * oben Platz und ist beim Bedienen der Navigation unten aus dem Bild. Diese
	 * Variante zeigt denselben Zustand im Balken, in dem auch „Zurück"/„Weiter"
	 * liegen — vier Segmente statt vier Beschriftungen.
	 *
	 * Was dabei erhalten bleiben MUSS und deshalb hier steht statt in einer
	 * reinen CSS-Lösung:
	 *  - Klick-Navigation über dieselbe Regel wie oben (`canNavigateToStep`,
	 *    kein zweites Regelwerk),
	 *  - `aria-current="step"` am aktiven Schritt (WAI-Stepper-Muster),
	 *  - ein 44-px-Ziel pro Segment (`--target-min`, im Feldmodus 56px).
	 *
	 * Die Segmente sind Dekoration, die Ansage trägt der Text „Schritt X von Y"
	 * plus das `aria-label` je Schaltfläche. Deshalb ist die Farbdifferenz der
	 * Segmente nicht der einzige Kanal — sie darf unter 3:1 liegen, ohne dass
	 * Information verloren geht (WCAG 1.4.11 greift nur für Elemente, die den
	 * Zustand allein tragen).
	 */
	let { steps, currentStep = $bindable(0) }: { steps: FormStep[]; currentStep?: number } = $props();

	const { form } = getFormContext();

	function canNavigateTo(targetIndex: number): boolean {
		return canNavigateToStep(currentStep, targetIndex, $form);
	}

	function handleStepClick(index: number): void {
		if (canNavigateTo(index)) {
			currentStep = index;
		}
	}
</script>

<!--
	Der Verbindungszustand steht im ortsfesten Balken und nicht nur in der
	Navbar: Auf dem Telefon ist die Navbar beim Ausfüllen längst weggescrollt,
	der Balken ist die einzige dauerhaft sichtbare Fläche. Hier steht die Zusage
	zu den Eingaben ausgeschrieben — im Formular ist sie die eigentliche Sorge.

	`announce={false}`, weil die Instanz in der Navbar dieselbe Meldung bereits
	als Live-Region trägt; zwei davon sagen dem Screenreader „Offline" doppelt.

	Die Layout-Klassen gehen als `class` an die Komponente statt an einen
	Wrapper: Ein Wrapper mit `mb-2` behielte seinen Abstand auch dann, wenn gar
	nichts zu sehen ist.
-->
<ConnectionBadge announce={false} class="mb-2 md:hidden" />

<nav class="flex items-center gap-3 md:hidden" aria-label="Formular-Schritte">
	<p class="text-support text-base-content/70 shrink-0">
		Schritt {currentStep + 1} von {steps.length}
	</p>
	<ol class="flex flex-1 gap-1">
		{#each steps as step, index (step.id)}
			{@const navigable = canNavigateTo(index)}
			<li class="flex-1">
				<button
					type="button"
					class="flex min-h-[var(--target-min)] w-full items-center px-0.5"
					class:cursor-not-allowed={!navigable}
					aria-current={currentStep === index ? 'step' : undefined}
					aria-disabled={!navigable ? 'true' : 'false'}
					aria-label="Schritt {index + 1}: {step.title}"
					title={navigable
						? step.description
						: 'Bitte füllen Sie zuerst die vorherigen Schritte aus'}
					onclick={() => handleStepClick(index)}
				>
					<span
						class="h-1.5 w-full rounded-full {currentStep >= index
							? 'bg-primary'
							: 'bg-base-content/20'}"
						class:opacity-50={!navigable && index > currentStep}
					></span>
				</button>
			</li>
		{/each}
	</ol>
</nav>
