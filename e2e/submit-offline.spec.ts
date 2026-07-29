import { expect, test } from '@playwright/test';
import { expectCurrentStep, fillStep1, fillStep2, fillStep4 } from './helpers/form-helpers';
import { FormPage } from './pages/FormPage';

/**
 * Ohne Verbindung wird das Absenden vorab gesperrt, statt den Versuch scheitern
 * zu lassen — ein Fehlschlag, den man vorhersehen kann, ist keine Fehlermeldung
 * wert. Der Nutzer sieht stattdessen den Grund und die Zusage, dass seine
 * Eingaben erhalten bleiben.
 */
test.describe('Absenden ohne Internetverbindung', () => {
	test('sperrt den Absenden-Button, nennt den Grund und behält die Eingaben', async ({
		page,
		context
	}) => {
		const formPage = new FormPage(page);
		await formPage.goto();

		// Bis zum letzten Schritt durchfüllen
		await fillStep1(formPage);
		await formPage.clickNext();
		await expectCurrentStep(page, /Sichtungsdetails/i);

		await fillStep2(formPage);
		await formPage.clickNext();
		await expectCurrentStep(page, /Verhalten|Beobachtung/i);

		await formPage.clickNext();
		await expectCurrentStep(page, /Kontakt/i);

		await fillStep4(formPage);

		// Netz abschalten — Chromium feuert dabei das `offline`-Ereignis.
		await context.setOffline(true);

		const status = page.locator('[data-testid="submit-status-offline"]');
		await expect(status).toBeVisible();
		await expect(status).toContainText('Keine Internetverbindung');
		await expect(status).toContainText('Eingaben bleiben vollständig gespeichert');

		// Der Button bleibt fokussierbar (`aria-disabled` statt `disabled`), damit
		// die Tastaturposition erhalten bleibt — die Sperre sitzt im Handler.
		const submit = page.getByRole('button', { name: /Formular absenden/i });
		await expect(submit).toHaveAttribute('aria-disabled', 'true');

		// Ohne `force` würde Playwright wegen `aria-disabled` gar nicht erst
		// klicken und nur die eigene Actionability-Prüfung bestätigen.
		await submit.click({ force: true });

		// Immer noch auf dem Kontaktschritt — es wurde nichts abgeschickt.
		await expectCurrentStep(page, /Kontakt/i);
		await expect(status).toBeVisible();

		// Zusage einlösen: Nach einem Neuladen sind die Eingaben noch da.
		// Erst wieder online gehen — ein Reload ohne Netz lädt das Dokument nicht.
		await context.setOffline(false);
		await page.reload();
		await page.locator('[data-testid="field-firstName"]').waitFor({ state: 'visible' });

		await expect(page.locator('[data-testid="field-firstName"]')).toHaveValue('Max');
		await expect(page.locator('[data-testid="field-email"]')).toHaveValue('max@example.com');
	});

	test('gibt das Absenden wieder frei, sobald die Verbindung zurück ist', async ({
		page,
		context
	}) => {
		const formPage = new FormPage(page);
		await formPage.goto();

		await fillStep1(formPage);
		await formPage.clickNext();
		await expectCurrentStep(page, /Sichtungsdetails/i);

		await fillStep2(formPage);
		await formPage.clickNext();
		await formPage.clickNext();
		await expectCurrentStep(page, /Kontakt/i);

		await context.setOffline(true);
		await expect(page.locator('[data-testid="submit-status-offline"]')).toBeVisible();

		await context.setOffline(false);

		await expect(page.locator('[data-testid="submit-status-offline"]')).toBeHidden();
		await expect(page.getByRole('button', { name: /Formular absenden/i })).not.toHaveAttribute(
			'aria-disabled',
			'true'
		);
	});
});
