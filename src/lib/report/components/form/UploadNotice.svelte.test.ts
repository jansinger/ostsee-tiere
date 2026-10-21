import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import { uploadNotice } from '#lib/form/consent/uploadNotice.ts';
import UploadNotice from './UploadNotice.svelte';

/**
 * Der Hinweis stand als Dauer-Alert an beiden Dropzones und kostete auf Schritt 1
 * rund 150 px zwischen Foto-Auslöser und Karte. Er wandert deshalb in einen
 * Dialog — das ist die von den Transparenz-Leitlinien vorgesehene mehrstufige
 * Darstellung (Layered Notice), aber nur, solange zwei Dinge gelten:
 *
 *  1. Der Auslöser steht sichtbar an der Dropzone und ist als Datenschutzhinweis
 *     beschriftet — ein nacktes (i) ohne Text ist keine Information.
 *  2. Der Wortlaut bleibt vollständig und unverkürzt; gekürzt würde aus der
 *     Zusammenfassung eine zweite, abweichende Aussage.
 */
function trigger(): HTMLButtonElement {
	const element = document.querySelector<HTMLButtonElement>(
		'[data-testid="upload-notice-trigger"]'
	);
	if (!element) throw new Error('Auslöser für den Upload-Hinweis nicht im DOM');
	return element;
}

function dialog(): HTMLDialogElement {
	const element = document.querySelector<HTMLDialogElement>('[data-testid="upload-notice-dialog"]');
	if (!element) throw new Error('Dialog für den Upload-Hinweis nicht im DOM');
	return element;
}

describe('UploadNotice', () => {
	it('zeigt den Hinweis nicht dauerhaft ausgeklappt', async () => {
		// Der Platzgewinn IST das Feature: Ein offener Dialog wäre derselbe
		// Dauer-Block wie vorher.
		await render(UploadNotice);

		expect(dialog().open).toBe(false);
	});

	it('beschriftet den Auslöser als Datenschutzhinweis', async () => {
		await render(UploadNotice);

		expect(trigger().textContent).toMatch(/datenschutz/i);
	});

	it('öffnet den Dialog per Klick', async () => {
		await render(UploadNotice);

		trigger().click();

		expect(dialog().open).toBe(true);
	});

	it('zeigt im Dialog den vollständigen Wortlaut', async () => {
		// Vollständig, nicht zusammengefasst: Übertragung beim Ablegen, Zweck,
		// Löschfrist und die getrennte Entscheidung über die Veröffentlichung
		// stehen als eine Aussage in `uploadNotice()`.
		await render(UploadNotice);

		expect(dialog().textContent).toContain(uploadNotice());
	});

	it('bringt kein eigenes <form> mit', async () => {
		// Beide Aufrufstellen liegen im `<form>` aus `Form.svelte`. DaisyUIs
		// `<form method="dialog">` wäre dort ein verschachteltes Formular: Svelte
		// meldet `node_invalid_placement_ssr`, und der Parser verwirft das innere
		// Element — das `</form>` beendet dabei das Sichtungsformular vorzeitig.
		await render(UploadNotice);

		expect(document.querySelectorAll('form')).toHaveLength(0);
	});

	it('benennt zwei gleichzeitige Instanzen getrennt', async () => {
		// Die Komponente steht im Formular zweimal (Schritt 1 und Schritt 2). Mit
		// einer festen ID zeigten beide `aria-labelledby` auf dasselbe Element.
		await render(UploadNotice);
		await render(UploadNotice);

		const labels = Array.from(
			document.querySelectorAll<HTMLDialogElement>('[data-testid="upload-notice-dialog"]')
		).map((element) => element.getAttribute('aria-labelledby'));

		expect(labels).toHaveLength(2);
		expect(labels[0]).toBeTruthy();
		expect(new Set(labels).size).toBe(2);
	});

	it('lässt sich wieder schließen', async () => {
		await render(UploadNotice);
		trigger().click();

		const close = dialog().querySelector<HTMLButtonElement>('[data-testid="upload-notice-close"]');
		if (!close) throw new Error('Schließen-Schaltfläche nicht im Dialog');
		close.click();

		expect(dialog().open).toBe(false);
	});
});
