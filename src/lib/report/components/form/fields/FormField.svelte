<!--
  Form field component with form context integration
  Uses FieldRenderer for actual field rendering, handles form context integration
-->
<script lang="ts">
	import { createLogger } from '#lib/logger.ts';
	import { getSightingSchemaFields } from '#lib/report/formConfig.ts';
	import { getFormContext } from '#lib/report/formContext.ts';
	import type { FieldOption } from '#lib/types/index.ts';
	import type { SightingFormData } from '#lib/types/Form.ts';
	import { untrack } from 'svelte';
	import * as yup from 'yup';
	import FieldRenderer from './FieldRenderer.svelte';

	const logger = createLogger('report:FormField');

	let {
		name,
		disabled = false,
		size = 'md',
		variant = 'default',
		required = undefined,
		label = undefined,
		type = undefined,
		options = undefined,
		helpText = undefined,
		describedBy = undefined
	}: {
		name: keyof Omit<SightingFormData, 'uploadedFiles'>;
		disabled?: boolean;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'default' | 'compact' | 'full';
		/**
		 * Optionaler Override der Pflichtfeld-Markierung für konditionale
		 * Schema-Regeln (`when()`), die aus `describe()` nicht ableitbar sind.
		 * Ohne Angabe gilt weiterhin die Ableitung aus dem Yup-Schema.
		 */
		required?: boolean | undefined;
		/**
		 * Optionaler Override der Beschriftung, wenn dieselbe Schema-Spalte in
		 * zwei Kontexten unterschiedlich gefragt wird (Meldeformular vs.
		 * Admin-Maske). Ohne Angabe gilt weiterhin das `.label()` des Schemas.
		 */
		label?: string | undefined;
		/**
		 * Optionaler Override des Feldtyps (z.B. `'radio'` statt des
		 * Schema-`'select'`). Ohne Angabe gilt weiterhin `meta.type`.
		 */
		type?: string | undefined;
		/**
		 * Optionaler Override der Optionsliste — gehört fachlich zum
		 * `type`-Override. Ohne Angabe gilt weiterhin `meta.options`.
		 */
		options?: FieldOption[] | undefined;
		/**
		 * Optionaler Override des Hilfetexts — nötig, wenn ein `label`/`type`-
		 * Override die Frage so verändert, dass der Schema-Hilfetext sie nicht
		 * mehr beantwortet. `null` unterdrückt den Hilfetext ganz; ohne Angabe
		 * gilt weiterhin `meta.helpText`.
		 */
		helpText?: string | null | undefined;
		/**
		 * `id` eines Elements, das der Aufrufer selbst neben das Feld gestellt
		 * hat und das mitvorgelesen werden soll. Für Kontext, der nicht im Schema
		 * stehen kann, weil er aus dem Formularzustand kommt — Beispiel und volle
		 * Begründung an derselben Prop in `FieldRenderer.svelte`.
		 */
		describedBy?: string | undefined;
	} = $props();

	const context = getFormContext();

	if (!context) {
		throw new Error('FormField must be used inside a Form component (context not found)');
	}

	const { form, errors, touched, handleChange } = context;

	let fieldConfig = $derived.by(() => {
		const schemaFields = getSightingSchemaFields();
		const config = schemaFields[name] as yup.SchemaDescription | undefined;
		if (!config || !config.meta) {
			logger.error({ schema: schemaFields }, `Field "${name}" not found in schema configuration.`);
			throw new Error(
				`Field "${name}" not found in schema configuration (${config ? 'meta configuration missing' : 'schema element missing'}).`
			);
		}
		return config;
	});

	let error = $derived($errors[name]);
	let fieldTouched = $derived($touched[name] ?? false);
	// Extract the value and ensure it's a compatible type for FieldRenderer
	let formValue = $derived($form[name]);
	let value: string | number | boolean | undefined | null = $derived(
		// Convert any complex types to their primitive representation
		typeof formValue === 'object' && formValue !== null
			? JSON.stringify(formValue)
			: (formValue as string | number | boolean | undefined | null)
	);

	// Only log during development (untrack to avoid re-running on every form change)
	$effect(() => {
		logger.debug(
			{ form: untrack(() => $form), config: untrack(() => fieldConfig) },
			`FormField "${name}" rendered`
		);
	});
</script>

<div data-field={name}>
	<FieldRenderer
		{fieldConfig}
		{name}
		bind:value
		{error}
		touched={fieldTouched}
		{disabled}
		{size}
		{variant}
		{required}
		{label}
		{type}
		{options}
		{helpText}
		{describedBy}
		onchange={handleChange}
	/>
</div>
