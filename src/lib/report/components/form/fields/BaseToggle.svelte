<!--
  Base toggle switch component
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

	// Dynamic CSS classes
	//
	// Der Zustand ersetzt `toggle-primary`, er ergänzt es nicht: Alle drei
	// Klassen setzen dieselbe DaisyUI-Variable (`--input-color`) auf derselben
	// Ebene und mit derselben Spezifität. Stünden zwei davon am Element,
	// entschiede die Reihenfolge im DaisyUI-Stylesheet, welche gewinnt — nicht
	// die im `class`-Attribut. Aufbau deshalb wie `stateClass` in BaseRadio.
	//
	// Achtung, hier weicht der Toggle von Radio und Checkbox ab: `toggle-error`
	// und `toggle-success` greifen bei DaisyUI NUR unter `:checked`. Die Klasse
	// allein ließe damit ausgerechnet den wahrscheinlichsten Fehlerfall — den
	// ausgeschalteten Pflicht-Toggle — unverändert grau. Den ausgeschalteten
	// Zustand färbt deshalb ein Override in `src/app.css` (dort begründet,
	// gemessen in `e2e/form-a11y.spec.ts`).
	let toggleClasses = $derived.by(() => {
		const base = 'toggle';
		const stateClass = hasError ? 'toggle-error' : isValid ? 'toggle-success' : 'toggle-primary';
		const sizeClass = size === 'sm' ? 'toggle-sm' : size === 'lg' ? 'toggle-lg' : '';
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
			class={toggleClasses + ' flex-shrink-0'}
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
					aria-label={m.report_components_form_fields_basetoggle_aria_label_pflichtfeld()}>*</span
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
				aria-label={m.report_components_form_fields_basetoggle_aria_label_hinweis_valuetext({
					valueText: valueText
				})}
			>
				<Icon icon="lucide:info" width="14" class="text-base-content/60" />
			</button>
		</span>
	{/if}
</div>
