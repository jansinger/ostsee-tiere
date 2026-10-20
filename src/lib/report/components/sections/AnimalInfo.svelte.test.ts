import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import AnimalInfo from './AnimalInfo.svelte';

/**
 * PR 2, Teil a (docs/MEERESMUSEUM_FORMULAR_PLAN_2026-08-04.md): „Totfund erstmal
 * so lassen, aber prominenter platzieren" — `isDead` rückt an die erste Stelle
 * der Karte „Tierinformationen", der Totfund-Detailblock (`DeadAnimal`) folgt
 * unmittelbar darauf, statt am Ende der Karte zu stehen (heute: drei Felder von
 * seinem Auslöser entfernt).
 *
 * DOM-Reihenfolge statt Pixel-Position: `FormField` wraps jedes Feld in
 * `<div data-field={name}>` (siehe FormField.svelte:77) — dieselben Attribute,
 * die `e2e/form-ux.spec.ts` schon für die Sichtbarkeit abfragt
 * (`[data-field="deadCondition"]`). `querySelectorAll('[data-field]')` liefert
 * damit die tatsächliche Render-Reihenfolge ohne Layout-Messung; das ist
 * robuster als `compareDocumentPosition` an zwei Einzelknoten, weil es die
 * volle Kette auf einmal prüft und bei einer Regression eine lesbare
 * Namensliste statt einer Bitmaske liefert.
 *
 * Seit Task 7 (Einstiegsseite ersetzt den Schalter im Meldeformular) gilt
 * diese Reihenfolgeaussage nur noch in der Admin-Maske — dort ist `isDead`
 * weiterhin ein echtes Bedienelement. Der Wrapper rendert deshalb per Default
 * mit `adminMode`, statt zwei Kopien mit und ohne Schalter zu pflegen.
 */
function renderAnimalInfo(overrides: Partial<SightingFormData> = {}, adminMode = true): void {
	renderWithFormContext(AnimalInfo, { overrides, props: { adminMode } });
}

function fieldOrder(): string[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[data-field]')).map(
		(el) => el.dataset.field ?? ''
	);
}

/**
 * Modul-Ebene statt lokal in einem `describe`, damit sowohl der Admin- als
 * auch der Melder-Pfad (Review-Befund 5) denselben Helfer nutzen — keine
 * zweite Kopie pflegen.
 */
function speciesLabel(): string {
	const field = document.querySelector<HTMLElement>('[data-field="species"]');
	if (!field) throw new Error('Feld "species" nicht im DOM');
	return field.querySelector('label')?.textContent ?? '';
}

/**
 * Modul-Ebene statt lokal in einem `describe`, damit sowohl die
 * adminMode-Weiterreichungs-Tests unten als auch die Totfund-Schalter-Tests
 * (PR 2, Teil c) denselben Wrapper nutzen — keine zweite Kopie pflegen.
 */
function renderWithAdminMode(adminMode: boolean): void {
	renderWithFormContext(AnimalInfo, {
		overrides: { isDead: true, deadCondition: 1 },
		props: { adminMode }
	});
}

describe('sections/AnimalInfo — Totfund prominent platziert (PR 2, Teil a)', () => {
	it('rendert isDead als allererstes Feld der Karte — auch ohne Totfund', () => {
		renderAnimalInfo({ isDead: false });

		expect(fieldOrder()[0]).toBe('isDead');
	});

	it('rendert isDead im DOM vor species', () => {
		renderAnimalInfo({ isDead: false });

		const order = fieldOrder();
		expect(order.indexOf('isDead')).toBeLessThan(order.indexOf('species'));
	});

	it('rendert bei isDead=true den Totfund-Detailblock unmittelbar nach dem Schalter', () => {
		renderAnimalInfo({ isDead: true, deadCondition: 1 });

		const order = fieldOrder();
		const isDeadIndex = order.indexOf('isDead');

		// "Unmittelbar" heißt: das direkt folgende Feld gehört zu DeadAnimal
		// (deadCondition ist dort das erste gerenderte Feld) — nicht species
		// oder totalCount, die heute dazwischenstehen.
		expect(order[isDeadIndex + 1]).toBe('deadCondition');
	});

	it('rendert den Totfund-Detailblock NICHT mehr am Ende der Karte', () => {
		renderAnimalInfo({ isDead: true, deadCondition: 1 });

		const order = fieldOrder();
		// deadPhoneContact ist das letzte Feld von DeadAnimal. Stünde der Block
		// weiterhin am Kartenende (heutiger Stand), kämen species/totalCount
		// VOR ihm. Nach der Umsortierung müssen sie NACH dem Block folgen.
		const lastDeadAnimalField = order.indexOf('deadPhoneContact');
		expect(order.indexOf('species')).toBeGreaterThan(lastDeadAnimalField);
		expect(order.indexOf('totalCount')).toBeGreaterThan(lastDeadAnimalField);
	});

	it('lässt species und die Zähler-Felder in ihrer bisherigen Reihenfolge', () => {
		renderAnimalInfo({ isDead: false });

		const order = fieldOrder();
		expect(order.indexOf('species')).toBeLessThan(order.indexOf('totalCount'));
		expect(order.indexOf('totalCount')).toBeLessThan(order.indexOf('juvenileCount'));
	});
});

