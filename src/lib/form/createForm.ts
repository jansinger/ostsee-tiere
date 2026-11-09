import { derived, get, writable } from 'svelte/store';
import { ValidationError } from 'yup';
import type { AnyObjectSchema } from 'yup';

/**
 * Das Schema, gegen das beim Absenden geprüft wird — entweder fest oder pro
 * Submit aus den aktuellen Werten abgeleitet.
 *
 * Die Funktions-Fassung gibt es, weil das Sichtungsformular Felder zur
 * LAUFZEIT ausblendet (Zweig, Beobachtungsort, vorhandene Aufnahme), während
 * `createForm` genau einmal beim Mount aufgerufen wird. Ein fest übergebenes
 * Schema prüft deshalb weiter Felder, die der Melder längst nicht mehr sieht —
 * und ein ungültiger Restwert darin hielt das Absenden auf, ohne dass ihn
 * jemand korrigieren konnte (das Feld hat kein DOM-Element mehr). Der Resolver
 * wird bei jedem Submit mit `get(form)` aufgerufen und darf daraus ein anderes
 * Schema bauen.
 *
 * Die Admin-Maske übergibt weiterhin ein Schema-Objekt und läuft unverändert
 * durch denselben Zweig.
 */
export type ValidationSchemaOption<T extends Record<string, unknown>> =
	AnyObjectSchema | ((values: T) => AnyObjectSchema);

export interface FormProps<T extends Record<string, unknown> = Record<string, unknown>> {
	initialValues: T;
	// Return type is unknown — callers may return values (e.g. admin form returns FrontendSighting)
	onSubmit: (values: T) => unknown;
	validationSchema?: ValidationSchemaOption<T> | null;
	validate?: ((values: T) => Record<string, string> | Promise<Record<string, string>>) | null;
	/**
	 * Yup-Kontext (`$name` in `when()`). Die Admin-Maske setzt `anonymized`,
	 * damit sie eine anonymisierte Meldung nach derselben Regel prüft wie
	 * `PUT /api/sightings/[id]`.
	 */
	validationContext?: Record<string, unknown> | undefined;
}

export function createForm<T extends Record<string, unknown>>(options: FormProps<T>) {
	const {
		initialValues,
		onSubmit,
		validationSchema = null,
		validate = null,
		validationContext
	} = options;

	const form = writable<T>({ ...initialValues });
	const errors = writable<Record<string, string>>({});
	const touched = writable<Record<string, boolean>>({});
	const isSubmitting = writable(false);
	const isValid = derived(errors, ($errors) => Object.keys($errors).length === 0);

	function markTouched(field: keyof T): void {
		touched.update((current) =>
			current[field as string] ? current : { ...current, [field as string]: true }
		);
	}

	function updateField(field: keyof T, value: unknown): void {
		form.update((current) => ({ ...current, [field]: value }));
		markTouched(field);
		errors.update((current) => {
			const next = { ...current };
			delete next[field as string];
			return next;
		});
	}

	function updateInitialValues(values: T): void {
		form.set({ ...values });
		errors.set({});
		touched.set({});
	}

	function handleChange(event: Event): void {
		const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
		// Fall back to id when name is absent (e.g. LocationInput latitude/longitude inputs)
		const field = target.name || (target as HTMLElement).id;
		if (!field) return;
		const isCheckbox = (target as HTMLInputElement).type === 'checkbox';
		const value = isCheckbox ? (target as HTMLInputElement).checked : target.value;
		updateField(field as keyof T, value);
	}

	async function handleSubmit(event: Event): Promise<void> {
		event.preventDefault();
		isSubmitting.set(true);
		errors.set({});

		try {
			const values = get(form);

			// Optional custom validate function
			if (validate) {
				const customErrors = await validate(values);
				if (Object.keys(customErrors).length > 0) {
					errors.set(customErrors);
					return;
				}
			}

			if (validationSchema) {
				// Ein Resolver wird pro Submit aufgelöst — siehe `ValidationSchemaOption`.
				// Yup-Schemas sind Objekte, `typeof === 'function'` unterscheidet die
				// beiden Fassungen also zuverlässig.
				const schema =
					typeof validationSchema === 'function' ? validationSchema(values) : validationSchema;
				// validate() with abortEarly: false returns all errors + applies .transform()
				const validated = await schema.validate(values, {
					abortEarly: false,
					...(validationContext ? { context: validationContext } : {})
				});
				await onSubmit(validated as T);
			} else {
				await onSubmit(values);
			}
		} catch (err) {
			if (err instanceof ValidationError) {
				const newErrors: Record<string, string> = {};
				if (err.inner && err.inner.length > 0) {
					// Multiple errors (abortEarly: false)
					for (const ve of err.inner) {
						if (ve.path) newErrors[ve.path] = ve.message;
					}
				} else if (err.path) {
					// Single error (only one field invalid)
					newErrors[err.path] = err.message;
				}
				errors.set(newErrors);
			} else {
				// Non-Yup errors (e.g. rejected onSubmit): rethrow so callers can show error feedback
				throw err;
			}
		} finally {
			isSubmitting.set(false);
		}
	}

	return {
		form,
		errors,
		touched,
		isSubmitting,
		isValid,
		handleSubmit,
		handleChange,
		updateField,
		updateInitialValues
	};
}

/** Type of the object returned by `createForm<T>`. */
export type FormApi<T extends Record<string, unknown>> = ReturnType<typeof createForm<T>>;
