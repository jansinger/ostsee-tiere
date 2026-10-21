<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getUploadConfig } from '#lib/stores/configStore.ts';
	import { getFormContext } from '#lib/report/formContext.ts';
	import Icon from '#lib/components/Icon.svelte';
	import DropzoneEnhanced from '#lib/report/components/form/fields/DropzoneEnhanced.svelte';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import UploadNotice from '#lib/report/components/form/UploadNotice.svelte';
	import { getFileTypeDescription } from '#lib/utils/validation/fileValidation.ts';
	import type { ValidationPreset } from '#lib/types/index.ts';
	import { MEDIA_FALLBACK_EMAIL } from '#lib/constants/contact.ts';
	import SectionCard from './SectionCard.svelte';

	// Im Admin-Bearbeitungsformular bleibt die Medien-Einwilligung sichtbar, aber
	// gesperrt: Sie ist eine Aussage der meldenden Person, kein Attribut des
	// Datensatzes. Ein Admin könnte sie weder stellvertretend erteilen noch
	// nachweisen — `updateSighting` schreibt die Nachweisspalten bewusst nicht
	// mehr mit (Art. 7 Abs. 1 DSGVO).
	let { adminMode = false }: { adminMode?: boolean } = $props();

	// Generiere eine einfache referenceId für Upload (temporäre Lösung)
	const { form } = getFormContext();
	let referenceId = $derived($form.referenceId);

	// Dynamic upload configuration
	let uploadConfig = $state<ValidationPreset | null>(null);

	// Generate dynamic format description
	let formatDescription = $derived(
		uploadConfig ? getFileTypeDescription(uploadConfig.allowedTypes) : 'JPG, PNG, GIF, WEBP'
	);

	// Videos sind nur erlaubt, wenn die Konfiguration das hergibt — der
	// Dauerhinweis auf die Übertragungsdauer soll nicht erscheinen, wenn gar
	// keine Videos akzeptiert werden.
	let allowsVideo = $derived(
		uploadConfig?.allowedTypes.some((type) => type.startsWith('video/')) ?? false
	);

	// Zwei Grenzen, zwei Zahlen: Ein einzelner „max 100MB" wäre für Bilder
	// falsch, ein einzelner „max 10MB" für Videos.
	let maxSizeDescription = $derived.by(() => {
		if (!uploadConfig) return m.report_components_sections_media_text_bilder_max_10_mb();
		const imageMB = Math.round(uploadConfig.maxFileSize / (1024 * 1024));
		const hasVideo = uploadConfig.allowedTypes.some((type) => type.startsWith('video/'));
		if (!hasVideo) return m.report_components_sections_media_text_max_imagemb_mb({ imageMB });
		const videoMB = Math.round(uploadConfig.maxVideoFileSize / (1024 * 1024));
		return m.report_components_sections_media_text_bilder_max_imagemb_mb_videos_max_videomb({
			imageMB,
			videoMB
		});
	});

	// Load upload configuration on component mount
	$effect(() => {
		getUploadConfig().then((config) => {
			uploadConfig = config;
		});
	});
</script>

<!-- Media Section -->
<!-- „(optional)" steht im Titel, weil der Abschnitt seit dem 2026-08-04 auf dem
     Pflichtschritt 2 liegt: Zwischen lauter Pflichtfeldern liest sich eine
     Dropzone sonst wie eine weitere Bedingung fürs Weiterkommen. Wortlaut aus
     der Vorlage des Museums.

     Der Titel nennt Videos fest, obwohl `allowsVideo` unten prüft, ob die
     Konfiguration sie zulässt: Er ist eine Überschrift, kein Versprechen — was
     tatsächlich angenommen wird, sagt `formatDescription` eine Zeile tiefer und
     passt sich an. Der Fließtext daneben ist bewusst formatneutral gehalten. -->
<SectionCard
	title={m.report_components_sections_media_title_fotos_videos_hochladen_optional()}
	icon="lucide:camera"
