/**
 * Vite config for local development (HTTPS, HMR, warmup).
 * See also: vite.config.ci.ts (CI/E2E), vite.config.preview.ts (preview server)
 */
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import {
	devPortFromEnv,
	devServerIdentity,
	worktreeWatchIgnore
} from './src/tools/dev-server-identity.ts';
import { stableDepHash } from './src/tools/vite-stable-dep-hash.ts';
import { OL_OPTIMIZE_DEPS } from './src/tools/olOptimizeDeps.ts';
import { SVELTEKIT_OPTIONS } from './sveltekit.options.ts';

/**
 * Im Git-Worktree löst Node `node_modules` aus dem Haupt-Repo auf — außerhalb des
 * Worktree-Roots. Ohne Freigabe blockt `server.fs.allow` dort alles, was per `/@fs/`
 * ausgeliefert wird (sichtbar zuerst an den `@fontsource`-Schriften: 403). Gleiche
 * Ermittlung wie in vite.config.ci.ts, Hintergrund in docs/WORKTREES.md.
 */
const nodeModulesDir = path.dirname(
	path.dirname(createRequire(import.meta.url).resolve('vite/package.json'))
);

const certFile = fileURLToPath(new URL('./certs/localhost.pem', import.meta.url));
const keyFile = fileURLToPath(new URL('./certs/localhost-key.pem', import.meta.url));

/**
 * Von mkcert ausgestellte Zertifikate (scripts/setup-dev-certs.mjs, läuft vor `npm run dev`)
 * akzeptiert Chrome ohne Warnung. Fehlen sie — etwa weil mkcert nicht installiert ist —
 * übernimmt basicSsl mit einem selbstsignierten Zertifikat: funktioniert, zeigt aber das
 * Chrome-Interstitial.
 */
const devCert =
	existsSync(certFile) && existsSync(keyFile)
		? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
		: null;

export default defineConfig({
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
			// Ohne explizite Angabe wechselt das Plugin außerhalb von `NODE_ENV=production`
			// (also in jedem lokalen Dev-Lauf) automatisch auf `locale-modules` statt
			// `message-modules` (unplugin.js: "default to locale-modules for development
			// to speed up the dev server"). Die CLI (`npm run i18n:compile`) kennt diesen
			// Sonderfall nicht und erzeugt immer `message-modules` — ohne diese Zeile
			// hinge die Dateistruktur unter `src/lib/paraglide/messages/` davon ab, wer
			// zuletzt kompiliert hat. `scripts/i18nGate.test.ts` sichert die
			// Übereinstimmung ab.
			outputStructure: 'message-modules'
		}),

		sveltekit(SVELTEKIT_OPTIONS),

		Icons({
			compiler: 'svelte',
			autoInstall: true,
			iconCustomizer(_collection, _icon, props) {
				// Set default width and height
				props.width = props.width || '20';
				props.height = props.height || '20';
			}
		}),
		...(devCert
			? []
			: [
					basicSsl({
						name: 'localhost',
						domains: ['localhost', '*.local.dev'],
						certDir: './certs/basic-ssl'
					})
				]),
		// Meldet unter /__dev-server-identity, aus welchem Verzeichnis ausgeliefert wird.
		devServerIdentity(),
		// Zuletzt: sortiert resolve.external/noExternal nach allen anderen Plugins.
		stableDepHash()
	],
	server: {
		host: 'localhost',
		// Über `devPortFromEnv`, damit `VITE_DEV_PORT` hier nicht anders verstanden wird
		// als in playwright.config.ts (`parseInt('4300abc')` ergab 4300, `Number` NaN).
		port: devPortFromEnv() ?? 4000,
		/**
		 * Ohne `strictPort` weicht Vite bei belegtem Port still auf den nächsten aus.
		 * Das ist hier immer ein Fehlerzustand, nie eine brauchbare Rückfallebene:
		 * `PUBLIC_SITE_URL` steht fest auf 4000 und baut daraus die Auth0-Callback-URL,
		 * ein Server auf 4001 hat also einen kaputten Login. Und weil Playwright lokal
		 * einen vorhandenen Server wiederverwendet, machte genau dieses Ausweichen
		 * E2E-Läufe gegen fremde Worktrees möglich. Abbruch mit Meldung ist richtig.
		 */
		strictPort: true,
		...(devCert ? { https: devCert } : {}),
		hmr: { overlay: true },
		fs: {
			// fs.allow ersetzt Vites Default (Workspace-Root) — daher beides angeben
			allow: [searchForWorkspaceRoot(process.cwd()), nodeModulesDir]
		},
		/**
		 * Git-Worktrees liegen unter `.claude/worktrees/` *innerhalb* des Repo-Roots.
		 * Aktuell hält Vite sie ohnehin heraus (es beobachtet nur Dateien aus dem
		 * Modulgraph), und alle übrigen Tools schließen sie über `.gitignore` aus.
		 * Der Eintrag hier ist die Absicherung: Fällt die `.gitignore`-Zeile weg,
		 * beobachtet der Watcher sonst still ein Vielfaches an Dateien.
		 * Vite ergänzt seine Defaults (`**\/node_modules/**`, `**\/.git/**`).
		 *
		 * **Nur im Haupt-Repo.** Chokidar vergleicht `ignored` gegen den absoluten
		 * Pfad; im Worktree matchte das Muster jede eigene Quelldatei und legte
		 * HMR still — lautlos, denn ein Watcher, der nichts sieht, meldet nichts.
		 * Begründung und Prüfung in `worktreeWatchIgnore`.
		 */
		watch: {
			ignored: worktreeWatchIgnore()
		},
		// Warmup critical modules for faster initial page load
		warmup: {
			clientFiles: [
				'./src/routes/+layout.svelte',
				'./src/routes/+page.svelte',
				'./src/app.css',
				'./src/lib/report/components/ModernReportForm.svelte'
			]
		}
	},
	optimizeDeps: {
		// Pre-bundle these dependencies to avoid CommonJS issues and improve startup performance
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
