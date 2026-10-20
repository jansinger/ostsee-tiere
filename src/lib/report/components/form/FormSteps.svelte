<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { canNavigateToStep } from '$lib/form/validation/stepNavigation';
	import { getFormContext } from '$lib/report/formContext';
	import type { FormStep } from '$lib/report/types';
	import { stepNavigationLabel } from './stepLabels';

	/**
	 * Step navigation component - currentStep is managed by parent
	 * Forward navigation requires all intermediate steps to be valid
	 * Backward navigation is always allowed
	 */
	let {
		steps,
		currentStep = $bindable(0)
	}: {
		steps: FormStep[];
		currentStep?: number;
	} = $props();

	const { form } = getFormContext();

	function canNavigateTo(targetIndex: number): boolean {
		return canNavigateToStep(currentStep, targetIndex, $form);
	}

	function handleStepClick(index: number) {
		if (canNavigateTo(index)) {
			currentStep = index;
		}
	}
</script>

<!--
  DaisyUI steps component styles the <li> directly via .step class.
  The step title is rendered as visible <li> content (shown below the
  circle). Navigation is a real <button> for proper keyboard/AT support;
  aria-current marks the active step (WAI stepper pattern).

  Wie die drei Zustände AUSSEHEN, steht in app.css („Der Stepper muss aussehen
  wie Navigation") und hängt allein an aria-disabled und aria-current — hier
  gibt es bewusst keine parallelen Zustandsklassen, die davon abweichen
  könnten. Deshalb steht auch der gesperrte Cursor dort und nicht mehr als
  `class:cursor-not-allowed` an dieser Stelle.
-->
<!--
  Ab `md`. Unterhalb davon zeigt `StepProgressCompact.svelte` denselben Zustand
  im ortsfesten Balken unten — der Stepper hier wäre dort doppelt: er kostet
  oben Platz und ist beim Bedienen der Navigation längst aus dem Bild.
  Ausgeblendet statt umgebaut, weil beide Varianten dieselbe Regel
  (`canNavigateToStep`) und dasselbe `aria-current` benutzen; es gibt keinen
  Zustand, der nur in einer der beiden existiert.
-->
<nav
	class="mb-8 hidden md:block"
	aria-label={m.report_components_form_formsteps_aria_label_formular_schritte()}
>
	<ul class="steps steps-horizontal w-full">
		{#each steps as step, index (step.id)}
			{@const navigable = canNavigateTo(index)}
			<li
				class="step {currentStep >= index ? 'step-primary' : ''}"
				class:opacity-70={!navigable && index > currentStep}
			>
				<button
					type="button"
					class="text-support step-button px-1"
					aria-disabled={!navigable ? 'true' : 'false'}
					aria-label={stepNavigationLabel(index, currentStep, step.title)}
					aria-current={currentStep === index ? 'step' : undefined}
					title={navigable
						? step.description
						: m.report_components_form_stepprogresscompact_title_bitte_fuellen_sie_zuerst()}
					onclick={() => handleStepClick(index)}
				>
					{step.title}
				</button>
			</li>
		{/each}
	</ul>
</nav>
