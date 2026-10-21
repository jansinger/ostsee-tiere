import { buildSitemapXml } from '#lib/seo/sitemap.ts';
import { istKanonischerHost } from '#lib/seo/robotsTxt.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Auf nicht-kanonischen Hosts (Staging, Vorschau) gibt es keine Sitemap.
 *
 * Dort liefert `robots.txt` ohnehin `Disallow: /` und nennt sie nicht — eine
 * trotzdem erreichbare Sitemap wäre der eine Weg, auf dem ein Crawler die
 * Staging-URLs doch noch eingesammelt bekommt (Sitemaps werden auch ohne
 * robots.txt-Verweis abgerufen, etwa aus der Search Console eines Dritten).
 */
export const prerender = false;

export const GET: RequestHandler = ({ url }) => {
	if (!istKanonischerHost(url)) {
		error(404, 'Not found');
	}

	return new Response(buildSitemapXml(url.origin), {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
