import type { FrontendSighting } from '#lib/types/FrontendSighting.ts';
import { describe, expect, it } from 'vitest';
import { buildAdminEditInitialValues } from './adminEditInitialValues';

/**
 * Erzeugt eine Sichtung in der Form, in der sie aus `GET /api/sightings/[id]`
 * kommt: die vollständige Datenbankzeile, Zeitstempel als ISO-String.
 */
function createSighting(overrides: Record<string, unknown> = {}): FrontendSighting {
	return {
		id: 4711,
		referenceId: 'ref-4711',
		species: 1,
		totalCount: 2,
		sightingDate: '2024-06-01T08:30:00.000Z',
		latitude: '54.123456',
		longitude: '13.654321',
		firstName: 'Erika',
		lastName: 'Mustermann',
		email: 'erika@example.com',
		phone: '+49 381 123456',
		fax: null,
		street: 'Hafenstraße 12',
		zipCode: '18439',
		city: 'Stralsund',
		notes: 'Altbestand',
		...overrides
	} as unknown as FrontendSighting;
}

describe('buildAdminEditInitialValues', () => {
	describe('Bestandsdaten', () => {
		it('reicht die Kontakt- und Adressdaten unverändert durch', () => {
			const values = buildAdminEditInitialValues(createSighting());

			expect(values.firstName).toBe('Erika');
			expect(values.lastName).toBe('Mustermann');
			expect(values.email).toBe('erika@example.com');
			expect(values.phone).toBe('+49 381 123456');
			expect(values.street).toBe('Hafenstraße 12');
			expect(values.zipCode).toBe('18439');
			expect(values.city).toBe('Stralsund');
			expect(values.notes).toBe('Altbestand');
		});

		it('erhält Felder, die das Formular gar nicht anzeigt', () => {
			const values = buildAdminEditInitialValues(createSighting({ fax: '+49 381 999' }));

			expect(values.fax).toBe('+49 381 999');
			expect(values.referenceId).toBe('ref-4711');
		});
	});

	describe('Koordinaten', () => {
		it('übernimmt die volle Genauigkeit der gespeicherten Koordinaten', () => {
			const values = buildAdminEditInitialValues(createSighting());

			expect(values.latitude).toBe('54.123456');
			expect(values.longitude).toBe('13.654321');
			expect(values.hasPosition).toBe(true);
		});

		it('erfindet für eine Sichtung ohne Position keine Koordinaten', () => {
			const values = buildAdminEditInitialValues(
				createSighting({ latitude: null, longitude: null })
			);

			expect(values.latitude).toBeNull();
			expect(values.longitude).toBeNull();
			expect(values.hasPosition).toBe(false);
		});

		it('meldet keine Position, wenn nur ein Wert vorliegt', () => {
			const values = buildAdminEditInitialValues(createSighting({ longitude: null }));

			expect(values.hasPosition).toBe(false);
		});
	});

	describe('Datum und Uhrzeit', () => {
		it('zerlegt den Zeitstempel in deutsche Wanduhrzeit', () => {
			const values = buildAdminEditInitialValues(createSighting());

			// 08:30 UTC am 1. Juni ist 10:30 MESZ
			expect(values.sightingDate).toBe('2024-06-01');
			expect(values.sightingTime).toBe('10:30');
		});
	});
});
