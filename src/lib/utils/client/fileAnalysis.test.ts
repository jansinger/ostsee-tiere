import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { analyzeClientFile } from './fileAnalysis';
import * as exifr from 'exifr';

vi.mock('exifr', () => ({
	gps: vi.fn(),
	parse: vi.fn()
}));

/**
 * exifr belebt den EXIF-String "YYYY:MM:DD HH:MM:SS" in der Zeitzone des
 * Browsers wieder — die lokalen Felder tragen also die Wanduhrzeit der Kamera.
 */
const kameraWanduhrzeit = (
	jahr: number,
	monat: number,
	tag: number,
	stunde: number,
	minute: number
) => new Date(jahr, monat - 1, tag, stunde, minute, 0, 0);

const bild = () => new File(['x'], 'sichtung.jpg', { type: 'image/jpeg' });

beforeEach(() => {
	vi.mocked(exifr.gps).mockResolvedValue(
		undefined as unknown as { latitude: number; longitude: number }
	);
});

describe('analyzeClientFile — EXIF-Zeitstempel', () => {
	it('liest die Kamera-Wanduhrzeit als deutsche Zeit (Winter)', async () => {
		vi.mocked(exifr.parse).mockImplementation(async () => ({
			DateTimeOriginal: kameraWanduhrzeit(2024, 1, 15, 14, 30)
		}));

		const metadata = await analyzeClientFile(bild());

		// 14:30 MEZ = 13:30 UTC
		expect(metadata.exifData?.dateTimeOriginal?.toISOString()).toBe('2024-01-15T13:30:00.000Z');
	});

	it('liest die Kamera-Wanduhrzeit als deutsche Zeit (Sommer)', async () => {
		vi.mocked(exifr.parse).mockImplementation(async () => ({
			DateTimeOriginal: kameraWanduhrzeit(2024, 7, 15, 14, 30)
		}));

		const metadata = await analyzeClientFile(bild());

		// 14:30 MESZ = 12:30 UTC
		expect(metadata.exifData?.dateTimeOriginal?.toISOString()).toBe('2024-07-15T12:30:00.000Z');
	});

	it('fällt auf DateTime zurück, wenn DateTimeOriginal fehlt', async () => {
		vi.mocked(exifr.parse).mockImplementation(async () => ({
			DateTime: kameraWanduhrzeit(2024, 7, 15, 9, 5)
		}));

		const metadata = await analyzeClientFile(bild());

		expect(metadata.exifData?.dateTimeOriginal?.toISOString()).toBe('2024-07-15T07:05:00.000Z');
	});

	it('liefert in jeder Browser-Zeitzone denselben Zeitpunkt', async () => {
		const ergebnisse: string[] = [];

		for (const timeZone of TEST_TIME_ZONES) {
			// `withTimeZone` ist synchron und stellt die Zone vor dem `await` zurück —
			// hier muss sie über den gesamten Aufruf stehen, wie im echten Browser.
			const vorher = process.env.TZ;
			process.env.TZ = timeZone;
			try {
				vi.mocked(exifr.parse).mockImplementation(async () => ({
					DateTimeOriginal: kameraWanduhrzeit(2024, 7, 15, 14, 30)
				}));

				const metadata = await analyzeClientFile(bild());
				ergebnisse.push(metadata.exifData?.dateTimeOriginal?.toISOString() ?? 'fehlt');
			} finally {
				if (vorher === undefined) {
					delete process.env.TZ;
				} else {
					process.env.TZ = vorher;
				}
			}
		}

		expect(ergebnisse).toEqual(TEST_TIME_ZONES.map(() => '2024-07-15T12:30:00.000Z'));
	});

	it('liest auch den rohen EXIF-String zonenunabhängig', async () => {
		const ergebnisse = [];

		for (const timeZone of TEST_TIME_ZONES) {
			vi.mocked(exifr.parse).mockImplementation(async () => ({
				DateTimeOriginal: '2024:07:15 14:30:00'
			}));

			const metadata = await withTimeZone(timeZone, () => analyzeClientFile(bild()));
			ergebnisse.push((await metadata).exifData?.dateTimeOriginal?.toISOString());
		}

		expect(ergebnisse).toEqual(TEST_TIME_ZONES.map(() => '2024-07-15T12:30:00.000Z'));
	});
});
