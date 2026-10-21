<script lang="ts">
	import { getFormContext } from '#lib/report/formContext.ts';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import PositionPanel from '#lib/report/components/form/position/PositionPanel.svelte';
	import SectionCard from '#lib/report/components/sections/SectionCard.svelte';
	import { dateSectionIntro, dateSectionTitle } from '#lib/report/wording.ts';

	const { form } = getFormContext();

	/**
	 * Diese Karte, nicht `sections/DateTime.svelte`, ist Schritt 1 des
	 * Bürgerformulars — `DateTime.svelte` gehört ausschließlich der Admin-Maske
	 * (Review Task 6, Befund 1). Der Lebend-Zweig liefert weiterhin wörtlich
	 * „Datum und Uhrzeit" (`wording.ts`).
	 */
	const dateTitle = $derived(dateSectionTitle($form.isDead));
	const dateIntro = $derived(dateSectionIntro($form.isDead));
</script>

<div class="space-y-6">
	<PositionPanel />

	<!-- Date and Time Section (always visible) -->
	<SectionCard title={dateTitle} icon="lucide:calendar" variant="inset">
		<!-- Nur beim Totfund: die Karte hatte vorher keine Einleitungszeile, und für
		     die Sichtung soll keine neu entstehen (`dateSectionIntro` liefert dafür `null`). -->
		{#if dateIntro}
			<p class="text-base-content/70 text-support mb-4">{dateIntro}</p>
		{/if}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<FormField name="sightingDate" />
			<FormField name="sightingTime" />
		</div>
	</SectionCard>
</div>
