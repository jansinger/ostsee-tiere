import type { DistanceEnum } from '#lib/report/formOptions/distance.ts';
import type { FrontendSighting } from '#lib/types/index.ts';
import { describe, expect, test } from 'vitest';
import { generateXmlData } from './xmlExport';

/**
 * Creates a minimal valid FrontendSighting for testing
 */
function createTestSighting(overrides: Partial<FrontendSighting> = {}): FrontendSighting {
	return {
		id: 1,
		referenceId: 'test-ref-123',
		latitude: '54.5',
		longitude: '13.2',
		waterway: null,
		seaMark: null,
		sightingDate: new Date('2024-01-15T14:30:00.000Z'),
		sightingFrom: 1,
		sightingFromText: null,
		distance: 1,
		shipCount: null,
		totalCount: 1,
		juvenileCount: 0,
		distribution: 1,
		distributionText: null,
		mediaFile: null,
		mediaUpload: 0,
		behavior: 0,
		behaviorText: null,
		reaction: null,
		otherObservations: null,
		seaState: 1,
		windDirection: null,
		windForce: null,
		visibility: 1,
		shipName: null,
		homePort: null,
		boatType: null,
		boatDrive: 1,
		boatDriveText: null,
		firstName: null,
		lastName: null,
		street: null,
		zipCode: null,
		city: null,
		phone: null,
		fax: null,
		email: null,
		nameConsent: 0,
		shipNameConsent: 0,
		notes: null,
		created: new Date('2024-01-15T14:30:00.000Z'),
		entryChannel: 1,
		approvedAt: null,
		verified: 0,
		inBalticSea: 1,
		internalComment: null,
		inBalticSeaGeo: 1,
		isDead: 0,
		deadSize: null,
		deadCondition: 0,
		deadSex: 0,
		deadPhoneContact: 0,
		species: 0 as any,
		privacyConsent: 1,
		...overrides
	};
}

