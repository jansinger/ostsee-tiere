<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Icon from '$lib/components/Icon.svelte';
	import FormField from './fields/FormField.svelte';
	import { getFormSteps } from '$lib/report/formConfig';
	import { getFormContext } from '$lib/report/formContext';

	let { currentStep } = $props<{
		currentStep: number;
	}>();

	// Die Komponente steht ohnehin nur unterhalb von `<Form>` — `FormField`
	// unten wirft ohne Context.
	const { form } = getFormContext();

	// Only show on the last step (0-indexed)
	//
	// Gezählt wird die Schritt-Konfiguration des aktuellen Zweigs, nicht die
	// statische `formStepsConfig`: eine Quelle für alle Stellen, die über
	// Schritte rechnen. Heute liefern beide dieselbe Zahl — `getFormSteps`
	// filtert Felder, nie ganze Schritte —, und genau deshalb ist das hier
	// kein Verhaltenswechsel, sondern nur der Verzicht auf eine zweite Liste,
	// deren Gleichlauf niemand erzwingt.
	const isLastStep = $derived(currentStep === getFormSteps($form).length - 1);
</script>

{#if isLastStep}
	<!-- Required Privacy Consent - Prominently displayed before submit -->
	<!-- `data-consent-surface` grenzt die Fläche ab, die
	     `PRIVACY_CONSENT_VERSION` bezeugt: alles, was die meldende Person hier
	     zur Einwilligung liest — Überschrift, Verarbeitungs-Kacheln,
	     Widerrufshinweis, Verweis auf die Datenschutzerklärung —, nicht nur den
	     Ankreuztext aus dem Schema. `consentSurfaces.svelte.test.ts` pinnt den
	     Hash dieses Textes; wer hier umformuliert, muss die Fassungskennung
	     heben. Text, der zur Einwilligung gehört, gehört deshalb INNERHALB
	     dieses Elements. -->
	<div class="bg-primary/5 border-primary/20 mb-6 rounded-lg border-2 p-4" data-consent-surface>
		<div class="mb-4">
			<h4 class="text-primary mb-2 flex items-center gap-2 text-lg font-bold">
				<Icon icon="lucide:shield-alert" class="text-primary h-5 w-5" />
				{m.report_components_form_requiredconsent_text_erforderliche_zustimmung_zur_datenverwen()}
			</h4>
			<p class="text-base-content/80 text-sm">
				<strong
					>{m.report_components_form_requiredconsent_text_diese_zustimmung_ist_erforderlich()}</strong
				>
			</p>
		</div>

		<!-- Compact Privacy Information -->
		<div class="bg-base-100 mb-4 rounded-lg p-4">
			<div class="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
				<div class="flex items-start gap-3">
					<Icon
						icon="lucide:check-circle"
						width="20"
						height="20"
						class="text-success-strong mt-0.5"
					/>
					<div>
						<p class="font-medium">
							{m.report_components_form_requiredconsent_text_oeffentliche_wissenschaftsdaten()}
						</p>
						<p class="text-base-content/70 text-xs">
							{m.report_components_form_requiredconsent_text_datum_position_tierart_werden_fuer()}
						</p>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<Icon icon="lucide:lock" width="20" height="20" class="text-info-strong mt-0.5" />
					<div>
						<p class="font-medium">
							{m.report_components_form_requiredconsent_text_private_kontaktdaten()}
						</p>
						<p class="text-base-content/70 text-xs">
							{m.report_components_form_requiredconsent_text_ihre_persoenlichen_daten_bleiben_vertrau()}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Required Consent Checkbox -->
		<div class="border-primary/30 bg-primary/5 rounded-lg border p-4">
			<FormField name="privacyConsent" />
			<p class="text-primary/70 mt-2 text-xs">
				<!--
					„Meldung", nicht „Sichtung" (A5.3): Über dieses Formular wird auch ein
					Totfund gemeldet. Diese Fläche ist Rahmentext um die Einwilligung, nicht
					der Ankreuztext selbst — sie hängt trotzdem an der Fassungskennung, und
					seit dem 2026-08-06 erzwingt consentSurfaces.svelte.test.ts das auch
					(gepinnter Hash über diese Fläche). PRIVACY_CONSENT_VERSION steht in
					consentVersions.ts — dort auch der Grund der jeweils letzten Hebung
					(zuletzt 2026-09-13, DMM-Änderungswunsch). Wer hier umformuliert, hebt
					die Kennung UND trägt den neuen Hash nach — nur den Hash nachzutragen
					entwertet den Nachweis.
				-->
				<strong
					>{m.report_components_form_requiredconsent_text_ohne_diese_zustimmung_kann_ihre_meldung()}</strong
				>
				{m.report_components_form_requiredconsent_text_sie_koennen_diese_zustimmung_jederzeit()}
				<!--
					Art. 13 DSGVO verlangt die Datenschutzhinweise dort, wo die Daten erhoben
					werden. Bis 2026-07-30 stand die Erklärung nur als externer Link auf
					/about — an der Einwilligung selbst, also an der Erhebungsstelle, fehlte
					sie.
				-->
				{m.report_components_form_requiredconsent_text_einzelheiten_zur_verarbeitung_stehen_in()}
				<a
					href="https://www.deutsches-meeresmuseum.de/datenschutz"
					target="_blank"
					rel="noopener noreferrer"
					class="link">{m.report_components_form_requiredconsent_text_datenschutzerklaerung()}</a
				>.
			</p>
		</div>
	</div>
{/if}
