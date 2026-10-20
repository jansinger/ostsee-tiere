<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import ReportHeading from './ReportHeading.svelte';
	import { REPORT_KIND_PARAM, reportKindToParam, type ReportKind } from '#lib/report/reportKind.ts';
	import { isNotIFrame } from '#lib/utils/client/isNotIFrame.ts';
	import { scrollToElement } from '#lib/utils/fieldNavigation.ts';

	let {
		onchoose,
		// B7 (Abschlussreview): `false` per Default — beim allerersten
		// Seitenaufruf (keine vorherige Formularansicht) ist diese Seite kein
		// „Wechsel", ein Fokus-Sprung dorthin verschöbe für Tastaturnutzer nur den
		// ersten Tab-Stopp hinter die Navigation, ohne Nutzen. `+page.svelte`
		// setzt das Prop gezielt nur für den Rücksprung aus dem Formular (Ändern,
		// Reset, Browser-Zurück).
		autofocusHeading = false,
		/*
		 * Das Ziel der beiden Links — der JS-lose Pfad, siehe Kommentar am Markup.
		 * Der Default reicht für die Startseite ohne weitere Query-Parameter;
		 * `+page.svelte` überschreibt ihn, um bestehende Parameter (Kampagnen-
		 * Marker aus einem Museums-Link) zu erhalten. Die Komponente baut den
		 * Wert bewusst nicht selbst aus `$app/state`: Sie bliebe damit ohne
		 * SvelteKit-Umgebung nicht mehr renderbar, und die Stelle, die die URL
		 * ohnehin schon hält, ist `+page.svelte`.
		 */
		buildHref = (kind: ReportKind) => `?${REPORT_KIND_PARAM}=${reportKindToParam(kind)}`
	}: {
		onchoose: (kind: ReportKind) => void;
		autofocusHeading?: boolean;
		buildHref?: (kind: ReportKind) => string;
	} = $props();

	let questionEl: HTMLElement | undefined = $state();

	/**
	 * B7: „Ändern" tauschte bislang den gesamten Formularbaum gegen diese Seite
	 * aus, ohne den Fokus mitzunehmen — er fiel auf `<body>`, angesagt wurde
	 * nichts. Dieselbe Mechanik wie beim Schrittwechsel (`scrollAndFocusStep` in
	 * `form/StepNavigation.svelte`): Kopf des neuen Inhalts fokussieren.
	 *
	 * Fokussiert wird die Frage, nicht die `<h1>` darüber — die Seitenüberschrift
	 * ist im iframe bewusst ausgeblendet (siehe unten), die Frage dagegen immer
	 * vorhanden. Anders als bei den Formular-Schritten braucht es kein
	 * `requestAnimationFrame`: Diese Komponente ist beim ersten Lauf des Effekts
	 * bereits vollständig gerendert, es gibt keinen „alten Inhalt", der noch im
	 * Weg stehen könnte.
	 */
	$effect(() => {
		if (!autofocusHeading || !questionEl) return;
		scrollToElement(questionEl);
		questionEl.setAttribute('tabindex', '-1');
		questionEl.focus({ preventScroll: true });
	});

	/**
	 * Der Regelweg: Klick abfangen, Zweig melden, statt die Seite neu zu laden.
	 * `+page.svelte` setzt daraufhin selbst die URL (inklusive History-Eintrag,
	 * damit „Zurück" auf die Auswahl führt statt aus der App).
	 *
	 * Modifizierte Klicks bleiben dem Browser überlassen — Strg/Cmd öffnet einen
	 * neuen Tab, Shift ein neues Fenster. Würde der Handler auch sie abfangen,
	 * bliebe der Nutzer im alten Tab zurück, während der neue leer bleibt.
	 * `button !== 0` deckt Klicks ab, die manche Browser als `click` melden,
	 * ohne dass die primäre Taste gedrückt war.
	 */
	function select(event: MouseEvent, kind: ReportKind): void {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}
		event.preventDefault();
		onchoose(kind);
	}

	const OPTIONS: Array<{ value: ReportKind; label: string; hint: string; icon: string }> = [
		{
			value: 'alive',
			label: m.report_components_reportkindchoice_text_beobachtung_eines_lebenden_tieres(),
			hint: m.report_components_reportkindchoice_text_sie_haben_ein_tier_im_wasser_oder_an_lan(),
			icon: 'custom:porpoise'
		},
		{
			value: 'dead',
			label: m.report_components_reportkindchoice_text_fund_eines_toten_tieres(),
			hint: m.report_components_reportkindchoice_text_sie_haben_ein_totes_tier_gefunden_meist(),
			icon: 'lucide:triangle-alert'
		}
	];
