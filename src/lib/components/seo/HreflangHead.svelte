<script lang="ts">
	import { page } from '$app/state';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { buildHreflangLinks, ogLocale, ogLocaleAlternates } from '#lib/seo/hreflang.ts';

	/**
	 * Gemeinsame hreflang-/og:locale-Ausgabe für die vier lokalisierten
	 * öffentlichen Seiten (Aufgabe 2.5) — je Route einmal eingebunden, statt
	 * derselben Ableitung viermal im Markup zu wiederholen.
	 *
	 * `origin`/`pathAndQuery` sind bewusst überschreibbar: An den Aufrufstellen
	 * bleiben sie leer und die Defaults greifen (`page.url`);
	 * `HreflangHead.svelte.test.ts` übergibt feste Werte, damit der Test nicht
	 * von der Basis-URL des Test-Runners abhängt.
	 *
	 * Bewusst `page.url.origin` statt `PUBLIC_SITE_URL`: Erstere ist die
	 * tatsächliche Origin der aktuellen Anfrage, ohne zusätzliche
	 * Konfigurationsquelle, die davon abweichen könnte — und `$env/dynamic/public`
	 * braucht einen Server-Request-Kontext, den es im Component-Test nicht gibt.
	 */
	interface Props {
		origin?: string;
		pathAndQuery?: string;
	}
	let { origin, pathAndQuery }: Props = $props();

	const resolvedOrigin = $derived(origin ?? page.url.origin);
	const resolvedPath = $derived(pathAndQuery ?? page.url.pathname + page.url.search);
	const links = $derived(buildHreflangLinks(resolvedOrigin, resolvedPath));
	const locale = $derived(getLocale());
</script>

<svelte:head>
	{#each links as link (link.hreflang)}
		<link rel="alternate" hreflang={link.hreflang} href={link.href} />
	{/each}
	<meta property="og:locale" content={ogLocale(locale)} />
	{#each ogLocaleAlternates(locale) as alternate (alternate)}
		<meta property="og:locale:alternate" content={alternate} />
	{/each}
</svelte:head>
