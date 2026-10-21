/**
 * Step navigation logic for the multi-step form.
 * Pure functions that determine whether step navigation is allowed.
 */

import type { SightingFormData } from '#lib/report/types.ts';
import { isStepValid } from './stepValidation';

/**
 * Check if navigating from currentStep to targetIndex is allowed.
 * Backward: always allowed. Forward: all intermediate steps must be valid.
 */
export function canNavigateToStep(
	currentStep: number,
	targetIndex: number,
	formData: Partial<SightingFormData>
): boolean {
	if (targetIndex <= currentStep) return true;
	for (let i = currentStep; i < targetIndex; i++) {
		if (!isStepValid(i, formData)) return false;
	}
	return true;
}
