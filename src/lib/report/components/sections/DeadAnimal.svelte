<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';

	let { adminMode = false }: { adminMode?: boolean } = $props();
</script>

<div class="bg-warning/10 border-warning/20 mt-6 rounded-lg border p-4">
	<h4 class="text-base-content mb-3 flex items-center gap-2 font-semibold md:whitespace-nowrap">
		<Icon
			aria-hidden="true"
			icon="lucide:triangle-alert"
			width="16"
			class="text-warning-strong shrink-0"
		/>
		<span
			>{m.report_components_sections_deadanimal_text_zusaetzliche_informationen_fuer_totfund()}</span
		>
	</h4>
	<div class="text-base-content/80 mb-4 text-sm">
		<p class="mb-2 font-medium">
			{m.report_components_sections_deadanimal_text_totfunde_sind_besonders_wertvoll_fuer()}
		</p>
		<ul class="list-inside list-disc space-y-1 text-xs">
			<li>
				<strong>{m.report_components_sections_deadanimal_term_todesursachen()}</strong>
				{m.report_components_sections_deadanimal_gloss_todesursachen()}
			</li>
			<li>
				<strong>{m.report_components_sections_deadanimal_term_gesundheitszustand()}</strong>
				{m.report_components_sections_deadanimal_gloss_gesundheitszustand()}
			</li>
			<li>
				<strong>{m.report_components_sections_deadanimal_term_nicht_beruehren()}</strong>
				{m.report_components_sections_deadanimal_gloss_nicht_beruehren()}
			</li>
			<li>
				<strong>{m.report_components_sections_deadanimal_text_behoerden_informieren()}</strong>
				{m.report_components_sections_deadanimal_text_meeresmuseum_wasserschutzpolizei_nationa()}
			</li>
		</ul>
	</div>

	<!-- These fields will be loaded from constants in the future -->
	<div class="space-y-4">
		<!-- `required` als Override, weil die Pflicht im Schema in einem
		     `when('isDead')` steckt und `describe()` das nicht sieht — derselbe Fall
		     wie `waterway` in LocationDescription.svelte. Unbedingt `true`: Diese
		     Section rendert ausschließlich innerhalb von
		     `{#if isDeadFinding($form.isDead)}` (AnimalInfo.svelte), also genau unter
		     der Bedingung, die das Schema prüft — und `adminSightingSchema` lockert
		     sie nicht. Ohne den Override lief der Melder ohne Sternchen und ohne
		     `aria-required` in „Bitte geben Sie den Zustand des toten Tieres an.".

		     Die beiden Nachbarfelder bekommen ihn bewusst NICHT: `deadSize` ist im
		     Schema unbedingt optional (die Körperlänge ist eine Zusatzangabe, keine
		     Bedingung für die Meldung), und `deadSex` hat das Museum am 2026-08-04
		     samt Pflicht abbestellt. -->
		<FormField name="deadCondition" required={true} />

		<!-- Das Geschlecht beim Totfund ist seit 2026-08-04 nur noch in der
		     Admin-Maske sichtbar (C4) — ohne adminMode steht deadSize allein und
		     zieht auf die volle Breite, statt in der leeren Zweier-Spalte zu
		     hängen. -->
		{#if adminMode}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<FormField name="deadSex" />
				<FormField name="deadSize" />
			</div>
		{:else}
			<FormField name="deadSize" />
		{/if}

		<FormField name="deadPhoneContact" />
	</div>
</div>
