<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';
</script>

<!-- Administrative Section -->
<SectionCard
	title={m.report_components_sections_administrative_title_administratives()}
	icon="lucide:settings"
>
	<!-- Kein Feld für den Prüfstatus: Er wird ausschließlich über das
	     Status-Control (Tabelle, Detailansicht, Eingang) gesetzt, das
	     PATCH /api/sightings/[id]/verify aufruft und beide Status-Spalten
	     gemeinsam schreibt (.claude/rules/api.md). -->
	<FormField name="entryChannel" />

	<FormField name="internalComment" />
</SectionCard>
