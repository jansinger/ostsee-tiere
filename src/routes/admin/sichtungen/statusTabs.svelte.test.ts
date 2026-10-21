/**
 * @fileoverview Statusleiste über der Sichtungstabelle (WP2).
 *
 * Der Status ist die Haupt-Triage-Dimension und steckte bis hierher im
 * aufklappbaren Filter-Panel. Die Leiste macht ihn ohne Aufklappen bedienbar.
 *
 * Geprüft wird das, was die Komponente selbst verantwortet: die vier Reiter mit
 * ihren Zahlen, die Markierung des aktiven Reiters und der gemeldete Wert. Die
 * URL kennt sie nicht — das Navigieren macht `+page.svelte`, abgesichert im
 * E2E-Spec `admin-status-tabs.spec.ts`.
 */
import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import { SIGHTING_STATUS_PRESENTATION } from '#lib/components/admin/sightingStatus.ts';
import StatusTabs from './StatusTabs.svelte';
import type { StatusCounts } from './statusTabs';

const ZAEHLER: StatusCounts = { all: 12, open: 7, approved: 4, rejected: 1 };

describe('StatusTabs', () => {
	it('zeigt die vier Reiter mit ihren Trefferzahlen', async () => {
		const screen = await render(StatusTabs, { counts: ZAEHLER, active: '', onselect: vi.fn() });

		/* Die Beschriftungen gegen `SIGHTING_STATUS_PRESENTATION` geprüft und
		   nicht gegen Literale: Sonst wäre die Leiste eine zweite Quelle für
		   Wort und Reihenfolge neben der Statusableitung. */
		await expect.element(screen.getByRole('button', { name: /Alle/ })).toBeVisible();
		for (const [status, zahl] of [
			['open', ZAEHLER.open],
			['approved', ZAEHLER.approved],
			['rejected', ZAEHLER.rejected]
		] as const) {
			const label = SIGHTING_STATUS_PRESENTATION[status].label;
			await expect
				.element(screen.getByRole('button', { name: new RegExp(`${label}.*${zahl}`) }))
				.toBeVisible();
		}
		await expect
			.element(screen.getByRole('button', { name: new RegExp(`Alle.*${ZAEHLER.all}`) }))
			.toBeVisible();
	});

	it('markiert den aktiven Reiter mit aria-current', async () => {
		const screen = await render(StatusTabs, { counts: ZAEHLER, active: 'open', onselect: vi.fn() });

		await expect
			.element(screen.getByRole('button', { name: /Offen/ }))
			.toHaveAttribute('aria-current', 'true');
		await expect
			.element(screen.getByRole('button', { name: /Alle/ }))
			.not.toHaveAttribute('aria-current');
	});

	it('markiert ohne Statusfilter den Reiter „Alle"', async () => {
		const screen = await render(StatusTabs, { counts: ZAEHLER, active: '', onselect: vi.fn() });

		await expect
			.element(screen.getByRole('button', { name: /Alle/ }))
			.toHaveAttribute('aria-current', 'true');
		await expect
			.element(screen.getByRole('button', { name: /Offen/ }))
			.not.toHaveAttribute('aria-current');
	});

	it.each([
		['Offen', 'open'],
		['Freigegeben', 'approved'],
		['Abgelehnt', 'rejected']
	])('meldet beim Klick auf „%s" den Wert %s', async (label, wert) => {
		const onselect = vi.fn();
		const screen = await render(StatusTabs, { counts: ZAEHLER, active: '', onselect });

		await screen.getByRole('button', { name: new RegExp(label) }).click();

		expect(onselect).toHaveBeenCalledWith(wert);
	});

	it('meldet beim Klick auf „Alle" den leeren Wert', async () => {
		const onselect = vi.fn();
		const screen = await render(StatusTabs, { counts: ZAEHLER, active: 'approved', onselect });

		await screen.getByRole('button', { name: /Alle/ }).click();

		expect(onselect).toHaveBeenCalledWith('');
	});
});
