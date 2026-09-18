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
 * würde bei jedem lix-Release erneut brechen — deshalb die Namensausnahme
 * hier statt in package.json, und zusätzlich nur wirksam, wenn die gemeldete
 * Lizenz tatsächlich die Metadaten-Lücke (UNKNOWN) ist.
 */
describe('isKnownMissingLicenseMetadata', () => {
	it('erkennt die bekannten lix-Plattformpakete unabhängig von der Version', () => {
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk-linux-x64@0.16.1', 'UNKNOWN')).toBe(true);
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk-darwin-arm64@0.17.1', 'UNKNOWN')).toBe(true);
	});

	it('lässt das Haupt-SDK-Paket unberührt — es trägt "license": "MIT" korrekt', () => {
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk@0.16.1', 'MIT')).toBe(false);
	});

	it('greift bei keinem anderen Scoped-Paket', () => {
		expect(isKnownMissingLicenseMetadata('@inlang/paraglide-js@2.25.2', 'UNKNOWN')).toBe(false);
	});

	it('greift bei einem unbekannten lix-Plattformnamen NICHT — neue Plattformen fallen bewusst durch', () => {
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk-freebsd-x64@0.18.0', 'UNKNOWN')).toBe(false);
	});

	it('greift NICHT, wenn ein bekanntes lix-Paket ausnahmsweise eine echte, unzulässige Lizenz meldet', () => {
		// Die Namensliste allein darf kein Freibrief sein — nur die tatsächliche
		// Metadaten-Lücke (UNKNOWN/leer) wird entschuldigt, keine andere Lizenz.
		expect(isKnownMissingLicenseMetadata('@lix-js/sdk-linux-x64@0.16.1', 'GPL-3.0')).toBe(false);
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

	it('meldet ein bekanntes lix-Paket trotzdem, falls es echt GPL wäre (fail closed)', () => {
		const violations = findDisallowedPackages({
			'@lix-js/sdk-linux-x64@0.16.1': { licenses: 'GPL-3.0' }
		});
		expect(violations).toEqual([{ name: '@lix-js/sdk-linux-x64@0.16.1', licenses: 'GPL-3.0' }]);
	});

	it('meldet ein unbekanntes zukünftiges lix-Plattformpaket trotz UNKNOWN (fail closed statt fail open)', () => {
		const violations = findDisallowedPackages({
			'@lix-js/sdk-freebsd-x64@0.18.0': { licenses: 'UNKNOWN' }
		});
		expect(violations).toEqual([{ name: '@lix-js/sdk-freebsd-x64@0.18.0', licenses: 'UNKNOWN' }]);
	});

	it('erkennt ein Array mit einem exakt erlaubten Element als erlaubt', () => {
		// license-checker prüft bei einem Array per Array.prototype.indexOf, also
		// exaktes Element — "MIT" als eigenes Element reicht, egal was daneben steht.
		const violations = findDisallowedPackages({
			'multi@1.0.0': { licenses: ['MIT', 'GPL-3.0'] }
		});
		expect(violations).toEqual([]);
	});

	it('lässt ein Array NICHT über einen bloßen Teilstring durch (anders als bei einem String)', () => {
		// "The MIT License" enthält "MIT" als Teilstring, ist aber als Array-Element
		// kein exaktes "MIT" — license-checkers Array.indexOf('MIT') wäre hier -1.
		// Ein join(', ').includes(...) würde das fälschlich als erlaubt behandeln.
		const violations = findDisallowedPackages({
			'multi@1.0.0': { licenses: ['GPL-3.0', 'The MIT License'] }
		});
		expect(violations).toEqual([{ name: 'multi@1.0.0', licenses: 'GPL-3.0, The MIT License' }]);
	});

	it('nutzt bei einem String weiterhin Teilstring-Semantik wie license-checker selbst', () => {
		// license-checker prüft bei einem String per String.indexOf —
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
