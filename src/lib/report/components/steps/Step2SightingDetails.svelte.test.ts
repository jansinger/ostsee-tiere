import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import Step2SightingDetails from './Step2SightingDetails.svelte';

/**
 * Zwei Wünsche des Museums treffen sich auf diesem Schritt:
 *
 * 1. **Der Medien-Upload gehört hierher, vor die Tierangaben.** Er stand auf
 *    Schritt 3 unter dem prominenten „Schritt überspringen"-Knopf — wer den
 *    nutzte, sah die Foto-Frage nie. Und wer unsicher ist, welche Art er
 *    gesehen hat, soll das Bild hochladen können, bevor er sich auf eine Art
 *    festlegt. Das gilt nur für die DATEI-Felder (`mediaFile`/`mediaUpload`)
 *    — `mediaConsent` steht seit Task 14 (2026-08-05) nicht mehr auf diesem
 *    Schritt, sondern auf Schritt 4 bei den übrigen Einwilligungen
 *    (`Step4Contact.svelte.test.ts`).
 * 2. **Beim Totfund fragt der Kopf nach einem Fund, nicht nach einer
 *    Beobachtung.** Die Entscheidung dazu steht in `#lib/report/wording.js`.
 */
function renderStep2(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(Step2SightingDetails, { overrides });
}

describe('Step2SightingDetails — Medien-Upload vor den Tierangaben', () => {
	/**
	 * `mediaFile`/`mediaUpload` sind Buchführungsfelder ohne eigenes
	 * `FormField`-Rendering (die Dropzone schreibt sie programmatisch) — sie
	 * tragen deshalb kein `[data-field]` und taugen nicht als DOM-Anker. Der
	 * Auslöser des Datenschutz-Dialogs an der Dropzone (`UploadNotice.svelte`)
	 * ist unbedingt gerendert und dient hier als stellvertretender Anker für
	 * den Medien-Abschnitt.
	 */
	it('rendert den Medien-Abschnitt im DOM vor der Artauswahl', () => {
		renderStep2();

		const uploadTrigger = document.querySelector('[data-testid="upload-notice-trigger"]');
		const speciesField = document.querySelector('[data-field="species"]');
		expect(uploadTrigger).not.toBeNull();
		expect(speciesField).not.toBeNull();
		expect(
			uploadTrigger!.compareDocumentPosition(speciesField!) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	// Gegenprobe zu Task 14: Die Einwilligung selbst steht hier nicht mehr —
	// sie zog auf Schritt 4. Ohne diesen Test würde ein versehentliches
	// Zurückverschieben unbemerkt bleiben, weil `mediaFile` allein die
	// Reihenfolge schon erfüllt.
	it('rendert die Medien-Einwilligung hier nicht mehr', () => {
		renderStep2();

		expect(document.querySelector('[data-testid="field-mediaConsent"]')).toBeNull();
	});

	it('kündigt den Upload als optional an — der Schritt selbst ist Pflicht', () => {
		renderStep2();

		expect(document.body.textContent).toContain('Fotos/Videos hochladen (optional)');
	});
});

describe('Step2SightingDetails — Ansprache bei Sichtung und Totfund', () => {
	it('fragt bei einer Sichtung nach der Beobachtung', () => {
		renderStep2({ isDead: false });

		expect(document.body.textContent).toContain('Was haben Sie beobachtet?');
	});

	it('fragt beim Totfund nach dem Fund', () => {
		renderStep2({ isDead: true, deadCondition: 1 });

		expect(document.body.textContent).toContain('Was haben Sie gefunden?');
		expect(document.body.textContent).not.toContain('Was haben Sie beobachtet?');
	});

	// Der Rest des Einleitungstextes ist für beide Fälle richtig und bleibt
	// unverändert — er nennt Tierart und Anzahl, nicht den Vorgang.
	it('behält den Hinweis auf Tierart und Anzahl in beiden Fällen', () => {
		renderStep2({ isDead: true, deadCondition: 1 });

		expect(document.body.textContent).toContain('Tierart und Anzahl');
	});
});

/**
 * Der „Ändern"-Knopf stand bis zum Umzug in `AnimalInfo` und wurde über diesen
 * Schritt durchgereicht. Er sitzt jetzt in der Aktionszeile unter dem Formular
 * (`form/FormActions.svelte`, dort getestet) — die Durchreich-Kette endet damit
 * bei `ModernReportForm`, und `Step2SightingDetails` kennt `onchangekind` nicht
 * mehr.
 */
describe('Step2SightingDetails — kein „Ändern"-Knopf mehr im Schritt', () => {
	it('rendert die Rückmeldung nicht', () => {
		renderStep2({ isDead: true });

		expect(document.body.textContent).not.toContain('Sie melden');
		expect(document.querySelector('[data-testid="report-kind-change"]')).toBeNull();
	});
});
