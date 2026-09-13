<!--
  Step 3: Contact Information and Observer Details
  Personal information, boat details, and additional observations
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Icon from '$lib/components/Icon.svelte';
	import ConfirmDialog from '$lib/components/ui/Dialog/ConfirmDialog.svelte';
	import {
		clearContactDataConfirmMessage,
		clearContactDataWithFeedback
	} from '$lib/report/clearContactData';
	import { getFormContext } from '$lib/report/formContext';
	import { hasUploadedMedia, isFromLand } from '$lib/report/formConfig';
	import { loadUserContactData } from '$lib/storage/localStorage';
	import FormField from '$lib/report/components/form/fields/FormField.svelte';

	const { form, updateField } = getFormContext();

	// Task 15: `mediaConsent` fragt nach der Freigabe von Aufnahmen — ohne
	// mindestens eine abgeschlossen hochgeladene Aufnahme ist das eine Frage
	// ohne Bezugsgegenstand (dieselbe Fehlerklasse wie `shipNameConsent` bei
	// Land unten). `hasUploadedMedia` (formConfig.ts) ist dieselbe Funktion,
	// die `getFormSteps` für die Validierung dieses Feldes aufruft — beide
	// Seiten (Markup hier, Validierung dort) lesen also garantiert dasselbe
	// Ergebnis, statt zwei eigene Bedingungen zu pflegen. Geprüft gegen
	// `$form.uploadedFiles`, nicht gegen den client-seitigen Medien-Store: Der
	// gehört den Dropzone-Instanzen auf Schritt 1/2 und bleibt leer, solange
	// keine von beiden gemountet ist — bei einem Reload direkt auf diesem
	// Schritt sonst fälschlich leer.
	let hasMedia = $derived(hasUploadedMedia($form.uploadedFiles));

	/**
	 * UX-Review (2026-08-06, Punkt 2): Worüber der Melder hier entscheidet, liegt
	 * zwei Schritte zurück — die Dateien selbst stehen auf Schritt 2. Ohne diese
	 * Aufzählung müsste er aus dem Gedächtnis wissen, was er freigibt.
	 *
	 * Benannt wird `originalName` (der Name, unter dem der Melder die Datei
	 * kennt), nicht der interne `fileName`.
	 */
	const UPLOADED_MEDIA_SUMMARY_ID = 'uploaded-media-summary';

	let uploadedMedia = $derived($form.uploadedFiles ?? []);
	let uploadedMediaCaption = $derived(
		m.report_components_steps_step4contact_text_hochgeladene_aufnahmen_plural({
			count: uploadedMedia.length
		})
	);

	// Check if user has saved contact data
	let hasSavedContactData = $state(false);

	$effect(() => {
		const savedData = loadUserContactData();
		hasSavedContactData = !!(savedData.firstName || savedData.lastName || savedData.email);
	});

	/**
	 * Rückfrage über `ConfirmDialog` statt `window.confirm` (UX MEDIUM 13).
	 * Der Dialog liegt hier und nicht in `clearContactData.ts`: Er antwortet
	 * über einen Callback, nicht als Rückgabewert eines Aufrufs — Begründung
	 * dort im Docblock von `clearContactDataWithFeedback`.
	 */
	let zeigeBestaetigung = $state(false);

	function clearContactData() {
		clearContactDataWithFeedback($form, updateField);
		hasSavedContactData = false;
	}
</script>

