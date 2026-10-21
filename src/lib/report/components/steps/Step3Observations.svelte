<!--
  Step 2: Behavioral Observations and Environmental Conditions
  Optional detailed information that enhances research value
-->
<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { createLogger } from '#lib/logger.ts';
	import Behavior from '#lib/report/components/sections/Behavior.svelte';
	import BoatInfo from '#lib/report/components/sections/BoatInfo.svelte';
	import Environment from '#lib/report/components/sections/Environment.svelte';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { isDeadFinding } from '#lib/report/formConfig.ts';
	import { scrollToElement } from '#lib/utils/fieldNavigation.ts';
	import { step3ObservationsIntro } from '#lib/report/wording.ts';

	import Icon from '#lib/components/Icon.svelte';

	const logger = createLogger('report:Step3Observations');
	const formContext = getFormContext();
	const { form, isSubmitting } = formContext;

	// Abschlussreview (nicht blockierend): Der zweite Satz nannte beim Totfund
	// weiterhin „Verhaltensinformationen", obwohl die Karte darunter für diesen
	// Zweig ausgeblendet ist (`isDeadFinding`-Bedingung an `<Behavior>` unten) —
	// die Entscheidung steht wie die übrigen Zweigtexte in `wording.ts`.
	const introSecondSentence = $derived(step3ObservationsIntro($form.isDead));

	// Props für currentStep - wird vom Parent (ModernReportForm) übergeben
	let { currentStep = $bindable(2) }: { currentStep?: number } = $props();

	async function skipToNextStep(): Promise<void> {
		try {
			currentStep += 1;
			scrollToElement(document.getElementById('form-content'));
			// Fokus auf den Header des neuen Schritts setzen (Screenreader-Ansage), analog StepNavigation
			requestAnimationFrame(() => {
				const stepHeader = document.querySelector('#form-content h2');
				if (stepHeader instanceof HTMLElement) {
					stepHeader.setAttribute('tabindex', '-1');
					stepHeader.focus({ preventScroll: true });
				}
			});
			logger.info('Step 3 skipped by user');
		} catch (error) {
			logger.error({ error }, 'Error skipping step 3');
		}
	}
</script>

<div class="space-y-6 md:space-y-8">
	<!-- Step Header -->
	<div class="space-y-4 px-2 text-center md:px-0">
		<!-- Unterhalb `md` ausgeblendet: dekorativ, siehe Step1LocationTime.svelte. -->
		<div class="hidden justify-center md:flex">
			<div
				class="bg-primary/20 flex h-10 w-10 items-center justify-center rounded-full md:h-12 md:w-12"
			>
				<Icon icon="lucide:activity" width="20" class="text-primary md:h-6 md:w-6" />
			</div>
		</div>
		<h2 class="text-base-content text-xl font-bold md:text-2xl">
			{m.report_components_steps_step3observations_text_weitere_informationen()}
		</h2>
		<!-- „Fotos/Videos" stand hier, solange der Upload auf diesem Schritt lag.
		     Seit dem 2026-08-04 steht er auf Schritt 2 — der Halbsatz verspräche
		     sonst etwas, das einen Schritt weiter vorne liegt, und das ausgerechnet
		     direkt über dem „Schritt überspringen"-Knopf. -->
		<p class="text-base-content/70 mx-auto max-w-2xl text-sm md:text-base">
			{m.report_components_steps_step3observations_text_diese_details_sind()}
			<strong
				>{m.report_components_steps_step3observations_text_optional_aber_extrem_wertvoll()}</strong
			>
			{m.report_components_steps_step3observations_text_fuer_die_forschung()}
			{introSecondSentence}
		</p>

		<!-- Skip Button prominent oben platziert -->
		<div class="flex justify-center">
			<button
				type="button"
				onclick={skipToNextStep}
				disabled={$isSubmitting}
				class="btn btn-outline gap-2"
				aria-label={m.report_components_steps_step3observations_aria_label_diesen_optionalen_schritt_ueberspringen()}
			>
				<Icon icon="lucide:skip-forward" width="16" />
				{m.report_components_steps_step3observations_text_schritt_ueberspringen()}
			</button>
		</div>

		<div class="divider text-xs opacity-70">
			{m.report_components_steps_step3observations_text_oder_details_hinzufuegen()}
		</div>
	</div>

	<!-- `Media` steht seit dem 2026-08-04 auf Schritt 2 (`Step2SightingDetails`).

	     `OptionalSightingDetails` ist hier ersatzlos entfallen: Beide Felder der
	     Sektion sind admin-only, sie hätte im Meldeformular nur noch eine leere
	     Karte mit Überschrift beigetragen. Die Komponente selbst bleibt — die
	     Admin-Maske bindet sie ein und braucht beide Felder für den Bestand. -->
	{#if !isDeadFinding($form.isDead)}
		<!-- Ein totes Tier zeigt kein Verhalten und reagiert nicht auf ein Boot —
		     `getFormSteps` (formConfig.ts) nimmt `behavior`/`behaviorText`/`reaction`
		     beim Totfund bereits aus der Validierung. Ohne dieselbe Bedingung hier
		     bliebe die Karte sichtbar, aber unvalidiert ausgefüllt — sichtbar UND
		     validiert müssen zusammen entschieden werden, sonst geht ein unvalidierter
		     Wert ans Backend. `isDeadFinding` ist die einzige gültige Normalisierung
		     von `isDead`, siehe formConfig.ts. -->
		<Behavior></Behavior>
	{/if}

	<Environment></Environment>

	<BoatInfo></BoatInfo>
</div>
