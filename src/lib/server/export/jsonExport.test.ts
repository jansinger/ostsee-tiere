// @ts-nocheck - Test file with mock data that may not match exact types
import { describe, it, expect } from 'vitest';
import { generateJsonData } from './jsonExport';
import type { FrontendSighting } from '#lib/types/index.ts';

describe('jsonExport', () => {
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

	describe('generateJsonData', () => {
		it('should return valid JSON string', () => {
			const result = generateJsonData([mockSighting]);

			expect(() => JSON.parse(result)).not.toThrow();
		});

		it('should format JSON with proper indentation', () => {
			const result = generateJsonData([mockSighting]);

			// Should be formatted with 2-space indentation
			expect(result).toContain('  "id"');
			expect(result).toContain('  "species"');
		});

		it('should preserve all sighting data', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);

			expect(parsed).toHaveLength(1);
			expect(parsed[0]).toEqual(mockSighting);
		});

		it('should handle multiple sightings', () => {
			const sighting2: FrontendSighting = {
				...mockSighting,
				id: 'test-456',
				species: 1,
				totalCount: 5,
				firstName: 'Jane',
				lastName: 'Smith'
			};

			const result = generateJsonData([mockSighting, sighting2]);
			const parsed = JSON.parse(result);

			expect(parsed).toHaveLength(2);
			expect(parsed[0].id).toBe('test-123');
			expect(parsed[1].id).toBe('test-456');
			expect(parsed[1].species).toBe(1);
			expect(parsed[1].totalCount).toBe(5);
		});

		it('should handle empty array', () => {
			const result = generateJsonData([]);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual([]);
			expect(Array.isArray(parsed)).toBe(true);
		});

		it('should preserve null values', () => {
			const sightingWithNulls: FrontendSighting = {
				...mockSighting,
				juvenileCount: null,
				deadCondition: null,
				phone: null,
				fax: null,
				notes: null
			};

			const result = generateJsonData([sightingWithNulls]);
			const parsed = JSON.parse(result);

			expect(parsed[0].juvenileCount).toBeNull();
			expect(parsed[0].deadCondition).toBeNull();
			expect(parsed[0].phone).toBeNull();
			expect(parsed[0].fax).toBeNull();
			expect(parsed[0].notes).toBeNull();
		});

		it('should preserve boolean values correctly', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);

			expect(parsed[0].isDead).toBe(false);
			expect(parsed[0].shipNameConsent).toBe(true);
			expect(parsed[0].nameConsent).toBe(true);
			expect(parsed[0].mediaUpload).toBe(true);
			expect(parsed[0].verified).toBe(false);
		});

		it('should preserve numeric values correctly', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);

			expect(parsed[0].species).toBe(0);
			expect(parsed[0].totalCount).toBe(2);
			expect(parsed[0].juvenileCount).toBe(1);
			expect(parsed[0].latitude).toBe(54.5);
			expect(parsed[0].longitude).toBe(13.5);
			expect(parsed[0].shipCount).toBe(3);
		});

		it('should preserve string values correctly', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);

			expect(parsed[0].id).toBe('test-123');
			expect(parsed[0].reaction).toBe('Neugierig');
			expect(parsed[0].waterway).toBe('Ostsee');
			expect(parsed[0].firstName).toBe('John');
			expect(parsed[0].lastName).toBe('Doe');
			expect(parsed[0].email).toBe('john@example.com');
		});

		it('should preserve date strings correctly', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);

			expect(parsed[0].sightingDate).toBe('2024-03-15T14:30:00.000Z');
			expect(parsed[0].created).toBe('2024-03-15T15:00:00.000Z');
		});

		it('should handle special characters in strings', () => {
			const sightingWithSpecialChars: FrontendSighting = {
				...mockSighting,
				notes: 'Special chars: äöü ß "quotes" & <tags> \n newlines',
				waterway: 'Østersø (Danish)',
				reaction: 'Très curieux'
			};

			const result = generateJsonData([sightingWithSpecialChars]);
			const parsed = JSON.parse(result);

			expect(parsed[0].notes).toContain('äöü ß "quotes" & <tags>');
			expect(parsed[0].waterway).toBe('Østersø (Danish)');
			expect(parsed[0].reaction).toBe('Très curieux');
		});

		it('should not modify original data', () => {
			const originalSighting = { ...mockSighting };

			generateJsonData([mockSighting]);

			expect(mockSighting).toEqual(originalSighting);
		});

		it('should handle large numbers correctly', () => {
			const sightingWithLargeNumbers: FrontendSighting = {
				...mockSighting,
				latitude: 89.999999,
				longitude: -179.999999,
				totalCount: 1000,
				shipCount: 999
			};

			const result = generateJsonData([sightingWithLargeNumbers]);
			const parsed = JSON.parse(result);

			expect(parsed[0].latitude).toBe(89.999999);
			expect(parsed[0].longitude).toBe(-179.999999);
			expect(parsed[0].totalCount).toBe(1000);
			expect(parsed[0].shipCount).toBe(999);
		});

		it('should preserve object structure completely', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);

			// Check that all keys are preserved
			const originalKeys = Object.keys(mockSighting).sort();
			const parsedKeys = Object.keys(parsed[0]).sort();

			expect(parsedKeys).toEqual(originalKeys);
		});

		it('should produce valid JSON that can be round-tripped', () => {
			const result = generateJsonData([mockSighting]);
			const parsed = JSON.parse(result);
			const reStringified = JSON.stringify(parsed);
			const reParsed = JSON.parse(reStringified);

			expect(reParsed[0]).toEqual(mockSighting);
		});
	});
});
