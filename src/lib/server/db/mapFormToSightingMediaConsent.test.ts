/**
 * Die Einwilligung zur Veröffentlichung von Medien muss die Formulargrenze
 * überleben — sonst kann das Museum sie weder nachweisen (Art. 7 Abs. 1 DSGVO)
 * noch im Betrieb auswerten, welches Foto veröffentlicht werden darf.
 *
 * Hintergrund und Entscheidungslage: docs/archive/MEDIENEINWILLIGUNG_ANALYSE_2026-07-28.md
 */
import type { SightingFormValues } from '#lib/types/Form.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../geo/checkBalticSeaFile', () => ({
	checkBalticSeaFile: vi.fn()
}));

vi.mock('drizzle-orm', () => ({
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
		type: 'sql',
		strings,
		values
	}))
}));

import { checkBalticSeaFile } from '../geo/checkBalticSeaFile';
import { MEDIA_CONSENT_VERSION } from '#lib/form/consent/mediaConsentVersion.ts';
import { mapFormToSighting } from './mapFormToSighting';

function buildForm(overrides: Partial<SightingFormValues> = {}): SightingFormValues {
	return {
		sightingDate: '2026-07-28',
		sightingTime: '10:30',
		latitude: '54.5',
		longitude: '13.2',
		species: 1,
		totalCount: 1,
		privacyConsent: true,
		referenceId: 'ref-media-consent',
		...overrides
	} as SightingFormValues;
}

describe('mapFormToSighting — Medien-Einwilligung', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkBalticSeaFile).mockReturnValue({
			inBaltic: true,
			inChartArea: true,
			longitude: 13.2,
			latitude: 54.5
		});
	});

	it('schreibt die erteilte Einwilligung in die Sichtung', () => {
		const result = mapFormToSighting(buildForm({ mediaConsent: true }));

		expect(result.mediaConsent).toBe(1);
	});

	it('hält den Zeitpunkt der Einwilligung als Nachweis fest', () => {
		const before = Date.now();
		const result = mapFormToSighting(buildForm({ mediaConsent: true }));

		expect(result.mediaConsentAt).toBeInstanceOf(Date);
		expect(result.mediaConsentAt!.getTime()).toBeGreaterThanOrEqual(before);
	});

	it('hält fest, welcher Einwilligungstext gegolten hat', () => {
		const result = mapFormToSighting(buildForm({ mediaConsent: true }));

		expect(result.mediaConsentVersion).toBe(MEDIA_CONSENT_VERSION);
	});

	it('vermerkt eine fehlende Einwilligung ohne Zeitpunkt und Version', () => {
		const result = mapFormToSighting(buildForm({ mediaConsent: false }));

		expect(result.mediaConsent).toBe(0);
		expect(result.mediaConsentAt).toBeNull();
		expect(result.mediaConsentVersion).toBeNull();
	});

	it('behandelt eine gar nicht getroffene Auswahl wie eine Ablehnung', () => {
		// Feld fehlt vollständig — etwa aus einem Client, der es nicht kennt.
		const result = mapFormToSighting(buildForm());

		expect(result.mediaConsent).toBe(0);
		expect(result.mediaConsentAt).toBeNull();
		expect(result.mediaConsentVersion).toBeNull();
	});

	it('trennt die Medien-Einwilligung von der Pflicht-Einwilligung', () => {
		// Pflicht-Einwilligung erteilt, Veröffentlichung abgelehnt: Die Sichtung
		// darf gespeichert werden, das Foto aber nicht veröffentlicht.
		const result = mapFormToSighting(buildForm({ privacyConsent: true, mediaConsent: false }));

		expect(result.privacyConsent).toBe(1);
		expect(result.mediaConsent).toBe(0);
	});
});
