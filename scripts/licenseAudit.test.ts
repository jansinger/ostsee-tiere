import { describe, expect, it } from 'vitest';
import {
	ALLOWED_LICENSES,
	findDisallowedPackages,
	isKnownMissingLicenseMetadata
} from './licenseAudit';

/**
 * Wächter über `npm run license:audit`.
 *
 * Alle offenen Dependabot-PRs scheiterten am 2026-09-18 am selben Job
 * (Compliance Check → "Validate license compatibility"), weil license-checker
 * für `@lix-js/sdk-linux-x64` (Dependency von @inlang/paraglide-js) "UNKNOWN"
 * meldet — das Hauptpaket `@lix-js/sdk` trägt "license": "MIT", die
 * plattformspezifischen native-Binary-Pakete aus demselben Monorepo lassen
 * das Feld im package.json schlicht weg (verifiziert gegen
 * https://github.com/opral/lix/blob/main/LICENSE). Eine versionsgepinnte
 * Ausnahme (--excludePackages von license-checker kennt nur name@version)
 * würde bei jedem lix-Release erneut brechen — deshalb die Namensmuster-
 * Ausnahme hier statt in package.json.
 */
describe('isKnownMissingLicenseMetadata', () => {
	it('erkennt die lix-Plattformpakete unabhängig von der Version', () => {
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk-linux-x64@0.16.1')).toBe(true);
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk-darwin-arm64@0.17.1')).toBe(true);
	});

	it('lässt das Haupt-SDK-Paket unberührt — es trägt "license": "MIT" korrekt', () => {
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk@0.16.1')).toBe(false);
	});

	it('greift bei keinem anderen Scoped-Paket', () => {
		expect(isKnownMissingLicenseMetadata('@inlang/paraglide-js@2.25.2')).toBe(false);
	});
});

describe('findDisallowedPackages', () => {
	it('lässt erlaubte Lizenzen durch', () => {
		const violations = findDisallowedPackages({
			'foo@1.0.0': { licenses: 'MIT' },
			'bar@2.0.0': { licenses: 'BSD-3-Clause' }
		});
		expect(violations).toEqual([]);
	});

	it('meldet ein Paket mit nicht erlaubter Lizenz', () => {
		const violations = findDisallowedPackages({
			'foo@1.0.0': { licenses: 'MIT' },
			'copyleft-pkg@1.0.0': { licenses: 'GPL-3.0' }
		});
		expect(violations).toEqual([{ name: 'copyleft-pkg@1.0.0', licenses: 'GPL-3.0' }]);
	});

	it('ignoriert UNKNOWN bei den bekannten lix-Plattformpaketen', () => {
		const violations = findDisallowedPackages({
			'@lix-js/sdk-linux-x64@0.16.1': { licenses: 'UNKNOWN' },
			'@lix-js/sdk@0.16.1': { licenses: 'MIT' }
		});
		expect(violations).toEqual([]);
	});

	it('meldet UNKNOWN weiterhin bei jedem anderen Paket', () => {
		const violations = findDisallowedPackages({
			'irgendein-paket@1.0.0': { licenses: 'UNKNOWN' }
		});
		expect(violations).toEqual([{ name: 'irgendein-paket@1.0.0', licenses: 'UNKNOWN' }]);
	});

	it('behandelt ein Lizenz-Array wie license-checker es liefert', () => {
		// Dieselbe Teilstring-Semantik wie das bisherige --onlyAllow: eine
		// erlaubte Lizenz irgendwo im String reicht, auch neben einer nicht
		// erlaubten — das galt vorher schon so und wird hier nicht verschärft.
		const violations = findDisallowedPackages({
			'multi@1.0.0': { licenses: ['MIT', 'GPL-3.0'] }
		});
		expect(violations).toEqual([]);
	});

	it('nutzt dieselbe Teilstring-Semantik wie license-checker selbst', () => {
		// license-checker prüft per String.indexOf, nicht per exaktem Vergleich —
		// "BSD" in der Allow-Liste matcht deshalb auch "BSD-3-Clause".
		const violations = findDisallowedPackages({
			'foo@1.0.0': { licenses: 'BSD-3-Clause' }
		});
		expect(violations).toEqual([]);
	});

	it('exportiert dieselbe Allow-Liste, die bisher an --onlyAllow ging', () => {
		expect(ALLOWED_LICENSES).toContain('MIT');
		expect(ALLOWED_LICENSES).toContain('(MIT OR Apache-2.0)');
	});
});
