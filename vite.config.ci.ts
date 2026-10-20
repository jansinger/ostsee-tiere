/**
 * Vite config for CI/E2E tests (no HTTPS, SKIP_DB_CHECK, no HMR).
 * See also: vite.config.ts (development), vite.config.preview.ts (preview server)
 */
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import path from 'node:path';
import Icons from 'unplugin-icons/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { CI_DEV_HOST, ciDevPort, devServerIdentity } from './src/tools/dev-server-identity.ts';
import { stableDepHash } from './src/tools/vite-stable-dep-hash.ts';
import { OL_OPTIMIZE_DEPS } from './src/tools/olOptimizeDeps.ts';

/**
 * In Git-Worktrees liegt das installierte node_modules außerhalb des
 * Worktree-Roots (Node löst es per Verzeichnis-Aufstieg aus dem Haupt-Repo
 * auf). Vites server.fs.allow blockt dann die Auslieferung z. B. von
 * vitest-browser-svelte an die Browser-Tests. Deshalb das reale
 * node_modules über Nodes eigene Auflösung ermitteln — ein bloßer
 * Existenz-Check reicht nicht, weil Vite im Worktree ein Cache-Stub
 * (node_modules/.vite) ohne Pakete anlegt.
 */
const require = createRequire(import.meta.url);
const nodeModulesDir = path.dirname(path.dirname(require.resolve('vite/package.json')));

export default defineConfig({
	// Set environment variable to skip database check in CI/E2E tests
	define: {
		'process.env.SKIP_DB_CHECK': JSON.stringify('true')
	},
	plugins: [
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// Ohne `preferredLanguage`: präfixlos ist immer Deutsch. Sonst rendert
			// dieselbe URL je nach Browser-Header zwei Inhalte — nicht cachebar und
			// für Suchmaschinen ein Duplikat. Begründung: Entwurf, Abschnitt 4.5.
			strategy: ['url', 'cookie', 'baseLocale'],
			// Nagelt den Dev-Sonderfall des Plugins fest (`locale-modules` statt
			// `message-modules` außerhalb von `NODE_ENV=production`) — Begründung in
			// vite.config.ts.
			outputStructure: 'message-modules'
		}),
		Icons({
			compiler: 'svelte',
			autoInstall: true,
			iconCustomizer(_collection, _icon, props) {
				// Set default width and height
				props.width = props.width || '20';
				props.height = props.height || '20';
			}
		}),
		sveltekit(),
		// No basicSsl plugin for CI to avoid HTTPS certificate issues
		// Auch in CI: Der Identitäts-Check in e2e/global-setup.ts läuft unbedingt, damit
		// ein versehentlich entferntes Plugin auffällt statt still die Prüfung abzuschalten.
		devServerIdentity(),
		// Zuletzt: sortiert resolve.external/noExternal nach allen anderen Plugins.
		stableDepHash()
	],
	server: {
		/*
		 * Host und Port kommen aus `src/tools/dev-server-identity.ts`, weil
		 * `playwright.config.ts` daraus die Adresse ableitet, an der es auf den Server
		 * wartet. Standen sie hier als Literale, konnten Bind-Adresse und Abfrage-Adresse
		 * auseinanderlaufen — genau das war die Ursache des webServer-Timeouts vom
		 * 2026-08-04 (`0.0.0.0` gebunden, `localhost` → `::1` abgefragt).
		 */
		host: CI_DEV_HOST,
		// Vorher hart 4000 — das von playwright.config.ts gesetzte VITE_DEV_PORT lief damit ins Leere.
		port: ciDevPort(),
		strictPort: true,
		// Disable HMR overlay for CI
		hmr: false,
		fs: {
			// fs.allow ersetzt Vites Default (Workspace-Root) — daher beides angeben
			allow: [searchForWorkspaceRoot(process.cwd()), nodeModulesDir]
		}
	},
	optimizeDeps: {
		// Pre-bundle these dependencies to avoid CommonJS issues
		include: [
			'yup',
			/* Die `ol/*`-Unterpfade einzeln — `'ol'` allein deckt nur den
			   Paket-Einstieg ab. Seit `OLMap.svelte` die Helfer dynamisch
			   nachlädt, findet Vites Scanner sie sonst erst zur Laufzeit und
			   optimiert mitten im Testlauf nach; die Folge sind `effect_orphan`
			   in fremden Komponenten. Begründung und Nachstellung in
			   `src/tools/olOptimizeDeps.ts`. */
			...OL_OPTIMIZE_DEPS,
			'@turf/boolean-point-in-polygon',
			'@turf/helpers',
			'drizzle-orm',
			'exifr',
			'rbush'
		],
		// Exclude large packages that are only used in specific routes
		exclude: ['@scalar/sveltekit', 'handlebars']
	},
	resolve: {
		// Ensure consistent module resolution
		conditions: ['browser', 'import', 'module', 'default']
	}
});
