import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SightingStatistics } from '#lib/server/db/sightingRepository.ts';
import FormHelp from './FormHelp.svelte';

/**
 * Verhaltenstest für das Zahlenformat der Statistik-Kacheln (M10-Befund):
 * `zahlenLocale` läuft seit der Umstellung auf `resolveDisplayLocale(getLocale())`
 * statt hartcodiertem `'de-DE'` — bewiesen wird das hier über den tatsächlichen
 * Tausendertrenner (`.` gegen `,`), nicht nur über die Existenz der Zahl.
 *
 * `totalSightings`, `uniqueUsers`, `sightingsWithMedia` und `deadAnimalsFound`
 * teilen sich alle dieselbe `zahlenLocale`-Variable — ein Wert genügt, um sie
 * mitzuprüfen, weil sie hier bewusst identisch gewählt werden.
 */

const STATISTICS: SightingStatistics = {
	totalSightings: 1234,
	completionRate: 42,
	averageOptionalFields: 6,
	yearsOfService: 17,
	uniqueUsers: 1234,
	sightingsWithMedia: 1234,
	deadAnimalsFound: 1234
};

const originalFetch = globalThis.fetch;

function stubStatisticsFetch(): void {
	globalThis.fetch = vi.fn(async () => {
		return { ok: true, json: async () => STATISTICS } as Response;
	}) as typeof fetch;
}

afterEach(async () => {
	globalThis.fetch = originalFetch;
});

describe('FormHelp — Zahlenformat folgt der Locale', () => {
	it('formatiert die Statistik-Zahlen deutsch, wenn die aktive Locale de ist', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'de');
		stubStatisticsFetch();

		await render(FormHelp);

		await expect.poll(() => document.body.textContent, { timeout: 5000 }).toContain('1.234');
	});

	it('formatiert die Statistik-Zahlen britisch, wenn die aktive Locale en ist', async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');
		stubStatisticsFetch();

		await render(FormHelp);

		await expect.poll(() => document.body.textContent, { timeout: 5000 }).toContain('1,234');

		// Auf den echten Default zurückschalten, damit andere Tests im selben
		// Prozess nicht die englische Locale erben (Muster wie dateUtils.test.ts).
		overwriteGetLocale(() => baseLocale);
	});
});
