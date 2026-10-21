import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import Media from './Media.svelte';

/**
 * Die Medien-Einwilligung ist eine Aussage der meldenden Person, kein Attribut
 * des Datensatzes. Ein Admin kann sie deshalb nicht stellvertretend erteilen —
 * und ein Häkchen, das er setzen kann, hätte auch keinen Nachweis: Der
 * Zeitstempel würde die Bearbeitungszeit tragen und damit eine Zustimmung
 * behaupten, die nie stattgefunden hat.
 *
 * Im Admin-Formular bleibt das Feld deshalb HIER sichtbar (der Zustand ist für
 * die Sachbearbeitung relevant), aber gesperrt. Im öffentlichen Formular
 * rendert diese Komponente das Feld seit Task 14 (2026-08-05) NICHT mehr — es
 * steht dort auf Schritt 4 bei den übrigen Einwilligungen
 * (`steps/Step4Contact.svelte.test.ts` deckt die Bedienbarkeit dort ab), weil
 * die Admin-Maske `Step4Contact.svelte` nicht einbindet und das Feld sonst aus
 * ihr verschwände.
 */
function renderMedia(props: { adminMode?: boolean } = {}): void {
	renderWithFormContext(Media, { props });
}

function consentInput(): HTMLInputElement {
	const element = document.querySelector<HTMLInputElement>('[data-testid="field-mediaConsent"]');
	if (!element) throw new Error('Feld "mediaConsent" nicht im DOM');
	return element;
}

describe('Media — Einwilligung zur Veröffentlichung', () => {
	it('rendert das Feld im öffentlichen Formular nicht mehr — es steht seit Task 14 auf Schritt 4', () => {
		renderMedia();

		expect(document.querySelector('[data-testid="field-mediaConsent"]')).toBeNull();
	});

	it('ist im Admin-Formular gesperrt', () => {
		renderMedia({ adminMode: true });

		expect(consentInput().disabled).toBe(true);
	});

	it('zeigt im Admin-Formular weiterhin den Zustand an', () => {
		// Sperren heißt nicht verstecken — die Sachbearbeitung muss sehen, ob
		// eine Veröffentlichung erlaubt ist.
		renderMedia({ adminMode: true });

		expect(consentInput()).toBeTruthy();
	});

	it('begründet die Sperre sichtbar', () => {
		// Der Grund darf nicht nur in einem `title` stecken: An einem
		// `disabled`-Element ist der per Tastatur nicht erreichbar.
		renderMedia({ adminMode: true });

		expect(document.body.textContent).toMatch(/meldende|melderin|melder|betroffene/i);
	});
});

/**
 * Der Einleitungstext folgt der Fassung des Museums — mit einer bewussten
 * Auslassung.
 *
 * Das Dokument schlägt vor: „Mit dem Hochladen Ihrer Fotos stimmen Sie deren
 * Speicherung durch das Deutsche Meeresmuseum zu." Genau das steht schon an
 * jeder Dropzone, und zwar genauer: `UPLOAD_NOTICE` nennt die sofortige
 * Übertragung, die Zweckbindung auf die fachliche Prüfung, die automatische
 * Löschung nicht abgeschickter Meldungen und die spätere eigene Entscheidung
 * über eine Veröffentlichung. Eine zweite, kürzere Fassung daneben wäre keine
 * Zusammenfassung, sondern eine abweichende Aussage über denselben Vorgang —
 * dieselbe Begründung, aus der `UploadNotice.svelte` den vollen Wortlaut in
 * einem Dialog hält statt ihn zu kürzen.
 *
 * Übernommen sind deshalb Titel, Einladungssatz und der Verweis auf die
 * Einwilligung darunter. Die zweite Einwilligung („ausschließlich intern"),
 * die das Dokument zusätzlich vorsieht, ist bewusst nicht gebaut: Sie bräuchte
 * ein Schema-Feld, eine DB-Spalte und zwei Nachweisspalten. Ohne sie ist der
 * unangekreuzte Zustand die interne Nutzung — was `mediaConsent.valueText`
 * bereits sagt.
 */
