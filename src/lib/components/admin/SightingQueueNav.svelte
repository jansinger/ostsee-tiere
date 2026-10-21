<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { queueHref, type SightingQueue } from './sightingQueue';

	interface Props {
		queue: SightingQueue | null;
		queueFailed: boolean;
		order: 'asc' | 'desc';
	}

	let { queue, queueFailed, order }: Props = $props();

	let prevHref = $derived(queue?.prev ? queueHref(queue.prev.id, order) : null);
	let nextHref = $derived(queue?.next ? queueHref(queue.next.id, order) : null);
	let zaehler = $derived(
		queue
			? queue.position
				? `${queue.position} von ${queue.total} offen`
				: `${queue.total} offen`
			: ''
	);
</script>

{#if queueFailed || queue}
	<!-- `queue === null && !queueFailed` rendert nichts: Die Komponente ist
	     zustandslos und wird nur mit einer geladenen oder einer fehlgeschlagenen
	     Warteschlange aufgerufen — ein dritter, „noch nicht geladen"-Zustand
	     würde sonst wie zwei gesperrte Enden plus leerer Zähler aussehen, also
	     genau wie das „abgearbeiteter Stapel"-Bild, gegen das der Fehlerzweig
	     unten antritt. -->
	<nav
		class="bg-base-200 rounded-box flex items-center justify-between gap-2 p-2"
		aria-label="Offene Sichtungen"
	>
		{#if queueFailed}
			<!-- Ein Fehlschlag ist nicht „Stapel zu Ende": Die Leiste sagt ausdrücklich,
			     dass die Position unbekannt ist, statt leere Knöpfe zu zeigen, die wie
			     ein abgearbeiteter Stapel aussähen. -->
			<p class="text-base-content/70 text-support w-full text-center">
				<Icon icon="lucide:unlink" class="mr-1 inline h-4 w-4" aria-hidden="true" />
				Warteschlange nicht geladen — Position unbekannt
			</p>
		{:else}
			{#if prevHref}
				<a class="btn btn-ghost btn-sm" href={prevHref} data-sveltekit-preload-data="hover">
					<Icon icon="lucide:chevron-left" class="h-4 w-4" aria-hidden="true" />
					Vorherige
				</a>
			{:else}
				<!-- Kein Knopf-Attrappe: An einem `.btn` legt DaisyUI auf `aria-disabled=true`
				     `pointer-events: none` — Hover, `title` und der Mausweg wären komplett
				     stumm, und ein `role="button"` ohne Handler bekäme trotzdem einen
				     Tab-Stopp ohne Aussage. Das Stapelende hat dagegen etwas zu sagen
				     („erste offene Sichtung"), das „17 von 653 offen" allein nicht ausdrückt
				     — deshalb reiner Text statt Attrappe, ohne Tab-Stopp. -->
				<span class="text-base-content/70 text-support inline-flex items-center gap-1">
					<Icon icon="lucide:chevron-left" class="h-4 w-4" aria-hidden="true" />
					Erste offene Sichtung
				</span>
			{/if}

			<!-- Kein `role="status"`: Nach einem Sprung über die Tastatur (Task 8,
			     `admin/[id]/+page.svelte`) wird dieser Absatz neu eingefügt statt
			     aktualisiert, und eine frisch eingefügte Live-Region wird von
			     Screenreadern nicht zuverlässig vorgelesen — die implizite
			     Live-Region-Semantik der Rolle wäre hier also wirkungslos. Schlimmer:
			     Bei einem `invalidateAll()` ohne Remount (Reset-Pfad in
			     `admin/[id]/+page.svelte`) bliebe der Knoten bestehen, und eine echte
			     Live-Region kündigte dann „… offen alle Kürzel ?" an, obwohl niemand
			     danach gefragt hat. Das Kürzel bleibt dauerhaft sichtbar statt nur
			     angesagt — dieselbe Begründung wie beim Eingang (`admin/+page.svelte`):
			     ein unsichtbares Kürzel ist keines. `data-testid` ist reiner
			     Test-Zugriff, kein Ersatz für eine ARIA-Rolle. -->
			<p class="text-base-content/70 text-support" data-testid="queue-counter">
				{zaehler}
				<span class="ml-2">alle Kürzel <kbd class="kbd kbd-xs">?</kbd></span>
			</p>

			{#if nextHref}
				<a class="btn btn-ghost btn-sm" href={nextHref} data-sveltekit-preload-data="hover">
					Nächste
					<Icon icon="lucide:chevron-right" class="h-4 w-4" aria-hidden="true" />
				</a>
			{:else}
				<span class="text-base-content/70 text-support inline-flex items-center gap-1">
					Letzte offene Sichtung
					<Icon icon="lucide:chevron-right" class="h-4 w-4" aria-hidden="true" />
				</span>
			{/if}
		{/if}
	</nav>
{/if}
