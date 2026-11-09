/**
 * `toFrontendSighting` speist CSV-, XML- und KML-Export und reicht die Zeile per
 * Spread durch; der XML-Export schreibt jedes Feld seines Objekts. Der
 * Melder-Hash darf dort nicht ankommen (docs/ANONYMISIERUNG_KONZEPT.md, 6.2).
 */
import { describe, expect, it } from 'vitest';
import { toFrontendSighting } from './toFrontendSighting';

describe('toFrontendSighting', () => {
	it('entfernt Melder-Hash und Intern-Kennzeichen', () => {
		const result = toFrontendSighting({
			id: 1,
			species: 1,
			location: null,
			reporterHash: 'a'.repeat(64),
			reporterInternal: true
		} as never);

		expect(result).not.toHaveProperty('reporterHash');
		expect(result).not.toHaveProperty('reporterInternal');
		expect(result).toMatchObject({ id: 1, species: 1 });
	});
});
