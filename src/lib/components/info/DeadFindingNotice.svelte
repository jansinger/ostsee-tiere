<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import { infoStyles, type InfoVariant } from '#lib/components/info/variant.ts';
	import type { Snippet } from 'svelte';

	let {
		variant = 'inline',
		children
	}: {
		variant?: InfoVariant;
		/**
		 * Anhang unter dem Text. Die Formularhilfe schiebt hier ihre
		 * Totfund-Kennzahl aus `/api/statistics` hinein; die Bestimmungshilfe
		 * lädt keine Statistiken und lässt es leer.
		 */
		children?: Snippet;
	} = $props();

	const styles = $derived(infoStyles(variant));
</script>

<!--
	Fachliche Aussage (Behördenmeldung, „nicht berühren") — bewusst geteilt und
	nicht kopiert: eine zweite Fassung würde bei der nächsten Textkorrektur
	auseinanderlaufen. Dasselbe Argument, mit dem der Footer die Rechtstexte
	verlinkt statt sie nachzubauen.
-->
<div class="alert alert-warning">
	<Icon
		icon="lucide:triangle-alert"
		width={styles.iconWidth}
		class="text-warning-strong shrink-0"
		aria-hidden="true"
	/>
	<div>
		<svelte:element this={styles.headingTag} class={styles.headingClass}>
			{m.components_info_deadfindingnotice_text_totfunde_besonders_wichtig()}
		</svelte:element>
		<p class={styles.bodyClass}>
			{m.components_info_deadfindingnotice_text_tote_tiere_liefern_wichtige()}
			<strong>{m.components_info_deadfindingnotice_text_bitte_nicht_beruehren()}</strong>
			{m.components_info_deadfindingnotice_text_melden_sie_den_fund_auch_an()}
		</p>
		{@render children?.()}
	</div>
</div>