/**
 * „Welche Tierart haben Sie gefunden?" — Wunsch des Museums für den Totfund.
 * Das Artfeld liegt in derselben Karte wie der Totfund-Schalter und kann ihm
 * deshalb folgen; die Zuordnung selbst steht in `#lib/report/wording.js`.
 *
 * Geprüft wird das gerenderte `<label>`, nicht das Schema-`.label()`: Der
 * Wortlaut kommt hier über den `label`-Override an `FormField` (derselbe Weg,
 * den PR 4 für den Bootsantrieb gebaut hat), das Schema bleibt unverändert.
 */
describe('sections/AnimalInfo — Artfrage folgt dem Totfund-Schalter', () => {
	it('fragt bei einer Sichtung, was gesehen wurde', () => {
		renderAnimalInfo({ isDead: false });

		expect(speciesLabel()).toContain('Welche Tierart haben Sie gesehen?');
	});

	it('fragt beim Totfund, was gefunden wurde', () => {
		renderAnimalInfo({ isDead: true, deadCondition: 1 });

		expect(speciesLabel()).toContain('Welche Tierart haben Sie gefunden?');
	});
});

/**
 * `adminMode` wird von `AnimalInfo` nur durchgereicht (PR 2, Teil b) — die
 * Fach-Entscheidung, ob `deadSex` erscheint, trifft `DeadAnimal` selbst
 * (siehe DeadAnimal.svelte.test.ts). Hier wird nur die Weitergabe geprüft,
 * analog zu OptionalSightingDetails.svelte.test.ts / Location.svelte.test.ts.
 */
describe('sections/AnimalInfo — adminMode wird an DeadAnimal durchgereicht', () => {
	it('zeigt deadSex NICHT ohne adminMode', () => {
		renderWithAdminMode(false);

		expect(document.querySelector('[data-testid="field-deadSex"]')).toBeNull();
	});

	it('zeigt deadSex MIT adminMode={true}', () => {
		renderWithAdminMode(true);

		expect(document.querySelector('[data-testid="field-deadSex"]')).not.toBeNull();
	});
});

/**
 * Die Einstiegsseite („Was möchten Sie melden?") beantwortet Sichtung/Totfund
 * bereits vor dem Formular. Der Totfund-Schalter auf Schritt 2 würde dieselbe
 * Frage ein zweites Mal stellen — mit dem Risiko, dass beide Antworten
 * auseinanderlaufen. Im Meldeformular (adminMode=false) entfällt er deshalb.
 * Die Rückmeldung „Sie melden: … · [Ändern]", die hier an seine Stelle getreten
 * war, steht seit dem Umzug in die Aktionszeile unter dem Formular
 * (`form/FormActions.svelte`, dort getestet) — oben kostete sie Platz, obwohl
 * sie keine Eingabe ist. In der Admin-Maske (adminMode=true) gibt es keine
 * Einstiegsseite — der Schalter bleibt dort das einzige Bedienelement, mit dem
 * eine Bearbeiterin den Status korrigieren kann.
 */
