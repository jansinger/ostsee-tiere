<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import HreflangHead from '#lib/components/seo/HreflangHead.svelte';
	import LazyMapWrapper from '#lib/components/map/LazyMapWrapper.svelte';
</script>

<svelte:head>
	<title>{m.routes_map_page_text_sichtungskarte_ostsee_tiere()}</title>
	<meta name="description" content={m.routes_map_page_meta_description()} />
	<meta name="keywords" content={m.routes_map_page_meta_keywords()} />

	<!--
		og:/twitter:-Tags standen bis 2026-08-02 global in `app.html` und trugen
		dort den Text der Startseite. Beim Entfernen der Dopplung (siehe Kommentar
		in `app.html`) war diese Route die einzige öffentliche ohne eigenen Satz —
		sie wäre sonst beim Teilen ohne Vorschaukarte geblieben.
	-->
	<meta property="og:title" content={m.routes_map_page_meta_og_title()} />
	<meta property="og:description" content={m.routes_map_page_meta_og_description()} />
	<meta property="og:type" content="website" />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={m.routes_map_page_meta_og_title()} />
	<meta name="twitter:description" content={m.routes_map_page_meta_og_description()} />
</svelte:head>
<HreflangHead />

<LazyMapWrapper
	mapContainerId="map"
	title={m.routes_map_page_title_sichtungskarte()}
	showTitle={true}
	showLogo={true}
	containerClass="relative min-h-0 w-full flex-1 overflow-hidden"
/>