describe('xmlExport', () => {
	describe('generateXmlData', () => {
		test('should generate valid XML with header and root element', () => {
			const sightings: FrontendSighting[] = [];
			const result = generateXmlData(sightings);

			expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
			expect(result).toContain('<sichtungen>');
			expect(result).toContain('</sichtungen>');
		});

		test('should handle empty sightings array', () => {
			const sightings: FrontendSighting[] = [];
			const result = generateXmlData(sightings);

			expect(result).toContain('<sichtungen>');
			expect(result).toContain('</sichtungen>');
			expect(result).not.toContain('<sichtung>');
		});

		test('should transform single sighting correctly', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					waterway: 'Fehmarnbelt',
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					shipName: 'TestSchiff',
					shipNameConsent: 1,
					firstName: 'Max',
					lastName: 'Mustermann',
					nameConsent: 1
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<sichtung>');
			expect(result).toContain('<nr>1</nr>');
			expect(result).toContain('<datum>15.01.24</datum>');
			expect(result).toContain('<uhrzeit>1530</uhrzeit>'); // 14:30 UTC + 1 Stunde MEZ = 15:30
			expect(result).toContain('<tierart>0</tierart>');
			expect(result).toContain('<fahrwasser>Fehmarnbelt</fahrwasser>');
			expect(result).toContain('<dezigrad_n>54.5</dezigrad_n>');
			expect(result).toContain('<dezigrad_e>13.2</dezigrad_e>');
			expect(result).toContain('<totfund>0</totfund>');
			expect(result).toContain('<media>Einzeltier</media>');
			expect(result).toContain('<anz_ber>1</anz_ber>');
			expect(result).toContain('<groessenklasse>Einzeltier</groessenklasse>');
			expect(result).toContain('<schiff>TestSchiff</schiff>');
			expect(result).toContain('<person>Max Mustermann</person>');
		});

		test('should handle multiple sightings', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-16T15:45:00.000Z'),
					species: 1,
					totalCount: 3,
					latitude: '55.0',
					longitude: '14.0',
					isDead: 0,
					juvenileCount: 1,
					verified: 0,
					created: new Date('2024-01-16T15:45:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			// Should contain both sightings
			expect((result.match(/<sichtung>/g) || []).length).toBe(2);
			expect(result).toContain('<nr>1</nr>');
			expect(result).toContain('<nr>2</nr>');
			expect(result).toContain('<datum>15.01.24</datum>');
			expect(result).toContain('<datum>16.01.24</datum>');
		});

		test('should exclude null, undefined, and empty string values', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					waterway: null, // Should be excluded
					seaMark: undefined, // Should be excluded
					notes: '' // Should be excluded
				})
			];

			const result = generateXmlData(sightings);

			expect(result).not.toContain('<fahrwasser>');
			expect(result).not.toContain('<notes>');
			expect(result).not.toContain('<seaMark>');
		});

		test('should convert boolean values to 1/0', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 1, // Should become 1
					juvenileCount: 0,
					verified: 0, // Should become 0
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<totfund>1</totfund>');
		});
	});

	describe('transformToXmlSighting', () => {
		test('should format date correctly (DD.MM.YY)', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<datum>15.01.24</datum>');
		});

		test('should format time correctly (HHMM)', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T09:05:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T09:05:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<uhrzeit>1530</uhrzeit>'); // 14:30 UTC + 1 Stunde MEZ = 15:30
			expect(result).toContain('<uhrzeit>1005</uhrzeit>'); // 09:05 UTC + 1 Stunde MEZ = 10:05
		});

		test('should handle different years correctly', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2023-12-31T22:59:00.000Z'), // 22:59 UTC + 1 Stunde = 23:59 am 31.12.23
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2023-12-31T22:59:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-12-31T23:01:00.000Z'), // 23:01 UTC + 1 Stunde = 00:01 am 01.01.25
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-12-31T23:01:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<datum>31.12.23</datum>');
			expect(result).toContain('<datum>01.01.25</datum>');
		});

		test('should handle coordinates correctly', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.123456',
					longitude: '13.987654',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<dezigrad_n>54.123456</dezigrad_n>');
			expect(result).toContain('<dezigrad_e>13.987654</dezigrad_e>');
		});

		test('should handle invalid coordinates', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: null,
					longitude: undefined,
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<dezigrad_n>0</dezigrad_n>');
			expect(result).toContain('<dezigrad_e>0</dezigrad_e>');
		});

		test('should categorize dead animals correctly', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 5, // Should be ignored for dead animals
					latitude: '54.5',
					longitude: '13.2',
					isDead: 1,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<totfund>1</totfund>');
			expect(result).toContain('<media>tot</media>');
			expect(result).toContain('<groessenklasse>tot</groessenklasse>');
			// Should not contain anz_ber for dead animals
			expect(result).not.toContain('<anz_ber>');
		});

		test('should categorize animal count correctly - single animal', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<media>Einzeltier</media>');
			expect(result).toContain('<anz_ber>1</anz_ber>');
			expect(result).toContain('<groessenklasse>Einzeltier</groessenklasse>');
		});

		test('should categorize animal count correctly - 2-5 animals', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 3,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 5,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<media>2_5</media>');
			expect(result).toContain('<anz_ber>3</anz_ber>');
			expect(result).toContain('<anz_ber>5</anz_ber>');
			expect(result).toContain('<groessenklasse>2-5 Tiere</groessenklasse>');
		});

		test('should categorize animal count correctly - 6-10 animals', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 8,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<media>6_10</media>');
			expect(result).toContain('<anz_ber>8</anz_ber>');
			expect(result).toContain('<groessenklasse>6-10 Tiere</groessenklasse>');
		});

		test('should categorize animal count correctly - 11-15 animals', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 12,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<media>11_15</media>');
			expect(result).toContain('<anz_ber>12</anz_ber>');
			expect(result).toContain('<groessenklasse>11-15 Tiere</groessenklasse>');
		});

		test('should categorize animal count correctly - >15 animals', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 20,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<media>_15</media>');
			expect(result).toContain('<anz_ber>20</anz_ber>');
			expect(result).toContain('<groessenklasse>Mehr als 15 Tiere</groessenklasse>');
		});

		test('should handle undefined totalCount', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: undefined,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			// Should default to >15 category when totalCount is undefined
			expect(result).toContain('<media>_15</media>');
			expect(result).toContain('<groessenklasse>Mehr als 15 Tiere</groessenklasse>');
		});

		test('should include juvenile count when > 0', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 5,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 2,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<jungtiere>2</jungtiere>');
		});

		test('should exclude juvenile count when 0 or undefined', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 5,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 3,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: undefined,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).not.toContain('<jungtiere>');
		});

		test('should include ship name only with consent', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					shipName: 'TestSchiff',
					shipNameConsent: 1
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					shipName: 'PrivateSchiff',
					shipNameConsent: 0 // No consent
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<schiff>TestSchiff</schiff>');
			expect(result).not.toContain('<schiff>PrivateSchiff</schiff>');
		});

		test('should not include ship name without consent even if name exists', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					shipName: 'PrivateSchiff'
					// shipNameConsent is undefined/false
				})
			];

			const result = generateXmlData(sightings);

			expect(result).not.toContain('<schiff>');
		});

		test('should include person name only with consent and complete data', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					firstName: 'Max',
					lastName: 'Mustermann',
					nameConsent: 1
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<person>Max Mustermann</person>');
		});

		test('should not include person name without consent', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					firstName: 'Max',
					lastName: 'Mustermann',
					nameConsent: 0
				})
			];

			const result = generateXmlData(sightings);

			expect(result).not.toContain('<person>');
		});

		test('should not include person name without complete data', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					firstName: 'Max',
					// lastName missing
					nameConsent: 1
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z'),
					// firstName missing
					lastName: 'Mustermann',
					nameConsent: 1
				})
			];

			const result = generateXmlData(sightings);

			expect(result).not.toContain('<person>');
		});
	});

	describe('coordinate transformation', () => {
		test('should calculate X/Y coordinates using Mercator projection', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			// Should contain x and y coordinates (calculated values)
			expect(result).toMatch(/<x>-?\d+(\.\d+)?<\/x>/);
			expect(result).toMatch(/<y>-?\d+(\.\d+)?<\/y>/);
		});

		test('should handle zero coordinates', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '0',
					longitude: '0',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<x>');
			expect(result).toContain('<y>');
		});

		test('should handle null coordinates in transformation', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: null,
					longitude: null,
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			// Null coordinates are treated as 0,0 and then transformed
			// The transformation uses Mercator projection so they won't be exactly 0,0
			expect(result).toMatch(/<x>-?\d+(\.\d+)?<\/x>/);
			expect(result).toMatch(/<y>-?\d+(\.\d+)?<\/y>/);
			// But dezigrad values should be 0
			expect(result).toContain('<dezigrad_n>0</dezigrad_n>');
			expect(result).toContain('<dezigrad_e>0</dezigrad_e>');
		});

		test('should round coordinates to 3 decimal places', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.123456789',
					longitude: '13.987654321',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			// Extract x and y values to check rounding
			const xMatch = result.match(/<x>(-?\d+(?:\.\d+)?)<\/x>/);
			const yMatch = result.match(/<y>(-?\d+(?:\.\d+)?)<\/y>/);

			if (xMatch && xMatch[1]) {
				const xValue = parseFloat(xMatch[1]);
				// Check that x is rounded to max 3 decimal places
				expect(xValue.toString()).toMatch(/^-?\d+(\.\d{1,3})?$/);
			}

			if (yMatch && yMatch[1]) {
				const yValue = parseFloat(yMatch[1]);
				// Check that y is rounded to max 3 decimal places
				expect(yValue.toString()).toMatch(/^-?\d+(\.\d{1,3})?$/);
			}
		});
	});

	describe('edge cases and error handling', () => {
		test('should handle species ID 0 correctly', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any, // Schweinswal - should not be treated as falsy
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<tierart>0</tierart>');
		});

		test('should handle all species IDs', () => {
			const speciesIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const sightings: FrontendSighting[] = speciesIds.map((species, index) => ({
				id: index + 1,
				sightingDate: new Date('2024-01-15T14:30:00.000Z'),
				species,
				totalCount: 1,
				latitude: '54.5',
				longitude: '13.2',
				isDead: 0,
				juvenileCount: 0,
				verified: 0,
				created: new Date('2024-01-15T14:30:00.000Z'),
				distribution: 0, // oder sinnvoller Testwert
				distance: 0 as DistanceEnum, // z.B. 0 Meter
				sightingFrom: 0, // z.B. 'boat'
				boatDrive: 0, // z.B. 'none'
				seaState: 0 // z.B. 'calm'
			}));

			const result = generateXmlData(sightings);

			speciesIds.forEach((id) => {
				expect(result).toContain(`<tierart>${id}</tierart>`);
			});
		});

		test('should handle invalid date strings gracefully', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: 'invalid-date' as unknown as Date,
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			// Should not throw an error
			expect(() => generateXmlData(sightings)).not.toThrow();
		});

		test('should handle large numbers correctly', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 999999,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1000,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 999,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<nr>999999</nr>');
			expect(result).toContain('<anz_ber>1000</anz_ber>');
			expect(result).toContain('<jungtiere>999</jungtiere>');
		});

		test('should handle boundary latitude values', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '90', // North pole
					longitude: '0',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '-90', // South pole
					longitude: '0',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<dezigrad_n>90</dezigrad_n>');
			expect(result).toContain('<dezigrad_n>-90</dezigrad_n>');
		});

		test('should handle boundary longitude values', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '0',
					longitude: '180', // International date line
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				}),
				createTestSighting({
					id: 2,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '0',
					longitude: '-180', // International date line
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			expect(result).toContain('<dezigrad_e>180</dezigrad_e>');
			expect(result).toContain('<dezigrad_e>-180</dezigrad_e>');
		});
	});

	describe('XML structure and validity', () => {
		test('should produce well-formed XML structure', () => {
			const sightings: FrontendSighting[] = [
				createTestSighting({
					id: 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: '54.5',
					longitude: '13.2',
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			];

			const result = generateXmlData(sightings);

			// Check XML declaration
			expect(result).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);

			// Check root element
			expect(result).toContain('<sichtungen>');
			expect(result).toContain('</sichtungen>');

			// Check sichtung elements are properly opened and closed
			expect(result).toContain('<sichtung>');
			expect(result).toContain('</sichtung>');

			// Count opening and closing tags should match
			const openTags = (result.match(/<sichtung>/g) || []).length;
			const closeTags = (result.match(/<\/sichtung>/g) || []).length;
			expect(openTags).toBe(closeTags);
		});

		test('should produce consistent XML structure with multiple sightings', () => {
			const sightings: FrontendSighting[] = Array.from({ length: 5 }, (_, i) =>
				createTestSighting({
					id: i + 1,
					sightingDate: new Date('2024-01-15T14:30:00.000Z'),
					species: 0 as any,
					totalCount: 1,
					latitude: String(54.5 + i * 0.1),
					longitude: String(13.2 + i * 0.1),
					isDead: 0,
					juvenileCount: 0,
					verified: 0,
					created: new Date('2024-01-15T14:30:00.000Z')
				})
			);

			const result = generateXmlData(sightings);

			// Should have 5 sighting elements
			const sightingCount = (result.match(/<sichtung>/g) || []).length;
			expect(sightingCount).toBe(5);

			// Each sighting should have an nr element
			const nrCount = (result.match(/<nr>\d+<\/nr>/g) || []).length;
			expect(nrCount).toBe(5);
		});
	});
});
