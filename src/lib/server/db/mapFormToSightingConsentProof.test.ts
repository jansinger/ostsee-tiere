/**
 * Nachweis der Einwilligungen nach Art. 7 Abs. 1 DSGVO.
 *
 * Der Verantwortliche muss eine Einwilligung **nachweisen** können. Ein
 * gespeichertes „ja" allein belegt weder **wann** eingewilligt wurde noch
 * **welchem Text** zugestimmt wurde. `mediaConsent` führt diesen Nachweis seit
 * dem 2026-07-28 (siehe `mapFormToSightingMediaConsent.test.ts`); diese Tests
 * ziehen die übrigen drei Einwilligungen nach.
 *
 * Besonders `nameConsent` hat sichtbare Folgen: `/api/sightings` (Feld `na`)
 * veröffentlicht Vor- und Nachnamen, sobald das Flag gesetzt ist.
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

import {
	NAME_CONSENT_VERSION,
	PRIVACY_CONSENT_VERSION,
	SHIP_NAME_CONSENT_VERSION
} from '#lib/form/consent/consentVersions.ts';
import { checkBalticSeaFile } from '../geo/checkBalticSeaFile';
import { mapFormToSighting } from './mapFormToSighting';

function buildForm(overrides: Partial<SightingFormValues> = {}): SightingFormValues {
	return {
		sightingDate: '2026-07-31',
		sightingTime: '10:30',
		latitude: '54.5',
		longitude: '13.2',
		species: 1,
		totalCount: 1,
		referenceId: 'ref-consent-proof',
		...overrides
	} as SightingFormValues;
}

/**
 * Die drei Einwilligungen unterscheiden sich fachlich, der Nachweis funktioniert
 * bei allen gleich. Der Tabellenlauf hält sie deshalb zusammen — eine neue
 * Einwilligung ohne Nachweisspalten fällt hier sofort auf.
 */
const CONSENTS = [
	{
		field: 'nameConsent',
		atColumn: 'nameConsentAt',
		versionColumn: 'nameConsentVersion',
		version: NAME_CONSENT_VERSION
	},
	{
		field: 'shipNameConsent',
		atColumn: 'shipNameConsentAt',
		versionColumn: 'shipNameConsentVersion',
		version: SHIP_NAME_CONSENT_VERSION
	},
	{
		field: 'privacyConsent',
		atColumn: 'privacyConsentAt',
		versionColumn: 'privacyConsentVersion',
		version: PRIVACY_CONSENT_VERSION
	}
] as const;

describe('mapFormToSighting — Nachweis der Einwilligungen', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkBalticSeaFile).mockReturnValue({
			inBaltic: true,
			inChartArea: true,
			longitude: 13.2,
			latitude: 54.5
		});
	});

	describe.each(CONSENTS)('$field', ({ field, atColumn, versionColumn, version }) => {
		it('hält den Zeitpunkt der Einwilligung als Nachweis fest', () => {
			const before = Date.now();
			const result = mapFormToSighting(buildForm({ [field]: true }));

			const at = result[atColumn as keyof typeof result] as Date | null;
			expect(at).toBeInstanceOf(Date);
			expect(at!.getTime()).toBeGreaterThanOrEqual(before);
		});

		it('hält fest, welcher Einwilligungstext gegolten hat', () => {
			const result = mapFormToSighting(buildForm({ [field]: true }));

			expect(result[versionColumn as keyof typeof result]).toBe(version);
		});

		it('vermerkt eine abgelehnte Einwilligung ohne Zeitpunkt und Version', () => {
			// Ein Nachweis für eine nicht erteilte Einwilligung wäre sinnlos —
			// und ein gesetzter Zeitstempel würde eine Zustimmung vortäuschen.
			const result = mapFormToSighting(buildForm({ [field]: false }));

			expect(result[atColumn as keyof typeof result]).toBeNull();
			expect(result[versionColumn as keyof typeof result]).toBeNull();
		});

		it('behandelt eine gar nicht getroffene Auswahl wie eine Ablehnung', () => {
			// Feld fehlt vollständig — etwa aus einem Legacy-Client, der es nicht
			// kennt. Ohne Auswahl gibt es nichts nachzuweisen.
			const result = mapFormToSighting(buildForm());

			expect(result[atColumn as keyof typeof result]).toBeNull();
			expect(result[versionColumn as keyof typeof result]).toBeNull();
		});
	});

	/**
	 * Die tragende Invariante des Nachweises:
	 *
	 *   `_am` und `_version` sind genau dann gesetzt, wenn das Flag 1 ist.
	 *
	 * Beide Verletzungsrichtungen sind Fehler. Flag 1 ohne Nachweis behauptet
	 * etwas ohne Beleg. Nachweis ohne Flag stellt ein Datum hin, das jemanden
	 * zum Veröffentlichen verleitet, obwohl gerade keine Erlaubnis vorliegt.
	 *
	 * Der Test sitzt bewusst auf dem Schreibpfad und nicht als DB-Constraint:
	 * Der Altbestand (Flag 1, Nachweis NULL) verletzt die Invariante
	 * zwangsläufig und ist genau so gewollt — dort gibt es keinen Nachweis.
	 */
	describe('Invariante: Nachweis genau dann, wenn das Flag steht', () => {
		const PROOF_COLUMNS = [
			['nameConsent', 'nameConsentAt', 'nameConsentVersion'],
			['shipNameConsent', 'shipNameConsentAt', 'shipNameConsentVersion'],
			['privacyConsent', 'privacyConsentAt', 'privacyConsentVersion'],
			['mediaConsent', 'mediaConsentAt', 'mediaConsentVersion']
		] as const;

		it.each([
			['alle erteilt', true],
			['alle abgelehnt', false]
		])('hält die Invariante, wenn %s sind', (_label, granted) => {
			const result = mapFormToSighting(
				buildForm({
					nameConsent: granted,
					shipNameConsent: granted,
					privacyConsent: granted,
					mediaConsent: granted
				})
			);

			for (const [flagColumn, atColumn, versionColumn] of PROOF_COLUMNS) {
				const flag = result[flagColumn as keyof typeof result];
				const at = result[atColumn as keyof typeof result];
				const version = result[versionColumn as keyof typeof result];

				expect(at != null, `${atColumn} passt nicht zu ${flagColumn}=${flag}`).toBe(flag === 1);
				expect(version != null, `${versionColumn} passt nicht zu ${flagColumn}=${flag}`).toBe(
					flag === 1
				);
			}
		});

		it('hält die Invariante auch bei gemischter Auswahl', () => {
			const result = mapFormToSighting(
				buildForm({
					privacyConsent: true,
					mediaConsent: true,
					nameConsent: false
					// shipNameConsent gar nicht gesetzt
				})
			);

			for (const [flagColumn, atColumn, versionColumn] of PROOF_COLUMNS) {
				const flag = result[flagColumn as keyof typeof result];
				expect(result[atColumn as keyof typeof result] != null).toBe(flag === 1);
				expect(result[versionColumn as keyof typeof result] != null).toBe(flag === 1);
			}
		});
	});

	it('führt die Einwilligungen getrennt — eine erteilte belegt die andere nicht', () => {
		const result = mapFormToSighting(
			buildForm({ privacyConsent: true, nameConsent: false, shipNameConsent: false })
		);

		expect(result.privacyConsent).toBe(1);
		expect(result.privacyConsentAt).toBeInstanceOf(Date);
		expect(result.nameConsent).toBe(0);
		expect(result.nameConsentAt).toBeNull();
		expect(result.shipNameConsent).toBe(0);
		expect(result.shipNameConsentAt).toBeNull();
	});
});
