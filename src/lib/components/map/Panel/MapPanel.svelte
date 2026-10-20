<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { focusPanelHeading, returnFocusToToggle } from '$lib/map/panelFocus';

	let {
		panelId,
		titleId,
		title,
		toggleText,
		icon,
		togglePositionClass,
		accentBorderClass,
		isLoading = false,
		// H6: Auf Mobile verdecken die fixen Toggle-Tabs den Sheet-Header —
		// der Parent blendet deshalb beide Tabs aus, solange ein Sheet offen ist.
		toggleHidden = false,
		// H5: bindable, damit Tastaturkürzel im Parent das Panel direkt über
		// den State steuern können statt über DOM-Queries.
		isOpen = $bindable(false),
		children
	}: {
		panelId: string;
		titleId: string;
		title: string;
		toggleText: string;
		icon: string;
		togglePositionClass: string;
		accentBorderClass: string;
		isLoading?: boolean;
		toggleHidden?: boolean;
		isOpen?: boolean;
		children: Snippet;
	} = $props();

	// Element-Referenzen für das Fokus-Management (H5)
	let panelEl = $state<HTMLDivElement>();
	let toggleEl = $state<HTMLButtonElement>();
	let headingEl = $state<HTMLHeadingElement>();

	// H6: Unterhalb von md ist das Panel ein Bottom-Sheet mit zwei Höhen —
	// Peek (Karte bleibt sichtbar) und Expanded. Auf md+ ohne Wirkung.
	let sheetExpanded = $state(false);

	// H5: Fokus folgt dem Panel-Zustand — beim Öffnen auf die Überschrift,
	// beim Schließen zurück zum Toggle. Läuft auch, wenn der Zustand von
	// außen (Tastaturkürzel im Parent) geändert wird.
	let wasOpen = false;
	$effect(() => {
		if (isOpen === wasOpen) return;
		wasOpen = isOpen;
		if (isOpen) {
			focusPanelHeading(headingEl);
		} else {
			// H6: Sheet startet beim nächsten Öffnen wieder im Peek-Zustand
			sheetExpanded = false;
			returnFocusToToggle(panelEl, toggleEl);
		}
	});

	function togglePanel() {
		isOpen = !isOpen;
	}

	function closePanel() {
		isOpen = false;
	}
</script>

<!-- Toggle Button (always visible) — H6: auf Mobile 44px breit (Touch-Target)
     und ortsfest; nur auf md+ wandert er mit dem Panel nach links.

     Die Fläche ist deckendes `bg-base-100` und NICHT `glass`: Der Umschalter
     steht mit seiner Beschriftung (FILTER/LEGENDE) über den OSM-Kacheln, und
     Glass lässt sie durch. `text-base-content` darauf misst über heller See
     12,25:1, über dunklem Land aber 1,07:1 (gemessen 2026-08-14) — WCAG 1.4.3
     verlangt 4,5:1. Jetzt 16,50:1, unabhängig von der Kachel.

     Eine helle Fläche des Themes, kein Schleier: `bg-scrim` gehörte hierher
     nur, wenn die Kachel durchscheinen SOLL. Und deckend statt /95, weil axe
     bei 95 % weiter „unentscheidbar" meldet — der Unterschied entscheidet, ob
     die Knoten gegen den Deckel in axe-scan.spec.ts zählen. Abgesichert in
     e2e/design-tokens.spec.ts → „Kontrast über fremdem Bildmaterial". -->
<button
	bind:this={toggleEl}
	onclick={togglePanel}
	class="bg-base-100 text-base-content hover:bg-base-200 {accentBorderClass} {togglePositionClass} z-nav shadow-floating duration-panel fixed right-0 flex h-32 w-11 cursor-pointer flex-col items-center justify-center rounded-l-lg border-2 border-r-0 transition-all md:w-8 {isOpen
		? 'md:-translate-x-80'
		: ''} {toggleHidden ? 'max-md:hidden' : ''}"
	aria-label={title}
	aria-expanded={isOpen}
	aria-controls={panelId}
>
	<Icon
		icon={isLoading ? 'lucide:loader-2' : icon}
		class="mb-1 h-4 w-4 {isLoading ? 'animate-spin' : ''}"
	/>
	<div
		class="text-xs whitespace-nowrap"
		style="writing-mode: vertical-rl; text-orientation: mixed;"
	>
		{toggleText}
	</div>
</button>

<!-- Panel Container: nicht-modales Seitenpanel (H5) — role="region" statt
     Fake-Dialog; inert nimmt das geschlossene (nur verschobene) Panel samt
     seiner fokussierbaren Elemente aus Tab-Zyklus und Accessibility-Tree.
     H6: < md als Bottom-Sheet (Peek/Expanded), ab md als 320px-Seitenpanel,
     dessen Höhe den top-20-Versatz berücksichtigt.

     Deckendes `bg-base-100` und NICHT `glass` — dieselbe Begründung wie am
     Umschalter oben, nur eine Ebene tiefer: Das Panel steht `position: fixed`
     über den OSM-Kacheln und trägt Überschrift und Fließtext in
     `text-base-content`. Mit Glass war der Grund `rgba(0, 0, 0, 0)` plus
     Weiß-Verlauf; über einer schwarzen Kachel gemessen 1,07:1 statt der von
     WCAG 1.4.3 verlangten 4,5:1.

     Der axe-Scan konnte das strukturell nicht finden: Ein geschlossenes Panel
     trägt `inert`, axe überspringt es, und `e2e/axe-scan.spec.ts` öffnet die
     Panels nicht — der Scan sah nie etwas anderes als den geschlossenen
     Zustand. Der Wächter ist deshalb eine Messung in
     `e2e/design-tokens.spec.ts` → „Kontrast über fremdem Bildmaterial",
     mit geöffnetem Panel.

     `backdrop-blur-sm` ist mit der Deckung entfallen: Es weichzeichnet, was
     hinter der Fläche liegt, und hinter einer deckenden Fläche ist das
     nichts. Deckend statt /95 aus demselben Grund wie am Umschalter — axe
     meldet bei 95 % weiter „unentscheidbar". -->
