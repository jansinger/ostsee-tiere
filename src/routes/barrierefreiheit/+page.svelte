<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import HreflangHead from '#lib/components/seo/HreflangHead.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { ACCESSIBILITY_FEEDBACK_EMAIL } from '#lib/constants/contact.ts';

	const title = m.routes_barrierefreiheit_page_text_titel();
	const description = m.routes_barrierefreiheit_page_meta_description();
</script>

<svelte:head>
	<title>{title} {m.routes_barrierefreiheit_page_text_ostsee_tiere_suffix()}</title>
	<meta name="description" content={description} />
</svelte:head>
<HreflangHead />

<div class="mx-auto max-w-3xl p-6">
	<h1 class="text-primary text-display mb-4 font-bold tracking-tight">{title}</h1>

	<!-- Pflichtseite nach § 14 LBGG M-V / BITVO M-V (EU-Richtlinie 2016/2102):
	     Die iframe-Einbettung auf meeresmuseum.de deckt die Pflicht unter
	     eigener Domain nicht ab — dieselbe Begründung wie bei Impressum und
	     Datenschutz im Footer. Diese Erklärung beschreibt den Stand DIESER
	     Anwendung, nicht den der Museums-Hauptseite. Abgesichert durch
	     e2e/accessibility-statement.spec.ts. -->
	<p class="text-base-content/80 mb-4 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_intro()}
	</p>
	<p class="text-base-content/80 mb-8 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_geltungsbereich()}
	</p>

	<h2 class="text-base-content text-title mb-3 font-semibold">
		{m.routes_barrierefreiheit_page_text_stand_titel()}
	</h2>
	<p class="text-base-content/80 mb-4 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_stand_text()}
	</p>
	<p class="text-base-content/70 mb-8 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_stand_methode()}
	</p>

	<h2 class="text-base-content text-title mb-3 font-semibold">
		{m.routes_barrierefreiheit_page_text_maengel_titel()}
	</h2>
	<p class="text-base-content/80 mb-3 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_maengel_intro()}
	</p>
	<ul class="text-base-content/80 mb-8 list-disc space-y-2 pl-6 leading-relaxed">
		<li>{m.routes_barrierefreiheit_page_text_maengel_karte()}</li>
		<li>{m.routes_barrierefreiheit_page_text_maengel_fotos()}</li>
		<li>{m.routes_barrierefreiheit_page_text_maengel_sprache()}</li>
	</ul>

	<h2 class="text-base-content text-title mb-3 font-semibold">
		{m.routes_barrierefreiheit_page_text_feedback_titel()}
	</h2>
	<p class="text-base-content/80 mb-3 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_feedback_text()}
	</p>
	<p class="mb-8">
		<a
			href="mailto:{ACCESSIBILITY_FEEDBACK_EMAIL}"
			class="link link-primary inline-flex items-center gap-2"
		>
			<Icon icon="lucide:mail" width="16" height="16" aria-hidden="true" />
			{ACCESSIBILITY_FEEDBACK_EMAIL}
		</a>
	</p>

	<h2 class="text-base-content text-title mb-3 font-semibold">
		{m.routes_barrierefreiheit_page_text_durchsetzung_titel()}
	</h2>
	<p class="text-base-content/80 mb-3 leading-relaxed">
		{m.routes_barrierefreiheit_page_text_durchsetzung_text()}
	</p>
	<p class="mb-4">
		<a
			href="https://www.deutsches-meeresmuseum.de/barrierefreiheit"
			target="_blank"
			rel="noopener noreferrer"
			class="link link-primary inline-flex items-center gap-2"
		>
			<Icon icon="lucide:external-link" width="16" height="16" aria-hidden="true" />
			{m.routes_barrierefreiheit_page_text_durchsetzung_link()}
		</a>
	</p>
</div>
