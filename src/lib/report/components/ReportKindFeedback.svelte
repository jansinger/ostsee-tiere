<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { isDeadFinding } from '#lib/report/formConfig.ts';

	// Default-Noop wie an den übrigen `onchangekind`-Aufrufstellen
	// (`Step2SightingDetails.svelte`, `ModernReportForm.svelte`):
	// `exactOptionalPropertyTypes` verbietet sonst das Weiterreichen eines
	// undefaulteten optionalen Props.
	let { onchangekind = () => {} }: { onchangekind?: () => void } = $props();

	const { form } = getFormContext();
</script>

<!--
  Einzige Aufrufstelle ist `form/FormActions.svelte` — die Aktionszeile unter
  dem Formular, neben „Formular zurücksetzen". Vorher stand die Zeile doppelt
  und jeweils oben: am Kopf von Schritt 1 und in der Karte „Tierinformationen"
  auf Schritt 2. Dort kostete sie den knappsten Platz des Telefons, obwohl sie
  weder Eingabe noch Schritt-Kontext ist, sondern eine Korrektur an der Meldung
  als Ganzes — wie das Zurücksetzen daneben. Aus der Aktionszeile heraus gilt
  sie für alle vier Schritte statt nur für zwei; der Korrekturweg zurück zur
  Einstiegsseite (Abschlussreview B6) ist damit an mehr Stellen erreichbar als
  vorher, nicht an weniger.

  isDeadFinding statt eines rohen Booleans: `isDead` kommt beim Wiederaufsetzen
  aus dem Storage als String und in der Admin-Maske als Zahl aus der DB. Ein
  roher Ternär (`$form.isDead ? … : …`) träfe bei einem falsy-wirkenden, aber
  nicht-leeren String wie '0' die falsche Antwort.
-->
<p class="text-base-content/70 text-support">
	{m.report_components_reportkindfeedback_text_sie_melden()}
	<strong class="text-base-content">
		{isDeadFinding($form.isDead)
			? m.report_components_reportkindchoice_text_fund_eines_toten_tieres()
			: m.report_components_reportkindchoice_text_beobachtung_eines_lebenden_tieres()}
	</strong>
	<!-- Trennpunkt aus Spec §7.5 („Sie melden: … · [Ändern]"). Bedeutungslos für
	     Screenreader — aria-hidden, wie die übrigen Zierzeichen im Projekt
	     (design-system.md, „*-Regel"-Abschnitt). -->
	<span aria-hidden="true"> · </span>
	<button
		type="button"
		class="btn btn-outline btn-sm"
		onclick={onchangekind}
		aria-label={m.report_components_reportkindfeedback_aria_label_art_der_meldung_aendern()}
		data-testid="report-kind-change"
	>
		{m.report_components_reportkindfeedback_text_aendern()}
	</button>
</p>