<div
	bind:this={panelEl}
	id={panelId}
	data-sheet-state={sheetExpanded ? 'expanded' : 'peek'}
	class="bg-base-100 {accentBorderClass} z-panel shadow-floating duration-panel fixed overflow-hidden transition-[transform,height] max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:border-t-2 md:top-20 md:right-0 md:h-[calc(100%-5rem)] md:w-80 md:border-l-2 {sheetExpanded
		? 'max-md:h-[85dvh]'
		: 'max-md:h-[45dvh]'} {isOpen
		? 'translate-x-0 translate-y-0'
		: 'max-md:translate-y-full md:translate-x-full'}"
	role="region"
	aria-labelledby={titleId}
	inert={!isOpen}
>
	<div class="flex h-full flex-col">
		<!-- Griff des Bottom-Sheets (nur Mobile). Bis 2026-08-14 war das ein
		     dekoratives div mit aria-hidden: Es sah nach einem Drag-Handle aus,
		     ließ sich aber weder ziehen noch tippen — die Peek/Expanded-Umschaltung
		     hing allein am Chevron rechts im Header. Der Griff schaltet jetzt
		     denselben Zustand; der Chevron bleibt, weil er den Zustand benennt
		     und die Umschaltung auch außerhalb der Griff-Fläche erreichbar hält.
		     Die volle Breite und min-h-11 sind das Touch-Target (WCAG 2.5.5) —
		     die 6px-Pille darin ist nur die Optik.

		     aria-hidden + tabindex="-1": Der Griff ist ein zusätzliches Ziel für
		     den Finger, keine zusätzliche Funktion. Mit eigenem Label hieße er
		     zwangsläufig wie der Chevron unmittelbar daneben — zwei Schaltflächen
		     mit identischem Namen und identischer Wirkung, direkt hintereinander.
		     Playwrights Strict Mode hat das in `e2e/map-panels.spec.ts` sofort als
		     Mehrdeutigkeit gemeldet; für Screenreader wäre es dieselbe Doppelung,
		     nur ohne Fehlermeldung. Tastatur und AT bedienen den Chevron, der die
		     Funktion benennt und den Zustand meldet.

		     Das preventDefault auf mousedown gehört zwingend dazu: tabindex="-1"
		     nimmt den Griff nur aus der Tab-Reihenfolge, ein Klick fokussiert ihn
		     trotzdem — nachgemessen stand document.activeElement danach auf einem
		     Knoten mit aria-hidden="true". Ein Screenreader hat dort nichts zu
		     melden, weder die Aktion noch den neuen Zustand, und die nächste
		     Tab-Taste setzt an einer nie angesagten Stelle fort. Ohne die Zeile
		     wäre aria-hidden also nicht die stille Variante, sondern eine
		     Fokusfalle. -->
		<button
			type="button"
			data-testid="sheet-handle"
			onclick={() => (sheetExpanded = !sheetExpanded)}
			onmousedown={(event) => event.preventDefault()}
			class="flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-center md:hidden"
			aria-hidden="true"
			tabindex="-1"
		>
			<span class="bg-base-content/20 h-1.5 w-10 rounded-full"></span>
		</button>

		<div class="flex shrink-0 items-center justify-between gap-2 px-4 max-md:pt-0 md:pt-4">
			<!-- tabindex="-1": Fokusziel beim Öffnen des Panels (H5) -->
			<h2 id={titleId} tabindex="-1" bind:this={headingEl} class="text-lg font-bold">
				{title}
			</h2>
			<div class="flex items-center gap-1">
				<!-- H6: Peek/Expanded-Umschalter des Bottom-Sheets (nur < md) -->
				<button
					onclick={() => (sheetExpanded = !sheetExpanded)}
					class="btn btn-ghost btn-sm hover:bg-base-200 min-h-11 min-w-11 md:hidden"
					aria-expanded={sheetExpanded}
					aria-label={sheetExpanded
						? m.components_map_panel_mappanel_aria_label_title_verkleinern({ title })
						: m.components_map_panel_mappanel_aria_label_title_vergroessern({ title })}
				>
					<Icon
						icon={sheetExpanded ? 'lucide:chevron-down' : 'lucide:chevron-up'}
						class="h-4 w-4"
					/>
				</button>
				<button
					onclick={closePanel}
					class="btn btn-ghost btn-sm hover:bg-base-200 min-h-11 min-w-11"
					aria-label={m.components_map_panel_mappanel_aria_label_title_schliessen({ title: title })}
				>
					<Icon icon="lucide:square-x" class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="scroll-styled min-h-0 flex-1 overflow-y-auto px-4 pb-4">
			{@render children()}
		</div>
	</div>
</div>
