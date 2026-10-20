import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { get } from 'svelte/store';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchema = getSightingSchema();
import { getPublicBoatDriveOptions } from '#lib/report/formOptions/boatDrive.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import SightingDetails from './SightingDetails.svelte';

/**
 * Konditionale Pflichtfelder: `sightingFromText` und `boatDrive` sind im
 * Yup-Schema nur unter einer Bedingung Pflicht (`when('sightingFrom')`).
 * `FieldRenderer` leitet die Markierung aber aus `describe()` ab, und dort ist
 * ein `when()` nicht sichtbar — ohne den `required`-Override an `FormField`
 * zeigt das Feld weder Sternchen noch `aria-required`, obwohl „Weiter" daran
 * scheitert (design-system.md, „Formularfeld-Muster").
 *
 * **Die beiden Felder liegen dabei unterschiedlich:**
 *
 * - `boatDrive` ist in **beiden** Masken Pflicht, sobald von Segelschiff oder
 *   Motorboot gemeldet wird — `adminSightingSchema` lockert es nicht. Der
 *   Meldeformular-Zweig hat den Override seit `479ef33c`; der Admin-Zweig
 *   rendert unter derselben Bedingung und braucht ihn genauso.
 * - `sightingFromText` ist **nur im Meldeformular** Pflicht.
 *   `adminSightingSchema` baut das Feld ausdrücklich als `notRequired()` neu
 *   auf, weil 1.120 Bestandszeilen `vonwo = 0` ohne Freitext tragen. Ein
 *   unbedingtes `required={true}` wäre in der Admin-Maske also eine Lüge über
 *   die Validierung — der Override hängt hier an `adminMode`.
 */
function renderSightingDetails(
	overrides: Partial<SightingFormData> = {},
	props: { adminMode?: boolean } = {}
): void {
	renderWithFormContext(SightingDetails, { overrides, props });
}

/** Das Pflicht-Sternchen der Feld-Pipeline, auf ein Feld eingegrenzt. */
function requiredMark(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-field="${name}"] [aria-label="Pflichtfeld"]`);
}

function field(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-testid="field-${name}"]`);
}

describe('sections/SightingDetails — sightingFromText als konditionales Pflichtfeld', () => {
	it('markiert den Freitext im Meldeformular als Pflicht, wenn "Sonstiges" gewählt ist', () => {
		renderSightingDetails({ sightingFrom: SightingFromEnum.OTHER });

		expect(field('sightingFromText')).not.toBeNull();
		expect(requiredMark('sightingFromText')).not.toBeNull();
		expect(field('sightingFromText')?.getAttribute('aria-required')).toBe('true');
	});

	/**
	 * Der Gegenprobe-Fall: In der Admin-Maske gilt `adminSightingSchema`, dort
	 * ist der Freitext optional. Ein Sternchen würde hier eine Pflicht behaupten,
	 * die beim Speichern niemand prüft.
	 */
	it('markiert den Freitext in der Admin-Maske NICHT als Pflicht', () => {
		renderSightingDetails({ sightingFrom: SightingFromEnum.OTHER }, { adminMode: true });

		expect(field('sightingFromText')).not.toBeNull();
		expect(requiredMark('sightingFromText')).toBeNull();
		expect(field('sightingFromText')?.getAttribute('aria-required')).toBeNull();
	});
});

describe('sections/SightingDetails — boatDrive in der Admin-Maske', () => {
	it.each([
		['Segelschiff', SightingFromEnum.SAILBOAT],
		['Motorboot', SightingFromEnum.MOTORBOAT]
	])('markiert den Bootsantrieb bei "%s" als Pflicht', (_label, sightingFrom) => {
		renderSightingDetails({ sightingFrom }, { adminMode: true });

		expect(field('boatDrive')).not.toBeNull();
		expect(requiredMark('boatDrive')).not.toBeNull();
		expect(field('boatDrive')?.getAttribute('aria-required')).toBe('true');
	});

	/**
	 * Bei Land/Fähre/Sonstiges verlangt das Schema keinen Antrieb — der ganze
	 * Block rendert dann gar nicht, es kann also auch keine falsche Markierung
	 * stehenbleiben.
	 */
	it('zeigt den Bootsantrieb bei "Land" gar nicht erst', () => {
		renderSightingDetails({ sightingFrom: SightingFromEnum.LAND }, { adminMode: true });

		expect(document.querySelector('[data-field="boatDrive"]')).toBeNull();
	});
});

