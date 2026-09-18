/**
 * Kommandozeilen-Einstieg für `npm run license:audit`.
 *
 * Eigene Datei, ohne `isDirectRun`-Bedingung, aus demselben Grund wie in
 * import-legacy-inbox-cli.js: unter `vite-node` ist `process.argv[1]` der
 * vite-node-Loader, nie diese Datei — eine solche Bedingung wäre nie wahr
 * und der Befehl endete kommentarlos. Die geprüfte Logik bleibt in
 * licenseAudit.ts, importierbar und ohne Seiteneffekt beim Import (sonst
 * liefe license-checker auch beim Laden von licenseAudit.test.ts).
 */
import { runLicenseAudit } from './licenseAudit';

runLicenseAudit().catch((error: unknown) => {
	// `error.name` bewusst mit ausgeben: der CI-Schritt "Validate license
	// compatibility" (.github/workflows/ci.yml) erkennt einen bekannten
	// license-checker-Absturz auf Node 24 daran, dass die Ausgabe den String
	// "TypeError" enthält, und behandelt ihn dann als überspringbar statt als
	// echten Audit-Fehler. Nur `error.message` auszugeben würde diese
	// Erkennung unterlaufen.
	console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	process.exitCode = 1;
});
