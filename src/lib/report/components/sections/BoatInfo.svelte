<!--
  Boot-/Schiffsangaben zur Beobachtungssituation.

  Stand bis zum 2026-07-31 auf Schritt 4 zwischen den Kontaktdaten. Fachlich
  gehört die Angabe aber zur Beobachtung, nicht zur Person — von welchem Boot
  aus beobachtet wurde, ordnet die Sichtung ein, nicht den Melder.

  Zu beachten: `shipName`, `homePort` und `boatType` bleiben Teil der dauerhaft
  gespeicherten Kontaktdaten (`USER_CONTACT_FIELDS`) und werden von
  „Kontaktdaten löschen" auf Schritt 4 weiterhin mitgelöscht, obwohl sie jetzt
  hier stehen. Das ist gewollt — es sind Angaben zum immer gleichen Boot des
  Melders, die beim nächsten Mal wieder vorausgefüllt werden sollen.

  `shipCount` stand hier bis Task 12 ebenfalls, außerhalb des
  Land-Ausblende-Blocks — es fragt aber laut Schema nach der Anzahl ANDERER
  Schiffe in näherer Umgebung, also Störungskontext wie Seegang oder
  Sichtweite, nicht nach dem eigenen Boot. Ein Landbeobachter hat gar keins,
  aber diese Karte fragte weiter danach, mit Titel und Einleitung, die für ihn
  falsch waren. Der Umzug nach `Environment.svelte` (vor `seaState`) ordnet es
  fachlich richtig ein, für Bord- wie für Landmelder gleichermaßen.
-->
<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { isFromLand } from '#lib/report/formConfig.ts';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';

	const { form } = getFormContext();
</script>

{#if !isFromLand($form.sightingFrom)}
	<SectionCard
		title={m.report_components_sections_boatinfo_title_boot_schiffsinformationen()}
		icon="lucide:anchor"
	>
		<p class="text-base-content/70 mb-4 text-sm">
			{m.report_components_sections_boatinfo_text_falls_sie_von_einem_boot()}
		</p>

		<!-- `shipName`/`homePort`/`boatType` betreffen das EIGENE Wasserfahrzeug und
		     entfallen deshalb bei einer ausdrücklichen Land-Meldung — ein
		     Landbeobachter hat kein Boot, dessen Name oder Heimathafen er nennen
		     könnte. `getFormSteps` (formConfig.ts) nimmt dieselben drei Felder
		     bereits aus der Validierung; dieselbe Bedingung (`isFromLand`) hier,
		     sonst bliebe die Karte sichtbar, aber unvalidiert ausgefüllt (siehe die
		     Begründung bei `HIDDEN_WHEN_FROM_LAND`). Seit `shipCount` in
		     `Environment.svelte` steht, hätte die Karte für Land-Melder sonst KEIN
		     Feld mehr enthalten — die ganze Karte hängt deshalb jetzt an derselben
		     Bedingung, nicht mehr nur ihr Inhalt. -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<FormField name="shipName" />

			<FormField name="homePort" />
		</div>

		<div class="mt-4 grid grid-cols-1 gap-4">
			<FormField name="boatType" />
		</div>
	</SectionCard>
{/if}
