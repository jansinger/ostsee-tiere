import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import PositionAndTime from './PositionAndTime.svelte';

/**
 * Deckt Befund 1 aus dem Task-6-Review ab: `DateTime.svelte` gehört
 * ausschließlich der Admin-Maske (`AdminSightingEditForm.svelte`) — der
 * Bürger sieht auf Schritt 1 diese Karte hier. Ein reiner Funktionstest auf
 * `dateSectionTitle()` (siehe `wording.test.ts`) hätte die falsche Verdrahtung
 * nicht bemerkt, weil er nie rendert, was der Melder tatsächlich sieht.
 *
 * Verbindliche Entscheidung des Auftraggebers: Der Lebend-Zweig behält
 * wörtlich „Datum und Uhrzeit" — deshalb hier eine Gegenprobe für BEIDE
 * Zweige, nicht nur für den Totfund.
 */
function renderPositionAndTime(overrides: Partial<SightingFormData> = {}): void {
	renderWithFormContext(PositionAndTime, { overrides });
}

describe('PositionAndTime — Kartentitel der Datumskarte am Zweig (Bürgerformular)', () => {
	it('zeigt beim Lebend-Zweig weiterhin „Datum und Uhrzeit"', async () => {
		renderPositionAndTime({ isDead: false });

		await expect
			.element(page.getByRole('heading', { name: 'Datum und Uhrzeit', exact: true }))
			.toBeVisible();
	});

	it('zeigt beim Totfund „Funddatum" statt „Datum und Uhrzeit"', async () => {
		renderPositionAndTime({ isDead: true });

		await expect
			.element(page.getByRole('heading', { name: 'Funddatum', exact: true }))
			.toBeVisible();
	});
});

/**
 * Abschlussreview (nicht blockierend): Die Einleitung der Datumskarte nutzte
 * `text-sm` (14px) statt der Rollen-Utility `text-support` (13px) —
 * `design-system.md` nennt genau dieses Muster als zu vermeiden: dieselbe
 * semantische Ebene (Sekundärtext) darf nicht in zwei Größen auftauchen.
 */
describe('PositionAndTime — Einleitungszeile nutzt die Rollen-Utility', () => {
	it('setzt die Totfund-Einleitung auf text-support statt text-sm', () => {
		renderPositionAndTime({ isDead: true });

		// Gezielt über den Text statt über die Klasse gesucht: `PositionPanel`
		// (vor der Datumskarte im DOM) trägt selbst mehrere `<p class="text-base-content/70 …">`
		// — ein Klassenselektor träfe dort das erste, falsche Element.
		const intro = Array.from(document.querySelectorAll('p')).find((el) =>
			el.textContent?.includes('An welchem Tag war der Fund?')
		);
		expect(intro).toBeDefined();
		expect(intro?.classList.contains('text-support')).toBe(true);
		expect(intro?.classList.contains('text-sm')).toBe(false);
	});
});
