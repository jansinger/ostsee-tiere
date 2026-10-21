<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';
</script>

<!-- Date & Time Section -->
<SectionCard
	title={m.report_components_sections_datetime_title_zeitpunkt_der_sichtung()}
	icon="lucide:calendar"
>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<FormField name="sightingDate" />
		<FormField name="sightingTime" />
	</div>
</SectionCard>