<div class="space-y-6 md:space-y-8">
	<!-- Step Header -->
	<div class="space-y-2 px-2 text-center md:px-0">
		<!-- Unterhalb `md` ausgeblendet: dekorativ, siehe Step1LocationTime.svelte. -->
		<div class="hidden justify-center md:flex">
			<div
				class="bg-primary/20 flex h-10 w-10 items-center justify-center rounded-full md:h-12 md:w-12"
			>
				<Icon icon="lucide:user" width="20" class="text-primary md:h-6 md:w-6" />
			</div>
		</div>
		<h2 class="text-base-content text-xl font-bold md:text-2xl">
			{m.report_components_steps_step4contact_text_kontaktdaten()}
		</h2>
		<!-- Der frühere Satz „Ihre persönlichen Daten werden nie öffentlich
		     angezeigt!" war nachweislich falsch: Direkt darunter stehen die
		     Einwilligungen zur Namensnennung, und `/api/map/sightings` liefert
		     Vor- und Nachnamen aus, sobald `nameConsent` gesetzt ist
		     (`mapUtils.ts`). Die Kartensuche durchsucht sie, CSV-, XML- und
		     KML-Export tragen sie ebenfalls — die sind allerdings, anders als in
		     der Analyse angenommen, nur für Admins erreichbar
		     (`requireUserRole(['admin','superadmin'])`); der öffentliche Weg ist
		     allein die Karten-API.

		     „Ortsangaben zum Seegebiet" steht bewusst in der Aufzählung:
		     `/api/map/sightings` liefert `waterway` und `seaMark` unkonditioniert
		     aus. Das sind Freitextfelder, die der Melder selbst tippt und die
		     beiläufig Personenbezug tragen können — wer sie ausfüllt, soll
		     wissen, dass sie öffentlich werden.

		     Die neue Fassung sagt, was tatsächlich passiert, und erklärt die
		     Ankreuzfelder darunter, statt ihnen zu widersprechen. -->
		<p class="text-base-content/70 mx-auto max-w-2xl text-sm md:text-base">
			<strong>{m.report_components_steps_step4contact_text_datenschutz()}</strong>
			{m.report_components_steps_step4contact_text_ihre_kontaktdaten_verwenden_wir_ausschli()}
		</p>
	</div>

	<!-- Personal Contact Information -->
	<div class="border-base-300 bg-base-200/50 rounded-lg border p-3 md:p-4">
		<h3 class="mb-3 flex gap-2 text-base font-semibold md:text-lg">
			<Icon icon="lucide:user" width="20" class="text-primary" />
			{m.report_components_steps_step4contact_text_ihre_kontaktdaten()}
		</h3>
		<div class="text-base-content/70 mb-4 text-sm">
			<p class="mb-1 flex items-center gap-2 font-medium">
				<Icon icon="lucide:mail" width="16" class="text-primary" />
				{m.report_components_steps_step4contact_text_ihre_e_mail_adresse_ist_erforderlich_fue()}
			</p>
			<ul class="list-inside list-disc space-y-1 text-xs">
				<li>{m.report_components_steps_step4contact_text_bestaetigung_ihrer_meldung()}</li>
				<li>
					{m.report_components_steps_step4contact_text_wichtige_rueckfragen_zur_datenqualitaet()}
				</li>
				<li>
					{m.report_components_steps_step4contact_text_information_ueber_wissenschaftliche_erge()}
				</li>
			</ul>

			<!-- Die frühere „Automatische Speicherung für Komfort"-Box beschrieb das
			     Speichern als unbedingt, obwohl `saveUserContactDataWithConsent`
			     (`localStorage.ts`) es schon immer an `persistentDataConsent` band —
			     ohne Zustimmung landen die Daten nur in der Session. Die
			     Datenschutzbeauftragte des DMM (E-Mail 2026-09-02) hat das als
			     irreführend beanstandet; die tatsächliche Einwilligung steht weiter
			     unten bei „Dauerhafte Speicherung der Kontaktdaten". Der Hinweis auf
			     bereits gespeicherte Daten bleibt, weil er ein reales Angebot ist
			     (Löschen), keine Behauptung über automatisches Speichern. -->
			{#if hasSavedContactData}
				<div class="mt-4 flex items-center justify-between">
					<span class="text-success-strong font-medium"
						>{m.report_components_steps_step4contact_text_gespeicherte_kontaktdaten_gefunden()}</span
					>
					<button
						type="button"
						class="btn btn-outline btn-error btn-sm"
						onclick={() => (zeigeBestaetigung = true)}
					>
						<Icon icon="lucide:trash-2" width="14" />
						{m.report_components_steps_step4contact_text_kontaktdaten_loeschen()}
					</button>
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<FormField name="firstName" />
			<FormField name="lastName" />
		</div>

		<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
			<FormField name="email" />

			<FormField name="phone" />
		</div>

		<!-- Adresse (Straße/PLZ/Ort) wird nicht mehr abgefragt: Für Rückfragen
		     genügen E-Mail und Telefon, und weniger personenbezogene Daten sind
		     datenschutzrechtlich die bessere Wahl (Wunsch des Deutschen
		     Meeresmuseums). Schema-Einträge und DB-Spalten bleiben — die
		     Legacy-API führt `strasse`/`plz`/`ort` weiter. -->
	</div>

	<!-- Die Boot-/Schiffsangaben stehen seit dem 2026-07-31 auf Schritt 3
	     (`sections/BoatInfo.svelte`): Sie beschreiben die Beobachtungssituation,
	     nicht die Person. „Kontaktdaten löschen" oben räumt sie weiterhin mit
	     auf — sie bleiben Teil von `USER_CONTACT_FIELDS`. -->

	<!-- Additional Information Section -->
	<div class="border-base-300 bg-base-200/50 rounded-lg border p-3 md:p-4">
		<h3 class="mb-3 flex items-center gap-2 text-base font-semibold md:text-lg">
			<Icon icon="lucide:message-square" width="20" class="text-primary" />
			{m.report_components_steps_step4contact_text_zusaetzliche_informationen()}
		</h3>

		<FormField name="notes" />
	</div>

	<!-- Privacy and Consent Section -->
	<!-- `data-consent-surface` grenzt die Fläche ab, die die Fassungskennungen
	     bezeugen — hier die äußere, gemeinsame: Die Überschrift „Datenschutz und
	     Einverständnis" rahmt alle vier Einwilligungen darunter. Die beiden
	     Gruppen tragen je eine eigene, innere Fläche; `consentSurfaces.svelte.test.ts`
	     hasht pro Feld die äußere Fläche, die eigene Gruppe und den eigenen
	     Ankreuztext getrennt, sodass eine Gruppen-Überschrift nur die Kennungen
	     ihrer eigenen Gruppe bewegt. Text, der zu einer Einwilligung gehört,
	     gehört deshalb INNERHALB der passenden Fläche. -->
	<div class="border-primary/20 bg-base-200/50 rounded-lg border p-3 md:p-4" data-consent-surface>
		<h3 class="mb-3 flex gap-2 text-base font-semibold md:text-lg">
			<Icon icon="lucide:lock" width="20" class="text-primary" />
			{m.report_components_steps_step4contact_text_datenschutz_und_einverstaendnis()}
		</h3>

		<!-- Optionale Einwilligungen: Namensnennung (eigener Name, Schiffsname)
		     und Veröffentlichung von Aufnahmen. Die Überschrift muss alle drei
		     Felder darunter tragen — `mediaConsent` ist keine Namensnennung, hier
		     stand bis zum Review von Task 14 (2026-08-06) noch „…Ihres Namens". -->
		<div class="mt-6 space-y-4" data-consent-surface>
			<h4 class="flex items-center gap-2 text-base font-semibold">
				<Icon icon="lucide:pen-line" width="16" class="text-primary" />
				{m.report_components_steps_step4contact_text_optionale_veroeffentlichung_von_namen_un()}
			</h4>
			<p class="text-base-content/70 mb-4 text-sm">
				{m.report_components_steps_step4contact_text_diese_einverstaendniserklaerungen_sind()}
				<!-- Kein Whitespace zwischen `</strong>` und der nächsten Interpolation:
				     Ein Zeilenumbruch hier rendert als Leerzeichen vor dem Punkt
				     („optional .") — von der Datenschutzbeauftragten des DMM
				     beanstandet (E-Mail 2026-09-02). -->
				<strong>{m.report_components_steps_step4contact_text_optional()}</strong
				>{m.report_components_steps_step4contact_text_ihre_meldung_wird_auch_ohne()}
			</p>

			<div class="space-y-3">
				<FormField name="nameConsent" />
				<!-- Einwilligung zur Veröffentlichung eines Schiffsnamens, den bei
				     einer Land-Meldung nie jemand erhoben hat (`BoatInfo.svelte`
				     blendet `shipName` dort aus) — eine Frage ohne
				     Bezugsgegenstand. `getFormSteps` (formConfig.ts) nimmt
				     `shipNameConsent` bereits bei Land aus der Validierung;
				     dieselbe Bedingung (`isFromLand`) hier, sonst bliebe das Feld
				     sichtbar, aber unvalidiert ausgefüllt. -->
				{#if !isFromLand($form.sightingFrom)}
					<FormField name="shipNameConsent" />
				{/if}
				<!-- `mediaConsent` steht seit dem 2026-08-05 hier bei den übrigen
				     Einwilligungen, nicht mehr bei der Dropzone auf Schritt 2
				     (`sections/Media.svelte`). Alle vier Felder mit Nachweisspalten
				     (`…_am`/`…_version` in `schema.ts`) stehen damit an einer Stelle;
				     die Datei-Felder selbst bleiben auf Schritt 2. In der Admin-Maske
				     bleibt das Feld dagegen bei der Dropzone stehen — sie bindet diese
				     Komponente hier nicht ein.

				     Eine Einwilligung zur Veröffentlichung von Aufnahmen, die es nicht
				     gibt, ist eine Frage ohne Bezugsgegenstand — dieselbe Fehlerklasse
				     wie `shipNameConsent` oben bei einer Land-Meldung. `getFormSteps`
				     (formConfig.ts) nimmt `mediaConsent` bei fehlender Aufnahme aus der
				     Validierung — über dieselbe Funktion `hasUploadedMedia`, die auch
				     `hasMedia` hier oben berechnet, statt einer zweiten, separat
				     gepflegten Bedingung. Ohne diese Klammer hier bliebe das Feld
				     sichtbar, aber unvalidiert ausgefüllt (die „halbe Miete" aus der
				     Doku dort). -->
				{#if hasMedia}
					<!-- Aufzählung und Ankreuzfeld bilden eine Einheit und stehen
					     deshalb enger beieinander als die Geschwister der Gruppe
					     (`space-y-3` außen). Die Aufzählung steht bewusst VOR dem
					     Feld: Sie ist die Frage, das Feld die Antwort. -->
					<div class="space-y-1">
						<!-- `id` + `describedBy` am Feld: Optisch steht die Aufzählung über
						     dem Ankreuzfeld, für einen Screenreader wäre sie ohne die
						     Verknüpfung aber nicht Teil der Frage — wer direkt aufs Feld
						     tabbt, hörte den Einwilligungstext ohne die Dateinamen, also
						     genau das Problem, das die Aufzählung beheben soll.

						     `data-consent-surface-exclude`: Der Block steht INNERHALB der
						     Einwilligungsfläche, gehört aber nicht in deren Hash — Anzahl
						     und Dateinamen kommen aus dem Formularzustand, nicht aus einem
						     Wortlaut, dem jemand zustimmt. Ohne die Auszeichnung stünde die
						     Fixture aus `consentSurfaces.svelte.test.ts` (`foto.jpg`) in
						     den Fassungskennungen, und ein umbenanntes Testbild verleitete
						     dazu, eine Kennung zu heben, obwohl sich kein gelesener Satz
						     geändert hat. Grenzen der Auszeichnung: ebenda. -->
						<div
							id={UPLOADED_MEDIA_SUMMARY_ID}
							class="text-base-content/70 text-support"
							data-testid="uploaded-media-summary"
							data-consent-surface-exclude
						>
							<p class="font-medium">{uploadedMediaCaption}</p>
							<ul class="list-inside list-disc">
								{#each uploadedMedia as file (file.uid)}
									<li class="break-all">{file.originalName}</li>
								{/each}
							</ul>
						</div>
						<FormField name="mediaConsent" describedBy={UPLOADED_MEDIA_SUMMARY_ID} />
					</div>
				{/if}
			</div>
		</div>

		<!-- Persistent Data Storage Consent -->
		<div class="mt-6 space-y-4" data-consent-surface>
			<h4 class="text-base font-semibold">
				<Icon icon="lucide:save" width="16" class="inline" />
				{m.report_components_steps_step4contact_text_dauerhafte_speicherung_der_kontaktdaten()}
			</h4>
			<p class="text-base-content/70 mb-4 text-sm">
				{m.report_components_steps_step4contact_text_moechten_sie_dass_ihre_kontaktdaten()}
			</p>

			<div class="space-y-3">
				<FormField name="persistentDataConsent" />
			</div>
		</div>
	</div>
</div>

<ConfirmDialog
	bind:show={zeigeBestaetigung}
	title={m.report_components_steps_step4contact_text_gespeicherte_kontaktdaten_loeschen()}
	message={clearContactDataConfirmMessage()}
	confirmLabel={m.report_components_steps_step4contact_text_endgueltig_loeschen()}
	cancelLabel={m.report_components_steps_step4contact_text_abbrechen()}
	onConfirm={clearContactData}
/>
