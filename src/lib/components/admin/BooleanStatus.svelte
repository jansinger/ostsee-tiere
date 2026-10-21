<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';

	interface Props {
		value: boolean | null | undefined | number;
		trueLabel?: string;
		falseLabel?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		showIcon?: boolean;
	}

	let {
		value,
		trueLabel = 'Ja',
		falseLabel = 'Nein',
		size = 'sm',
		showIcon = true
	}: Props = $props();

	const isTrue = $derived(Boolean(value));

	// Icon size based on badge size
	const iconSize = $derived.by(() => {
		switch (size) {
			case 'xs':
				return '12';
			case 'sm':
				return '14';
			case 'md':
				return '16';
			case 'lg':
				return '18';
			default:
				return '14';
		}
	});

	/* Vollständige Klassennamen, kein `badge-${size}`: Tailwind 4 erkennt nur
	   Strings, die als Ganzes im Quelltext stehen (daisyui.md). */
	const SIZE_CLASS = {
		xs: 'badge-xs',
		sm: 'badge-sm',
		md: 'badge-md',
		lg: 'badge-lg'
	} as const;

	/* badge-success ist eine Vollton-Fläche — dort ist `*-content` korrekt und
	   kommt aus DaisyUI selbst. badge-ghost trägt base-content auf base-200. */
	const badgeClasses = $derived(
		`badge ${SIZE_CLASS[size]} ${isTrue ? 'badge-success' : 'badge-ghost'} inline-flex items-center gap-1 font-medium`
	);
</script>

<div class={badgeClasses}>
	{#if showIcon}
		{#if isTrue}
			<Icon
				icon="lucide:circle-check"
				class="flex-shrink-0"
				style="width: {iconSize}px; height: {iconSize}px;"
			/>
		{:else}
			<Icon
				icon="lucide:circle-x"
				class="flex-shrink-0"
				style="width: {iconSize}px; height: {iconSize}px;"
			/>
		{/if}
	{/if}
	<span>{isTrue ? trueLabel : falseLabel}</span>
</div>
