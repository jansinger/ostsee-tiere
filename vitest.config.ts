import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { worktreeBrowserApiPort } from './src/tools/dev-server-identity.ts';

export default defineConfig({
	test: {
		/**
		 * Vitests Default sind 10 s — und die werden im Browser-Projekt *jedes Mal*
		 * voll ausgeschöpft: Nach dem letzten Test bleiben Dateihandles offen, die
		 * der `hanging-process`-Reporter nur als „FILEHANDLE (unknown stack trace)"
		 * ausweist, und der Lauf endet mit „close timed out after 10000ms". Danach
		 * beendet sich der Prozess von selbst; nachgemessen bleibt weder Port noch
		 * Chromium zurück. Es ist also eine reine Wartezeit — bei einem Lauf von
		 * ~17 s über ein Drittel der Gesamtdauer, und die fällt bei jedem Gate an.
		 *
		 * Bewusst nur gekürzt, nicht abgeschaltet: Bliebe eines Tages doch etwas
		 * zurück, ist die Meldung der einzige Hinweis darauf.
		 */
		teardownTimeout: 2_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/lib/**/*.ts'],
			exclude: [
				// Enum/Option definitions — pure data, no logic
				'src/lib/report/formOptions/**',
				// Test files
				'**/*.test.ts',
				'**/*.spec.ts',
				'**/*.testutil.ts',
				// Erzeugter Paraglide-Code (Task 1) — nicht ausgelieferter Quelltext, siehe .gitignore
				'src/lib/paraglide/**',
				// Type-only files
				'src/**/*.d.ts',
				// OpenLayers map controllers — instantiate OL Map/View/Layer/Canvas, need real DOM+WebGL
				'src/lib/map/optimizedMapController.ts',
				'src/lib/map/controls/**',
				// OpenLayers helper utilities — import OL modules, require real DOM+WebGL
				'src/lib/utils/map/**',
				// Type definition files only
				'src/lib/types/**',
				// Svelte context / form wiring — Svelte runtime deps
				'src/lib/report/formContext.ts',
				// CLI tools — not unit-testable
				'src/tools/**',
				// Svelte stores/context — require Svelte runtime
				'src/lib/stores/**',
				// Map state management — requires OpenLayers runtime
				'src/lib/map/mapContext.ts',
				'src/lib/map/panelManager.ts',
				'src/lib/map/layerManager.ts',
				// Form field config — pure re-exports, tested via integration
				'src/lib/form/fields/**',
				// Server config — requires DB connection
				'src/lib/server/config/**',
				'src/lib/services/configService.ts',
				// Browser-only utilities — require browser APIs (Blob, URL, DOM, File, FormData)
				'src/lib/utils/download.ts',
				'src/lib/utils/fieldNavigation.ts',
				'src/lib/utils/client/**',
				'src/lib/utils/media/**',
				'src/lib/utils/upload/**',
				'src/lib/utils/uploadUtils.ts'
			],
			thresholds: {
				statements: 70,
				branches: 65,
				functions: 75,
				lines: 70
			}
		},
		projects: [
			{
				// Client browser tests use vite.config.ci.ts (no basicSsl/HTTPS)
				// vite.config.ts includes basicSsl which breaks headless Chromium
				extends: './vite.config.ci.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }],
						/*
						 * Ohne diese Zeile bindet Vitest fest auf 63315 — in *jedem*
						 * Worktree derselbe Port. Zwei gleichzeitige Läufe stören sich
						 * dann gegenseitig, und zwar nicht als Portfehler, sondern als
						 * vereinzelter Fehlschlag oder als „no tests": ein Befund, der
						 * nach einem Defekt am Code aussieht und keiner ist.
						 */
						api: { port: worktreeBrowserApiPort(process.cwd()) }
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['vitest-browser-svelte', './vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					/* `e2e/helpers/` steht hier bewusst mit — und bewusst nur dieses
					   Unterverzeichnis. Die Scan-Regeln aus `bannedClasses.ts` sind
					   reine Funktionen über Klassennamen und gehören damit in
					   `test:quick`, nicht erst in einen Playwright-Shard. Ein
					   breiteres `e2e/**` würde dagegen die Playwright-Specs
					   einsammeln (`e2e/basic.test.ts`, `e2e/homepage.test.ts`), die
					   `@playwright/test` als Runner brauchen und unter Vitest
					   scheitern. */
					include: [
						'src/**/*.{test,spec}.{js,ts}',
						'e2e/helpers/*.{test,spec}.{js,ts}',
						'legacy-inbox/**/*.test.js',
						/* `scripts/` steht hier wegen `ciJobGating.test.ts`: dem Wächter
						   über die Job-Gates in .github/workflows/ci.yml. Der gehört in
						   `test:quick`, weil sein Fehlermodus — ein Job läuft still nicht
						   mehr — sonst erst nach dem Merge sichtbar würde. */
						'scripts/*.{test,spec}.ts'
					],
					// Das node_modules-Muster muss explizit mit: Ein eigenes `exclude`
					// ersetzt Vitests Default. Ohne den Eintrag würde das
					// `legacy-inbox/**`-Include Testdateien aus den Abhängigkeiten
					// einsammeln, sobald dort jemand `npm install` ausführt.
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', '**/node_modules/**'],
					setupFiles: ['./vitest-setup-server.ts'],
					// Force UTC timezone for consistent date/time tests across environments
					env: {
						TZ: 'UTC',
						NODE_ENV: 'test'
					}
				}
			}
		]
	}
});