describe('Media — Einleitungstext nach der Fassung des Museums', () => {
	it('kündigt den Abschnitt als optional an', () => {
		renderMedia();

		expect(document.body.textContent).toContain('Fotos/Videos hochladen (optional)');
	});

	it('lädt zum Hochladen ein', () => {
		renderMedia();

		expect(document.body.textContent).toMatch(/Sie können Aufnahmen zu Ihrer Meldung hochladen/i);
	});

	/**
	 * Auf einen Ausschnitt des neuen Satzes geprüft, nicht auf das Wort
	 * „Veröffentlichung" allein: Das steht bereits im Schema-Label von
	 * `mediaConsent` („Veröffentlichung meiner Aufnahmen"), ein Test darauf wäre
	 * auch ohne den neuen Absatz grün.
	 *
	 * Bis Task 14 (2026-08-05) verwies der Satz mit „Bitte wählen Sie unten
	 * aus …" auf das Feld direkt darunter. Die Einwilligung steht seither auf
	 * Schritt 4 — der Verweis musste mitziehen, sonst würde auf eine Auswahl
	 * verwiesen, die hier gar nicht mehr steht.
	 */
	it('verweist auf die Kontaktdaten, wo die Veröffentlichung entschieden wird', () => {
		renderMedia();

		expect(document.body.textContent).toMatch(/fragen wir Sie im Schritt Kontaktdaten/i);
	});

	/**
	 * Der Absatz gilt nur im Meldeformular. In der Admin-Maske hat der Verweis
	 * auf Schritt 4 keinen Sinn — die Admin-Maske kennt keine Schritte, und das
	 * Feld bleibt dort ohnehin bei der Dropzone stehen (gesperrt).
	 */
	it('zeigt den Verweis auf die Kontaktdaten nicht im Admin-Formular', () => {
		renderMedia({ adminMode: true });

		expect(document.body.textContent).not.toMatch(/fragen wir Sie im Schritt Kontaktdaten/i);
	});

	/**
	 * Der Kern der Auslassung: Der Einwilligungssatz gehört in den
	 * Datenschutzhinweis, nicht ein zweites Mal in den Fließtext. Bräche das
	 * auf, stünden zwei unterschiedlich formulierte Aussagen über die
	 * Speicherung im selben Abschnitt.
	 */
	it('behauptet keine Einwilligung durch das Hochladen selbst', () => {
		renderMedia();

		expect(document.body.textContent).not.toMatch(/Mit dem Hochladen .*stimmen Sie/i);
	});

	it('behält den Datenschutzhinweis an der Dropzone', () => {
		renderMedia();

		expect(document.querySelector('[data-testid="upload-notice-trigger"]')).not.toBeNull();
	});
});

/**
 * Dieser Abschnitt versprach bis zum 2026-08-04 an zwei Stellen eine
 * Positionsübernahme, die er nicht leistet: „Automatische Positionserkennung aus
 * Fotos" in der Vorteilsliste und „GPS-Daten werden beim Upload verarbeitet" als
 * Default-Zusatz aus `DropzoneEnhanced`.
 *
 * Eingelöst wird beides nicht: Die Dropzone hier läuft mit
 * `enableGPSExtraction={false}`, und `applyExifPosition` hängt in
 * `DropzoneEnhanced` am selben Wächter (`isPositionStep`). Die Koordinaten aus
 * Schritt 1 bleiben unberührt — GPS übernimmt ausschließlich `PositionPanel`.
 *
 * Geprüft wird deshalb die **Abwesenheit** der Zusage, nicht der neue Wortlaut:
 * Wie der Abschnitt seinen Nutzen beschreibt, darf das Museum jederzeit
 * umformulieren; dass er dabei keine Positionsübernahme behauptet, nicht. Das
 * Muster fängt bewusst die Sache und nicht den alten Satz — eine Assertion auf
 * dessen Wortlaut wäre grün, sobald jemand dasselbe Versprechen anders
 * formuliert.
 *
 * Den zweiten Satz deckt dieser Test NICHT ab, und der Versuch wäre eine Falle:
 * Die Dropzone hängt an `{#if uploadConfig}` und damit an `getUploadConfig()`,
 * das hier nie auflöst — eine Assertion auf ihren Zusatz wäre auch mit dem alten
 * Default grün (vorgeführt am 2026-08-04). Sie steht deshalb dort, wo sie beißt:
 * `DropzoneEnhanced.svelte.test.ts` → „Default-Zusatz verspricht kein GPS".
 */
describe('Media — keine Zusage einer Positionsübernahme', () => {
	it('kündigt keine automatische Positionserkennung an', () => {
		renderMedia();

		expect(document.body.textContent).not.toMatch(/automatisch\w*\s+Position/i);
	});

	/**
	 * Die Gegenprobe zu den beiden Verboten: Ohne sie wären sie auch dann grün,
	 * wenn der Abschnitt gar nichts mehr zu Metadaten sagt — und der Hinweis,
	 * dass die eigene Eingabe unangetastet bleibt, ist genau der Satz, der die
	 * Sorge „ein Foto überschreibt meine Position" ausräumt.
	 */
	it('sagt stattdessen, dass die eigene Positionsangabe unberührt bleibt', () => {
		renderMedia();

		expect(document.body.textContent).toMatch(/Schritt 1 bleiben davon unberührt/i);
	});
});
