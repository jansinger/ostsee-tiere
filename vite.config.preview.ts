/**
 * Vite config for preview server (no HTTPS, port 4000).
 * See also: vite.config.ts (development), vite.config.ci.ts (CI/E2E)
 */
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SVELTEKIT_OPTIONS } from './sveltekit.options.ts';

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
			// Nagelt den Dev-Sonderfall des Plugins fest (`locale-modules` statt
			// `message-modules` außerhalb von `NODE_ENV=production`) — Begründung in
			// vite.config.ts.
			outputStructure: 'message-modules'
		}),
		sveltekit(SVELTEKIT_OPTIONS)
		// No basicSsl plugin for preview in CI to avoid HTTPS certificate issues
	],
	preview: {
		port: 4000,
		host: true,
		strictPort: true
	},
	resolve: {
		// Ensure consistent module resolution
		conditions: ['browser', 'import', 'module', 'default']
	}
});
