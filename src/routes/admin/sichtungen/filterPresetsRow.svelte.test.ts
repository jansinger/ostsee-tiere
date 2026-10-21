import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';
import {
	FILTER_PRESETS_STORAGE_KEY,
	serializeFilterPresets,
	type FilterPreset
} from './filterPresets';

/**
 * filterPresetsRow.svelte.test.ts — WP6: das Label „Ansichten:“ ist nur dann
 * sinnvoll, wenn es tatsächlich etwas benennt.
 *
 * Eigene Datei statt einer Erweiterung von `filterPresets.test.ts`: Jene Datei
 * prüft nur die reine Rechnung (Serialisierung, Vergleich, URL-Bau) ohne
 * `window`/DOM — keiner der dortigen Tests rendert die Zeile. Gleiches Muster
 * wie `filterChips.svelte.test.ts` neben `filterChips.test.ts`.
 */

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict: vi.fn(() => Promise.resolve(true))
}));

const SichtungenSeite = (await import('./+page.svelte')).default;

function daten(rows: SightingSelect[] = []): PageData {
	return {
		sightings: rows,
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: { page: 1, perPage: 20, total: rows.length, totalPages: 1, maxPerPage: 100 }
	} as unknown as PageData;
}

function seedPresets(presets: FilterPreset[]): void {
	window.localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, serializeFilterPresets(presets));
}

function findeAnsichtenLabel(container: HTMLElement): HTMLElement | undefined {
	return [...container.querySelectorAll('span')].find(
		(span) => span.textContent?.trim() === 'Ansichten:'
	);
}

describe('Sichtungstabelle — Ansichten-Zeile', () => {
	afterEach(async () => {
		window.localStorage.removeItem(FILTER_PRESETS_STORAGE_KEY);
	});

	it('zeigt das Label „Ansichten:“ nicht, solange es weder Presets noch ein offenes Formular gibt', async () => {
		const screen = await render(SichtungenSeite, { data: daten() });

		// „Ansicht speichern" ist der Einstieg ins Feature und bleibt sichtbar —
		// nur das Label davor wäre ohne Inhalt ein Torso.
		await expect.element(screen.getByRole('button', { name: 'Ansicht speichern' })).toBeVisible();
		expect(findeAnsichtenLabel(screen.container)).toBeUndefined();
	});

	it('zeigt das Label, sobald mindestens ein Preset existiert', async () => {
		/* `1` und nicht `true`: Nur `1`/`0` lösen serverseitig ein Prädikat aus
		   (`deadFindingFilter.ts`). Ein Preset namens „Offene Totfunde" mit einem
		   Wert, der gar nicht filtert, wäre eine Fixture, die etwas zusichert,
		   was der Code nicht tut. */
		seedPresets([{ id: 'id-1', name: 'Offene Totfunde', params: { deadFinding: '1' } }]);
		const screen = await render(SichtungenSeite, { data: daten() });

		await expect.element(screen.getByRole('button', { name: 'Offene Totfunde' })).toBeVisible();
		expect(findeAnsichtenLabel(screen.container)).toBeDefined();
	});

	it('zeigt das Label, während das Speichern-Formular offen ist', async () => {
		const screen = await render(SichtungenSeite, { data: daten() });

		await screen.getByRole('button', { name: 'Ansicht speichern' }).click();

		await expect.element(screen.getByLabelText('Name der Ansicht')).toBeVisible();
		expect(findeAnsichtenLabel(screen.container)).toBeDefined();
	});
});
