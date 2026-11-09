import { expect, test, type Locator, type Page } from '@playwright/test';
import { FormPage } from './pages/FormPage';
import { fillStep1, fillStep4, waitForNextEnabled } from './helpers/form-helpers';

const HELP_TITLE = 'Hilfe & Tipps für eine wertvolle Meldung';

/**
 * Der Hilfeblock gehört auf die Einstiegsseite und ins Formular, und zwar als
 * EINE Instanz in `+page.svelte`: Nur dann überlebt sein Auf-/Zu-Zustand den
 * Wechsel zwischen beiden. Die Erfolgsseite trägt ihn nicht (geprüft unten im
 * Absende-Test von B2/B3).
 */
test.describe('Hilfeblock auf Einstiegsseite und im Formular', () => {
	const helpDetails = (page: Page): Locator =>
		page.locator('details').filter({ has: page.locator('summary', { hasText: HELP_TITLE }) });

	test('steht auf der Einstiegsseite unter beiden Karten und ist zugeklappt', async ({ page }) => {
		await page.goto('/');

		const help = page.getByText(HELP_TITLE);
		await expect(help).toBeVisible();

		const helpBox = await help.boundingBox();
		for (const testId of ['report-kind-option-lebend', 'report-kind-option-totfund']) {
			const card = await page.getByTestId(testId).boundingBox();
			expect(card, `Karte ${testId} hat keine Box`).not.toBeNull();
			expect(helpBox!.y, `Hilfeblock steht nicht unter ${testId}`).toBeGreaterThanOrEqual(
				card!.y + card!.height
			);
		}

		await expect(helpDetails(page)).toHaveJSProperty('open', false);
	});

	test('bleibt beim Wechsel von der Einstiegsseite ins Formular aufgeklappt', async ({ page }) => {
		await page.goto('/');
		// Vor dem Klick hydratisiert sein — sonst navigiert die Karte nativ über den
		// `href`, das Dokument wäre neu und der Zustand schon deshalb weg.
		await page.waitForLoadState('networkidle');

		await page.locator('summary', { hasText: HELP_TITLE }).click();
		await expect(helpDetails(page)).toHaveJSProperty('open', true);

		await page.getByTestId('report-kind-option-lebend').click();
		await expect(
			page.getByRole('heading', { name: 'Position & Zeitpunkt', exact: true })
		).toBeVisible();

		await expect(helpDetails(page)).toHaveJSProperty('open', true);
	});

	test('kommt im Formular genau einmal vor', async ({ page }) => {
		await page.goto('/?meldung=lebend');
		await expect(
			page.getByRole('heading', { name: 'Position & Zeitpunkt', exact: true })
		).toBeVisible();

		await expect(page.getByText(HELP_TITLE)).toHaveCount(1);
	});
});

