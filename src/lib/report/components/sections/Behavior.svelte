<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { isFromLand } from '#lib/report/formConfig.ts';
	import { AnimalBehaviorEnum } from '#lib/report/formOptions/animalBehavior.ts';
	import { slide } from 'svelte/transition';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';

	const { form } = getFormContext();

	/**
	 * Zeigt zusätzlich die Felder, die das Meldeformular nicht mehr abfragt.
	 *
	 * Das Meldeformular ist eine kuratierte Teilmenge des Schemas — die
	 * Admin-Maske ist der vollständige Editor über denselben Datensatz. Ohne
	 * diesen Schalter hätte das Ausblenden im Formular auch die Korrektur im
	 * Admin genommen, denn beide benutzen diese Sektion.
	 */
	let { adminMode = false }: { adminMode?: boolean } = $props();

	/**
	 * Beschriftung von `reaction` im Meldeformular — allgemeiner als das
	 * Schema-Label „Reaktion auf Ihr Boot", das die Admin-Maske behält.
	 *
	 * UX-Review (2026-08-06, Punkt 4): `isFromLand` blendet das Feld bewusst nur
	 * bei einem ausdrücklichen „Land" aus, weil `sightingFrom = 0` gleichzeitig
	 * „Sonstiges" und „noch nicht beantwortet" bedeutet (Begründung an
	 * `isFromLand` in `formConfig.ts`). Das ist richtig — heißt aber, dass die
	 * Frage auch dem Kajakfahrer, dem SUP-Paddler und dem Besucher auf der
	 * Seebrücke gestellt wird, und für die drei gibt es kein „Ihr Boot".
	 *
	 * Der `label`-Override ist dafür der vorgesehene Weg und keine Ausnahme von
	 * der Regel „Beschriftungen kommen aus dem Schema": `FormField` führt ihn
	 * ausdrücklich für den Fall, dass dieselbe Schema-Spalte im Meldeformular
	 * und in der Admin-Maske unterschiedlich gefragt wird. Präzedenz mit
	 * derselben Mechanik: `species` in `sections/AnimalInfo.svelte`.
	 */
	const REPORT_REACTION_LABEL =
		m.report_components_sections_behavior_text_reaktion_auf_sie_oder_ihr_fahrzeug();
</script>

<!-- Animal Behavior Section -->
<SectionCard
	title={m.report_components_sections_behavior_title_verhalten_der_tiere()}
	icon="lucide:waves"
>
	<p class="text-base-content/70 mb-4 text-sm">
		{m.report_components_sections_behavior_text_verhaltensinformationen_helfen_wissensch()}
	</p>

	<!-- Behavior with select -->
	<FormField name="behavior" />

	{#if String($form.behavior) === String(AnimalBehaviorEnum.OTHER)}
		<!-- Additional field for custom behavior -->
		<div transition:slide>
			<FormField name="behaviorText" />
		</div>
	{/if}

	<!-- Die Reaktionsfrage ist für einen Landbeobachter unbeantwortbar — er steht
	     am Ufer, die Tiere reagieren nicht auf ihn. `getFormSteps`
	     (formConfig.ts) nimmt `reaction` bereits bei einer Land-Meldung aus der
	     Validierung; dieselbe Bedingung (`isFromLand`) hier, sonst bliebe das
	     Feld sichtbar, aber unvalidiert ausgefüllt.

	     Die zwei Zweige sind nicht nur die Ausnahme für den Admin-Modus (die
	     Admin-Maske muss `reaction` auch an Altbestands-Datensätzen mit
	     `vonwo = Land` korrigieren können), sondern tragen seit dem UX-Review
	     (2026-08-06, Punkt 4) auch die zwei Beschriftungen: Die Sachbearbeitung
	     behält das Schema-Label, das Meldeformular fragt allgemeiner
	     (`REPORT_REACTION_LABEL`, Begründung im script-Block). Getrennte Zweige
	     statt eines Ternärs am `label`-Prop, weil `exactOptionalPropertyTypes`
	     ein explizites `undefined` an einem optionalen Prop nicht zulässt. -->
	{#if adminMode}
		<FormField name="reaction" />
	{:else if !isFromLand($form.sightingFrom)}
		<FormField name="reaction" label={REPORT_REACTION_LABEL} />
	{/if}

	<!-- `otherObservations` ist aus dem Meldeformular genommen (Überschneidung
	     mit „Bemerkungen"), bleibt im Admin aber editierbar: 844 Datensätze
	     tragen dort Inhalt. -->
	{#if adminMode}
		<FormField name="otherObservations" />
	{/if}
</SectionCard>
