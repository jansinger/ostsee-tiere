<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import MaintenanceBanner from '#lib/components/MaintenanceBanner.svelte';
	import PublicFooter from '#lib/components/PublicFooter.svelte';
	import PublicNavbar from '#lib/components/PublicNavbar.svelte';
	import StructuredDataHead from '#lib/components/seo/StructuredDataHead.svelte';
	import ToastContainer from '#lib/components/ToastContainer.svelte';
	import { isNotIFrame } from '#lib/utils/client/isNotIFrame.ts';
	import '../app.css';

	let { children, data } = $props();
</script>

<StructuredDataHead />

<div class:iframe-mode={!isNotIFrame}>
	<!-- Skip-Link: erster fokussierbarer Inhalt vor der Navigation -->
	<a
		href="#main-content"
		class="btn btn-primary z-skip sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
	>
		{m.routes_layout_text_zum_hauptinhalt_springen()}
	</a>

	<!--
		Kopfbereich und Inhalt bilden zusammen genau einen Viewport (`min-h-dvh`),
		der Footer steht bewusst AUSSERHALB dieser Box.

		Damit ergibt sich die Höhe des Inhalts aus dem, was der Header tatsächlich
		einnimmt — Seiten müssen sie nicht mehr schätzen. `/map` rechnete vorher
		`calc(100dvh - 4rem)` und lag damit immer daneben: der Header misst
		einzeilig 66px, als Admin mit umbrechendem Menü 99px, und der
		Wartungsbanner darunter kam in der Rechnung gar nicht vor. Die Karte ragte
		entsprechend unter den Fensterrand, ihre unteren Bedienelemente lagen
		außerhalb des Fensters (abgesichert in `e2e/app-shell-height.spec.ts`).

		Der Footer bleibt draußen, damit die Karte weiterhin das ganze sichtbare
		Fenster füllt und der Footer wie bisher erst beim Scrollen erscheint —
		innerhalb der Box würde er auf `/map` dauerhaft ~130px Kartenfläche kosten.
	-->
	<div class="flex min-h-dvh flex-col">
		<PublicNavbar
			user={data.user}
			isAdmin={data.showAdminMenu}
			showLanguageSwitcher={data.showLanguageSwitcher}
		/>

		<!-- Maintenance Mode Banner for Admins -->
		{#if data.maintenanceConfig?.enabled && data.showAdminMenu && isNotIFrame}
			<div class="container mx-auto shrink-0 px-4 py-2">
				<MaintenanceBanner isAdmin={true} maintenanceMessage={data.maintenanceConfig.message} />
			</div>
		{/if}

		<!-- flex-col + min-h-0: Seiten können ihren Inhalt mit `flex-1` auf die
		     verbleibende Höhe strecken, ohne sie zu kennen. -->
		<main id="main-content" class="flex min-h-0 flex-1 flex-col">
			{@render children()}
		</main>
	</div>

	<PublicFooter />

	<!-- Global Toast Container -->
	<ToastContainer />
</div>