test.describe('Einstiegsseite des Meldeformulars', () => {
	/**
	 * UX-Review (2026-08-07): Die Seite ist keine Radiogruppe mit „Weiter" mehr,
	 * sondern zwei Links. Der Zustand „bestätigt, ohne etwas gewählt zu haben" —
	 * und mit ihm der ganze Fehler-Apparat, den der vorherige Test hier prüfte —
	 * ist damit strukturell nicht mehr herstellbar.
	 *
	 * Was stattdessen zu sichern ist: Der Weg VOR der Hydration darf nicht ins
	 * Leere laufen. Er hängt jetzt allein am `href` — und zwar am serverseitig
	 * ausgelieferten, weshalb dieser Test bewusst NICHT auf `networkidle`
	 * wartet: Die Aussage gilt für das rohe SSR-Markup.
	 */
	test('Erstbesucher sieht die Auswahl, beide Karten tragen ihr Ziel im href', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('report-kind-choice')).toBeVisible();

		await expect(page.getByTestId('report-kind-option-lebend')).toHaveAttribute(
			'href',
			/[?&]meldung=lebend/
		);
		await expect(page.getByTestId('report-kind-option-totfund')).toHaveAttribute(
			'href',
			/[?&]meldung=totfund/
		);
	});

	/**
	 * Die Gegenprobe zum Test oben: Der `href` allein belegt nur, dass das Ziel
	 * dasteht — nicht, dass ein Melder ohne JS dort auch ankommt. Hier wird die
	 * Navigation tatsächlich gefahren, mit abgeschaltetem JavaScript.
	 */
	test('ohne JavaScript führt die Karte per Navigation in den richtigen Zweig', async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/');

		await page.getByTestId('report-kind-option-totfund').click();

		await expect(page).toHaveURL(/meldung=totfund/);
		// Ohne JS bleibt das Formular statisch, die serverseitig aufgelöste
		// Verzweigung ist aber sichtbar — Schritt 1 trägt im Totfund-Zweig
		// „Funddatum" statt „Datum und Uhrzeit".
		await expect(page.getByRole('heading', { name: 'Funddatum' })).toBeVisible();

		await context.close();
	});

	test('nach der Auswahl erscheint Schritt 1', async ({ page }) => {
		await page.goto('/');
		// Wie FormPage.goto(): Playwrights Actionability-Check wartet nur auf
		// Sichtbarkeit, nicht auf Hydration. Ein Klick davor navigiert nativ über
		// den `href` — der Melder käme zwar richtig an, aber über eine
		// Seitennavigation statt über den Klick-Pfad, den dieser Test prüfen soll.
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-totfund').click();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();
		// toBeHidden() allein wäre auch für ein gar nicht existentes Element
		// erfüllt — erst diese Zeile belegt, dass tatsächlich Schritt 1 da ist.
		await expect(page.getByRole('heading', { name: 'Position & Zeitpunkt' })).toBeVisible();
	});

	test('der Direktlink überspringt die Auswahl', async ({ page }) => {
		await page.goto('/?meldung=totfund');
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();
		await expect(page.getByRole('heading', { name: 'Position & Zeitpunkt' })).toBeVisible();
	});

	test('Totfund-Wahl kommt als isDead im Formular an', async ({ page }) => {
		// Der fachliche Zweck der ganzen Verzweigung: Die Auswahl auf der
		// Einstiegsseite muss als `isDead` im Formular ankommen, nicht nur
		// irgendeine Seite hinter der Auswahl anzeigen.
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-totfund').click();

		// Schritt 1: ohne GPS-Position ist die Ortsbeschreibung Pflicht.
		await page.getByTestId('field-waterway').fill('Kieler Bucht');
		await page.getByRole('button', { name: /Nächster Schritt/i }).click();

		// Schritt 2: Der Totfund-Block (`DeadAnimal.svelte`) rendert
		// ausschließlich innerhalb von `{#if isDeadFinding($form.isDead)}` —
		// sichtbar genau dann, wenn die Wahl „Totfund" tatsächlich als `isDead`
		// ankam.
		await expect(page.getByTestId('field-deadCondition')).toBeVisible();
	});

	test('Browser-Zurück führt auf die Auswahl, nicht aus der App', async ({ page }) => {
		// Ohne History-Eintrag verließe „Zurück" die Anwendung — im iframe
		// navigiert das die Museumsseite weg.
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-lebend').click();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();

		await page.goBack();
		await expect(page.getByTestId('report-kind-choice')).toBeVisible();

		// Browser-Vorwärts muss den Zweig aus der URL zurückholen — der
		// `popstate`-Handler ist bidirektional, nicht nur „kein Parameter →
		// Auswahl zeigen".
		await page.goForward();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();
		await expect(page.getByRole('heading', { name: 'Position & Zeitpunkt' })).toBeVisible();
	});

	test('Wiederkehrer mit gespeichertem Stand wird nicht erneut gefragt', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-lebend').click();
		await page.reload();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();
		await expect(page.getByRole('heading', { name: 'Position & Zeitpunkt' })).toBeVisible();
	});

	/**
	 * Review-Befund 2 (Task 7): Die Durchreich-Kette von `onchangekind` hatte
	 * keinen Test, der rot wird, wenn das Callback an irgendeiner Stelle nicht
	 * mehr weitergereicht wird. Dieser Test fährt die volle Strecke bis zum
	 * Klick — seit dem Umzug der Rückmeldung in die Aktionszeile ist die Kette
	 * `+page.svelte` → `ModernReportForm` → `FormActions`.
	 */
	test('„Ändern" auf Schritt 2 führt zurück auf die Auswahlseite', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-lebend').click();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();

		// Schritt 1 → Schritt 2, wie im Test „Totfund-Wahl kommt als isDead an".
		await page.getByTestId('field-waterway').fill('Kieler Bucht');
		await page.getByRole('button', { name: /Nächster Schritt/i }).click();
		await expect(page.getByText(/Sie melden/i)).toBeVisible();

		await page.getByRole('button', { name: /ändern/i }).click();

		await expect(page.getByTestId('report-kind-choice')).toBeVisible();
	});

	/**
	 * B6 (Abschlussreview, wichtig): Bis dahin gab es auf Schritt 1 keinen Weg
	 * zurück zur Auswahl — „Zurück" ist dort hart gesperrt, und die einzige
	 * Korrektur lag einen Schritt weiter, unterhalb der Upload-Karte. Genau auf
	 * Schritt 1 merkt ein Melder aber am ehesten, dass er falsch abgebogen ist
	 * („Funddatum" statt „Datum und Uhrzeit"). Die Rückmeldung stand seither am
	 * Kopf von Schritt 1 und sitzt inzwischen in der Aktionszeile unter dem
	 * Formular — sie gilt damit für alle vier Schritte, dieser eingeschlossen.
	 */
	test('„Ändern" auf Schritt 1 führt zurück auf die Auswahlseite (B6)', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-totfund').click();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();

		// Schon auf Schritt 1 sichtbar, ohne dass ein Feld ausgefüllt werden muss.
		await expect(page.getByRole('heading', { name: 'Funddatum' })).toBeVisible();
		await expect(page.getByText(/Fund eines toten Tieres/i)).toBeVisible();

		await page.getByRole('button', { name: /ändern/i }).click();

		await expect(page.getByTestId('report-kind-choice')).toBeVisible();
	});

	/**
	 * B7 (Abschlussreview, wichtig): „Ändern" tauschte den ganzen Formularbaum
	 * gegen die Auswahlseite aus, ohne den Fokus mitzunehmen — er fiel auf
	 * `<body>`, angesagt wurde nichts. `ReportKindChoice` fokussiert seither
	 * beim Rücksprung ihre Auswahlfrage, dieselbe Mechanik wie beim
	 * Schrittwechsel im Formular (`scrollAndFocusStep`).
	 *
	 * Bis zum Umbau auf Links war diese Frage eine `<legend>`; seither ist sie
	 * die `<h2>` über den beiden Karten. Die Rolle im Fokus-Muster ist
	 * unverändert.
	 */
	test('„Ändern" setzt den Fokus auf die Auswahlfrage (B7)', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-lebend').click();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();

		await page.getByRole('button', { name: /ändern/i }).click();

		const auswahlfrage = page.locator('#report-kind-question');
		await expect(auswahlfrage).toBeVisible();
		await expect(auswahlfrage).toBeFocused();
	});

	/**
	 * Review-Befund 1 (Task 7): `resolveReportKind` hat eine DRITTE Quelle
	 * neben Query-Parameter und gespeichertem Zweig — `isDead` aus den
	 * persistierten Formulardaten. `ModernReportForm` schreibt `isDead` bereits
	 * beim bloßen Öffnen des Formulars dorthin. Ein „Ändern", das nur den
	 * Query-Parameter und den gespeicherten Zweig räumt, fällt bei einem Reload
	 * über diese dritte Quelle sofort in den verlassenen Zweig zurück — bevor
	 * eine neue Auswahl getroffen wurde. Der Doc-Kommentar an `changeKind()`
	 * versprach das Gegenteil.
	 */
	test('„Ändern" hält auch nach einem Reload — die Auswahlseite bleibt stehen', async ({
		page
	}) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-totfund').click();
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();

		await page.getByTestId('field-waterway').fill('Kieler Bucht');
		await page.getByRole('button', { name: /Nächster Schritt/i }).click();
		await expect(page.getByText(/Sie melden/i)).toBeVisible();

		await page.getByRole('button', { name: /ändern/i }).click();
		await expect(page.getByTestId('report-kind-choice')).toBeVisible();

		await page.reload();
		// Der Server rendert die Auswahlseite bei jedem Reload ohnehin erst kurz
		// (er kennt `localStorage`/`sessionStorage` nicht) — die eigentliche
		// Aussage steckt im Zustand NACH der Hydration, wenn der Client die
		// Storage-Quellen nachträgt. Ohne das Warten bestünde der Test allein
		// durch diesen kurzen SSR-Flash, unabhängig vom eigentlichen Fehler.
		await page.waitForLoadState('networkidle');

		await expect(page.getByTestId('report-kind-choice')).toBeVisible();

		// `networkidle` sagt nur „keine Netzwerkaktivität mehr" — nicht „Svelte hat
		// hydratisiert". Die Zeile darüber bestünde deshalb auch dann, wenn
		// `networkidle` noch VOR der Hydration aufläuft (langsamerer Runner,
		// gecachte Module, andere Bundling-Strategie): Die statische
		// SSR-Auswahlseite steht testidentisch im DOM, egal ob Svelte sie schon
		// übernommen hat.
		//
		// Der Beleg war früher der Wechsel von `aria-disabled` am „Weiter"-Knopf,
		// danach die Fehlermeldung an der Radiogruppe — beides gibt es seit dem
		// Umbau auf Links (UX-Review 2026-08-07) nicht mehr. An ihre Stelle tritt
		// das Shallow Routing: Ein hydratisierter Klick fängt den Link ab und
		// wechselt per `pushState` in den Zweig, OHNE das Dokument neu zu laden —
		// die Markierung am `window` überlebt das. Ohne Hydration navigierte
		// derselbe Klick nativ über den `href`, und sie wäre weg.
		//
		// Dass diese Karte überhaupt noch klickbar ist, ist zugleich der
		// eigentliche Befund: Wäre der verlassene Zweig über `resolveReportKind`s
		// dritte Quelle zurückgekehrt, stünde hier längst das Formular.
		await page.evaluate(() => {
			(window as unknown as Record<string, unknown>).__vorDemKlick = true;
		});
		await page.getByTestId('report-kind-option-lebend').click();
		// Nicht auf Schritt 1 prüfen: `currentStep` kommt aus dem Storage, und
		// dieser Test war vor dem „Ändern" bereits auf Schritt 2 — das Formular
		// kehrt dorthin zurück. Die Aussage hier ist „die Auswahl ist durch", nicht
		// „ein bestimmter Schritt steht".
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();
		await expect(page.getByRole('navigation', { name: 'Formular-Schritte' })).toBeVisible();

		const dokumentUeberlebte = await page.evaluate(
			() => (window as unknown as Record<string, unknown>).__vorDemKlick === true
		);
		expect(dokumentUeberlebte).toBe(true);
	});
});

