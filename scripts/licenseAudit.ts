/**
 * `npm run license:audit` — Ersatz für den bloßen `license-checker --onlyAllow`-
 * Aufruf.
 *
 * Grund: license-checker meldet `@lix-js/sdk-linux-x64` (Dependency von
 * @inlang/paraglide-js, seit dem Upgrade in PR #923) als Lizenz "UNKNOWN" und
 * bricht deshalb bei jedem PR ab, egal was der PR ändert — am 2026-09-18 waren
 * dadurch alle offenen Dependabot-PRs rot. Das Hauptpaket `@lix-js/sdk`
 * trägt "license": "MIT" korrekt; die plattformspezifischen native-Binary-
 * Pakete aus demselben lix-Monorepo lassen das Feld im package.json nur
 * schlicht weg (verifiziert gegen
 * https://github.com/opral/lix/blob/main/LICENSE, MIT).
 *
 * license-checkers eigene `--excludePackages` kennt nur `name@version` —
 * eine damit gepinnte Ausnahme würde bei jedem lix-Release (Dependabot bumpt
 * diese Pakete regelmäßig) wieder brechen, also exakt das Symptom erneut
 * auslösen. Deshalb hier ein Namensmuster statt einer Versions-Ausnahme.
 */
import { init } from 'license-checker';
import { pathToFileURL } from 'node:url';

export const ALLOWED_LICENSES = [
	'MIT',
	'MIT-0',
	'ISC',
	'BSD',
	'Apache-2.0',
	'Apache 2.0',
	'BSD-2-Clause',
	'BSD-3-Clause',
	'CC0-1.0',
	'Unlicense',
	'WTFPL',
	'0BSD',
	'OFL-1.1',
	'BlueOak-1.0.0',
	'Python-2.0',
	'MPL-2.0',
	'Artistic-2.0',
	'CC-BY-3.0',
	'(MIT OR Apache-2.0)',
	'(MPL-2.0 OR Apache-2.0)',
	'(MIT AND Zlib)',
	'(MIT OR CC0-1.0)',
	'(MIT AND CC-BY-3.0)',
	'(BSD-2-Clause OR MIT OR Apache-2.0)',
	'MIT AND BSD-3-Clause'
] as const;

const KNOWN_MISSING_LICENSE_METADATA = [/^@lix-js\/sdk-[a-z0-9-]+$/];

export interface PackageLicenseInfo {
	licenses?: string | string[];
}

/** `name@version` -> `name`. Funktioniert auch für gescopte Pakete (`@scope/name@version`). */
function packageNameOf(packageNameAtVersion: string): string {
	const atIndex = packageNameAtVersion.lastIndexOf('@');
	return atIndex > 0 ? packageNameAtVersion.slice(0, atIndex) : packageNameAtVersion;
}

export function isKnownMissingLicenseMetadata(packageNameAtVersion: string): boolean {
	const name = packageNameOf(packageNameAtVersion);
	return KNOWN_MISSING_LICENSE_METADATA.some((pattern) => pattern.test(name));
}

export interface LicenseViolation {
	name: string;
	licenses: string;
}

/**
 * Dieselbe Teilstring-Semantik wie license-checkers `--onlyAllow`
 * (`licenses.indexOf(k) !== -1`), damit dieses Skript nichts strenger oder
 * lockerer prüft als der bisherige CLI-Aufruf — nur die lix-Ausnahme kommt
 * neu dazu.
 */
export function findDisallowedPackages(
	packages: Record<string, PackageLicenseInfo>,
	allowedLicenses: readonly string[] = ALLOWED_LICENSES
): LicenseViolation[] {
	const violations: LicenseViolation[] = [];

	for (const [name, info] of Object.entries(packages)) {
		if (isKnownMissingLicenseMetadata(name)) continue;

		const licenses = Array.isArray(info.licenses)
			? info.licenses.join(', ')
			: (info.licenses ?? '');
		const isAllowed = allowedLicenses.some((allowed) => licenses.includes(allowed));
		if (!isAllowed) violations.push({ name, licenses });
	}

	return violations;
}

function readPackages(): Promise<Record<string, PackageLicenseInfo>> {
	return new Promise((resolve, reject) => {
		init(
			{ start: '.', excludePrivatePackages: true },
			(error: unknown, packages: Record<string, PackageLicenseInfo>) => {
				if (error) reject(error);
				else resolve(packages);
			}
		);
	});
}

async function main(): Promise<void> {
	const packages = await readPackages();
	const violations = findDisallowedPackages(packages);

	if (violations.length > 0) {
		for (const violation of violations) {
			console.error(
				`Package "${violation.name}" is licensed under "${violation.licenses}" which is not permitted by the license audit. Exiting.`
			);
		}
		process.exitCode = 1;
		return;
	}

	console.log('✅ Alle Lizenzen erlaubt (oder als bekannte Metadaten-Lücke bestätigt)');
}

const isDirectRun =
	typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
