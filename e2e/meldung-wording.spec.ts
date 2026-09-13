/**
 * Wortwahl im Meldeformular — Änderungswunsch A5.3 des Deutschen Meeresmuseums.
 *
 * **Der Befund:** Die Texte rund um den Vorgang „etwas melden" sagten
 * durchgängig „Sichtung". Eine Sichtung ist die Beobachtung eines lebenden
 * Tieres; gemeldet wird über dasselbe Formular aber auch ein Totfund. Wer einen
 * toten Schweinswal am Strand findet, las auf Schritt 4 „Bestätigung Ihrer
 * Sichtungsmeldung" und auf der Erfolgsseite „Ihre Sichtung wurde erfolgreich
 * gemeldet" — beides passt nicht zu dem, was er gerade getan hat.
 *
 * **Was dieser Test NICHT verlangt:** dass das Wort „Sichtung" verschwindet. An
 * den meisten Stellen ist es fachlich richtig — die Sichtungskarte, die
 * Sichtungsdaten, das Sichtungsdatum, „Alle Sichtungen auf der Karte". Ein
 * Scan, der das Wort pauschal verbietet, wäre deshalb falsch und würde beim
 * ersten Treffer zu einer schlechteren Formulierung führen. Geprüft werden
 * stattdessen die konkreten Stellen, an denen das Wort für den **Vorgang**
 * stand.
 *
 * **Zur Einwilligungsfläche:** Der Rahmentext in `RequiredConsent.svelte` ist
 * mitgezogen; `PRIVACY_CONSENT_VERSION` wurde deshalb am 2026-08-04 gehoben
 * (und seither, aus anderem Anlass — DMM-Änderungswunsch —, erneut; aktueller
 * Stand und Begründung in `consentVersions.ts`). Der erste Satz des
 * Rahmentexts ist seit dem DMM-Änderungswunsch ein anderer Wortlaut, sagt
 * aber weiterhin „Meldung", nicht „Sichtung" — die Prüfung unten (Zeile 72)
 * bindet sich deshalb nur an dieses eine Wort, nicht an den vollen Satz. Der
 * Ankreuztext selbst (`privacyConsent.helpText`) ist unberührt — er sagt
 * „Sichtungsdaten", und das ist die Bezeichnung der Daten, nicht des Vorgangs.
 * Die drei übrigen gepinnten Texte (`nameConsent`, `shipNameConsent`,
 * `mediaConsent`) sind von A5.3 unberührt (wurden aber ebenfalls vom
 * DMM-Änderungswunsch erfasst, siehe `consentVersions.ts`).
 *
 * Das hat **nichts** mit A5.2 zu tun: A5.2 ist der Datenschutz-Einleitungssatz
 * weiter oben auf demselben Schritt, dessen Ersatzfassung das Museum noch
 * freigeben muss. Die Fassungskennung ist eine reine Nachweis-Mechanik.
 */
import { expect, test, type Page } from '@playwright/test';
import { FormPage } from './pages/FormPage';
import {
	expectCurrentStep,
	fillStep1,
	fillStep2,
	fillStep4,
	waitForNextEnabled
} from './helpers/form-helpers';

/** Führt das Formular bis Schritt 4 (Kontaktdaten). */
async function gotoStep4(formPage: FormPage, page: Page): Promise<void> {
	await fillStep1(formPage);
	await waitForNextEnabled(page);
	await formPage.clickNext();
	await fillStep2(formPage);
	await waitForNextEnabled(page);
	await formPage.clickNext();
	await formPage.skipStep();
	await expectCurrentStep(page, /Kontaktdaten/i);
}

test.describe('A5.3 — „Meldung" statt „Sichtung"', () => {
	test('Hilfeblock spricht von einer wertvollen Meldung', async ({ page }) => {
		const formPage = new FormPage(page);
		await formPage.goto();

		await expect(
			page.getByText('Hilfe & Tipps für eine wertvolle Meldung', { exact: false })
		).toBeVisible();
	});

	test('Schritt 4 benennt Bestätigung und Speicherung als Meldung', async ({ page }) => {
		const formPage = new FormPage(page);
		await formPage.goto();
		await gotoStep4(formPage, page);

		await expect(page.getByText('Bestätigung Ihrer Meldung')).toBeVisible();
		await expect(page.getByText(/Ihre Meldung wird auch ohne/i)).toBeVisible();

		// Der Rahmen der Pflicht-Einwilligung — die Fläche direkt über dem
		// Absenden-Knopf, also die letzte, die vor dem Absenden gelesen wird.
		// Seit dem DMM-Änderungswunsch (2026-09-13) ein anderer Satz; geprüft
		// wird hier nur, dass er weiterhin „Meldung" statt „Sichtung" sagt.
		await expect(page.getByText(/Damit Ihre Meldung .*gespeichert und genutzt/i)).toBeVisible();
		await expect(
			page.getByText(/Ohne diese Zustimmung kann Ihre Meldung nicht gespeichert werden/i)
		).toBeVisible();

		// Der Ankreuztext zur Gerätespeicherung sagt dasselbe wie der Absatz
		// darüber; vorher stand hier „bei zukünftigen Sichtungsmeldungen"
		// unmittelbar unter „bei zukünftigen Meldungen".
		await expect(
			page.getByText(/bei zukünftigen Meldungen automatisch zu verwenden/i)
		).toBeVisible();

		// Gegenprobe: keine alte Formulierung bleibt auf dem Schritt stehen.
		await expect(page.getByText('Bestätigung Ihrer Sichtungsmeldung')).toHaveCount(0);
		await expect(page.getByText(/Ihre Sichtung/)).toHaveCount(0);
		await expect(page.getByText(/Sichtungsmeldung/)).toHaveCount(0);
	});

	test('Erfolgsseite spricht durchgängig von der Meldung', async ({ page }) => {
		await page.route('**/api/sightings', (route) => {
			route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, id: 42, referenceId: 'REF-42' })
			});
		});

		const formPage = new FormPage(page);
		await formPage.goto();
		await gotoStep4(formPage, page);
		await fillStep4(formPage);
		await formPage.clickSubmit();

		await expect(page.getByRole('heading', { name: /Vielen Dank/i })).toBeVisible({
			timeout: 10000
		});

		await expect(page.getByText('Ihre Meldung wurde erfolgreich übermittelt')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Ihre Meldung' })).toBeVisible();
		await expect(page.getByText(/Ihre Meldung erscheint nach Prüfung/i)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Weitere Meldung abgeben' })).toBeVisible();

		// „Alle Sichtungen auf der Karte" bleibt bewusst stehen: dort steht das
		// Wort für die Daten, nicht für den Vorgang.
		await expect(page.getByRole('link', { name: /Alle Sichtungen auf der Karte/i })).toBeVisible();
	});
});
