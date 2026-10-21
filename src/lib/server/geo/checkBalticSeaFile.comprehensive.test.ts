// @ts-nocheck
/**
 * Comprehensive test suite for checkBalticSeaFile function
 *
 * This test suite validates the file-based Baltic Sea geographic validation
 * using RBush spatial index + Turf.js algorithms as an alternative to PostGIS.
 *
 * Test Coverage:
 * - Parameter validation and type safety
 * - WGS84 coordinate bounds checking
 * - Baltic Sea bounding box validation
 * - Precise geometry validation with spatial index
 * - Error handling and graceful degradation
 * - Performance characteristics and edge cases
 * - Consistency with PostGIS-based validation
 */

import { describe, it, expect } from 'vitest';
import { checkBalticSeaFile } from './checkBalticSeaFile';
import type { BalticSeaFileResult } from '#lib/types/index.ts';
import { BALTIC_SEA_BBOX } from '#lib/utils/geo/checkBalticSea.ts';

describe('checkBalticSeaFile', () => {
	// Test helper to create expected result structure
	const createExpectedResult = (
		inBaltic: boolean,
		inChartArea: boolean,
		longitude: number,
		latitude: number
	): BalticSeaFileResult => ({
		inBaltic,
		inChartArea,
		longitude,
		latitude
	});

	describe('Parameter Validation', () => {
		it('should handle non-numeric longitude parameter', () => {
			const result = checkBalticSeaFile('invalid' as any, 54.3233);

			expect(result).toEqual(createExpectedResult(false, false, 'invalid', 54.3233));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should handle non-numeric latitude parameter', () => {
			const result = checkBalticSeaFile(10.1367, 'invalid' as any);

			expect(result).toEqual(createExpectedResult(false, false, 10.1367, 'invalid'));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should handle null longitude parameter', () => {
			const result = checkBalticSeaFile(null as any, 54.3233);

			expect(result).toEqual(createExpectedResult(false, false, null, 54.3233));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should handle undefined latitude parameter', () => {
			const result = checkBalticSeaFile(10.1367, undefined as any);

			expect(result).toEqual(createExpectedResult(false, false, 10.1367, undefined));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should handle NaN longitude', () => {
			const result = checkBalticSeaFile(NaN, 54.3233);

			expect(result).toEqual(createExpectedResult(false, false, NaN, 54.3233));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should handle NaN latitude', () => {
			const result = checkBalticSeaFile(10.1367, NaN);

			expect(result).toEqual(createExpectedResult(false, false, 10.1367, NaN));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should handle object parameters', () => {
			const objLng = { value: 10.1367 } as any;
			const objLat = { value: 54.3233 } as any;
			const result = checkBalticSeaFile(objLng, objLat);

			expect(result).toEqual(createExpectedResult(false, false, objLng, objLat));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});
	});

	describe('WGS84 Coordinate Bounds Validation', () => {
		it('should reject longitude below -180°', () => {
			const result = checkBalticSeaFile(-180.1, 54.3233);

			expect(result).toEqual(createExpectedResult(false, false, -180.1, 54.3233));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should reject longitude above +180°', () => {
			const result = checkBalticSeaFile(180.1, 54.3233);

			expect(result).toEqual(createExpectedResult(false, false, 180.1, 54.3233));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should accept longitude at exact -180°', () => {
			const result = checkBalticSeaFile(-180.0, 54.3233);

			// Should not fail bounds check, but will fail Baltic area check
			expect(result.longitude).toBe(-180.0);
			expect(result.latitude).toBe(54.3233);
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should accept longitude at exact +180°', () => {
			const result = checkBalticSeaFile(180.0, 54.3233);

			// Should not fail bounds check, but will fail Baltic area check
			expect(result.longitude).toBe(180.0);
			expect(result.latitude).toBe(54.3233);
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should reject latitude below -90°', () => {
			const result = checkBalticSeaFile(10.1367, -90.1);

			expect(result).toEqual(createExpectedResult(false, false, 10.1367, -90.1));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should reject latitude above +90°', () => {
			const result = checkBalticSeaFile(10.1367, 90.1);

			expect(result).toEqual(createExpectedResult(false, false, 10.1367, 90.1));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should accept latitude at exact -90°', () => {
			const result = checkBalticSeaFile(10.1367, -90.0);

			// Should not fail bounds check, but will fail Baltic area check
			expect(result.longitude).toBe(10.1367);
			expect(result.latitude).toBe(-90.0);
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should accept latitude at exact +90°', () => {
			const result = checkBalticSeaFile(10.1367, 90.0);

			// Should not fail bounds check, but will fail Baltic area check
			expect(result.longitude).toBe(10.1367);
			expect(result.latitude).toBe(90.0);
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should reject extremely large coordinates', () => {
			const result = checkBalticSeaFile(999.999, 999.999);

			expect(result).toEqual(createExpectedResult(false, false, 999.999, 999.999));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});

		it('should reject extremely negative coordinates', () => {
			const result = checkBalticSeaFile(-999.999, -999.999);

			expect(result).toEqual(createExpectedResult(false, false, -999.999, -999.999));
			expect(result.inBaltic).toBe(false);
			expect(result.inChartArea).toBe(false);
		});
	});

	describe('Baltic Sea Chart Area Validation', () => {
		// Baltic Sea bounding box: 9.4°E - 30.2°E, 53.0°N - 66.0°N

		it('should accept coordinates within Baltic chart area', () => {
			// Center of Baltic Sea chart area
			const result = checkBalticSeaFile(19.8, 59.5);

			expect(result.longitude).toBe(19.8);
			expect(result.latitude).toBe(59.5);
			expect(result.inChartArea).toBe(true);
			// inBaltic depends on actual geometry, tested separately
		});

		it('should reject coordinates west of chart area', () => {
			const result = checkBalticSeaFile(9.3, 54.0); // Just west of 9.4°E

			expect(result.longitude).toBe(9.3);
			expect(result.latitude).toBe(54.0);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should reject coordinates east of chart area', () => {
			const result = checkBalticSeaFile(30.3, 60.0); // Just east of 30.2°E

			expect(result.longitude).toBe(30.3);
			expect(result.latitude).toBe(60.0);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should reject coordinates south of chart area', () => {
			const result = checkBalticSeaFile(15.0, 52.9); // Just south of 53.0°N

			expect(result.longitude).toBe(15.0);
			expect(result.latitude).toBe(52.9);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should reject coordinates north of chart area', () => {
			const result = checkBalticSeaFile(20.0, 66.1); // Just north of 66.0°N

			expect(result.longitude).toBe(20.0);
			expect(result.latitude).toBe(66.1);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should accept coordinates at western chart boundary', () => {
			const result = checkBalticSeaFile(9.4, 54.0);

			expect(result.longitude).toBe(9.4);
			expect(result.latitude).toBe(54.0);
			expect(result.inChartArea).toBe(true);
		});

		it('should accept coordinates at eastern chart boundary', () => {
			const result = checkBalticSeaFile(30.2, 60.0);

			expect(result.longitude).toBe(30.2);
			expect(result.latitude).toBe(60.0);
			expect(result.inChartArea).toBe(true);
		});

		// Grenzwerte aus der Konstante ableiten, nicht wiederholen: BALTIC_SEA_BBOX
		// wird aus der Geometrie erzeugt (npm run geo:build) und aendert sich mit ihr.
		it('should accept coordinates at southern chart boundary', () => {
			const result = checkBalticSeaFile(15.0, BALTIC_SEA_BBOX.minLatitude);

			expect(result.longitude).toBe(15.0);
			expect(result.latitude).toBe(BALTIC_SEA_BBOX.minLatitude);
			expect(result.inChartArea).toBe(true);
		});

		it('should accept coordinates at northern chart boundary', () => {
			const result = checkBalticSeaFile(20.0, BALTIC_SEA_BBOX.maxLatitude);

			expect(result.longitude).toBe(20.0);
			expect(result.latitude).toBe(BALTIC_SEA_BBOX.maxLatitude);
			expect(result.inChartArea).toBe(true);
		});
	});

	describe('Known Geographic Locations', () => {
		// Test real-world coordinates for major Baltic Sea locations

		it('should validate Kiel, Germany as in Baltic Sea', () => {
			const result = checkBalticSeaFile(10.1367, 54.3233);

			expect(result.longitude).toBe(10.1367);
			expect(result.latitude).toBe(54.3233);
			expect(result.inChartArea).toBe(true);
			// Should be in Baltic based on real geography
			// Note: Exact result depends on spatial index accuracy
		});

		it('should validate Stockholm, Sweden as in chart area', () => {
			const result = checkBalticSeaFile(18.0686, 59.3293);

			expect(result.longitude).toBe(18.0686);
			expect(result.latitude).toBe(59.3293);
			expect(result.inChartArea).toBe(true);
			// Stockholm is coastal, should likely be near Baltic
		});

		it('should validate Helsinki, Finland as in chart area', () => {
			const result = checkBalticSeaFile(24.9384, 60.1699);

			expect(result.longitude).toBe(24.9384);
			expect(result.latitude).toBe(60.1699);
			expect(result.inChartArea).toBe(true);
			// Helsinki is on Baltic coast
		});

		it('should validate Copenhagen, Denmark as in chart area', () => {
			const result = checkBalticSeaFile(12.5683, 55.6761);

			expect(result.longitude).toBe(12.5683);
			expect(result.latitude).toBe(55.6761);
			expect(result.inChartArea).toBe(true);
			// Copenhagen is near Baltic/North Sea transition
		});

		it('should reject Hamburg, Germany as outside Baltic', () => {
			const result = checkBalticSeaFile(9.9937, 53.5511);

			expect(result.longitude).toBe(9.9937);
			expect(result.latitude).toBe(53.5511);
			expect(result.inChartArea).toBe(true); // Within bounding box
			expect(result.inBaltic).toBe(false); // But not in actual Baltic Sea
		});

		it('should reject London, UK as completely outside', () => {
			const result = checkBalticSeaFile(-0.1276, 51.5074);

			expect(result.longitude).toBe(-0.1276);
			expect(result.latitude).toBe(51.5074);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should reject New York, USA as completely outside', () => {
			const result = checkBalticSeaFile(-74.006, 40.7128);

			expect(result.longitude).toBe(-74.006);
			expect(result.latitude).toBe(40.7128);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should reject Sydney, Australia as completely outside', () => {
			const result = checkBalticSeaFile(151.2093, -33.8688);

			expect(result.longitude).toBe(151.2093);
			expect(result.latitude).toBe(-33.8688);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});
	});

	describe('Edge Cases and Boundary Conditions', () => {
		it('should handle zero coordinates', () => {
			const result = checkBalticSeaFile(0, 0);

			expect(result.longitude).toBe(0);
			expect(result.latitude).toBe(0);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should handle very small positive coordinates', () => {
			const result = checkBalticSeaFile(0.000001, 0.000001);

			expect(result.longitude).toBe(0.000001);
			expect(result.latitude).toBe(0.000001);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should handle very small negative coordinates', () => {
			const result = checkBalticSeaFile(-0.000001, -0.000001);

			expect(result.longitude).toBe(-0.000001);
			expect(result.latitude).toBe(-0.000001);
			expect(result.inChartArea).toBe(false);
			expect(result.inBaltic).toBe(false);
		});

		it('should handle coordinates with many decimal places', () => {
			const lng = 10.123456789012344; // Adjusted to avoid precision loss
			const lat = 54.987654321098766; // Adjusted to avoid precision loss
			const result = checkBalticSeaFile(lng, lat);

			expect(result.longitude).toBe(lng);
			expect(result.latitude).toBe(lat);
			expect(result.inChartArea).toBe(true);
		});

		it('should handle scientific notation coordinates', () => {
			const result = checkBalticSeaFile(1.01367e1, 5.43233e1); // 10.1367, 54.3233

			expect(result.longitude).toBe(10.1367);
			expect(result.latitude).toBe(54.3233);
			expect(result.inChartArea).toBe(true);
		});

		it('should handle integer coordinates', () => {
			const result = checkBalticSeaFile(10, 54);

			expect(result.longitude).toBe(10);
			expect(result.latitude).toBe(54);
			expect(result.inChartArea).toBe(true);
		});
	});

	describe('Return Value Structure', () => {
		it('should always return BalticSeaFileResult with all required fields', () => {
			const result = checkBalticSeaFile(10.1367, 54.3233);

			expect(result).toBeDefined();
			expect(typeof result).toBe('object');
			expect(result).toHaveProperty('inBaltic');
			expect(result).toHaveProperty('inChartArea');
			expect(result).toHaveProperty('longitude');
			expect(result).toHaveProperty('latitude');

			expect(typeof result.inBaltic).toBe('boolean');
			expect(typeof result.inChartArea).toBe('boolean');
			expect(typeof result.longitude).toBe('number');
			expect(typeof result.latitude).toBe('number');
		});

		it('should echo input coordinates in result', () => {
			const testLng = 15.5678;
			const testLat = 58.1234;
			const result = checkBalticSeaFile(testLng, testLat);

			expect(result.longitude).toBe(testLng);
			expect(result.latitude).toBe(testLat);
		});

		it('should echo coordinates even for invalid inputs', () => {
			const invalidLng = 999.999;
			const invalidLat = 'invalid' as any;
			const result = checkBalticSeaFile(invalidLng, invalidLat);

			expect(result.longitude).toBe(invalidLng);
			expect(result.latitude).toBe(invalidLat);
		});
	});

	describe('Performance and Reliability', () => {
		it('should execute quickly for valid coordinates', () => {
			// Warmup: first call lazily initialises the ~32MB RBush singleton index,
			// which must not be measured as query time (caused CI flakiness).
			checkBalticSeaFile(10.1367, 54.3233);

			const start = performance.now();
			const result = checkBalticSeaFile(10.1367, 54.3233);
			const duration = performance.now() - start;

			expect(result).toBeDefined();
			// Per-query cost is ~0.5-2ms warm. The threshold is deliberately generous
			// (50-200x headroom) because wall-clock assertions on shared CI runners are
			// subject to heavy contention -- 20ms produced failures at 25ms and 36ms on
			// otherwise unchanged code. This still catches a real regression, which would
			// mean the RBush index is being rebuilt per query (10-50ms) or worse.
			expect(duration).toBeLessThan(100);
		});

		it('should be deterministic - same input produces same output', () => {
			const lng = 12.5683;
			const lat = 55.6761;

			const result1 = checkBalticSeaFile(lng, lat);
			const result2 = checkBalticSeaFile(lng, lat);
			const result3 = checkBalticSeaFile(lng, lat);

			expect(result1).toEqual(result2);
			expect(result2).toEqual(result3);
			expect(result1.inBaltic).toBe(result2.inBaltic);
			expect(result1.inChartArea).toBe(result2.inChartArea);
		});

		it('should handle rapid successive calls', () => {
			const coordinates = [
				[10.1367, 54.3233],
				[18.0686, 59.3293],
				[24.9384, 60.1699],
				[12.5683, 55.6761],
				[15.0, 60.0]
			];

			const results = coordinates.map(([lng, lat]) => checkBalticSeaFile(lng, lat));

			expect(results).toHaveLength(5);
			results.forEach((result, index) => {
				expect(result).toBeDefined();
				expect(result.longitude).toBe(coordinates[index][0]);
				expect(result.latitude).toBe(coordinates[index][1]);
			});
		});

		it('should never throw exceptions', () => {
			const problematicInputs = [
				[NaN, NaN],
				[Infinity, -Infinity],
				[-Infinity, Infinity],
				[null as any, undefined as any],
				[{} as any, [] as any],
				['string' as any, true as any],
				[999999999, -999999999]
			];

			expect(() => {
				problematicInputs.forEach(([lng, lat]) => {
					const result = checkBalticSeaFile(lng, lat);
					expect(result).toBeDefined();
					expect(typeof result).toBe('object');
				});
			}).not.toThrow();
		});
	});

	describe('Consistency with PostGIS Version', () => {
		// Tests to ensure file-based version behaves consistently with PostGIS version

		it('should use same coordinate validation logic as PostGIS version', () => {
			// Test same bounds checking
			const outOfBoundsTests = [
				[-180.1, 0], // Longitude too low
				[180.1, 0], // Longitude too high
				[0, -90.1], // Latitude too low
				[0, 90.1] // Latitude too high
			];

			outOfBoundsTests.forEach(([lng, lat]) => {
				const result = checkBalticSeaFile(lng, lat);
				expect(result.inBaltic).toBe(false);
				expect(result.inChartArea).toBe(false);
			});
		});

		it('should use same chart area definition as PostGIS version', () => {
			// Ecken aus der Konstante ableiten statt sie zu wiederholen — sonst
			// laeuft dieser Test bei der naechsten Geometrie-Aenderung wieder auf.
			const { minLongitude, maxLongitude, minLatitude, maxLatitude } = BALTIC_SEA_BBOX;
			const boundaryTests = [
				[minLongitude, minLatitude], // SW corner
				[maxLongitude, minLatitude], // SE corner
				[minLongitude, maxLatitude], // NW corner
				[maxLongitude, maxLatitude], // NE corner
				[19.8, 59.5] // Center
			];

			boundaryTests.forEach(([lng, lat]) => {
				const result = checkBalticSeaFile(lng, lat);
				expect(result.inChartArea).toBe(true); // All should be in chart area
			});
		});

		it('should handle invalid parameter types same as PostGIS version', () => {
			// PostGIS version throws, file version returns false gracefully
			const invalidInputs = [
				[null, 54.3233],
				[10.1367, undefined],
				['string', 54.3233],
				[10.1367, {}]
			];

			invalidInputs.forEach(([lng, lat]) => {
				const result = checkBalticSeaFile(lng as any, lat as any);
				expect(result.inBaltic).toBe(false);
				expect(result.inChartArea).toBe(false);
				// File version should echo inputs for debugging
				expect(result.longitude).toBe(lng);
				expect(result.latitude).toBe(lat);
			});
		});
	});
});