describe('AnimalInfo — Totfund-Schalter', () => {
	it('zeigt im Meldeformular weder Schalter noch Rückmeldung', async () => {
		renderWithAdminMode(false);
		expect(document.body.textContent).not.toContain('Sie melden');
		await expect.element(page.getByTestId('field-isDead')).not.toBeInTheDocument();
	});

	it('behält den Schalter in der Admin-Maske', async () => {
		// Dort kommt isDead aus dem Datensatz, es gibt keine Einstiegsseite —
		// ohne Schalter könnten Admins den Status nicht mehr korrigieren.
		renderWithAdminMode(true);
		await expect.element(page.getByTestId('field-isDead')).toBeInTheDocument();
	});
});

/**
 * Review-Befund 3 (Task 7): `{#if $form.isDead}` unter der Rückmeldung steuerte
 * den Totfund-Detailblock (`DeadAnimal`) weiter per rohem JS-Truthiness — drei
 * Zeilen unter der Stelle, die für genau diesen Wert bereits `isDeadFinding`
 * nutzt und „lebend" ausgibt. Für `isDead: '0'` widersprachen sich Rückmeldung
 * („lebend", siehe Test oben) und Detailblock (rendert trotzdem) sichtbar.
 */
describe('AnimalInfo — Totfund-Detailblock folgt derselben Normalisierung (Review-Befund 3)', () => {
	it('blendet den Totfund-Detailblock trotz truthy String "0" aus', () => {
		renderAnimalInfo({ isDead: '0' as unknown as boolean }, false);

		expect(document.querySelector('[data-testid="field-deadCondition"]')).toBeNull();
	});
});

/**
 * Review-Befund 5 (Task 7): Der Wrapper `renderAnimalInfo` rendert per Default
 * mit `adminMode={true}`, seit der Totfund-Schalter dort das echte
 * Bedienelement bleibt (siehe Kommentar an `renderAnimalInfo` oben). Die
 * Gruppen „Totfund prominent platziert" und „Artfrage folgt dem
 * Totfund-Schalter" testen seither ausschließlich den Admin-Pfad — für das
 * Meldeformular (`adminMode=false`, der fachlich gemeinte Weg) deckte danach
 * kein Test mehr ab, dass species/totalCount/juvenileCount in der richtigen
 * Reihenfolge stehen und der Totfund-Detailblock progressiv erscheint.
 *
 * Im Meldeformular gibt es keinen `isDead`-Schalter mehr, an dem sich „davor"/
 * „danach" festmachen ließe — der Detailblock ist dort schlicht das erste
 * Feld der Karte, wenn er erscheint.
 */
describe('sections/AnimalInfo — Feldreihenfolge und progressive Anzeige im Meldeformular (Review-Befund 5)', () => {
	it('rendert den Totfund-Detailblock bei einem Totfund als erstes Feld', () => {
		renderAnimalInfo({ isDead: true, deadCondition: 1 }, false);

		expect(fieldOrder()[0]).toBe('deadCondition');
	});

	it('blendet den Totfund-Detailblock bei einer Sichtung komplett aus', () => {
		renderAnimalInfo({ isDead: false }, false);

		const order = fieldOrder();
		expect(order).not.toContain('deadCondition');
		expect(order[0]).toBe('species');
	});

	it('lässt species und die Zähler-Felder in ihrer bisherigen Reihenfolge', () => {
		renderAnimalInfo({ isDead: false }, false);

		const order = fieldOrder();
		expect(order.indexOf('species')).toBeLessThan(order.indexOf('totalCount'));
		expect(order.indexOf('totalCount')).toBeLessThan(order.indexOf('juvenileCount'));
	});
});

/**
 * Review-Befund 5, Fortsetzung: dieselbe Lücke für die Artfrage — im
 * Admin-Pfad bereits durch „Artfrage folgt dem Totfund-Schalter" oben
 * abgedeckt, im Meldeformular seit Task 7 ungetestet.
 */
describe('sections/AnimalInfo — Artfrage im Meldeformular (Review-Befund 5)', () => {
	it('fragt bei einer Sichtung, was gesehen wurde', () => {
		renderAnimalInfo({ isDead: false }, false);

		expect(speciesLabel()).toContain('Welche Tierart haben Sie gesehen?');
	});

	it('fragt beim Totfund, was gefunden wurde', () => {
		renderAnimalInfo({ isDead: true, deadCondition: 1 }, false);

		expect(speciesLabel()).toContain('Welche Tierart haben Sie gefunden?');
	});
});
