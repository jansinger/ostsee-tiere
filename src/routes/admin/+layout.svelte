<script lang="ts">
	import { page } from '$app/state';
	import { ADMIN_BEREICHE, aktiverAdminBereich } from '#lib/config/adminNav.ts';
	import AdminFooter from '#lib/components/admin/AdminFooter.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	/* Liste und Zuordnung liegen in `#lib/config/adminNav.js` — dieselbe Quelle,
	   aus der die Gruppe „Verwaltung" in der TopBar entsteht. Zwei Listen von
	   Hand zu pflegen hieße, dass eine neue Sektion an einer der beiden
	   Stellen fehlt, ohne dass es auffällt. */
	const aktiv = $derived(aktiverAdminBereich(page.url.pathname));
</script>

<!--
	Kein eigenes <main>: Root-Layout stellt bereits <main id="main-content"> bereit.

	`flex-1 min-h-0` statt `min-h-screen`: Diese Box sitzt seit dem Umbau der
	App-Shell in einer bereits auf Viewport-Höhe gestreckten Flex-Spalte. 100vh
	INNERHALB von „Viewport minus Header" ergab genau die Header-Höhe an
	überflüssigem Scrollweg — gemessen 900px statt der verfügbaren 834px, auf
	jeder Admin-Seite, deren Inhalt kürzer als ein Fenster ist. Es war dieselbe
	geratene Höhe wie das `calc(100dvh - 4rem)` auf `/map`, nur eine Ebene tiefer.
	Mit `flex-1` fällt das Raten weg: Die Box bekommt, was da ist, und der
	AdminFooter sitzt weiterhin unten. Abgesichert in `e2e/app-shell-height.spec.ts`.

	Der frühere äußere `w-full`-Wrapper ist dabei entfallen — er hätte die
	Flex-Kette zwischen `<main>` und dieser Box unterbrochen und trug sonst nichts.
-->
<div class="flex min-h-0 w-full flex-1 flex-col">
	<!--
		Unternavigation der Verwaltung. In der TopBar liegen dieselben vier Ziele
		hinter einem Aufklapper — der ist der Einstieg von außen, taugt aber nicht
		zum Wechseln innerhalb des Bereichs (zwei Klicks pro Wechsel).

		`<nav>` mit `aria-current` statt `role="tablist"`/`role="tab"`: Das sind
		Links auf eigene Seiten, keine Reiter über gemeinsamem Inhalt. Die
		`tabs`-Klassen sind reine Optik und brauchen die Rollen nicht — DaisyUI
		stylt über `.tabs > .tab`.

		Bewusst nicht `sticky top-16`: Das wäre wieder eine geratene Header-Höhe,
		genau der Fehler, den `e2e/app-shell-height.spec.ts` seit 2026-08-03
		absichert. Der Header misst 66px, nicht 64px.
	-->
	<nav aria-label="Verwaltung" class="border-base-300 bg-base-100 tabs tabs-border border-b px-4">
		{#each ADMIN_BEREICHE as bereich (bereich.href)}
			<a
				href={bereich.href}
				class="tab {bereich.href === aktiv ? 'tab-active font-medium' : ''}"
				aria-current={bereich.href === aktiv ? 'page' : undefined}
			>
				{bereich.label}
			</a>
		{/each}
	</nav>

	<div class="w-full flex-1">
		{@render children()}
	</div>
	<AdminFooter buildInfo={data.buildInfo} />
</div>
