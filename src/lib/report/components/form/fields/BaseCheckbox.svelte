<!--
  Base checkbox component
  Independent of form context, accepts all props directly
-->
<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import type { FieldSize } from '#lib/types/index.ts';
	import Icon from '#lib/components/Icon.svelte';

	interface Props {
		checked?: boolean;
		label?: string;
		size?: FieldSize;
		hasError?: boolean;
		isValid?: boolean;
		icon?: string;
		valueText?: string;
		onchange?: (event: Event) => void;
		// Common input attributes
		id?: string;
		name?: string;
		value?: string | number;
		disabled?: boolean;
		required?: boolean;
		'aria-describedby'?: string;
		'aria-invalid'?: boolean;
		'aria-required'?: boolean;
		'data-testid'?: string;
	}

	let {
		checked = $bindable(),
		label = '',
		size = 'md',
		hasError = false,
		isValid = false,
		icon = undefined,
		valueText = undefined,
		onchange = undefined,
		id,
		name,
		value,
		disabled = false,
		required = false,
		'aria-describedby': ariaDescribedBy,
		'aria-invalid': ariaInvalid,
		'aria-required': ariaRequired,
		'data-testid': dataTestId
	}: Props = $props();

	// Dynamic CSS classes - pure DaisyUI
	//
	// Der Zustand ersetzt `checkbox-primary`, er ergänzt es nicht: Alle drei
	// Klassen setzen dieselbe DaisyUI-Variable (`--input-color`) auf derselben
	// Ebene und mit derselben Spezifität. Stünden zwei davon am Element,
	// entschiede die Reihenfolge im DaisyUI-Stylesheet, welche gewinnt — nicht
	// die im `class`-Attribut. Aufbau deshalb wie `stateClass` in BaseRadio.
	//
	// Anders als beim Toggle greift das hier in beiden Zuständen: `.checkbox`
	// bezieht seinen Rahmen unbedingt aus `var(--input-color)`, eine nicht
	// angehakte Pflicht-Checkbox zeigt den Fehler also von selbst.
	let checkboxClasses = $derived.by(() => {
		const base = 'checkbox';
		const stateClass = hasError
			? 'checkbox-error'
			: isValid
				? 'checkbox-success'
				: 'checkbox-primary';
		const sizeClass = size === 'sm' ? 'checkbox-sm' : size === 'lg' ? 'checkbox-lg' : '';
		return [base, stateClass, sizeClass].filter(Boolean).join(' ');
	});
</script>

<div class="flex w-full items-start justify-between gap-2">
	<label class="flex w-full cursor-pointer justify-start gap-3 py-2">
		{#if icon !== undefined}
			<Icon aria-hidden="true" {icon} width="16" class="text-base-content/60 flex-shrink-0" />
		{/if}
		<input
			type="checkbox"
			class={checkboxClasses + ' flex-shrink-0'}
			bind:checked
			{onchange}
			{disabled}
			{required}
			{id}
			{name}
			{value}
			aria-describedby={ariaDescribedBy}
			aria-invalid={ariaInvalid}
			aria-required={ariaRequired}
			data-testid={dataTestId}
		/>
		<span
			class="min-w-0 flex-1 text-left font-medium"
			style="overflow-wrap: anywhere; hyphens: auto;"
		>
			{label}
			{#if required}
				<span
					class="text-error ml-1 text-sm"
					role="img"
					aria-label={m.report_components_form_fields_basecheckbox_aria_label_pflichtfeld()}>*</span
				>
			{/if}
		</span>
	</label>

	<!-- Value Information Tooltip (fokussierbar für Tastatur/Touch), außerhalb des Labels -->
	{#if valueText}
		<span class="tooltip tooltip-left flex-shrink-0" data-tip={valueText}>
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle"
				aria-label={m.report_components_form_fields_basecheckbox_aria_label_hinweis_valuetext({
					valueText: valueText
				})}
			>
				<Icon icon="lucide:info" width="14" class="text-base-content/60" />
			</button>
		</span>
	{/if}
</div>
