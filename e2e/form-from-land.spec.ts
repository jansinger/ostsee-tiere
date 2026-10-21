import { expect, test } from '@playwright/test';
import { FormPage } from './pages/FormPage';
import {
	fillStep1,
	fillStep4,
	expectCurrentStep,
	waitForNextEnabled
} from './helpers/form-helpers';

/**
 * Zwei Achsen blenden Felder aus: die Einstiegsseite (Sichtung/Totfund, siehe
 * `report-kind-choice.spec.ts`) und der Beobachtungsort `sightingFrom` auf
 * Schritt 2 — dieser hier. `getFormSteps` (Validierung) und die einzelnen
 * Sektionen (Rendering) sind bereits über Komponententests abgedeckt; diese
 * Datei fährt den Durchstich: das Formular im laufenden Browser, über mehrere
 * Schritte hinweg.
 *
 * Werte des `SightingFromEnum` (`formOptions/sightingFrom.ts`), wie in
 * `form-helpers.ts` per Kommentar statt Import benannt (kein Spec importiert
 * aus `#lib`): 0 Sonstiges, 1 Segelschiff, 2 Motorboot, 3 Land, 4 Fähre.
 */

/**
 * Minimal gültiger Schritt 2, mit frei wählbarem Beobachtungsort.
 *
 * `totfund: true` lässt die Entfernung aus: Sie entfällt seit dem UX-Review
 * 2026-08-07 im Totfund-Zweig vollständig (`HIDDEN_WHEN_DEAD` in
 * `formConfig.ts`) — ein `selectDistance` liefe dort in einen Timeout.
 */
async function fillStep2From(
	formPage: FormPage,
	sightingFrom: number,
	options: { totfund?: boolean } = {}
) {
	await formPage.selectSpecies(0); // Schweinswal
	await formPage.fillTotalCount(2);
	if (!options.totfund) {
		await formPage.selectDistance(1);
	}
	await formPage.selectSightingFrom(sightingFrom);
}

