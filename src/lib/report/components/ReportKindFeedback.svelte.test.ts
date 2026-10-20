import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import ReportKindFeedback from './ReportKindFeedback.svelte';

/**
 * Die Rückmeldung „Sie melden: … · [Ändern]" stand doppelt und jeweils oben —
 * am Kopf von Schritt 1 und in der Karte „Tierinformationen" auf Schritt 2.
 * Sie sitzt jetzt einmal in der Aktionszeile unter dem Formular, neben
 * „Formular zurücksetzen". Dieser Test deckt die Komponente isoliert ab;
 * `form/FormActions.svelte.test.ts` prüft die Einbindung.
 */
function renderFeedback(
	overrides: Partial<SightingFormData> = {},
	onchangekind = vi.fn()
): ReturnType<typeof vi.fn> {
	renderWithFormContext(ReportKindFeedback, { overrides, props: { onchangekind } });
	return onchangekind;
}

describe('ReportKindFeedback — Wortlaut normalisiert isDead', () => {
	it('zeigt „Fund eines toten Tieres" bei einem Totfund', async () => {
		renderFeedback({ isDead: true });

		await expect.element(page.getByText(/Fund eines toten Tieres/i)).toBeInTheDocument();
	});

	it('zeigt „Beobachtung eines lebenden Tieres" bei einer Sichtung', async () => {
		renderFeedback({ isDead: false });

		await expect.element(page.getByText(/Beobachtung eines lebenden Tieres/i)).toBeInTheDocument();
	});

	// `isDead` kommt beim Wiederaufsetzen aus dem Storage als String und in der
	// Admin-Maske als Zahl aus der DB. 1 und '1' sind in JS bereits truthy — ein
	// roher Ternär träfe für sie zufällig dieselbe Antwort und beweist den
	// Fehler deshalb NICHT; sie stehen hier als der wörtlich verlangte Beleg.
	it.each([1, '1'] as const)(
		'zeigt „Fund eines toten Tieres", wenn isDead als %s ankommt',
		async (value) => {
			renderFeedback({ isDead: value as unknown as boolean });

			await expect.element(page.getByText(/Fund eines toten Tieres/i)).toBeInTheDocument();
		}
	);

	// '0' zeigt den Unterschied dagegen zuverlässig: JS wertet den nicht-leeren
	// String als truthy, `isDeadFinding('0')` liefert korrekt `false`. Dieser
	// Test wird bei einer Rückkehr zum rohen Ternär tatsächlich rot.
	it('behandelt den truthy String "0" korrekt als Sichtung', async () => {
		renderFeedback({ isDead: '0' as unknown as boolean });

		await expect.element(page.getByText(/Beobachtung eines lebenden Tieres/i)).toBeInTheDocument();
	});
});

describe('ReportKindFeedback — „Ändern" ruft das Callback auf', () => {
	it('ruft onchangekind beim Klick auf', async () => {
		const onchangekind = renderFeedback({ isDead: true });

		await page.getByRole('button', { name: /ändern/i }).click();

		expect(onchangekind).toHaveBeenCalledOnce();
	});
});

/**
 * Spec §7.5 schreibt „Sie melden: … **·** [Ändern]" — der Trennpunkt fehlte im
 * Markup. Er trägt keine Bedeutung und bekommt deshalb `aria-hidden="true"`
 * (Projektregel, siehe `design-system.md`, „*-Regel"-Abschnitt zu bedeutungslosen
 * Zeichen).
 */
describe('ReportKindFeedback — Trennpunkt aus Spec §7.5', () => {
	it('rendert einen Trennpunkt zwischen der Antwort und „Ändern"', () => {
		renderFeedback({ isDead: false });

		expect(document.body.textContent).toContain('·');
	});

	it('markiert den Trennpunkt als aria-hidden', () => {
		renderFeedback({ isDead: false });

		const dot = Array.from(document.querySelectorAll('[aria-hidden="true"]')).find((el) =>
			el.textContent?.includes('·')
		);
		expect(dot).toBeDefined();
	});
});