/**
 * B1 (Abschlussreview, kritisch): „Formular zurücksetzen" setzte den
 * Formular-Zustand auf `initialFormData` zurück (`isDead: false`) und räumte
 * per `clearStorage()` zwar `REPORT_KIND` weg — der Zweig-`$state` in
 * `+page.svelte` blieb davon aber unberührt. Die Auswahlseite erschien nie
 * wieder, Schritt 1/2 zeigten unbemerkt den Lebend-Wortlaut, und die Pflicht-
 * frage nach dem Zustand des toten Tieres verschwand ersatzlos — ein
 * Strandfund ließ sich nach dem Reset lautlos als Lebendsichtung absenden,
 * während die URL weiterhin `?meldung=totfund` trug.
 */
test.describe('„Formular zurücksetzen" kehrt zur Auswahl zurück (B1)', () => {
	test('nach dem Reset erscheint die Auswahlseite, nicht der verlassene Totfund-Zweig', async ({
		page
	}) => {
		await page.goto('/?meldung=totfund');
		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();

		await page.getByTestId('field-waterway').fill('Kieler Bucht');
		await page.getByRole('button', { name: /Nächster Schritt/i }).click();
		// Belegt, dass der Zweig zu diesem Zeitpunkt tatsächlich „dead" ist —
		// der Totfund-Block rendert ausschließlich dafür.
		await expect(page.getByTestId('field-deadCondition')).toBeVisible();

		await new FormPage(page).resetForm();

		await expect(page.getByTestId('report-kind-choice')).toBeVisible();
		// Ohne das holte ein Reload denselben verlassenen Zweig sofort zurück —
		// `resolveReportKind` gibt der URL Vorrang vor dem gespeicherten Stand.
		await expect(page).not.toHaveURL(/meldung=totfund/);

		// Gegenprobe gegen einen Rücksprung über die dritte Quelle
		// (`isDead` aus persistierten Formulardaten, siehe `resolveReportKind`):
		// Die Auswahl muss auch ein Reload überstehen.
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('report-kind-choice')).toBeVisible();
	});
});

