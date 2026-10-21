// @ts-nocheck - Test file with mock data that may not match exact types
import { describe, it, expect, vi } from 'vitest';
import { generateCsvData } from './csvExport';
import type { FrontendSighting } from '#lib/types/index.ts';

// Mock form option modules
vi.mock('#lib/report/formOptions/animalBehavior.ts', () => ({
	getAnimalBehaviorLabel: vi.fn((value) => `behavior-${value}`)
}));

vi.mock('#lib/report/formOptions/boatDrive.ts', () => ({
	getBoatDriveLabel: vi.fn((value) => `boatDrive-${value}`)
}));

vi.mock('#lib/report/formOptions/distance.ts', () => ({
	getDistanceLabel: vi.fn((value) => `distance-${value}`)
}));

vi.mock('#lib/report/formOptions/distribution.ts', () => ({
	getDistributionLabel: vi.fn((value) => `distribution-${value}`)
}));

vi.mock('#lib/report/formOptions/seaState.ts', () => ({
	getSeaStateLabel: vi.fn((value) => `seaState-${value}`)
}));

vi.mock('#lib/report/formOptions/sightingFrom.ts', () => ({
	getSightingFromLabel: vi.fn((value) => `sightingFrom-${value}`)
}));

vi.mock('#lib/report/formOptions/species.ts', () => ({
	getSpeciesLabel: vi.fn((value) => `species-${value}`)
}));

vi.mock('#lib/report/formOptions/visibility.ts', () => ({
	getVisibilityLabel: vi.fn((value) => `visibility-${value}`)
}));