>
	<!-- Der Einwilligungssatz der Vorlage („Mit dem Hochladen … stimmen Sie deren
	     Speicherung zu") steht hier bewusst NICHT: Denselben Vorgang beschreibt
	     `UPLOAD_NOTICE` an der Dropzone darunter genauer — sofortige Übertragung,
	     Zweckbindung auf die fachliche Prüfung, automatische Löschung nicht
	     abgeschickter Meldungen, spätere eigene Entscheidung über eine
	     Veröffentlichung. Eine zweite, kürzere Fassung daneben wäre keine
	     Zusammenfassung, sondern eine abweichende Aussage; aus demselben Grund
	     hält `UploadNotice.svelte` den Wortlaut unverkürzt im Dialog.

	     Die zweite Einwilligung der Vorlage („ausschließlich intern") ist nicht
	     gebaut — sie bräuchte Schema-Feld, DB-Spalte und zwei Nachweisspalten.
	     Ohne sie IST der unangekreuzte Zustand die interne Nutzung, was
	     `mediaConsent.valueText` bereits sagt.

	     `mediaConsent` steht seit dem 2026-08-05 nicht mehr hier, sondern auf
	     Schritt 4 bei den übrigen Einwilligungen (`steps/Step4Contact.svelte`,
	     Begründung in `formConfig.ts`). Nur in der Admin-Maske
	     (`AdminSightingEditForm.svelte` rendert `<Media adminMode={true} />`)
	     bleibt das Feld hier stehen — sie bindet `Step4Contact.svelte` nicht
	     ein —, dort gesperrt (`disabled`, dieser ganze Block steht bereits
	     hinter `{#if adminMode}`) mit eigener Erklärung, dass nur die
	     meldende Person diese Einwilligung erteilen kann.

	     „Aufnahmen" statt „Fotos und Videos": Welche Formate tatsächlich
	     angenommen werden, hängt an der Laufzeit-Konfiguration und steht in der
	     Liste darunter (`formatDescription`). Ein fester Satz im Fließtext würde
	     Videos auch dann versprechen, wenn `allowedTypes` keine enthält. Das
	     Wort ist zugleich das, was der Abschnitt sonst durchgehend verwendet. -->
	{#if !adminMode}
		<p class="text-base-content/70 mb-4 text-sm">
			{m.report_components_sections_media_text_sie_koennen_aufnahmen_zu_ihrer()}
		</p>
	{/if}
	<div class="text-base-content/70 mb-4 text-sm">
		<p class="mb-2 flex items-center gap-2 font-medium">
			<Icon icon="lucide:camera" width="16" class="text-primary" aria-hidden="true" />
			{m.report_components_sections_media_text_aufnahmen_sind_extrem_wertvoll_fuer()}
		</p>
		<ul class="list-inside list-disc space-y-1 text-xs">
			<li>
				<strong>{m.report_components_sections_media_text_artbestimmung()}</strong>
				{m.report_components_sections_media_text_auch_unscharfe_aufnahmen_koennen_helfen()}
			</li>
			<!-- Bis zum 2026-08-04 stand hier „Automatische Positionserkennung aus
			     Fotos". Das löst dieser Schritt nicht ein: Die Dropzone unten läuft mit
			     `enableGPSExtraction={false}`, und `applyExifPosition` hängt in
			     `DropzoneEnhanced` am selben Wächter — die Positionsangabe aus Schritt 1
			     bleibt also unberührt. Ausgelesen und gespeichert werden die Metadaten
			     trotzdem (client-seitig für die Anzeige, serverseitig nach
			     `sichtungen_dateien.exif_daten`), und genau das sagt der Satz jetzt.

			     Der zweite Halbsatz ist kein Beiwerk: Ohne ihn liest sich der erste als
			     Ankündigung, dass ein beliebiges der zehn Fotos die eigene Eingabe
			     überschreibt. -->
			<li>
				<strong>{m.report_components_sections_media_text_metadaten()}</strong>
				{m.report_components_sections_media_text_gps_position_und_aufnahmezeit()}
			</li>
			<li>
				<strong>{m.report_components_sections_media_text_formate()}</strong>
				{formatDescription} ({maxSizeDescription})
			</li>
			{#if allowsVideo}
				<li>
					<strong>{m.report_components_sections_media_text_videos()}</strong>
					{m.report_components_sections_media_text_grosse_videos_koennen_ueber_mobilfunk()}
				</li>
			{/if}
		</ul>
	</div>
	<UploadNotice />
	{#if adminMode}
		<!--
			Nur hier, nicht auch im Meldeformular: `mediaConsent` steht dort seit
			dem 2026-08-05 auf Schritt 4 (`Step4Contact.svelte`). Diese Maske
			bindet die Komponente nicht ein, deshalb bleibt das Feld an dieser
			Stelle stehen — gesperrt, weil ein Admin die Einwilligung weder
			stellvertretend erteilen noch nachweisen kann.

			`disabled` statt `disabled={adminMode}`: Dieser ganze Block steht
			bereits hinter `{#if adminMode}`, die Bedingung war also konstant
			wahr. Kein Fall für `aria-disabled` (Projektregel für gesperrte
			SCHALTFLÄCHEN, die eine laufende Aktion blockieren) — dieses Feld ist
			dauerhaft und unabhängig von jeder Aktion gesperrt, weil ein Admin die
			Einwilligung grundsätzlich nicht stellvertretend abgeben kann; die
			Feld-Pipeline (`FieldRenderer`) kennt für Formularfelder ohnehin nur
			ein natives `disabled`, kein `aria-disabled`.
		-->
		<FormField name="mediaConsent" disabled />
		<!--
			Bewusst ohne `aria-describedby`: Ein `disabled` Control ist nicht
			fokussierbar, eine Beschreibung daran würde im Formularmodus nie
			vorgelesen. Der sichtbare Text in Dokumentreihenfolge ist hier der
			wirksame Weg. Die Feld-Pipeline (`FieldRenderer`) bietet ohnehin keinen
			Hook für eine zusätzliche Beschreibung.
		-->
		<p class="text-support text-base-content/70 mt-1">
			{m.report_components_sections_media_text_diese_einwilligung_kann_nur_die()}
		</p>
	{/if}
	{#if uploadConfig}
		<DropzoneEnhanced
			{referenceId}
			maxFiles={10}
			config={uploadConfig}
			enableGPSExtraction={false}
		/>
	{:else}
		<div class="skeleton h-32 w-full"></div>
	{/if}
	<div class="alert alert-info mt-4">
		<Icon icon="lucide:mail" width="20" class="text-info-strong" aria-hidden="true" />
		<span class="text-sm">
			{m.report_components_sections_media_text_ist_eine_aufnahme_zu_gross_fuer()}
			<!-- `wrap-anywhere`: Die Adresse ist ein einziges Wort von 207px und damit
			     die Mindestbreite dieses Alerts. Auf 320px schob sie das Dokument um
			     60px über den Fensterrand hinaus (`e2e/horizontal-overflow.spec.ts`) —
			     ein Alert kann seinem Inhalt nicht ausweichen, und der Seiten-Wrapper
			     wächst als Flex-Item mit `mx-auto` mit. -->
			{m.report_components_sections_media_text_die_datei_anschliessend_an()}
			<a class="link wrap-anywhere" href="mailto:{MEDIA_FALLBACK_EMAIL}">{MEDIA_FALLBACK_EMAIL}</a>.
		</span>
	</div>
</SectionCard>
