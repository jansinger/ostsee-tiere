<script lang="ts">
	import ApiDocumentation from '#lib/components/docs/ApiDocumentation.svelte';
</script>

<svelte:head>
	<title>API-Dokumentation - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Umfassende OpenAPI-Dokumentation für die Ostsee-Tiere API mit interaktiver Schnittstelle"
	/>
	<meta name="keywords" content="API, OpenAPI, Scalar, Ostsee, Meerestiere, Sichtungen, REST" />

	<!-- Open Graph -->
	<meta property="og:title" content="Ostsee-Tiere API Dokumentation" />
	<meta
		property="og:description"
		content="Interaktive API-Dokumentation für die Meldung und Verwaltung von Meerestier-Sichtungen"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Ostsee-Tiere API Dokumentation" />
	<meta
		name="twitter:description"
		content="Interaktive API-Dokumentation für die Meldung und Verwaltung von Meerestier-Sichtungen"
	/>
</svelte:head>

<!-- Öffentliche API-Dokumentation -->
<ApiDocumentation />