test.describe('Meldeformular — Beobachtung von Land', () => {
	test('Landmeldung blendet die eigenen Bootsangaben über das gesamte Formular aus', async ({
		page
	}) => {
		const formPage = new FormPage(page);
		await formPage.goto();
		await fillStep1(formPage);
		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Angaben zum Tier/i);

		// „Von wo" auf Land setzen — die Bootsfelder müssen im selben Schritt
		// verschwinden, ohne ihn ungültig zu machen. `fillStep2From` deckt auch
		// species/totalCount/distance ab — ohne sie bliebe „Weiter" unten wegen
		// der übrigen Pflichtfelder gesperrt, unabhängig vom Land-Verhalten.
		await fillStep2From(formPage, 3); // Land
		await expect(page.getByTestId('field-boatDrive-1')).toBeHidden();
		await expect(page.getByTestId('field-distance')).toBeVisible();

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Weitere Informationen/i);

		// Die ganze Boot-/Schiffskarte entfällt (BoatInfo.svelte), nicht nur ein
		// Feld darin — sonst stünde eine leere Karte mit Titel und Einleitung im
		// Formular.
		await expect(page.getByText('Boot-/Schiffsinformationen')).toBeHidden();
		// „Reaktion auf Sie oder Ihr Fahrzeug" ist für einen Landbeobachter
		// unbeantwortbar (Behavior.svelte); der Rest der Karte („Verhalten der
		// Tiere") bleibt.
		// Über die Rolle statt `getByText`: Der Kartentitel steht als `<h3>`,
		// derselbe Text kommt aber zusätzlich als Feld-Hilfetext und -Begründung
		// vor (`getByText` träfe dort auf drei Treffer statt einem).
		await expect(page.getByTestId('field-reaction')).toBeHidden();
		await expect(page.getByRole('heading', { name: 'Verhalten der Tiere' })).toBeVisible();
		// shipCount (Störungskontext) und die Umweltbedingungen betreffen NICHT
		// das eigene Boot und bleiben für Land-Melder stehen (Environment.svelte).
		await expect(page.getByTestId('field-shipCount')).toBeVisible();
		await expect(page.getByTestId('field-seaState')).toBeVisible();
		await expect(page.getByTestId('field-visibility')).toBeVisible();
		await expect(page.getByTestId('field-windForce')).toBeVisible();

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Kontaktdaten/i);

		// Eine Einwilligung, einen Schiffsnamen zu veröffentlichen, den nie
		// jemand erhoben hat, ist eine Frage ohne Bezugsgegenstand.
		await expect(page.getByTestId('field-shipNameConsent')).toBeHidden();
	});

	/**
	 * Die Gegenprobe aus dem Auftrag: `sightingFrom` ist `integer default(0)
	 * notNull`, und 0 bedeutet gleichzeitig „noch nicht beantwortet" UND
	 * „Sonstiges" (Kajak, SUP, Seebrücke — 713 von 1.833 Bestandszeilen nutzen
	 * genau das). Träfe die Land-Regel versehentlich auch hier, verlöre ein
	 * Kajak- oder SUP-Melder seine Bootsfelder, ohne je „Land" gewählt zu haben.
	 * `sightingFromText` wird bei „Sonstiges" selbst Pflicht (Schema-`when`) —
	 * ohne diese Zeile bliebe „Weiter" gesperrt und der Test bewiese nichts.
	 */
	test('Nur ein ausdrückliches „Land" blendet aus — bei „Sonstiges" bleiben die Bootsfelder sichtbar', async ({
		page
	}) => {
		const formPage = new FormPage(page);
		await formPage.goto();
		await fillStep1(formPage);
		await waitForNextEnabled(page);
		await formPage.clickNext();

		await fillStep2From(formPage, 0); // Sonstiges
		await formPage.fillSightingFromText('Seebrücke');

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Weitere Informationen/i);

		await expect(page.getByText('Boot-/Schiffsinformationen')).toBeVisible();
		await expect(page.getByTestId('field-shipName')).toBeVisible();
		await expect(page.getByTestId('field-homePort')).toBeVisible();
		await expect(page.getByTestId('field-boatType')).toBeVisible();
		await expect(page.getByTestId('field-reaction')).toBeVisible();

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Kontaktdaten/i);
		await expect(page.getByTestId('field-shipNameConsent')).toBeVisible();
	});

	/**
	 * Die knappste Kombination: Totfund entfernt `behavior`/`behaviorText`/
	 * `reaction`, Land zusätzlich die Boot-Karte. Auf Schritt 3 bleiben nur
	 * noch vier Felder — Anzahl anderer Schiffe, Seegang, Sichtweite,
	 * Windstärke. Der Schritt darf trotzdem nicht leer wirken, und der Melder
	 * muss bis zur Bestätigung durchkommen. Die API wird gemockt (wie in
	 * `form-submit.spec.ts` „Submit mit API-Mock") statt eine echte Zeile in
	 * die geteilte lokale DB zu schreiben.
	 */
	test('Totfund von Land: Schritt 3 bleibt mit vier Feldern nutzbar, der Melder kommt durch', async ({
		page
	}) => {
		await page.route('**/api/sightings', (route) => {
			route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, id: 4242, referenceId: 'REF-4242' })
			});
		});

		const formPage = new FormPage(page);
		await formPage.goto('totfund');
		await fillStep1(formPage);
		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Angaben zum Tier/i);

		await fillStep2From(formPage, 3, { totfund: true }); // Land
		// Die Entfernung entfällt im Totfund-Zweig ganz — am Strand steht der
		// Melder neben dem Tier (UX-Review 2026-08-07).
		await expect(page.getByTestId('field-distance')).toHaveCount(0);
		// Pflicht bei Totfund (Schema: deadCondition.when('isDead', …)); ohne
		// diese Angabe bleibt „Weiter" gesperrt.
		await formPage.selectDeadCondition(1); // Extrem frisch

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Weitere Informationen/i);

		// Die Behavior-Karte (Totfund) und die Boot-Karte (Land) fehlen beide
		// vollständig — nicht nur einzelne Felder darin.
		await expect(page.getByRole('heading', { name: 'Verhalten der Tiere' })).toBeHidden();
		await expect(page.getByText('Boot-/Schiffsinformationen')).toBeHidden();

		// Die verbleibenden vier Felder tragen den Schritt weiterhin.
		await expect(page.getByTestId('field-shipCount')).toBeVisible();
		await expect(page.getByTestId('field-seaState')).toBeVisible();
		await expect(page.getByTestId('field-visibility')).toBeVisible();
		await expect(page.getByTestId('field-windForce')).toBeVisible();

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Kontaktdaten/i);
		await fillStep4(formPage);

		await formPage.clickSubmit();
		await expect(page.getByRole('heading', { name: /Vielen Dank/i })).toBeVisible({
			timeout: 10000
		});
	});

	/**
	 * Der Weg, den `ModernReportForm.svelte` (Zeile ~203–225) explizit gegen
	 * einen verworfenen ersten Ansatz absichert: Ausblenden geschieht am
	 * Absende-Rand (`omitFields` auf das Submit-Objekt), NICHT indem `$form`
	 * selbst geleert wird. Ein Melder, der versehentlich auf „Land" stellt und
	 * zurückwechselt, muss seinen getippten Schiffsnamen wiederfinden.
	 */
	test('Wer aus Versehen auf Land stellt und zurückwechselt, findet den eingetippten Schiffsnamen wieder', async ({
		page
	}) => {
		const formPage = new FormPage(page);
		await formPage.goto();
		await fillStep1(formPage);
		await waitForNextEnabled(page);
		await formPage.clickNext();

		await fillStep2From(formPage, 1); // Segelschiff — zeigt boatDrive UND die Boot-Karte
		await formPage.selectBoatDrive(1); // Motor lief
		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Weitere Informationen/i);

		await formPage.fillShipName('MS Seelöwe');

		// Zurück auf Schritt 2 und (versehentlich) auf Land umstellen.
		await formPage.clickPrevious();
		await expectCurrentStep(page, /Angaben zum Tier/i);
		await formPage.selectSightingFrom(3); // Land
		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expect(page.getByText('Boot-/Schiffsinformationen')).toBeHidden();

		// … und wieder zurück zu Segelschiff. `boatDrive` hat einen EIGENEN
		// Reset-Mechanismus (`boatDriveReset.ts`) und wurde beim ersten Wechsel
		// auf Land bereits geleert — anders als `shipName` also erneut nötig,
		// sonst bleibt „Weiter" wegen des jetzt wieder Pflichtfelds gesperrt.
		await formPage.clickPrevious();
		await formPage.selectSightingFrom(1); // Segelschiff
		await formPage.selectBoatDrive(1); // Motor lief
		await waitForNextEnabled(page);
		await formPage.clickNext();

		// Der Schiffsname ist noch da — `$form` wurde beim Umschalten auf „Land"
		// nie geleert, nur die Anzeige war zwischendurch ausgeblendet.
		await expect(page.getByTestId('field-shipName')).toHaveValue('MS Seelöwe');
	});

	/**
	 * Der wertvollste Test in diesem Task: Der Weg von oben lässt sich per UI
	 * nicht direkt belegen — eine ausgeblendete Karte zeigt ihren Inhalt nicht
	 * mehr an. Beweisbar ist er nur an der tatsächlich abgesendeten Anfrage.
	 * `page.route` fängt sie ab (wie in `form-submit.spec.ts`), `postDataJSON()`
	 * liest den vom Client tatsächlich gesendeten JSON-Body — genau das Objekt,
	 * das `ModernReportForm.svelte`s `onSubmit` nach `omitFields(...,
	 * OWN_VESSEL_FIELDS)` an `submitSightingForm` übergibt.
	 */
	test('Land-Meldung entfernt die eigenen Bootsangaben aus der Absende-Anfrage', async ({
		page
	}) => {
		const formPage = new FormPage(page);
		await formPage.goto();
		await fillStep1(formPage);
		await waitForNextEnabled(page);
		await formPage.clickNext();

		await fillStep2From(formPage, 1); // Segelschiff, damit boatDrive/BoatInfo überhaupt existieren
		await formPage.selectBoatDrive(1); // Motor lief
		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Weitere Informationen/i);

		await formPage.fillShipName('MS Seelöwe');
		await formPage.fillHomePort('Kiel');
		await formPage.fillReaction('neugierig genähert');

		await formPage.clickPrevious();
		await expectCurrentStep(page, /Angaben zum Tier/i);
		await formPage.selectSightingFrom(3); // Land
		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Weitere Informationen/i);

		await waitForNextEnabled(page);
		await formPage.clickNext();
		await expectCurrentStep(page, /Kontaktdaten/i);
		await fillStep4(formPage);

		let capturedBody: Record<string, unknown> | undefined;
		await page.route('**/api/sightings', (route) => {
			capturedBody = route.request().postDataJSON() as Record<string, unknown>;
			route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, id: 4243, referenceId: 'REF-4243' })
			});
		});

		await formPage.clickSubmit();
		await expect(page.getByRole('heading', { name: /Vielen Dank/i })).toBeVisible({
			timeout: 10000
		});

		expect(capturedBody).toBeDefined();
		// Was der Beobachtungsort ausblendet, geht nicht mit — seit dem
		// 2026-08-07 entscheidet das einheitlich `hiddenFormFields`
		// (formConfig.ts) statt der früheren Teilliste `OWN_VESSEL_FIELDS`.
		// `boatDrive` steht deshalb jetzt mit in der Prüfung: Vorher war es
		// ausgenommen, weil `shouldResetBoatDrive` (`boatDriveReset.ts`) es
		// beim Wechsel weg vom Boot ohnehin im `$form`-Zustand leert. Das
		// bleibt richtig und ist der Grund, warum hier nichts anderes
		// herauskommt als vorher — verlassen wird sich darauf aber nicht mehr.
		expect(capturedBody?.boatType).toBeUndefined();
		expect(capturedBody?.shipName).toBeUndefined();
		expect(capturedBody?.homePort).toBeUndefined();
		expect(capturedBody?.shipNameConsent).toBeUndefined();
		expect(capturedBody?.reaction).toBeUndefined();
		expect(capturedBody?.boatDrive).toBeUndefined();

		// Der Beobachtungsort selbst geht weiterhin mit — nur die vom Boot
		// abhängigen Felder entfallen.
		expect(capturedBody?.sightingFrom).toBe(3);
	});
});
