<script lang="ts">
	import { page } from '$app/state';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { buildSiteStructuredData, serializeJsonLd } from '#lib/seo/structuredData.ts';

	// `page.url.origin` und nicht `PUBLIC_SITE_URL` — dieselbe Wahl und derselbe
	// Grund wie in `HreflangHead.svelte`: Die Angaben sollen zu dem Host passen,
	// unter dem die Seite tatsächlich abgerufen wurde.
	const jsonLd = $derived(serializeJsonLd(buildSiteStructuredData(page.url.origin, getLocale())));

	// Das schließende Tag zusammengesetzt, mit der Trennung hinter der spitzen
	// Klammer. Zwei Gründe, und beide sind ausprobiert:
	//   1. Ein wörtliches schließendes Skript-Tag im Quelltext beendet den
	//      umgebenden `<script>`-Block. Das gilt schon für den Svelte-Parser —
	//      die Variante mit der Trennung NACH den beiden Zeichen scheiterte mit
	//      „Expected a valid element or component name".
	//   2. Die Backslash-Schreibweise täte dasselbe, ist in JavaScript aber ein
	//      überflüssiges Escape und wird von ESLint zu Recht angemerkt.
	const ENDE = '<' + '/script>';
</script>

<svelte:head>
	<!--
		Ein einziger @graph im Layout statt je Seite ein eigener Block: Organization
		und WebSite gelten für die ganze Anwendung. Seitenbezogene Typen (etwa ein
		Dataset auf /map) kämen in die jeweilige Route — dazu steht in
		structuredData.ts, warum es den Dataset-Knoten noch nicht gibt.

		`{@html}` ist hier unvermeidbar: Svelte maskiert Textinhalt, und ein
		maskiertes `&quot;` im JSON-LD wäre ungültig. Die Serialisierung entschärft
		dafür die spitzen Klammern (serializeJsonLd), sodass kein Wert das Element
		schließen kann — genau die Gefahr, vor der die ESLint-Regel warnt. Der
		Inhalt stammt zudem aus Konstanten und der Origin der Anfrage, nicht aus
		Benutzereingaben.
	-->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}${ENDE}`}
</svelte:head>