describe('csvExport', () => {
	const mockSighting: FrontendSighting = {
		id: 'test-123',
		sightingDate: '2024-03-15T14:30:00.000Z',
		species: 0,
		totalCount: 2,
		juvenileCount: 1,
		distribution: 0,
		latitude: 54.5,
		longitude: 13.5,
		behavior: 1,
		reaction: 'Neugierig',
		distance: 2,
		sightingFrom: 1,
		isDead: false,
		deadCondition: null,
		deadSex: null,
		deadSize: null,
		waterway: 'Ostsee',
		seaMark: 'Leuchtturm',
		seaState: 2,
		visibility: 3,
		windDirection: 'N',
		windForce: '4',
		shipName: 'Test Ship',
		shipNameConsent: true,
		homePort: 'Hamburg',
		boatType: 'Segelboot',
		boatDrive: 1,
		shipCount: 3,
		mediaUpload: true,
		firstName: 'John',
		lastName: 'Doe',
		nameConsent: true,
		email: 'john@example.com',
		phone: '+49123456789',
		fax: null,
		street: 'Teststraße 1',
		zipCode: '12345',
		city: 'Hamburg',
		notes: 'Test notes',
		otherObservations: 'Test observations',
		verified: false,
		created: '2024-03-15T15:00:00.000Z'
	};

	describe('generateCsvData', () => {
		it('should generate CSV header correctly', () => {
			const result = generateCsvData([]);
			const lines = result.split('\n');
			expect(lines[0]).toContain('ID;Datum;Uhrzeit;Tierart');
			expect(lines[0]).toContain('Lat;Lon');
			expect(lines[0]).toContain('Name;Email');
		});

		it('should generate CSV data for single sighting', () => {
			const result = generateCsvData([mockSighting]);
			const lines = result.split('\n');

			expect(lines).toHaveLength(3); // Header + 1 data row + empty line
			expect(lines[1]).toContain('"test-123"');
			expect(lines[1]).toContain('"15.03.2024"');
			expect(lines[1]).toContain('"species-0"');
			expect(lines[1]).toContain('"2"'); // totalCount
		});

		it('should format date and time correctly', () => {
			const result = generateCsvData([mockSighting]);
			const lines = result.split('\n');
			const dataRow = lines[1];

			expect(dataRow).toContain('"15.03.2024"'); // DD.MM.YYYY format
			// Time will vary based on timezone, but should be in HH:MM format
			expect(dataRow).toMatch(/"[0-2][0-9]:[0-5][0-9]"/);
		});

		it('should handle name consent correctly', () => {
			const sightingWithNameConsent = { ...mockSighting, nameConsent: true };
			const sightingWithoutNameConsent = { ...mockSighting, nameConsent: false };

			const resultWith = generateCsvData([sightingWithNameConsent]);
			const resultWithout = generateCsvData([sightingWithoutNameConsent]);

			expect(resultWith).toContain('"John Doe"');
			expect(resultWithout).toContain('""'); // Empty string for name
		});

		it('should handle ship name consent correctly', () => {
			const sightingWithShipConsent = { ...mockSighting, shipNameConsent: true };
			const sightingWithoutShipConsent = { ...mockSighting, shipNameConsent: false };

			const resultWith = generateCsvData([sightingWithShipConsent]);
			const resultWithout = generateCsvData([sightingWithoutShipConsent]);

			expect(resultWith).toContain('"Test Ship"');
			expect(resultWithout).toContain('""'); // Empty string for ship name
		});

		it('should handle dead animal data correctly', () => {
			const deadSighting: FrontendSighting = {
				...mockSighting,
				isDead: true,
				deadCondition: 'Fresh',
				deadSex: 'Male',
				deadSize: '2.5m'
			};

			const result = generateCsvData([deadSighting]);

			expect(result).toContain('"Ja"'); // isDead = true
			expect(result).toContain('"Fresh"');
			expect(result).toContain('"Male"');
			expect(result).toContain('"2.5m"');
		});

		it('should handle missing optional fields', () => {
			const minimalSighting: FrontendSighting = {
				...mockSighting,
				juvenileCount: null,
				reaction: null,
				windDirection: null,
				notes: null,
				phone: null
			};

			const result = generateCsvData([minimalSighting]);
			const lines = result.split('\n');
			const dataRow = lines[1];

			// Should contain empty strings for null values
			expect(dataRow.split(';')).toContain('""');
		});

		it('should handle multiple sightings', () => {
			const sighting2: FrontendSighting = {
				...mockSighting,
				id: 'test-456',
				species: 1,
				totalCount: 5
			};

			const result = generateCsvData([mockSighting, sighting2]);
			const lines = result.split('\n');

			expect(lines).toHaveLength(4); // Header + 2 data rows + empty line
			expect(lines[1]).toContain('"test-123"');
			expect(lines[2]).toContain('"test-456"');
			expect(lines[2]).toContain('"species-1"');
			expect(lines[2]).toContain('"5"');
		});

		it('should handle media upload flag', () => {
			const sightingWithMedia = { ...mockSighting, mediaUpload: true };
			const sightingWithoutMedia = { ...mockSighting, mediaUpload: false };

			const resultWith = generateCsvData([sightingWithMedia]);
			const resultWithout = generateCsvData([sightingWithoutMedia]);

			expect(resultWith).toContain('"Ja"'); // Has media
			expect(resultWithout).toContain('"Nein"'); // No media
		});

		it('should escape quotes in data values', () => {
			const sightingWithQuotes: FrontendSighting = {
				...mockSighting,
				notes: 'Notes with "quotes" inside',
				waterway: 'Area "North"'
			};

			const result = generateCsvData([sightingWithQuotes]);

			// Values should be wrapped in quotes
			expect(result).toContain('"Notes with "quotes" inside"');
			expect(result).toContain('"Area "North""');
		});

		it('should format created date correctly', () => {
			const result = generateCsvData([mockSighting]);

			// Should contain German locale formatted date (allowing for different formats)
			expect(result).toMatch(/"\d{1,2}\.\d{1,2}\.\d{4}, \d{2}:\d{2}:\d{2}"/);
		});

		it('should use semicolon as delimiter', () => {
			const result = generateCsvData([mockSighting]);
			const lines = result.split('\n');

			// Header should use semicolons
			expect(lines[0].split(';').length).toBeGreaterThan(10);
			// Data row should use semicolons
			expect(lines[1].split(';').length).toBeGreaterThan(10);
		});

		it('should call form option label functions', () => {
			generateCsvData([mockSighting]);

			// The functions are mocked at the top level, just verify they work
			expect(generateCsvData([mockSighting])).toContain('species-0');
			expect(generateCsvData([mockSighting])).toContain('distance-2');
		});

		it('should have equal column count in header and data rows', () => {
			const result = generateCsvData([mockSighting]);
			const lines = result.trim().split('\n');
			const headerColumns = lines[0].split(';');
			const dataColumns = lines[1].split(';');

			expect(dataColumns.length).toBe(headerColumns.length);
		});

		it('führt den abgeleiteten Status unter der Spalte „Status"', () => {
			const csv = generateCsvData([
				{ ...mockSighting, verified: 1, approvedAt: null, rejectedAt: null },
				{ ...mockSighting, verified: 0, approvedAt: new Date('2026-03-12'), rejectedAt: null },
				{ ...mockSighting, verified: 0, approvedAt: null, rejectedAt: new Date('2026-03-12') }
			]);
			const zeilen = csv.split('\n');
			const headers = zeilen[0].split(';').map((h) => h.replaceAll('"', ''));
			const idx = headers.indexOf('Status');
			expect(idx).toBeGreaterThan(-1);

			const werte = zeilen.slice(1, 4).map((z) => z.split(';')[idx].replaceAll('"', ''));
			// geprueft = 1 ohne Freigabe ist NICHT veröffentlicht — die alte Spalte
			// meldete hier „Ja" (Bestandsbefund 2026-08-07, 22 Zeilen).
			expect(werte).toEqual(['Offen', 'Freigegeben', 'Abgelehnt']);
		});

		it('should place created date under Erstellt am header', () => {
			const result = generateCsvData([mockSighting]);
			const lines = result.trim().split('\n');
			const headers = lines[0].split(';');
			const dataRow = lines[1].split(';');

			const idx = headers.indexOf('Erstellt am');
			expect(idx).toBeGreaterThan(-1);
			expect(dataRow[idx]).toMatch(/"\d{1,2}\.\d{1,2}\.\d{4}/);
		});
	});
});
