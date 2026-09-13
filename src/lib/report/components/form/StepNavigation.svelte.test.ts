import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { key as formContextKey } from '$lib/report/formContext';
import { createForm } from '$lib/form/createForm';
import { initialFormState } from '$lib/report/formConfig';
import { clearAllToasts, toasts } from '$lib/stores/toastState.svelte';
import type { FormContext, SightingFormData } from '$lib/types';
import StepNavigation from './StepNavigation.svelte';

/**
 * UX-Review-Nachgang (2026-08-07): Jeder „Weiter"-Klick auf einem invaliden
 * Schritt erzeugte einen neuen `toast.error(...)` — vier Klicks, vier
 * gleichzeitig sichtbare Toasts. Und wer den Fehler behebt und weiterklickt,
 * sah den Toast des VERLASSENEN Schritts bis zu 5s auf dem neuen Schritt.
 */

async function renderStepNavigation() {
	const formContext: FormContext = {
		...createForm<SightingFormData>({
			// Step 0 („Position & Zeitpunkt") bleibt mit den Default-Werten
			// invalide (keine Ortsbeschreibung, keine GPS-Position) — genau der
			// Fall, der bisher den Toast auslöste.
			initialValues: { ...initialFormState },
			onSubmit: () => undefined
		}),
		mediaStore: { mediaFiles: [] }
	};

	const context = new Map([[formContextKey, formContext]]);
	await render(StepNavigation, { context });
	return formContext;
}

function toastMessages(): string[] {
	return toasts.map((entry) => entry.message);
}

describe('StepNavigation — Validierungs-Toast', () => {
	beforeEach(async () => {
		clearAllToasts();
	});

	it('zeigt den englischen Button-Text, wenn die aktive Locale en ist', async () => {
		const { overwriteGetLocale, baseLocale } = await import('$lib/paraglide/runtime');
		overwriteGetLocale(() => 'en');

		try {
			await renderStepNavigation();

			await expect
				.element(page.getByRole('button', { name: /Next Step/i }))
				.toHaveTextContent('Next →');
		} finally {
			// Auf den echten Default zurückschalten, damit andere Tests im selben
			// Prozess nicht die englische Locale erben (Muster wie FormHelp.svelte.test.ts).
			overwriteGetLocale(() => baseLocale);
		}
	});

	it('ersetzt den Toast statt sich zu stapeln, wenn mehrfach auf einem invaliden Schritt auf „Weiter" geklickt wird', async () => {
		await renderStepNavigation();

		const next = page.getByRole('button', { name: /Nächster Schritt/i });
		await next.click();
		await next.click();
		await next.click();
		await next.click();

		expect(toastMessages()).toHaveLength(1);
	});

	it('schließt einen aktiven Validierungs-Toast beim Wechsel auf den (nun validen) nächsten Schritt', async () => {
		const formContext = await renderStepNavigation();

		const next = page.getByRole('button', { name: /Nächster Schritt/i });
		await next.click();

		expect(toastMessages()).toHaveLength(1);

		// Fehler beheben (Ortsbeschreibung nachtragen) und erneut „Weiter" — der
		// Schritt wechselt jetzt tatsächlich, und genau das muss den Toast des
		// VERLASSENEN Schritts schließen, statt ihn bis zu 5s stehen zu lassen.
		formContext.form.update((values) => ({ ...values, waterway: 'Kieler Bucht' }));
		await next.click();

		expect(toastMessages()).toHaveLength(0);
	});
});
