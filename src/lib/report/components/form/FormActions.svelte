<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getFormContext } from '#lib/report/formContext.ts';
	import ConfirmDialog from '#lib/components/ui/Dialog/ConfirmDialog.svelte';
	import ReportKindFeedback from '#lib/report/components/ReportKindFeedback.svelte';

	// `onCancel` bleibt Teil der Props für Abwärtskompatibilität mit
	// ModernReportForm.svelte, das den Wert weiterreicht. Der bisherige
	// "Abbrechen"-Button wurde entfernt, da `onCancel` in der einzigen
	// aktuellen Einbindung (src/routes/+page.svelte) auf dieselbe Seite
	// navigiert, auf der das Formular bereits liegt — der Button hatte also
	// keine erkennbare Wirkung. Ein Button ohne Funktion ist schlechter als
	// gar keiner. Sollte künftig ein Aufrufer eine echte Abbrechen-Semantik
	// benötigen (z.B. iFrame-Einbindung mit "zurück an Elternseite"), kann
	// hier wieder ein Button ergänzt werden.
	let {
		onReset = () => {},
		onCancel: _onCancel = () => {},
		// Default-Noop wie an den übrigen `onchangekind`-Aufrufstellen:
		// `exactOptionalPropertyTypes` verbietet sonst das Weiterreichen als
		// `{onchangekind}` an `ReportKindFeedback`, dessen eigener Default
		// (`= () => {}`) den externen Proptyp auf `() => void` ohne `undefined`
		// verengt.
		onchangekind = () => {}
	}: {
		onReset?: () => void;
		onCancel?: () => void;
		/** Reicht den „Ändern"-Knopf aus `ReportKindFeedback` weiter — nur
		 *  `+page.svelte` kennt die Einstiegsseite, zu der er zurückführt. */
		onchangekind?: () => void;
	} = $props();

	const { isSubmitting } = getFormContext();

	/**
	 * Rückfrage über `ConfirmDialog` statt `window.confirm`. Der native Dialog
	 * war auf dem Telefon nicht gestaltbar, nannte die App als Absender
	 * („localhost sagt …") und blockierte den Hauptthread — und im iframe auf
	 * meeresmuseum.de darf der Browser ihn ganz unterdrücken, womit das
	 * Zurücksetzen entweder ungefragt oder gar nicht liefe. Es ist derselbe
	 * Bestätigungsweg wie beim Löschen im Admin-Bereich; eine eigene Variante
	 * gibt es hier bewusst nicht.
	 */
	let zeigeBestaetigung = $state(false);
</script>

<!-- Form Actions -->
<div
	class="mx-auto mt-8 flex flex-col items-center gap-2 md:flex-row md:justify-between md:gap-4"
	data-testid="form-actions"
>
	<!-- „Sie melden: … · [Ändern]" stand bis hierher am Kopf von Schritt 1 und
	     ein zweites Mal in der Karte „Tierinformationen" auf Schritt 2. Oben
	     verbrauchte die Zeile genau den Platz, der auf dem Telefon am knappsten
	     ist — vor dem ersten Feld stehen dort schon Seitentitel, Schritt-Anzeige
	     und Schritt-Überschrift. Hier unten steht sie neben „Zurücksetzen", wo
	     die übrigen Korrekturen an der Meldung als Ganzes sitzen, und gilt für
	     alle vier Schritte statt nur für zwei. -->
	<ReportKindFeedback {onchangekind} />

	<button
		type="button"
		class="btn btn-outline btn-error btn-sm w-full md:w-auto"
		onclick={() => (zeigeBestaetigung = true)}
		disabled={$isSubmitting}
	>
		{m.report_components_form_formactions_text_formular_zuruecksetzen()}
	</button>
</div>

<!-- Der Dialog nennt beide Folgen: die Eingaben im Formular UND den auf dem
     Gerät gespeicherten Zwischenstand, den `onReset` mit abräumt. Wer nur
     „Daten gehen verloren" liest, rechnet nicht damit, dass auch die
     Wiederaufnahme beim nächsten Besuch weg ist. -->
<ConfirmDialog
	bind:show={zeigeBestaetigung}
	title={m.report_components_form_formactions_text_formular_zuruecksetzen()}
	message={m.report_components_form_formactions_text_moechten_sie_das_formular_wirklich_zurue()}
	detail={m.report_components_form_formactions_text_auch_der_gespeicherte_zwischenstand()}
	confirmLabel={m.report_components_form_formactions_text_endgueltig_zuruecksetzen()}
	cancelLabel={m.report_components_form_formactions_text_abbrechen()}
	onConfirm={onReset}
/>
