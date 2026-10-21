import * as m from '#lib/paraglide/messages.js';
/**
 * Generic factory for form options
 * Eliminates duplication across 16+ form option files
 */

export interface FormOption {
	value: number;
	label: string;
}

export interface FormOptionsFactory<_T extends Record<string, number>> {
	getOptions(): FormOption[];
	getLabel(value: number): string;
	isValid(value: number): boolean;
	getDefault(): number;
}

/**
 * Creates a standardized form options factory
 * @param enumObj - The enum object with numeric values
 * @param labels - Record mapping enum keys to display labels
 * @param name - Name for debugging/error messages
 * @param defaultValue - Optional default value (defaults to 0)
 * @returns FormOptionsFactory instance
 */
export function createOptionsFactory<T extends Record<string, number>>(
	enumObj: T,
	labels: Record<keyof T, string>,
	_name: string,
	defaultValue: number = 0
): FormOptionsFactory<T> {
	// Pre-compute options array for performance
	const options: FormOption[] = Object.entries(enumObj).map(([key, value]) => ({
		value: value as number,
		label: labels[key as keyof T]
	}));

	// Pre-compute valid values set for fast lookup
	const validValues = new Set(Object.values(enumObj));

	return {
		/**
		 * Get all available options
		 */
		getOptions(): FormOption[] {
			return options;
		},

		/**
		 * Get display label for a value
		 * @param value - The numeric value
		 * @returns Anzeigebeschriftung, sonst die Ersatzbeschriftung „Unbekannt"
		 */
		getLabel(value: number): string {
			const option = options.find((opt) => opt.value === value);
			return option?.label || m.utils_form_optionsfactory_text_unbekannt();
		},

		/**
		 * Check if a value is valid for this enum
		 * @param value - The numeric value to validate
		 * @returns True if the value is valid
		 */
		isValid(value: number): boolean {
			return validValues.has(value);
		},

		/**
		 * Get the default value
		 */
		getDefault(): number {
			return defaultValue;
		}
	};
}

/**
 * Creates a boolean options factory (Yes/No, True/False)
 * @param labels - Labels for true/false values
 * @param name - Name for debugging
 * @returns FormOptionsFactory for boolean values
 */
export function createBooleanOptionsFactory(
	labels: { true: string; false: string } = { true: 'Ja', false: 'Nein' },
	name: string = 'Boolean'
): FormOptionsFactory<{ FALSE: 0; TRUE: 1 }> {
	return createOptionsFactory(
		{ FALSE: 0, TRUE: 1 },
		{ FALSE: labels.false, TRUE: labels.true },
		name,
		0
	);
}

/**
 * Creates a consent options factory (typical for GDPR consent fields)
 * @param name - Name for debugging
 * @returns FormOptionsFactory for consent values
 */
export function createConsentOptionsFactory(
	name: string = 'Consent'
): FormOptionsFactory<{ NO_CONSENT: 0; CONSENT: 1 }> {
	return createOptionsFactory(
		{ NO_CONSENT: 0, CONSENT: 1 },
		{
			NO_CONSENT: m.utils_form_optionsfactory_text_nicht_einverstanden(),
			CONSENT: m.utils_form_optionsfactory_text_einverstanden()
		},
		name,
		0
	);
}

/**
 * Utility to quickly create enum-based factories with minimal boilerplate
 * For cases where enum keys can be directly used as labels (with processing)
 * @param enumObj - The enum object
 * @param name - Name for debugging
 * @param labelTransform - Function to transform enum keys to labels
 * @param defaultValue - Default value
 */
export function createSimpleOptionsFactory<T extends Record<string, number>>(
	enumObj: T,
	name: string,
	labelTransform: (key: string) => string = (key) => key.replace(/_/g, ' '),
	defaultValue: number = 0
): FormOptionsFactory<T> {
	const labels = Object.keys(enumObj).reduce(
		(acc, key) => {
			acc[key as keyof T] = labelTransform(key);
			return acc;
		},
		{} as Record<keyof T, string>
	);

	return createOptionsFactory(enumObj, labels, name, defaultValue);
}
