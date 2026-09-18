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
 * auslösen. Deshalb hier eine namentliche Ausnahme statt einer Versions-
 * Ausnahme — und zusätzlich an die Bedingung geknüpft, dass die gemeldete
 * Lizenz tatsächlich die Metadaten-Lücke ist (UNKNOWN/leer), nicht eine
 * andere, echt unzulässige Lizenz.
 *
 * Aufruf über `vite-node` statt bloßem `node`: `package.json` unterstützt
 * laut `engines` auch Node 20.19/22.12, die `.ts`-Dateien ohne zusätzlichen
 * Runner nicht ausführen können (native Type-Stripping gibt es erst ab
 * Node 22.18/24 durchgängig) — `vite-node` ist bereits Dev-Dependency und
 * läuft auf jeder unterstützten Version.
 *
 * Der CLI-Einstieg steht bewusst nicht hier, sondern in licenseAuditCli.ts:
 * unter vite-node ist `process.argv[1]` der vite-node-Loader, nie diese
 * Datei (derselbe Fall wie in import-legacy-inbox-cli.js beschrieben) — ein
 * `isDirectRun`-Guard hier wäre nie wahr. Die Trennung hält diese Datei
 * außerdem frei vom Nebeneffekt "license-checker läuft beim Import", der
 * sonst auch licenseAudit.test.ts träfe.
 */
import { init } from 'license-checker';

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

/**
 * Explizite Liste statt `^@lix-js\/sdk-[a-z0-9-]+$` — ein Muster auf den
 * Namens-Präfix allein würde auch ein hypothetisches `@lix-js/sdk-cli` mit
 * echter GPL- oder UNKNOWN-Lizenz durchlassen. Ein neues lix-Release mit
 * einer weiteren Plattform (Stand jetzt: darwin-arm64, linux-arm64,
 * linux-x64, win32-x64, siehe package-lock.json) fällt hier bewusst
 * **durch** die Prüfung, statt automatisch akzeptiert zu werden — die Liste
 * ergänzen ist der Preis für "fail closed" statt "fail open".
 */
const KNOWN_LIX_NATIVE_PACKAGES = new Set([
	'@lix-js/sdk-darwin-arm64',
	'@lix-js/sdk-darwin-x64',
	'@lix-js/sdk-linux-arm64',
	'@lix-js/sdk-linux-x64',
	'@lix-js/sdk-win32-arm64',
	'@lix-js/sdk-win32-x64'
]);

export interface PackageLicenseInfo {
	licenses?: string | string[];
}

/** `name@version` -> `name`. Funktioniert auch für gescopte Pakete (`@scope/name@version`). */
function packageNameOf(packageNameAtVersion: string): string {
	const atIndex = packageNameAtVersion.lastIndexOf('@');
	return atIndex > 0 ? packageNameAtVersion.slice(0, atIndex) : packageNameAtVersion;
}

/** license-checker meldet eine fehlende `license`-Angabe im package.json als diesen Literal. */
function isMissingLicenseMetadata(licenses: string | string[] | undefined): boolean {
	if (licenses === undefined) return true;
	const values = Array.isArray(licenses) ? licenses : [licenses];
	return values.every((value) => value.trim() === '' || value === 'UNKNOWN');
}

/**
 * Nur wahr, wenn BEIDES zutrifft: das Paket steht auf der lix-Namensliste
 * UND die gemeldete Lizenz ist tatsächlich die Metadaten-Lücke (UNKNOWN/leer)
 * — nicht irgendeine andere, echt unzulässige Lizenz. Sonst würde die
 * Namens-Ausnahme allein auch ein zukünftiges Paket mit expliziter GPL-
 * Lizenz durchlassen.
 */
export function isKnownMissingLicenseMetadata(
	packageNameAtVersion: string,
	licenses?: string | string[]
): boolean {
	const name = packageNameOf(packageNameAtVersion);
	return KNOWN_LIX_NATIVE_PACKAGES.has(name) && isMissingLicenseMetadata(licenses);
}

export interface LicenseViolation {
	name: string;
	licenses: string;
}

/**
 * Dieselbe Unterscheidung wie license-checkers `--onlyAllow`
 * (`restricted[item].licenses.indexOf(k)`): bei einem Array prüft
 * `indexOf` auf ein exaktes Element, bei einem String auf einen Teilstring.
 * `['GPL-3.0', 'The MIT License']` enthält kein Element, das exakt "MIT"
 * ist — anders als der String "MIT License", der "MIT" als Teilstring
 * enthält. Wer beides über `join(', ').includes(...)` prüft, verwischt
 * diesen Unterschied und lässt Arrays lockerer durch als das Original.
 */
function matchesAllowedLicense(licenses: string | string[], allowed: string): boolean {
	// `.includes()` resolves to Array.prototype (exaktes Element) oder
	// String.prototype (Teilstring) je nach Laufzeittyp — genau die
	// Unterscheidung, die license-checkers eigenes `indexOf` trifft.
	if (Array.isArray(licenses)) return licenses.includes(allowed);
	return licenses.includes(allowed);
}

function formatLicenses(licenses: string | string[] | undefined): string {
	if (licenses === undefined) return '';
	return Array.isArray(licenses) ? licenses.join(', ') : licenses;
}

export function findDisallowedPackages(
	packages: Record<string, PackageLicenseInfo>,
	allowedLicenses: readonly string[] = ALLOWED_LICENSES
): LicenseViolation[] {
	const violations: LicenseViolation[] = [];

	for (const [name, info] of Object.entries(packages)) {
		const licenses = info.licenses ?? '';
		const isAllowed = allowedLicenses.some((allowed) => matchesAllowedLicense(licenses, allowed));
		if (isAllowed) continue;

		if (isKnownMissingLicenseMetadata(name, info.licenses)) continue;

		violations.push({ name, licenses: formatLicenses(info.licenses) });
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

export async function runLicenseAudit(): Promise<void> {
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
