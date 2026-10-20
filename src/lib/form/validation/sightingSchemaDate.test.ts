import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { getSightingSchema } from './sightingSchema';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchema = getSightingSchema();

/**
 * Der Kalendertag ist fachlich immer Berlin-Ortszeit. Zwischen 22:00 und 24:00 UTC
 * ist in Berlin bereits der Folgetag — genau dort scheiterte die Zukunftsprüfung.
 */
const BERLIN_IST_EINEN_TAG_VORAUS = new Date('2026-07-28T22:30:00.000Z');
const BERLIN_HEUTE = '2026-07-29';

const validiereDatum = (sightingDate: string): Promise<unknown> =>
	sightingSchema.validateAt('sightingDate', { sightingDate });

afterEach(() => {
	vi.useRealTimers();
});

describe('sightingSchema — sightingDate auf Berlin-Kalendertag', () => {
	it('akzeptiert den heutigen Berliner Kalendertag, auch wenn in UTC noch gestern ist', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(BERLIN_IST_EINEN_TAG_VORAUS);

		await expect(validiereDatum(BERLIN_HEUTE)).resolves.toBeDefined();
	});

	it('weist einen echten Zukunftstag weiterhin ab', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(BERLIN_IST_EINEN_TAG_VORAUS);

		await expect(validiereDatum('2026-07-30')).rejects.toThrow(/Zukunft/);
	});

	it('akzeptiert vergangene Tage', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(BERLIN_IST_EINEN_TAG_VORAUS);

		await expect(validiereDatum('2024-01-15')).resolves.toBeDefined();
	});

	it('weist unlesbare Datumsangaben ab', async () => {
		await expect(validiereDatum('15.07.2026')).rejects.toThrow();
		await expect(validiereDatum('2026-13-45')).rejects.toThrow();
	});

	it('urteilt in jeder Zeitzone gleich', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(BERLIN_IST_EINEN_TAG_VORAUS);

		for (const timeZone of TEST_TIME_ZONES) {
			const akzeptiert = await withTimeZone(timeZone, () =>
				validiereDatum(BERLIN_HEUTE).then(
					() => true,
					() => false
				)
			);
			expect(akzeptiert, `Zeitzone ${timeZone}`).toBe(true);
		}
	});

	it('setzt den Default auf den heutigen Berliner Kalendertag', () => {
		vi.useFakeTimers();
		vi.setSystemTime(BERLIN_IST_EINEN_TAG_VORAUS);

		const defaults = sightingSchema.getDefault() as { sightingDate?: string };

		expect(defaults.sightingDate).toBe(BERLIN_HEUTE);
	});
});
