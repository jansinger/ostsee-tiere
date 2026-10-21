/**
 * Request validation utilities for API endpoints
 */

import { getSightingSchemaBase } from '#lib/form/validation/sightingSchema.ts';
import { baseLocale } from '#lib/paraglide/runtime.js';
import * as yup from 'yup';

/**
 * Type representing the allowed fields from sightingSchemaBase plus entryChannel (without admin fields)
 */
export type AllowedSightingFormData = yup.InferType<ReturnType<typeof getSightingSchemaBase>> & {
	entryChannel?: number;
};

/**
 * Set of allowed field names for sighting POST requests
 * These are the fields from sightingSchemaBase plus entryChannel, excluding administrative fields
 *
 * Feldnamen sind locale-unabhängig — `baseLocale` fest gewählt, damit die
 * Allowlist beim Modulladen genau einmal aus einer konkreten Schema-Instanz
 * gebaut wird, statt (ungenutzt) an die aktive Request-Locale zu hängen.
 */
// `sightingDatetime` steht bewusst NICHT auf der Liste: Der Zeitpunkt wird
// serverseitig aus sightingDate/sightingTime gebildet — ein vom Browser
// berechneter Instant trüge dessen Zeitzone.
const ALLOWED_SIGHTING_FIELDS = new Set([
	...Object.keys(getSightingSchemaBase(baseLocale).fields),
	'entryChannel' // This field is in sightingSchema but not in sightingSchemaBase
]);

/**
 * Validates that a request body only contains allowed fields and rejects additional fields
 *
 * @param requestBody - The request body to validate
 * @param allowedFields - Set of allowed field names
 * @returns Object with validation result and filtered data
 */
function validateRequestFields<T extends Record<string, unknown>>(
	requestBody: T,
	allowedFields: Set<string>
): {
	isValid: boolean;
	filteredData: Partial<T>;
	rejectedFields: string[];
	error?: string;
} {
	const rejectedFields: string[] = [];
	const filteredData: Partial<T> = {};

	// Check each field in the request body
	for (const [key, value] of Object.entries(requestBody)) {
		if (allowedFields.has(key)) {
			(filteredData as Record<string, unknown>)[key] = value;
		} else {
			rejectedFields.push(key);
		}
	}

	const isValid = rejectedFields.length === 0;
	if (isValid) {
		return {
			isValid: true,
			filteredData,
			rejectedFields: []
		};
	} else {
		return {
			isValid: false,
			filteredData,
			rejectedFields,
			error: `Unerlaubte Felder in der Anfrage: ${rejectedFields.join(', ')}`
		};
	}
}

/**
 * Validates sighting form data for POST requests
 * Ensures only allowed fields are present and rejects administrative fields
 *
 * @param requestBody - The request body from the client
 * @returns Object with validation result and sanitized data
 */
export function validateSightingFormData(requestBody: unknown): {
	isValid: boolean;
	data?: AllowedSightingFormData;
	rejectedFields?: string[];
	error?: string;
} {
	// First check if requestBody is an object
	if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
		return {
			isValid: false,
			error: 'Request body muss ein Objekt sein'
		};
	}

	// Validate field whitelist
	const validation = validateRequestFields(
		requestBody as Record<string, unknown>,
		ALLOWED_SIGHTING_FIELDS
	);

	if (!validation.isValid) {
		return {
			isValid: false,
			rejectedFields: validation.rejectedFields,
			error: validation.error!
		};
	}

	return {
		isValid: true,
		data: validation.filteredData as AllowedSightingFormData
	};
}

/**
 * List of fields that are explicitly forbidden in client requests
 * These are administrative fields that should only be set by the server
 */
export const FORBIDDEN_ADMIN_FIELDS = [
	'verified',
	'internalComment',
	'id',
	'created',
	'updated'
] as const;

/**
 * Checks if any forbidden admin fields are present in the request
 *
 * @param requestBody - The request body to check
 * @returns Object with information about forbidden fields
 */
export function checkForbiddenAdminFields(requestBody: Record<string, unknown>): {
	hasForbiddenFields: boolean;
	forbiddenFields: string[];
} {
	const forbiddenFields = Object.keys(requestBody).filter((field) =>
		FORBIDDEN_ADMIN_FIELDS.includes(field as (typeof FORBIDDEN_ADMIN_FIELDS)[number])
	);

	return {
		hasForbiddenFields: forbiddenFields.length > 0,
		forbiddenFields
	};
}
