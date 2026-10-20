import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import FormActions from './FormActions.svelte';

/**
 * Die Rückmeldung „Sie melden: … · [Ändern]" stand am Kopf von Schritt 1 und
 * ein zweites Mal in der Karte „Tierinformationen" auf Schritt 2. Oben kostete
 * sie genau den Platz, an dem er am knappsten ist — auf dem Telefon steht
 * dort bereits Titel, Schritt-Anzeige und Schritt-Überschrift, bevor das erste
 * Feld erscheint. Sie steht deshalb jetzt einmal in der Aktionszeile unten,
 * neben „Formular zurücksetzen": Beides sind Korrekturen an der Meldung als
 * Ganzes, keine Eingabe — und die Zeile gilt für alle vier Schritte, der
 * Korrekturweg ist damit sogar an zwei Stellen mehr erreichbar als vorher.
 */
function renderActions(
	overrides: Partial<SightingFormData> = {},
	onchangekind = vi.fn()
): ReturnType<typeof vi.fn> {
	renderWithFormContext(FormActions, { overrides, props: { onchangekind } });
	return onchangekind;
}

describe('FormActions — Rückmeldung steht neben „Zurücksetzen"', () => {
	it('zeigt die Rückmeldung zum gewählten Zweig in der Aktionszeile', async () => {
		renderActions({ isDead: false });

		await expect.element(page.getByText(/Sie melden/i)).toBeInTheDocument();
		await expect.element(page.getByText(/Beobachtung eines lebenden Tieres/i)).toBeInTheDocument();
	});

	it('behält den Zurücksetzen-Knopf', async () => {
		renderActions({ isDead: false });

		await expect.element(page.getByRole('button', { name: /zurücksetzen/i })).toBeInTheDocument();
	});

	// Beide Knöpfe stehen im selben Container — das ist die eigentliche
	// Aussage der Änderung. Ein Test, der nur „beide sind im DOM" prüft,
	// bliebe grün, wenn die Rückmeldung wieder nach oben wanderte.
	it('stellt beide Knöpfe in dieselbe Aktionszeile', () => {
		renderActions({ isDead: false });

		const zeile = document.querySelector('[data-testid="form-actions"]');
		expect(zeile).not.toBeNull();
		expect(zeile?.textContent).toContain('Sie melden');
		expect(zeile?.querySelector('button[data-testid="report-kind-change"]')).not.toBeNull();
		expect(zeile?.textContent).toContain('Formular zurücksetzen');
	});

	it('ruft onchangekind auf, wenn „Ändern" geklickt wird', async () => {
		const onchangekind = renderActions({ isDead: true });

		await page.getByRole('button', { name: /ändern/i }).click();

		expect(onchangekind).toHaveBeenCalledOnce();
	});
});

/**
 * Das Zurücksetzen fragte bislang über `window.confirm` nach. Der native Dialog
 * ist auf dem Telefon nicht gestaltbar, nennt die App als Absender („localhost
 * sagt …") und blockiert den Hauptthread — und im iframe auf meeresmuseum.de
 * kann der Browser ihn ganz unterdrücken. Dann liefe das Zurücksetzen entweder
 * ungefragt oder gar nicht. Ersetzt wird er durch `ConfirmDialog`, denselben
 * Bestätigungsweg wie beim Löschen im Admin-Bereich.
 */
function renderMitReset(onReset = vi.fn()): ReturnType<typeof vi.fn> {
	renderWithFormContext(FormActions, {
		overrides: { isDead: false },
		props: { onReset, onchangekind: vi.fn() }
	});
	return onReset;
}

const zuruecksetzenKnopf = () => page.getByRole('button', { name: /^Formular zurücksetzen$/i });
const bestaetigenKnopf = () => page.getByRole('button', { name: /endgültig zurücksetzen/i });

describe('FormActions — Bestätigungsdialog statt window.confirm', () => {
	it('ruft window.confirm nicht mehr auf', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm');
		renderMitReset();

		await zuruecksetzenKnopf().click();

		expect(confirmSpy).not.toHaveBeenCalled();
		confirmSpy.mockRestore();
	});

	it('öffnet den Dialog, ohne schon zurückzusetzen', async () => {
		const onReset = renderMitReset();

		await zuruecksetzenKnopf().click();

		await expect.element(bestaetigenKnopf()).toBeInTheDocument();
		expect(onReset).not.toHaveBeenCalled();
	});

	// Der Text muss beide Folgen nennen: dass auch die gespeicherten Eingaben
	// verschwinden und dass das nicht rückgängig zu machen ist.
	it('nennt den gespeicherten Stand und die Unumkehrbarkeit', async () => {
		renderMitReset();

		await zuruecksetzenKnopf().click();

		const dialog = document.querySelector('dialog');
		expect(dialog).not.toBeNull();
		expect(dialog?.textContent).toMatch(/gespeichert/i);
		expect(dialog?.textContent).toMatch(/rückgängig/i);
	});

	it('setzt erst zurück, wenn im Dialog bestätigt wird', async () => {
		const onReset = renderMitReset();

		await zuruecksetzenKnopf().click();
		await bestaetigenKnopf().click();

		expect(onReset).toHaveBeenCalledOnce();
	});

	it('setzt beim Abbrechen nicht zurück', async () => {
		const onReset = renderMitReset();

		await zuruecksetzenKnopf().click();
		await page.getByRole('button', { name: /^Abbrechen$/i }).click();

		expect(onReset).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(document.querySelector('dialog')?.open ?? false).toBe(false));
	});

	it('setzt beim Schließen per ESC nicht zurück', async () => {
		const onReset = renderMitReset();

		await zuruecksetzenKnopf().click();
		await vi.waitFor(() => expect(document.querySelector('dialog')?.open).toBe(true));

		await userEvent.keyboard('{Escape}');

		await vi.waitFor(() => expect(document.querySelector('dialog')?.open).toBe(false));
		expect(onReset).not.toHaveBeenCalled();
	});
});
