<!--
  Base textarea component for multiline text input
  Independent of form context, accepts all props directly
-->
<script lang="ts">
	import type { FieldSize } from '#lib/types/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends HTMLTextareaAttributes {
		value?: string;
		size?: FieldSize;
		hasError?: boolean;
		isValid?: boolean;
		icon?: string;
		onchange?: (event: Event) => void;
	}

	let {
		value = $bindable(),
		size = 'md',
		hasError = false,
		isValid = false,
		icon = undefined,
		onchange = undefined,
		placeholder = '',
		rows = 4,
		...restProps
	}: Props = $props();

	// Dynamic CSS classes
	let textareaClasses = $derived.by(() => {
		const base = 'textarea w-full transition-all duration-quick resize-y';
		const stateClass = hasError ? 'textarea-error' : isValid ? 'textarea-success' : '';
		const sizeClass = size === 'sm' ? 'textarea-sm' : size === 'lg' ? 'textarea-lg' : '';
		const focusClass = 'focus:ring-2 focus:ring-primary/20 focus:border-primary';
		const iconPadding = icon !== undefined ? 'pl-10' : '';
		return [base, stateClass, sizeClass, focusClass, iconPadding].filter(Boolean).join(' ');
	});

	// Textarea props
	let textareaProps = $derived.by(() => {
		const props: HTMLTextareaAttributes = {
			...restProps,
			'aria-invalid': hasError || undefined,
			'aria-required': restProps.required || undefined
		};

		// Filter out undefined values
		return Object.fromEntries(Object.entries(props).filter(([, val]) => val !== undefined));
	});
</script>

<div class="relative">
	<!-- Icon (if available) -->
	{#if icon !== undefined}
		<div aria-hidden="true" class="z-raised pointer-events-none absolute top-3 left-3">
			<Icon {icon} width="16" class="text-base-content/60" />
		</div>
	{/if}

	<textarea {...textareaProps} class={textareaClasses} {placeholder} {rows} bind:value {onchange}
	></textarea>
</div>
