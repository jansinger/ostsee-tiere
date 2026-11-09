/**
 * Hinweisleiste im Admin-Bereich: Ein still ausgefallener Cron verletzt die
 * Frist, ohne dass es jemand merkt (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md,
 * „Überwachung"). Die Leiste erscheint nur bei rotem Status und führt zum
 * Panel in den Einstellungen.
 */
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AnonymizationAlert from './AnonymizationAlert.svelte';

describe('AnonymizationAlert', () => {
	it('nennt Überfällige und alten Lauf und verlinkt das Panel', async () => {
		render(AnonymizationAlert, {
			banner: { level: 'alert', reasons: ['overdue', 'stale_run'], overdue: 12 }
		});

		const alert = page.getByRole('alert');
		await expect.element(alert).toHaveTextContent('12 Meldungen liegen über der Frist');
		await expect.element(alert).toHaveTextContent('letzte Lauf liegt mehr als 48 Stunden zurück');
		await expect
			.element(page.getByRole('link', { name: 'Zur Anonymisierung' }))
			.toHaveAttribute('href', '/admin/settings#anonymisierung');
	});

	it.each([
		['grün', { level: 'ok', reasons: [], overdue: 0 }],
		['inaktiv', { level: 'inactive', reasons: [], overdue: 19873 }],
		['unbekannt', null]
	] as const)('bleibt aus, wenn der Status %s ist', async (_label, banner) => {
		render(AnonymizationAlert, { banner: banner as never });

		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});
});
