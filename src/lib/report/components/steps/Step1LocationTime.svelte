<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import PositionAndTime from '#lib/report/components/sections/PositionAndTime.svelte';
</script>

<div class="space-y-6 md:space-y-8">
	<!-- Step Header -->
	<div class="space-y-2 px-2 text-center md:px-0">
		<!-- Unterhalb `md` ausgeblendet: Das Symbol ist dekorativ (die Überschrift
		     darunter sagt dasselbe) und kostete mit seinem Abstand 48 px in genau
		     dem Bereich, in dem der Platz fehlt. Auf breiten Geräten bleibt es. -->
		<div class="hidden justify-center md:flex">
			<div
				class="bg-primary/20 flex h-10 w-10 items-center justify-center rounded-full md:h-12 md:w-12"
			>
				<Icon icon="lucide:map-pin" width="20" class="text-primary md:h-6 md:w-6" />
			</div>
		</div>
		<h2 class="text-base-content text-xl font-bold md:text-2xl">
			{m.report_components_steps_step1locationtime_text_position_zeitpunkt()}
		</h2>
		<p class="text-base-content/70 mx-auto max-w-2xl text-sm md:text-base">
			<strong>{m.report_components_steps_step1locationtime_text_wo_und_wann_fand_die()}</strong>
			{m.report_components_steps_step1locationtime_text_je_genauer_desto_wertvoller()}
		</p>
		<!-- Die Rückmeldung „Sie melden: … · [Ändern]" stand hier und kostete
		     oben den knappsten Platz. Sie steht jetzt einmal in der Aktionszeile
		     unter dem Formular (`form/FormActions.svelte`) und gilt von dort für
		     alle vier Schritte. -->
	</div>

	<!-- Step Content -->
	<PositionAndTime />
</div>