/**
 * B2 (Abschlussreview, wichtig) + B3 (Abschlussreview, wichtig): Nach
 * erfolgreichem Absenden setzte „Weitere Meldung abgeben" nur
 * `submissionSuccess`/`submittedData` zurück — der Zweig-`$state` blieb
 * stehen, wer gerade einen Totfund gemeldet hatte, landete ungefragt wieder
 * im Totfund-Formular (B2). Unabhängig davon überlebte `REPORT_KIND` im
 * `localStorage` auch die Formulardaten selbst, die in `sessionStorage`
 * liegen — die Einstiegsfrage wurde pro Browser nur einmal gestellt, auch
 * Wochen später für ein anderes Tier (B3).
 */
test.describe('Nach dem Absenden verlässt der Zweig den Speicher, und „Weitere Meldung" fragt neu (B2, B3)', () => {
	test('Storage vergisst den Zweig sofort nach dem Absenden, „Weitere Meldung" zeigt die Auswahl', async ({
		page
	}) => {
		await page.route('**/api/sightings', (route) => {
			route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ success: true, id: 999, referenceId: 'REF-999' })
			});
		});

		const formPage = new FormPage(page);
		await formPage.goto('totfund');
		await fillStep1(formPage);
		await waitForNextEnabled(page);
		await formPage.clickNext();

		await formPage.selectSpecies(0);
		await formPage.fillTotalCount(1);
		// Kein `selectDistance`: Die Entfernung entfällt im Totfund-Zweig
		// vollständig (`HIDDEN_WHEN_DEAD`, UX-Review 2026-08-07).
		await formPage.selectSightingFrom(3); // Land
		await formPage.selectDeadCondition(1);
		await waitForNextEnabled(page);
		await formPage.clickNext();

		await formPage.skipStep(); // Schritt 3 ist optional
		await fillStep4(formPage);
		await formPage.clickSubmit();

		await expect(page.getByRole('heading', { name: /Vielen Dank/i })).toBeVisible({
			timeout: 10000
		});

		// Der Hilfeblock begleitet das Ausfüllen; die Erfolgsseite trägt ihn nicht.
		await expect(page.getByText(HELP_TITLE)).toHaveCount(0);

		// B3: Der gemerkte Zweig ist mit den Formulardaten aus dem Storage
		// verschwunden — nicht erst, wenn „Weitere Meldung" geklickt wird.
		const storedKind = await page.evaluate(() => sessionStorage.getItem('sichtungen_report_kind'));
		expect(storedKind).toBeNull();
		const persistedKind = await page.evaluate(() => localStorage.getItem('sichtungen_report_kind'));
		expect(persistedKind).toBeNull();

		// B2: Der In-Memory-Zweig in `+page.svelte` überlebt bis hierher trotzdem —
		// erst der Klick auf „Weitere Meldung" muss ihn im UI zurücksetzen.
		await page.getByRole('button', { name: /Weitere Meldung abgeben/i }).click();
		await expect(page.getByTestId('report-kind-choice')).toBeVisible();
		await expect(page).not.toHaveURL(/meldung=totfund/);
	});
});

