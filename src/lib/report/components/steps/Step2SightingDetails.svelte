<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import AnimalInfo from '#lib/report/components/sections/AnimalInfo.svelte';
	import Media from '#lib/report/components/sections/Media.svelte';
	import SightingDetails from '#lib/report/components/sections/SightingDetails.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { observationQuestion } from '#lib/report/wording.ts';

	const { form } = getFormContext();

	const question = $derived(observationQuestion($form.isDead));
</script>

<div class="space-y-6 md:space-y-8">
	<!-- Step Header -->
	<div class="space-y-2 px-2 text-center md:px-0">
		<!-- Unterhalb `md` ausgeblendet: dekorativ, siehe Step1LocationTime.svelte. -->
		<div class="hidden justify-center md:flex">
			<div
				class="bg-primary/20 flex h-10 w-10 items-center justify-center rounded-full md:h-12 md:w-12"
			>
				<Icon icon="lucide:binoculars" width="20" class="text-primary md:h-6 md:w-6" />
			</div>
		</div>
		<h2 class="text-base-content text-xl font-bold md:text-2xl">
			{m.report_components_steps_step2sightingdetails_text_angaben_zum_tier()}
		</h2>
		<!-- Beim Totfund fragt der Kopf nach einem Fund statt nach einer Beobachtung
		     (Wunsch des Museums). Der Rest des Satzes gilt für beide Fälle — er
		     nennt Tierart und Anzahl, nicht den Vorgang. Die Zuordnung steht in
		     `#lib/report/wording.js`, damit sie beim Bau der getrennten Formulare
		     nicht an drei Stellen auseinanderläuft. -->
		<p class="text-base-content/70 mx-auto max-w-2xl text-sm md:text-base">
			<strong>{question}</strong>
			{m.report_components_steps_step2sightingdetails_text_bitte_geben_sie()}
			<strong>{m.report_components_steps_step2sightingdetails_text_tierart_und_anzahl()}</strong>
			{m.report_components_steps_step2sightingdetails_text_an()}
		</p>
	</div>

	<!-- Step Content -->
	<!-- Der Medien-Upload steht VOR den Tierangaben (Wunsch des Museums): Wer
	     unsicher ist, welche Art er gesehen hat, soll das Bild hochladen können,
	     statt zu raten. Er lag bis zum 2026-08-04 auf Schritt 3 unter dem
	     „Schritt überspringen"-Knopf und war damit für jeden unsichtbar, der ihn
	     benutzte. -->
	<Media />
	<AnimalInfo />
	<SightingDetails />
</div>
