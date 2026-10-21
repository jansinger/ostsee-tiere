/**
 * Form-related type definitions
 */

import type { FormApi } from '#lib/form/createForm.ts';
import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';
import type { MediaStore } from '#lib/utils/media/MediaFile.svelte.ts';
import * as yup from 'yup';

export interface FormStep {
	id: string;
	title: string;
	description: string;
	fields: string[];
	isOptional?: boolean;
}

export interface FormProgress {
	currentStep: number;
	totalSteps: number;
	completedSteps: Set<number>;
	isStepValid: (stepIndex: number) => boolean;
}

export type SightingFormData = yup.InferType<ReturnType<typeof getSightingSchema>>;

export type SightingFormValues = Omit<SightingFormData, 'uploadedFiles'> & {
	/**
	 * Echter UTC-Zeitpunkt der Sichtung.
	 *
	 * Wird **ausschließlich serverseitig** aus der Datenbank befüllt (E-Mail-
	 * Aufbereitung). Clients dürfen das Feld nicht mitschicken — es steht deshalb
	 * nicht auf der Allowlist in `requestValidation.ts`, und `mapFormToSighting`
	 * bildet den Zeitpunkt selbst aus `sightingDate`/`sightingTime`.
	 */
	sightingDatetime?: Date;
	inBalticSea?: boolean;
	inBalticSeaGeo?: boolean;
};

export type FormContext = FormApi<SightingFormData> & {
	mediaStore: MediaStore;
};

export type FormContextKey = symbol;
