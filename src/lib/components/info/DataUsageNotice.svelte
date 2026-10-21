<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import { infoStyles, type InfoVariant } from '#lib/components/info/variant.ts';

	let { variant = 'inline' }: { variant?: InfoVariant } = $props();

	const styles = $derived(infoStyles(variant));
</script>

<!--
	Nennt zwei fremde Gremien namentlich (HELCOM, ASCOBANS). Genau deshalb geteilt
	statt kopiert: eine zweite Fassung könnte still von der ersten abweichen und
	eine Zusage machen, die die Plattform nicht hält.
-->
<div class="alert alert-info">
	<Icon icon="lucide:info" width={styles.iconWidth} class="shrink-0" aria-hidden="true" />
	<div>
		<svelte:element this={styles.headingTag} class={styles.headingClass}>
			{m.components_info_datausagenotice_text_wofuer_die_daten_gebraucht_werden()}
		</svelte:element>
		<p class={styles.bodyClass}>
			{m.components_info_datausagenotice_text_ihre_meldung_wird_vom_deutschen()}
			<strong>{m.components_info_datausagenotice_text_helcom()}</strong>
			{m.components_info_datausagenotice_text_die_helsinki_kommission_zum_schutz()}
			<strong>{m.components_info_datausagenotice_text_ascobans()}</strong>
			{m.components_info_datausagenotice_text_das_internationale_abkommen_zum()}
		</p>
	</div>
</div>
