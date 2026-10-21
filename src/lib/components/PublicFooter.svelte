<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { isNotIFrame } from '#lib/utils/client/isNotIFrame.ts';
</script>

<!-- Footer with navigation (versteckt in iFrame) -->
{#if isNotIFrame}
	<footer class="bg-base-200 text-base-content mt-8 rounded-t-lg">
		<!--
			`footer sm:footer-horizontal` statt `footer-center`.

			`footer-center` ist in DaisyUI 5 auf JEDEM Breakpoint
			`grid-auto-flow: column dense` — es gibt dazu keine responsive Variante.
			Die drei Blöcke standen deshalb auch auf 390px nebeneinander, jeder rund
			130px breit, und die Linkliste wurde darin zu einer sechszeiligen Spalte
			gequetscht. Umgekehrt drängten sich auf 1280px dieselben Links zweizeilig
			ins linke Drittel, während rechts Platz frei blieb.

			Ein früherer Anlauf (2026-07-30) hatte nur das `md:grid-flow-col` der
			inneren `<nav>` entfernt. Das behob den horizontalen Überlauf, ließ die
			äußere Spaltenanordnung aber unberührt — die kommt aus `footer-center`
			selbst. Abgesichert in `e2e/footer-layout.spec.ts`.
		-->
		<!--
			`aria-labelledby` statt `aria-label`: Der Gruppenname steht ohnehin als
			sichtbare Überschrift da, und zwei Quellen für denselben String laufen
			auseinander. Der Accessible Name bleibt identisch — die E2E-Tests
			greifen die Gruppen weiterhin über ihn ab.
		-->
		<div class="footer sm:footer-horizontal container mx-auto p-6 sm:p-8">
			<nav aria-labelledby="footer-navigation">
				<h2 id="footer-navigation" class="footer-title">
					{m.components_publicfooter_text_navigation()}
				</h2>
				<a href={localizeHref('/')} class="link link-hover py-3"
					>{m.components_publicfooter_text_meldung()}</a
				>
				<a href={localizeHref('/map')} class="link link-hover py-3"
					>{m.components_publicfooter_text_sichtungskarte()}</a
				>
				<a href={localizeHref('/bestimmungshilfe')} class="link link-hover py-3"
					>{m.components_publicfooter_text_bestimmungshilfe()}</a
				>
				<!-- „Hintergrund" wie in der Navigation: Ein Ziel trägt einen Namen —
				     „Über uns" hier und „Hintergrund" oben wären zwei Namen für
				     dieselbe Seite. -->
				<a href={localizeHref('/about')} class="link link-hover py-3"
					>{m.components_publicfooter_text_hintergrund()}</a
				>
			</nav>

			<!--
				Anbieterkennzeichnung nach § 5 DDG und Datenschutzhinweis nach Art. 13
				DSGVO. Beides fehlte bis 2026-07-30 vollständig: es gab weder eine Route
				noch einen Link, und unter eigener Domain deckt die iframe-Einbettung auf
				meeresmuseum.de die Pflicht nicht ab.

				Verlinkt werden bewusst die Seiten des Betreibers (Deutsches
				Meeresmuseum) statt einer eigenen Kopie — eine zweite, separat zu
				pflegende Fassung derselben Rechtstexte würde nur auseinanderlaufen.
				„Ständig verfügbar" ist gegeben, weil dieser Footer auf jeder Seite
				steht; im iframe-Modus ist er ausgeblendet, dort trägt die einbettende
				Seite ihre eigene Kennzeichnung.

				Seit 2026-08-03 stehen sie in einer eigenen Gruppe statt auf Platz 5 und
				6 einer Linkzeile — auffindbar ist Teil der Pflicht.
			-->
			<nav aria-labelledby="footer-rechtliches">
				<h2 id="footer-rechtliches" class="footer-title">
					{m.components_publicfooter_text_rechtliches()}
				</h2>
				<a
					href="https://www.deutsches-meeresmuseum.de/impressum"
					target="_blank"
					rel="noopener noreferrer"
					class="link link-hover py-3">{m.components_publicfooter_text_impressum()}</a
				>
				<a
					href="https://www.deutsches-meeresmuseum.de/datenschutz"
					target="_blank"
					rel="noopener noreferrer"
					class="link link-hover py-3">{m.components_publicfooter_text_datenschutz()}</a
				>
				<!-- Eigene Route statt Museums-Link: Anders als Impressum und Datenschutz
				     beschreibt die Erklärung zur Barrierefreiheit (§ 14 LBGG M-V) den
				     Stand DIESER Anwendung — die Erklärung des Museums gilt nur für
				     dessen Hauptseite. -->
				<a href={localizeHref('/barrierefreiheit')} class="link link-hover py-3"
					>{m.components_publicfooter_text_barrierefreiheit()}</a
				>
			</nav>

			<nav aria-labelledby="footer-projekt">
				<h2 id="footer-projekt" class="footer-title">{m.components_publicfooter_text_projekt()}</h2>
				<!-- `/docs` bewusst NICHT über `localizeHref`: Der Pfad steht in
				     `NICHT_LOKALISIERT` (languagePrefix.ts) — ein `/en/docs` wäre eine 404. -->
				<a href="/docs" class="link link-hover py-3"
					>{m.components_publicfooter_text_dokumentation()}</a
				>
				<a
					href="https://github.com/jansinger/ostsee-tiere"
					target="_blank"
					rel="noopener noreferrer"
					class="link link-hover inline-flex items-center gap-2 py-3"
				>
					<Icon icon="lucide:github" width="16" height="16" aria-hidden="true" />
					{m.components_publicfooter_text_github()}
				</a>
				<a
					href="https://deutsches-meeresmuseum.de"
					target="_blank"
					rel="noopener noreferrer"
					class="link link-hover py-3">{m.components_publicfooter_text_deutsches_meeresmuseum()}</a
				>
			</nav>
		</div>

		<!-- Copyright als eigene Zeile über die volle Breite, nicht als dritte
		     Spalte: es ist keine Navigation und konkurrierte dort mit den Links. -->
		<div class="border-base-300 border-t">
			<div class="container mx-auto px-6 py-4 sm:px-8">
				<p class="text-base-content/70 text-support">
					{m.components_publicfooter_text_copyright_meldeplattform()}
				</p>
			</div>
		</div>
	</footer>
{/if}