/**
 * Review-Befund 2 (Task 11, zweite Runde): Der „Land"-Test oben rendert
 * ausschließlich mit `adminMode: true` und stand außerdem selbst in dieser
 * Admin-Gruppe — „war schon vorher grün" belegte damit nur den Admin-Zweig.
 * `showsBoatDrive` (`isBoatSightingFrom`) kennt `adminMode` gar nicht,
 * trotzdem war der Bürger-Zweig bis hierhin ungetestet. Eigene Gruppe statt
 * eines weiteren Falls in „… in der Admin-Maske", damit der Name stimmt.
 */
describe('sections/SightingDetails — boatDrive im Meldeformular', () => {
	it('zeigt den Bootsantrieb bei "Land" auch im Meldeformular gar nicht erst', () => {
		renderSightingDetails({ sightingFrom: SightingFromEnum.LAND });

		expect(document.querySelector('[data-field="boatDrive"]')).toBeNull();
	});
});

/**
 * Gemeldet am 2026-08-06: „Motor lief" wählen und „Weiter" klicken habe die rohe
 * Yup-Meldung „Bootsantrieb must be a `number` type, but the final value was:
 * `NaN` (cast from the value `\"undefined\"`)" gezeigt. Nachstellen ließ sich das
 * am Bestand nicht — die Strecke war aber ungetestet, und zwar genau die, auf
 * der ein solcher Fehler entsteht.
 *
 * **Was hier anders geprüft wird als in `BaseRadio.svelte.test.ts`:** Dort steht
 * der Auswahl-Zustand (`checked`) bei vorgegebenem Wert. Der Weg in die
 * Gegenrichtung — Klick → `handleChange` → Formular-Store → Yup — kommt darin
 * nicht vor: Kein Test der Feld-Pipeline klickt. Ein `onchange`, das
 * `FieldRenderer` für Radiogruppen nicht mehr durchreicht, bliebe damit
 * unbemerkt, obwohl der Melder danach vor einem gesperrten „Weiter" säße.
 *
 * Der Umweg über den String ist dabei kein Testartefakt, sondern der
 * Produktivpfad: `createForm.handleChange` liest `target.value`, legt also einen
 * String in den Store, und erst Yup castet ihn zurück zur Zahl.
 */
describe('sections/SightingDetails — der gewählte Antrieb übersteht den Weg zur Validierung', () => {
	// Nur die beiden Felder, um die es geht: `boatDrive` hängt über
	// `when('sightingFrom')` an der Herkunft, alles Weitere des Schritts wäre
	// hier Beiwerk.
	const antriebsSchema = sightingSchema.pick(['sightingFrom', 'boatDrive']);

	it.each(getPublicBoatDriveOptions().map((option) => [option.label, option.value] as const))(
		'„%s" landet als validierbare Zahl im Formular-Store',
		async (label, erwartet) => {
			const { form } = renderWithFormContext(SightingDetails, {
				overrides: { sightingFrom: SightingFromEnum.MOTORBOAT }
			});

			await page.getByRole('radio', { name: label, exact: true }).click();

			const validiert = await antriebsSchema.validate(get(form));
			expect(validiert.boatDrive).toBe(erwartet);
		}
	);
});

/**
 * „Statt Sichtungsdetails ‚Funddetails' einfügen" — Wunsch des Museums für den
 * Totfund. Die Karte reagiert auf den Totfund-Schalter, der auf Schritt 2 über
 * ihr steht; die Zuordnung selbst liegt in `#lib/report/wording.js`.
 *
 * Gilt auch in der Admin-Maske: Dort kommt `isDead` aus dem geladenen
 * Datensatz, und ein Totfund heißt auch dort ein Fund.
 */
