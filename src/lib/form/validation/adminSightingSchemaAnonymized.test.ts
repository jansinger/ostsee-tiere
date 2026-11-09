/**
 * Anonymisierte Meldungen bleiben im Admin speicherbar.
 *
 * Nach der Anonymisierung fehlen E-Mail und — ohne Namens-Einwilligung — Vor-
 * und Nachname. Das Admin-Schema verlangt sie sonst; ein Admin könnte eine
 * solche Meldung dann nicht mehr korrigieren, auch nicht an einem ganz anderen
 * Feld (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, Risiko „Admin kann anonymisierte
 * Meldung nicht speichern"). Ob die Zeile anonymisiert ist, weiß nur der
 * Server; er reicht es als Kontext `anonymized` herein.
 */
import { describe, expect, it } from 'vitest';
import * as yup from 'yup';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import { DistanceEnum } from '#lib/report/formOptions/distance.ts';
import { getAdminSightingSchema } from './sightingSchema';

const schema = getAdminSightingSchema();

function values(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		species: 1,
		totalCount: 2,
		juvenileCount: 0,
		sightingDate: '2024-06-01',
		sightingTime: '10:30',
		hasPosition: true,
		latitude: 54.123456,
		longitude: 13.654321,
		sightingFrom: SightingFromEnum.LAND,
		distance: DistanceEnum.FROM_10_TO_50M,
		privacyConsent: true,
		referenceId: 'ref-4711',
		...overrides
	};
}

async function errorPaths(
	input: Record<string, unknown>,
	context: Record<string, unknown> = {}
): Promise<string[]> {
	try {
		await schema.validate(input, { abortEarly: false, context });
		return [];
	} catch (error) {
		if (!(error instanceof yup.ValidationError)) throw error;
		return error.inner.map((inner) => inner.path ?? '?').sort();
	}
}

describe('Admin-Schema — anonymisierte Meldungen', () => {
	it('verlangt bei nicht anonymisierten Meldungen weiterhin Name und E-Mail', async () => {
		expect(await errorPaths(values())).toEqual(['email', 'firstName', 'lastName']);
	});

	it('nimmt eine anonymisierte Meldung ohne Name und E-Mail an', async () => {
		expect(await errorPaths(values(), { anonymized: true })).toEqual([]);
	});

	it('nimmt leere Strings an, wie das Formular sie aus NULL macht', async () => {
		expect(
			await errorPaths(values({ firstName: '', lastName: '', email: '' }), { anonymized: true })
		).toEqual([]);
	});

	it('prüft ein vorhandenes Feld weiterhin auf seine Länge', async () => {
		// Der Name bleibt bei Einwilligung stehen und ist dann weiter editierbar.
		expect(await errorPaths(values({ firstName: 'x'.repeat(65) }), { anonymized: true })).toEqual([
			'firstName'
		]);
	});
});
