<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import DataUsageNotice from '#lib/components/info/DataUsageNotice.svelte';
	import DeadFindingNotice from '#lib/components/info/DeadFindingNotice.svelte';
	import HreflangHead from '#lib/components/seo/HreflangHead.svelte';
	import SpeciesIdentificationHelp from '#lib/report/components/form/fields/SpeciesIdentificationHelp.svelte';
	import { localizeHref } from '#lib/paraglide/runtime.js';

	const title = m.routes_bestimmungshilfe_page_text_bestimmungshilfe_wale_und_robben_der_ost();
	const description =
		m.routes_bestimmungshilfe_page_text_schweinswal_oder_robbe_kegelrobbe_oder_s();
</script>

<svelte:head>
	<title>{title} {m.routes_bestimmungshilfe_page_text_ostsee_tiere_suffix()}</title>
	<meta name="description" content={description} />
	<meta name="keywords" content={m.routes_bestimmungshilfe_page_meta_keywords()} />

	<!-- Open Graph -->
	<meta property="og:title" content="{title} - Ostsee-Tiere" />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="article" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="{title} - Ostsee-Tiere" />
	<meta name="twitter:description" content={description} />
</svelte:head>
<HreflangHead />

<div class="mx-auto max-w-5xl p-6">
	<div class="mb-10">
		<h1 class="text-primary mb-4 text-4xl font-bold tracking-tight">
			{m.routes_bestimmungshilfe_page_text_bestimmungshilfe_fuer_meerestiere()}
		</h1>
		<p class="text-base-content/80 mb-4 text-xl leading-relaxed">
			{m.routes_bestimmungshilfe_page_text_welches_tier_war_das_diese()}
		</p>
		<p class="text-base-content/70 leading-relaxed">
			{m.routes_bestimmungshilfe_page_text_klicken_sie_auf_eine_tierart()}
		</p>
	</div>

	<SpeciesIdentificationHelp variant="page" />

	<div class="mt-10 space-y-6">
		<DeadFindingNotice variant="page" />
		<DataUsageNotice variant="page" />
	</div>

	<!-- Rückweg zum Formular: Wer hier landet, hat in aller Regel gerade etwas
	     gesehen und will es melden. -->
	<div class="border-base-300 mt-12 flex flex-wrap justify-center gap-4 border-t pt-10">
		<a href={localizeHref('/')} class="btn btn-primary btn-lg">
			<Icon icon="custom:porpoise" width="20" height="20" aria-hidden="true" />
			{m.routes_bestimmungshilfe_page_text_sichtung_melden()}
		</a>
		<a href={localizeHref('/map')} class="btn btn-outline btn-lg">
			<Icon icon="lucide:map" width="20" height="20" aria-hidden="true" />
			{m.routes_bestimmungshilfe_page_text_sichtungskarte_ansehen()}
		</a>
	</div>
</div>
