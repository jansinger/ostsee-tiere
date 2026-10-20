import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import OptionalSightingDetails from './OptionalSightingDetails.svelte';

/**
 * `distribution` (Verteilung der Tiere) verlässt den Melde-Schritt `observations`
 * und bleibt nur in der **Admin-Maske**. Der Test hält denselben Präzedenzfall fest
 * wie `Location.svelte.test.ts`: In PR #669 hat eine Feld-Entfernung im
 * Meldeformular der Admin-Maske drei Felder mit weggenommen, weil beide dieselbe
 * Komponente teilten — hier ist es dieselbe Komponente (`OptionalSightingDetails`),
 * die per `adminMode`-Flag unterscheidet. Die Admin-Maske braucht das Feld, um den
 * kompletten Bestand pflegen zu können: `verteilung` (DB-Spalte, `integer` `.default(0)`
 * `.notNull()`) trägt auf allen 19.887 Zeilen einen Wert; auf 4.758 davon weicht er
 * vom Default `0` ab (gemessen 2026-08-04, `verteilung != 0`).
 */
function renderDetails(props: { adminMode?: boolean } = {}): void {
	renderWithFormContext(OptionalSightingDetails, { props });
}

function field(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-testid="field-${name}"]`);
}

describe('sections/OptionalSightingDetails — Verteilung nur im Admin-Modus', () => {
	it('zeigt das Verteilungsfeld NICHT im Meldeformular (ohne adminMode)', () => {
		renderDetails();

		expect(field('distribution')).toBeNull();
	});

	it('zeigt das Verteilungsfeld in der Admin-Maske (adminMode)', () => {
		renderDetails({ adminMode: true });

		expect(field('distribution')).not.toBeNull();
	});
});

/**
 * Beide Felder dieser Sektion sind inzwischen `adminMode`-only — `distribution`
 * seit PR #746, `shipCount` seit dem Umzug nach `Environment.svelte`. Übrig blieb im
 * Meldeformular eine Karte mit Überschrift, Rahmen und Abstand, in der nichts
 * stand: `SectionCard` rendert seinen Titel unbedingt und kennt keinen
 * Leer-Zustand.
 *
 * Der Fehler ist nicht bei der einzelnen Feld-Entfernung entstanden, sondern
 * beim Zusammentreffen von zweien — genau die Klasse, die eine Feld-Prüfung
 * nicht sieht: `field('distribution') === null` war die ganze Zeit erfüllt,
 * während der Nutzer eine leere Karte vor sich hatte. Geprüft wird deshalb die
 * **Hülle**, nicht der Inhalt.
 */
describe('sections/OptionalSightingDetails — keine leere Karte im Meldeformular', () => {
	function cardHeading(): HTMLElement | null {
		return (
			Array.from(document.querySelectorAll<HTMLElement>('h3')).find((heading) =>
				heading.textContent?.includes('Weitere Sichtungsdetails')
			) ?? null
		);
	}

	it('rendert ohne adminMode gar keine Karte', () => {
		renderDetails();

		expect(cardHeading()).toBeNull();
	});

	it('rendert mit adminMode die Karte samt Überschrift', () => {
		renderDetails({ adminMode: true });

		expect(cardHeading()).not.toBeNull();
	});
});
