/**
 * Optionen des `sveltekit()`-Vite-Plugins — vorher `svelte.config.js`.
 *
 * SvelteKit 3 liest `svelte.config.js` nicht mehr; die Konfiguration wird dem
 * Plugin direkt übergeben. Sie steht hier und nicht inline in `vite.config.ts`,
 * weil drei Vite-Konfigurationen `sveltekit()` aufrufen: Entwicklung
 * (`vite.config.ts`), CI/E2E und Komponententests (`vite.config.ci.ts`) und
 * Preview (`vite.config.preview.ts`). Vorher lasen alle drei dieselbe
 * `svelte.config.js`; `sv migrate sveltekit-3` trägt die Optionen aber nur in
 * `vite.config.ts` ein. CI und E2E liefen dann ohne CSP und ohne die übrige
 * Konfiguration, ohne dass ein Fehler auffällt.
 */
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import type { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Dynamically select adapter based on build target
const USE_NODE_ADAPTER = process.env.USE_NODE_ADAPTER === 'true';

let adapter;

if (USE_NODE_ADAPTER) {
	// Node adapter for Docker deployment
	adapter = adapterNode({
		out: 'build',
		// Seit adapter-node 6 ein Boolean; `true` erzeugt wie vorher gzip und brotli.
		// `polyfill` entfällt: Die Node-Polyfills betrafen nur Versionen, die
		// SvelteKit 3 nicht mehr unterstützt.
		precompress: true,
		envPrefix: ''
	});
} else {
	// Vercel adapter for cloud deployment (default)
	adapter = adapterVercel();
}

export const SVELTEKIT_OPTIONS = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	compilerOptions: {
		// Enable development mode for better debugging
		dev: process.env.NODE_ENV === 'development'
	},
	adapter,
	// Development-spezifische Konfigurationen
	version: {
		pollInterval: process.env.NODE_ENV === 'development' ? 0 : 5000
	},
	// CSP-Konfiguration
	// Seit SvelteKit 3 stehen Schlüsselwörter OHNE eigene Anführungszeichen ('self' statt
	// "'self'"); Kit setzt sie im Header selbst. Die alte Schreibweise ginge zwar
	// unverändert durch, aber Kit prüft intern auf `unsafe-inline` ohne Quotes — es hielte
	// den Eintrag für abwesend und ergänzte Nonces, die `unsafe-inline` im Browser aushebeln.
	csp: {
		mode: 'auto',
		directives: {
			'default-src': ['self'],
			'script-src': [
				'self',
				'wasm-unsafe-eval',
				// 'unsafe-inline' ist für die Scalar-API-Dokumentation (/docs/api/scalar)
				// nötig, die Inline-Scripts injiziert. Ein Nonce-basiertes CSP ist damit
				// nicht umsetzbar (Nonces und 'unsafe-inline' schließen sich für script-src
				// gegenseitig aus), daher wird auch KEIN cspNonce in hooks.server.ts erzeugt.
				'unsafe-inline',
				...(process.env.NODE_ENV === 'development' ? (['unsafe-eval'] as const) : [])
			],
			'style-src': ['self', 'unsafe-inline', 'https://openlayers.org'],
			// Ohne diese Direktive greift default-src ['self'] und blockiert die
			// blob:-URL, über die createVideoThumbnail() das Video lädt. Der
			// Ladefehler wird still verschluckt — es gibt dann weder Thumbnail
			// noch Fehlermeldung. Siehe docs/archive/VIDEO_UPLOAD_KONZEPT_2026-07-31.md.
			'media-src': ['self', 'blob:', 'data:'],
			'img-src': [
				'self',
				'data:' /* Korrekt mit Doppelpunkt */,
				'blob:',
				'https://tile.openstreetmap.org',
				'https://tiles.openseamap.org',
				'https://*.tile.openstreetmap.org',
				'https://4i7mo0wwc3lp8d1e.public.blob.vercel-storage.com',
				'https://blob.vercel-storage.com',
				'https://*.gravatar.com'
			],
			'font-src': ['self', 'data:'],
			'connect-src': [
				'self',
				'https://tile.openstreetmap.org',
				'https://*.tile.openstreetmap.org',
				'https://api.openstreetmap.org',
				'https://4i7mo0wwc3lp8d1e.public.blob.vercel-storage.com',
				'https://blob.vercel-storage.com',
				'https://ostsee-tiere.de',
				'https://*.ostsee-tiere.de',
				'https://archive-api.open-meteo.com',
				// Development origins
				'http://localhost:*',
				'https://localhost:*',
				'http://127.0.0.1:*',
				'https://127.0.0.1:*'
			],
			'worker-src': ['self', 'blob:'],
			'frame-src': ['self'],
			'object-src': ['none'],
			'base-uri': ['self'],
			'form-action': ['self'],
			'frame-ancestors': [
				'self',
				'https://meeresmuseum.de',
				'https://*.meeresmuseum.de',
				'https://deutsches-meeresmuseum.de',
				'https://*.deutsches-meeresmuseum.de',
				// Für Development und lokale Dateien - Safari benötigt explizite Ports
				'http://localhost:*',
				'https://localhost:*',
				'http://localhost:4000',
				'https://localhost:4000',
				'http://127.0.0.1:*',
				'https://127.0.0.1:*',
				'http://127.0.0.1:4000',
				'https://127.0.0.1:4000',
				'file:' /* Erlaubt file:-URLs für lokale HTML-Dateien mit iframes */
			],
			'upgrade-insecure-requests': process.env.NODE_ENV === 'production'
		},
		reportOnly: {
			// Report-Only Direktiven für Monitoring neuer CSP-Verletzungen
			'frame-ancestors': [
				'self',
				'https://meeresmuseum.de',
				'https://*.meeresmuseum.de',
				'https://deutsches-meeresmuseum.de',
				'https://*.deutsches-meeresmuseum.de',
				'http://localhost:*',
				'https://localhost:*',
				'http://localhost:4000',
				'https://localhost:4000',
				'http://127.0.0.1:*',
				'https://127.0.0.1:*',
				'http://127.0.0.1:4000',
				'https://127.0.0.1:4000',
				'file:' /* Monitor auch file:-Zugriffe */
			],
			'report-uri': ['/api/csp-report']
		}
	}
} satisfies Parameters<typeof sveltekit>[0];
