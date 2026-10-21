import type { Handle } from '@sveltejs/kit/hooks';
import { toLocale } from '#lib/paraglide/runtime.js';
import { TRANSLATION_ROLLOUT_COMPLETE } from '#lib/i18n/translationRolloutStage.ts';

/**
 * Vorübergehender Auslieferungs-Riegel für Etappe 0 der Mehrsprachigkeit
 * (siehe `docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md`, Abschnitt 9.1).
 *
 * `/en` ist bereits erreichbar, aber noch KEIN einziger Text ist übersetzt —
 * die Übersetzung folgt erst in den Etappen 1–3. `src/app.html` setzt
 * gleichzeitig global `<meta name="robots" content="index, follow" />`, es
 * gibt weder `sitemap.xml` noch `robots.txt`, und `hreflang` ist planmäßig
 * erst für Etappe 2 vorgesehen. Ohne diesen Riegel indexieren Suchmaschinen
 * ab dem Merge deutschsprachige Inhalte unter englischen URLs — Duplicate
 * Content, und zwar in der falschen Sprache.
 *
 * Header statt zweitem `<meta name="robots">`: `app.html` trägt bereits ein
 * globales robots-Meta, und ein zweites, widersprechendes Tag daneben ist
 * genau der Fehler, den dieses Repository schon einmal hatte (siehe Kommentar
 * dort zu `%sveltekit.head%` bzw. `e2e/seo-meta.spec.ts`) — SvelteKit
 * dedupliziert Meta-Tags nicht, welches eine Suchmaschine nimmt, ist nicht
 * garantiert. Der Header umgeht das und wirkt zusätzlich für Nicht-HTML-
 * Antworten (z. B. die Legacy-JSON-Endpunkte unter `/en/rest_sichtungen/...`).
 *
 * Die Entfernungsbedingung — inklusive der Kopplung an den Sprachumschalter
 * in `PublicNavbar.svelte` und die noch ausstehende `hreflang`-Ergänzung —
 * steht gebündelt bei `TRANSLATION_ROLLOUT_COMPLETE`
 * (`#lib/i18n/translationRolloutStage.ts`). Dort auch der vollständige
 * Ablauf für den Abschluss von Etappe 0.
 *
 * Erkennung über `event.url.pathname` (die vom Client gesendete URL), nicht
 * über die von `reroute` umgeschriebene Route — `reroute` verändert
 * `event.url` nicht. `toLocale()` aus dem Paraglide-Runtime wird dafür
 * genutzt, weil dieselbe Quelle anderswo in der Anwendung bereits für exakt
 * diese Aufgabe verwendet wird (Groß-/Kleinschreibung wird dort per
 * `toLowerCase` behandelt) — ein eigener Regex liefe davon auseinander.
 *
 * Legacy-Pfade unter `/en/` (z. B. `/en/rest_sichtungen/antworten.json`)
 * bekommen den Header ebenfalls: Die Erkennung hängt bewusst nur am ersten
 * Pfadsegment, wie in der Aufgabenstellung verlangt, und nicht am
 * Content-Type. Eine Ausnahme dafür wäre zusätzliche Komplexität ohne
 * echten Nutzen — die iOS-App wertet diesen Header ohnehin nicht aus.
 */
export const noindexEnglishPages: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const erstesSegment = event.url.pathname.split('/').filter(Boolean)[0];
	if (!TRANSLATION_ROLLOUT_COMPLETE && toLocale(erstesSegment) === 'en') {
		response.headers.set('X-Robots-Tag', 'noindex, follow');
	}
	return response;
};