describe('sections/SightingDetails — Kartentitel folgt dem Totfund-Schalter', () => {
	it('heißt bei einer Sichtung „Sichtungsdetails"', () => {
		renderSightingDetails({ isDead: false });

		expect(document.body.textContent).toContain('Sichtungsdetails');
	});

	it('heißt beim Totfund „Funddetails"', () => {
		renderSightingDetails({ isDead: true });

		const text = document.body.textContent ?? '';
		expect(text).toContain('Funddetails');
		expect(text).not.toContain('Sichtungsdetails');
	});

	// Gegenprobe über die Admin-Maske: Der Titel hängt am Datensatz, nicht am
	// Modus — sonst führe die Sachbearbeitung einen Totfund unter „Sichtung".
	it('heißt beim Totfund auch in der Admin-Maske „Funddetails"', () => {
		renderSightingDetails({ isDead: true }, { adminMode: true });

		expect(document.body.textContent).toContain('Funddetails');
	});
});

/**
 * UX-Review 2026-08-07, Befund A: Die Karte hieß beim Totfund bereits
 * „Funddetails", das erste Feld darunter fragte aber weiter „Von wo aus wurde
 * die Sichtung gemacht?" — das Schema-Label kennt nur den Lebend-Zweig. Die
 * Zuordnung liegt wie alle Zweigtexte in `#lib/report/wording.js`.
 */
describe('sections/SightingDetails — die Herkunftsfrage folgt dem Zweig', () => {
	it('fragt im Lebend-Zweig unverändert nach der Sichtung', () => {
		renderSightingDetails({ isDead: false });

		expect(document.body.textContent).toContain('Von wo aus wurde die Sichtung gemacht?');
	});

	it('fragt beim Totfund nach dem Fund', () => {
		renderSightingDetails({ isDead: true });

		const text = document.body.textContent ?? '';
		expect(text).toContain('Von wo aus haben Sie das Tier gefunden?');
		expect(text).not.toContain('Von wo aus wurde die Sichtung gemacht?');
	});

	/**
	 * Anders als der Kartentitel bleibt die Feldbeschriftung in der Admin-Maske
	 * am Schema-Label: Dort wird ein Datensatz bearbeitet, nicht gemeldet — die
	 * Sachbearbeitung liest dieselbe Beschriftung wie im Export und in der
	 * Detailansicht.
	 */
	it('behält in der Admin-Maske auch beim Totfund das Schema-Label', () => {
		renderSightingDetails({ isDead: true }, { adminMode: true });

		expect(document.body.textContent).toContain('Von wo aus wurde die Sichtung gemacht?');
	});
});

/**
 * UX-Review 2026-08-07, Befund B: „Entfernung zum Tier" war auch beim Totfund
 * Pflichtfeld — wer am Strand neben dem Tier steht, kann die Frage nicht
 * beantworten und kam ohne geratene Kategorie nicht weiter. Die Markup-Hälfte
 * zur Aufnahme in `HIDDEN_WHEN_DEAD` (`formConfig.ts`); dieselbe Struktur wie
 * bei `deadSex` in `DeadAnimal.svelte`.
 */
describe('sections/SightingDetails — Entfernung entfällt beim Totfund', () => {
	it('zeigt die Entfernung im Lebend-Zweig', () => {
		renderSightingDetails({ isDead: false });

		expect(field('distance')).not.toBeNull();
	});

	it('zeigt die Entfernung beim Totfund gar nicht erst', () => {
		renderSightingDetails({ isDead: true });

		expect(document.querySelector('[data-field="distance"]')).toBeNull();
	});

	/**
	 * Die Admin-Maske muss die Entfernung an Totfund-Altbeständen weiter
	 * bearbeiten können — 282 Bestandszeilen tragen dort den Sentinel `0`
	 * („nicht angegeben", siehe `adminSightingSchema`).
	 */
	it('behält die Entfernung in der Admin-Maske auch beim Totfund', () => {
		renderSightingDetails({ isDead: true }, { adminMode: true });

		expect(field('distance')).not.toBeNull();
	});
});
