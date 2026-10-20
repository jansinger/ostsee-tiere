import { buildRobotsTxt } from '#lib/seo/robotsTxt.ts';
import type { RequestHandler } from './$types';

/**
 * Route statt Datei unter `static/`, weil der Inhalt am Host der Anfrage hängt
 * (Staging darf nicht indexiert werden). Die Begründung im Detail steht in
 * `#lib/seo/robotsTxt.ts`.
 *
 * `prerender = false` ist der Kern davon und darf nicht auf `true` wechseln:
 * Vorgerendert stünde das Ergebnis eines einzigen Hosts in allen Umgebungen.
 */
export const prerender = false;

export const GET: RequestHandler = ({ url }) => {
	return new Response(buildRobotsTxt(url), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			// Eine Stunde: lang genug, damit Crawler die Datei nicht bei jedem
			// Besuch neu holen, kurz genug, dass eine Korrektur am selben Tag wirkt.
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
