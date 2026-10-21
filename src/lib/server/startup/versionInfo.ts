/**
 * Baut Version-/Commit-/Build-Info für Startup-Log, `/health` und Admin-Footer.
 *
 * Docker-Images tragen kein `.git` — Version/Commit/Build-Zeit kommen deshalb als
 * Build-Args (`VERSION`, `VCS_REF`, `BUILD_DATE`, siehe Dockerfile) über die Env-Variablen
 * `APP_GIT_SHA`/`APP_BUILD_DATE` herein (`APP_VERSION` existiert zwar ebenfalls als
 * Env-Var, wird hier aber bewusst nicht gelesen — die Version kommt aus `package.json`,
 * siehe Kommentar bei `getBuildInfo()`). Lokale `npm run dev`-Starts und manuelle
 * `docker run` ohne Build-Args liefern hier `null` — dann steht explizit "unknown" da,
 * statt die Zeile stillschweigend zu verkürzen.
 */
import { env } from '#lib/server/env.ts';
import type { BuildInfo } from '#lib/types/BuildInfo.ts';
import { version as packageVersion } from '../../../../package.json';

export type { BuildInfo };

const SHORT_SHA_LENGTH = 7;

export function resolveBuildInfo(
	version: string,
	gitSha: string | null | undefined,
	buildDate: string | null | undefined
): BuildInfo {
	const sha = gitSha ? gitSha.trim() || null : null;
	const build = buildDate ? buildDate.trim() || null : null;

	return {
		version,
		gitSha: sha,
		shortGitSha: sha ? sha.slice(0, SHORT_SHA_LENGTH) : 'unknown',
		buildDate: build
	};
}

export function formatStartupBanner(info: BuildInfo, nodeEnv: string): string {
	return `Ostsee-Tiere v${info.version} | commit ${info.shortGitSha} | built ${info.buildDate ?? 'unknown'} | env ${nodeEnv}`;
}

// version kommt aus package.json statt aus env.APP_VERSION/env.npm_package_version: Der
// Docker-Container startet mit `node build/index.js` (siehe docker-entrypoint.sh), nicht
// über `npm run` — npm_package_version ist dort nie gesetzt. env.APP_VERSION wäre zwar
// gesetzt, trägt aber je nach Build-Pfad ein anderes Format als package.json (CI-Tags
// haben ein führendes "v", `npm run docker:build` nicht) — package.json ist die einzige
// Quelle, die in jedem Kontext (lokal, Docker, CI) konsistent ist.
//
// Gecacht, weil version/gitSha/buildDate für die Prozesslaufzeit konstant sind — `/health`
// wird von Docker alle 30s abgefragt und soll dafür nicht bei jedem Request neu auflösen.
let cachedBuildInfo: BuildInfo | undefined;

export function getBuildInfo(): BuildInfo {
	cachedBuildInfo ??= resolveBuildInfo(packageVersion, env.APP_GIT_SHA, env.APP_BUILD_DATE);
	return cachedBuildInfo;
}