</script>

<div class="mx-auto max-w-2xl px-4 py-8" data-testid="report-kind-choice">
	{#if isNotIFrame}
		<!-- Nur außerhalb des meeresmuseum.de-iframe: Die Museumsseite trägt dort
		     ihre eigene Überschrift — dieselbe Bedingung wie an der (bewusst
		     unterdrückten) Formular-Überschrift in `ModernReportForm.svelte`.
		     Ohne sie sah ein eingebetteter Besucher den Titel doppelt, und der
		     Höhensprung beim Wechsel zu Schritt 1 (dort bereits unterdrückt) fiel
		     größer aus (Abschlussreview, Politur).

		     Seit dem 2026-08-13 steht hier derselbe Kopf wie über dem Formular
		     (Wunsch des Deutschen Meeresmuseums) — vorher wechselte der Titel bei
		     der Zweigwahl von „Meerestier melden" auf „Sichtung von
		     Meeressäugetieren melden". -->
		<ReportHeading />
	{/if}
	<!-- Beantwortet die naheliegende Frage „warum werde ich das gefragt?" genau
	     dort, wo sie anfällt. -->
	<p class="text-base-content/70 mb-6">
		{m.report_components_reportkindchoice_text_damit_wir_ihnen_die_passenden()}
	</p>

	<h2 id="report-kind-question" class="text-section mb-3" bind:this={questionEl}>
		{m.report_components_reportkindchoice_text_was_moechten_sie_melden()}
	</h2>

	<!-- Zwei Links, keine Radiogruppe mit „Weiter": Jede Antwort führt sofort
	     woanders hin und hat eine eigene URL — das ist eine Navigation, keine
	     Auswahl, die noch bestätigt werden müsste. Eine Radio-Karte, die beim
	     Ankreuzen selbst weiterschickt, wäre kein Ersatz, sondern ein
	     Anti-Pattern: Wer per Pfeiltaste durch eine Radiogruppe geht, wählt
	     zwangsläufig die erste Option aus (WCAG 3.2.2).

	     Der `href` trägt das Ziel und macht den Weg ohne JS trivial: Ein Klick
	     vor der Hydration navigiert nativ auf `/?meldung=totfund`, wo
	     `resolveReportKind` den Zweig schon serverseitig auflöst. Der frühere
	     GET-Submit konnte das nur unter zwei Vorbehalten — er ersetzte die
	     gesamte Query (Kampagnen-Marker gingen verloren) und lud ohne Auswahl
	     stumm `/?` nach. Beides entfällt hier, ebenso der ganze Fehlerzustand
	     „nichts gewählt": Er ist strukturell nicht mehr herstellbar.

	     `<nav>` mit `aria-labelledby` statt einer Liste loser Links: So findet
	     ein Screenreader-Nutzer die beiden Ziele als benannte Gruppe („Was
	     möchten Sie melden?") wieder, ohne dass es eine Auswahl-Semantik
	     vortäuscht. -->
	<nav aria-labelledby="report-kind-question">
		<ul class="flex list-none flex-col gap-3 p-0">
			{#each OPTIONS as option (option.value)}
				<li>
					<!-- Label UND Hinweis stehen INNERHALB des Links: Der Hinweis ist die
					     eigentliche Unterscheidungshilfe; außerhalb gelassen hörte ein
					     Screenreader-Nutzer beim Durchgehen der Links nur die beiden
					     ähnlich klingenden Überschriften. -->
					<a
						href={buildHref(option.value)}
						onclick={(event) => select(event, option.value)}
						data-testid="report-kind-option-{reportKindToParam(option.value)}"
						class="border-base-300 hover:bg-base-200 hover:border-primary rounded-box flex w-full items-center gap-3 border p-4 no-underline transition-colors"
					>
						<Icon
							icon={option.icon}
							width="24"
							class="text-primary flex-shrink-0"
							aria-hidden="true"
						/>
						<span class="flex flex-1 flex-col gap-1">
							<span class="text-base-content font-medium">{option.label}</span>
							<span class="text-base-content/70 text-support">{option.hint}</span>
						</span>
						<!-- Macht die Karte auf den ersten Blick als „führt weiter" lesbar —
						     die Aufgabe, die vorher der „Weiter"-Knopf übernahm. -->
						<Icon
							icon="lucide:chevron-right"
							width="20"
							class="text-base-content/70 flex-shrink-0"
							aria-hidden="true"
						/>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>
