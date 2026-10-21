import { defineConfig, devices } from '@playwright/test';
import {
	CI_DEV_HOST,
	ciDevPort,
	devPortFromEnv,
	loopbackHostFor,
	worktreeDevPort
} from './src/tools/dev-server-identity';

/**
 * Lokal bekommt jedes Arbeitsverzeichnis seinen eigenen Port.
 *
 * Vorher stand hier für *alle* Worktrees fest 4001 (`VITE_DEV_PORT=4001` im
 * `test:e2e`-Skript). Zusammen mit `reuseExistingServer` benutzte ein Lauf damit
 * kommentarlos den Dev-Server eines anderen Worktrees — gemessen am 2026-08-02, als
 * 4000 *und* 4001 einem fremden Branch gehörten. Ein manuell gesetztes `VITE_DEV_PORT`
 * hat weiterhin Vorrang (nützlich, um den Abbruch in `e2e/global-setup.ts` vorzuführen).
 *
 * CI bleibt bei 4000: dort läuft genau ein Job in einem eigenen Container. Port und Host
 * kommen aus `dev-server-identity` — derselben Quelle, aus der `vite.config.ci.ts` seinen
 * Bind bezieht. Beide Seiten aus einer Quelle zu speisen ist hier keine Kosmetik: Der
 * webServer-Timeout vom 2026-08-04 entstand genau daran, dass sie es nicht waren.
 */
const devPort = process.env.CI ? ciDevPort() : (devPortFromEnv() ?? worktreeDevPort(process.cwd()));

/**
 * Der Host, unter dem Playwright auf den Server wartet, muss zu dessen Bind passen.
 *
 * In CI bindet `vite.config.ci.ts` auf `CI_DEV_HOST` (IPv4-Wildcard); `localhost` löst auf
 * macOS aber zuerst nach `::1` auf und traf damit nicht den eigenen Server, sondern einen
 * dort zufällig lauschenden — bei parallelem `npm run dev` den fremden HTTPS-Dev-Server.
 * Auf dessen Klartext-HTTP-Antwort wartete Playwright die vollen 120 s. `loopbackHostFor`
 * leitet die Adresse aus dem Bind ab, statt sie zu raten.
 *
 * Lokal bleibt es bei `localhost`: Dort bindet `vite.config.ts` selbst auf `localhost`,
 * und das Dev-Zertifikat ist auf diesen Namen ausgestellt.
 */
const baseURL = process.env.CI
	? `http://${loopbackHostFor(CI_DEV_HOST)}:${devPort}`
	: `https://localhost:${devPort}`;

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	webServer: {
		command: process.env.CI ? 'npx vite dev --config vite.config.ci.ts' : 'npm run dev',
		url: baseURL,
		env: { VITE_DEV_PORT: String(devPort) },
		/**
		 * Bleibt lokal an: Ein übrig gebliebener Server *dieses* Worktrees spart bei
		 * jedem Lauf den Kaltstart. Dass er auch wirklich aus diesem Verzeichnis
		 * ausliefert, prüft `e2e/global-setup.ts` — Wiederverwendung ist damit
		 * überprüft statt geraten.
		 */
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
		ignoreHTTPSErrors: true
	},
	testDir: 'e2e',
	/* e2e/helpers/*.test.ts are vitest unit tests (collected separately by vitest.config.ts's
	 * `server` project) that happen to live under e2e/ — Playwright's default glob would
	 * otherwise pick them up too and crash at collection time. */
	testIgnore: ['**/helpers/**'],
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 1 : 0,
	/* CI: 1 worker — Vite dev server can't handle parallel page compilation reliably */
	// Bedingt gespreizt statt `: undefined` — unter exactOptionalPropertyTypes darf ein
	// optionales Feld nicht explizit `undefined` sein (Playwright-Default bleibt lokal aktiv).
	...(process.env.CI ? { workers: 1 } : {}),
	/* Global test timeout */
	timeout: 30000,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: process.env.CI ? 'github' : 'html',
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL,
		/**
		 * Ohne diese Angabe entscheidet Chromiums Standardsprache (`en-US`) über
		 * `Accept-Language` und damit über die Weiterleitung auf `/` nach `/en`
		 * (siehe `zielFuerStartseite` in `src/lib/i18n/startseitenWeiterleitung.ts`).
		 * `page.goto('/')` würde dann still die englische Startseite prüfen statt
		 * der deutschen. Specs, die gezielt Englisch testen, überschreiben das
		 * lokal mit `test.use({ locale: 'en-GB' })` (siehe `e2e/i18n-routing.spec.ts`).
		 */
		locale: 'de-DE',
		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',
		/* Screenshot on failure */
		screenshot: 'only-on-failure',
		/* Ignore HTTPS errors for local development */
		ignoreHTTPSErrors: !process.env.CI,
		actionTimeout: 15000,
		navigationTimeout: 15000
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
