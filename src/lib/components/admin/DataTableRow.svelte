<script lang="ts">
	import BooleanStatus from './BooleanStatus.svelte';

	interface Props {
		label: string;
		value?: string | undefined;
		isBoolean?: boolean;
		booleanValue?: boolean;
		isPreformatted?: boolean;
		/**
		 * DaisyUI-Badge-Klasse (`badge-info`, `badge-ghost`, …) für Werte, die
		 * einen von mehreren Zuständen darstellen statt ja/nein — etwa den
		 * Ostsee-Status. Die Klasse ist Flächenfarbe, kommt also ohne
		 * `-strong`-Suffix (`.claude/rules/design-system.md`).
		 */
		badgeClass?: string;
		/** Erklärung des Zustands als Tooltip. Nur zusammen mit `badgeClass`. */
		title?: string;
	}

	let {
		label,
		value = '',
		isBoolean = false,
		booleanValue = false,
		isPreformatted = false,
		badgeClass = '',
		title = ''
	}: Props = $props();
</script>

<tr>
	<td class="w-40 font-medium">{label}</td>
	<td class:whitespace-pre-wrap={isPreformatted}>
		{#if isBoolean}
			<BooleanStatus value={booleanValue} />
		{:else if badgeClass}
			<!-- h-auto/min-h-6/py-1: DaisyUI gibt .badge eine feste Höhe (height: var(--size)).
			     Bricht ein langer Wert in der schmalen Spalte um, läuft der Text sonst über
			     die Pille hinaus. min-h-6 entspricht dem --size-Default, einzeilige Badges
			     sehen also unverändert aus. -->
			<span class="badge {badgeClass} h-auto min-h-6 py-1" {title}>{value}</span>
		{:else}
			{value}
		{/if}
	</td>
</tr>
