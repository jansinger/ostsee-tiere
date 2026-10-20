<script lang="ts">
	import { setFormContext } from '$lib/report/formContext';
	import type { FormContext } from '$lib/report/types';
	import type { MediaStore } from '$lib/utils/media/MediaFile.svelte';
	import { type Snippet, untrack } from 'svelte';

	import { createForm, type FormProps } from '$lib/form/createForm';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import type { AnyObjectSchema } from 'yup';

	const onSubmitDefault = () => {
		throw new Error('onSubmit is a required property in <Form /> when using the fallback context');
	};

	let {
		children,
		context = $bindable({} as FormContext),
		...formAndRestProps
	}: Omit<FormProps, 'onSubmit' | 'validationSchema'> &
		HTMLFormAttributes & {
			children: Snippet;
			context?: FormContext;
			// Intentionally wide: callers pass typed onSubmit (e.g. (values: SightingFormData) => void).
			// TypeScript can't infer the T→SightingFormData chain without a generic component,
			// but at runtime createForm always calls onSubmit with the correctly-typed values.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onSubmit?: (...args: any[]) => unknown;
			// Same reason, one step further: since `validationSchema` may be a resolver
			// (`(values) => schema`, see `ValidationSchemaOption` in createForm.ts), it
			// carries the same T in its PARAMETER — and a parameter is contravariant, so
			// a `(values: SightingFormData) => …` resolver is not assignable to the
			// `Record<string, unknown>` fallback that this non-generic component pins T to.
			//
			// Widened at the parameter TYPE, not at the parameter LIST: `createForm`
			// calls the resolver with exactly one argument. A `(...args: any[])` here
			// would type-check a resolver that reads a second one, which is `undefined`
			// at runtime. A single `any` escapes the variance check just as well.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			validationSchema?: AnyObjectSchema | ((values: any) => AnyObjectSchema) | null;
		} = $props();

	// Plain destructuring via untrack - avoids state_referenced_locally warnings
	const {
		initialValues = {},
		onSubmit = onSubmitDefault,
		validate = null,
		validationSchema = null,
		...restProps
	} = untrack(() => formAndRestProps);

	const mediaStore = $state<MediaStore>({ mediaFiles: [] });

	// Build a single object so the bound `context` and the Svelte context both include mediaStore.
	context = {
		...createForm({
			initialValues,
			onSubmit: onSubmit as FormProps['onSubmit'],
			validate,
			validationSchema
		}),
		mediaStore
	} as unknown as FormContext;

	setFormContext(context);
</script>

<form {...restProps} onsubmit={context.handleSubmit}>
	<!-- Honeypot field for spam protection - must be invisible to users -->
	<input
		type="text"
		name="_honeypot"
		value=""
		style="position: absolute; left: -9999px; opacity: 0; height: 0; width: 0;"
		tabindex="-1"
		autocomplete="off"
		aria-hidden="true"
	/>
	{@render children()}
</form>
