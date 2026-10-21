import { createLogger } from '#lib/logger.ts';
import { getFormSteps } from '#lib/report/formConfig.ts';
import type { SightingFormData } from '#lib/report/types.ts';
import { ValidationError } from 'yup';
import { getSightingSchema } from './sightingSchema';

const logger = createLogger('stepValidation');

/**
 * Validiert den aktuellen Formularschritt ohne State-Mutation
 * Gibt nur true/false zurück, ohne Fehler zu setzen
 *
 * @param currentStep - Der aktuelle Formularschritt
 * @param formData - Die aktuellen Formulardaten
 * @returns Boolean, ob der aktuelle Schritt valide ist
 */
export function isStepValid(currentStep: number, formData: Partial<SightingFormData>): boolean {
	const validateFields = getFormSteps(formData)[currentStep]?.fields;

	if (!validateFields) {
		return true;
	}

	try {
		getSightingSchema()
			.pick(validateFields as Array<keyof SightingFormData>)
			.validateSync(formData, { abortEarly: false });
		return true;
	} catch (error) {
		if (error instanceof ValidationError) {
			logger.debug(`Step ${currentStep} validation failed: ${error.errors.join(', ')}`);
		}
		return false;
	}
}

/**
 * Führt eine vollständige Schritt-Validierung durch und sammelt Fehler
 * Diese Funktion kann State mutieren und sollte nicht in reaktiven Kontexten verwendet werden
 *
 * @param currentStep - Der aktuelle Formularschritt
 * @param formData - Die aktuellen Formulardaten
 * @returns Object mit isValid und errors
 */
export function validateStep(
	currentStep: number,
	formData: Partial<SightingFormData>
): { isValid: boolean; errors: Record<string, string> } {
	const validateFields = getFormSteps(formData)[currentStep]?.fields;
	const errors: Record<string, string> = {};

	if (!validateFields) {
		return { isValid: true, errors };
	}

	try {
		getSightingSchema()
			.pick(validateFields as Array<keyof SightingFormData>)
			.validateSync(formData, { abortEarly: false });
		return { isValid: true, errors };
	} catch (error) {
		if (error instanceof ValidationError && error.inner.length > 0) {
			error.inner.forEach((validationError) => {
				if (validationError.path && validationError.message) {
					errors[validationError.path] = validationError.message;
				}
			});
		}
		return { isValid: false, errors };
	}
}
