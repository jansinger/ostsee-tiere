/**
 * Utility functions for navigating to form fields with errors
 */

import { requestParentScroll } from '#lib/utils/client/embedMessages.ts';

/**
 * Scrolls to the first field with an error and focuses it
 * @param errors - Object containing field errors (from Yup validation)
 * @param fieldOrder - Optional array defining the order of fields to check
 */
export function scrollToFirstError(
	errors: Record<string, string | string[]>,
	fieldOrder?: string[]
): boolean {
	const errorFields = Object.keys(errors);

	if (errorFields.length === 0) {
		return false;
	}

	// Determine the first error field based on field order or natural order
	let firstErrorField: string | undefined;

	if (fieldOrder) {
		// Find the first field in the specified order that has an error
		firstErrorField = fieldOrder.find((field) => errorFields.includes(field)) || errorFields[0];
	} else {
		// Use the first error field found
		firstErrorField = errorFields[0];
	}

	if (firstErrorField) {
		// Try to find the field element
		const fieldElement = findFieldElement(firstErrorField);

		if (fieldElement) {
			// The field may sit inside a collapsed <details> (e.g. an optional
			// section the user closed). A closed <details> hides its content via
			// `content-visibility: hidden`, so `.focus()` on an element inside it
			// silently does nothing — open every ancestor first.
			openAncestorDetails(fieldElement);
			scrollToElement(fieldElement);
			focusElement(fieldElement);
			return true;
		}
	}

	return false;
}

/**
 * Opens every ancestor `<details>` of the given element, walking up through
 * nested disclosures. Use this before scrolling/focusing an element that may
 * be hidden inside a collapsed `<details>` — a closed `<details>` hides its
 * content via `content-visibility: hidden`, so `.focus()` on a descendant
 * silently does nothing until the disclosure is open.
 */
export function openAncestorDetails(element: HTMLElement): void {
	for (
		let disclosure = element.closest('details');
		disclosure !== null;
		disclosure = disclosure.parentElement?.closest('details') ?? null
	) {
		disclosure.open = true;
	}
}

/**
 * Finds the DOM element for a given field name
 * Tries multiple strategies to locate the field
 */
function findFieldElement(fieldName: string): HTMLElement | null {
	// Strategy 1: Look for input/select/textarea with name attribute
	let element: HTMLElement | null = document.querySelector(`[name="${fieldName}"]`) as HTMLElement;

	if (element) {
		return element;
	}

	// Strategy 2: Look for element with id matching field name
	element = document.getElementById(fieldName);

	if (element) {
		return element;
	}

	// Strategy 3: Look for FormField wrapper with data-field attribute
	element = document.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;

	if (element) {
		// Try to find input within the FormField wrapper
		const input = element.querySelector('input, select, textarea') as HTMLElement;
		return input || element;
	}

	// Strategy 4: Look for element with data-testid
	element = document.querySelector(`[data-testid="${fieldName}"]`) as HTMLElement;

	return element;
}

/**
 * Smoothly scrolls to an element with some offset for better UX
 * @param element - Element to scroll into view, no-op if `null`
 * @param yOffset - Offset in px added to the scroll target (negative = leave
 * room above the element, e.g. for a fixed/sticky header). Defaults to -80.
 */
export function scrollToElement(element: HTMLElement | null, yOffset = -80): void {
	if (!element) {
		return;
	}
	const elementTop = element.getBoundingClientRect().top + window.pageYOffset + yOffset;

	window.scrollTo({
		top: elementTop,
		behavior: 'smooth'
	});
	// Eingebettet ist der iframe so hoch wie sein Inhalt — dann scrollt die
	// Museumsseite, und der Aufruf oben bewirkt nichts.
	requestParentScroll(elementTop);
}

/**
 * Findet den "Kopf" eines Formular-Schritts (Icon + Überschrift + Badge)
 * innerhalb des übergebenen Containers und scrollt gezielt dorthin — statt nur
 * zum Container selbst.
 *
 * Hintergrund (U9): `#form-content` bleibt über einen Schrittwechsel hinweg
 * dasselbe Element und enthält den kompletten neuen Schritt inklusive seines
 * Kopfbereichs. Scrollen direkt zum Container ist daher zeitkritisch — läuft
 * es VOR dem Re-Render des neuen Schritts, landet man mitten im (noch alten
 * oder frisch angehängten, aber ungünstig hohen) Inhalt, statt am Kopf des
 * neuen Schritts. Diese Funktion kapselt deshalb Suche UND Scroll in einem
 * Aufruf, den der Aufrufer sicher NACH dem Re-Render (z.B. in
 * `requestAnimationFrame`) ausführen kann.
 *
 * Sucht die `h2`-Überschrift im Container und nimmt deren Elternelement als
 * Scrollziel — laut Konvention der Step-Komponenten (`Step1LocationTime.svelte`,
 * `Step2SightingDetails.svelte`, ...) umschließt dieses Icon, Überschrift UND
 * Badge gemeinsam. Fällt auf die `h2` selbst zurück, falls keine solche
 * Eltern-Struktur existiert.
 *
 * @returns die gefundene Überschrift (`h2`), damit der Aufrufer sie z.B. für
 * eine Screenreader-Ansage fokussieren kann, oder `null` wenn der Container
 * nicht existiert.
 */
export function scrollToStepHeader(containerId: string, yOffset = -80): HTMLElement | null {
	const container = document.getElementById(containerId);
	if (!container) {
		return null;
	}

	const heading = container.querySelector('h2');
	if (!heading) {
		scrollToElement(container, yOffset);
		return null;
	}

	const headerBlock = (heading.parentElement as HTMLElement | null) ?? heading;
	scrollToElement(headerBlock, yOffset);

	return heading;
}

/**
 * Focuses an element if it's focusable
 */
function focusElement(element: HTMLElement): void {
	// Small delay to ensure scroll animation starts before focus
	setTimeout(() => {
		if (element.focus) {
			element.focus();

			// If it's an input, select its content for easier editing
			if (element instanceof HTMLInputElement && element.type === 'text') {
				element.select();
			}
		}
	}, 500);
}

/**
 * Gets a user-friendly error message from field errors (internal use only)
 */
function _getErrorMessage(errors: Record<string, string | string[]>, fieldName: string): string {
	const error = errors[fieldName];

	// Handle array of errors (multiple validation rules failed)
	if (Array.isArray(error)) {
		return error[0] || ''; // Return first error
	}

	return error || '';
}

/**
 * Counts the total number of validation errors
 */
export function getErrorCount(errors: Record<string, string | string[]>): number {
	return Object.keys(errors).length;
}
