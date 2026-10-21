/**
 * Version-/Commit-/Build-Info für Startup-Log, `/health` und Admin-Footer.
 *
 * Liegt unter `#lib/types` statt bei `$lib/server/startup/versionInfo.ts`, weil
 * `AdminFooter.svelte` (Client-Code) den Typ braucht — Module unter `#lib/server/**`
 * sind für Client-Imports gesperrt, auch bei reinen Typ-Importen.
 */
export interface BuildInfo {
	version: string;
	gitSha: string | null;
	shortGitSha: string;
	buildDate: string | null;
}