/**
 * B5 (Abschlussreview, wichtig): Ohne `?meldung=` liefert der Server immer
 * die Auswahlseite aus — er kennt `sessionStorage` nicht. Ein Wiederkehrer,
 * dessen Zweig ausschließlich aus dem Storage aufgelöst wird (Lesezeichen auf
 * `/`, iframe-Reload der Elternseite auf meeresmuseum.de), sieht die
 * Auswahlseite deshalb bei jedem Reload kurz aufflackern, bevor die
 * Hydration den gespeicherten Zweig nachträgt. Der `$effect`, der den
 * aufgelösten Zweig in die URL nachträgt, macht daraus „nur beim ersten Mal
 * nach Verlust des Parameters" — das NÄCHSTE Reload löst dann bereits
 * serverseitig richtig auf.
 */
test.describe('Der aus dem Storage aufgelöste Zweig wird in die URL nachgetragen (B5)', () => {
	test('ein Reload ohne Parameter trägt den gespeicherten Zweig in die URL nach', async ({
		page
	}) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.getByTestId('report-kind-option-totfund').click();
		await expect(page).toHaveURL(/meldung=totfund/);

		// Simuliert einen Wiederkehrer in derselben Sitzung, dessen URL den
		// Parameter nicht (mehr) trägt — z. B. ein Lesezeichen auf die
		// bloße Startseite. `sessionStorage` bleibt dabei erhalten.
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/meldung=totfund/);
		await expect(page.getByTestId('report-kind-choice')).toBeHidden();
	});
});
