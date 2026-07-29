<!--
  Ein Zustand, kein Alarm.

  Erscheint nur, wenn keine Verbindung besteht. Damit weiß der Mensch schon
  beim Ausfüllen, was ihn beim Absenden erwartet — statt es am Ende zu
  erfahren, wenn die Arbeit getan ist.

  Drei Entscheidungen stecken darin:

  1. **Kein Dauer-Indikator für „online".** Ein Zustand, der 99 % der Zeit
     dasselbe sagt, wird nicht gelesen. Im Normalfall kostet die Komponente
     deshalb nicht nur keine Aufmerksamkeit, sondern auch keinen Platz —
     siehe die Trennung unten.
  2. **„Wieder online" darf flüchtig sein.** Es ist die eine Stelle, an der
     ein verschwindender Hinweis richtig ist: Er verlangt keine Handlung, er
     nimmt nur eine Sorge weg. Die Frist liegt in `connectionState`.
  3. **Der Zustand kommt nicht aus `navigator.onLine` allein.** Das meldet nur
     eine aktive Netzwerkschnittstelle, nicht ob das Internet erreichbar ist —
     WLAN an Bord ohne Uplink meldet „online" und lässt jeden Request
     scheitern. Die Herleitung steht in `connectionState.svelte.ts`.

  **Warum Ansage und Anzeige getrennt sind:** Eine Live-Region muss schon im
  DOM stehen, BEVOR sich ihr Inhalt ändert — wird sie zusammen mit ihrem Text
  eingefügt, sagen viele Screenreader nichts. Ein dauerhaft gerendertes
  Wrapper-Element ist aber auch dauerhaft ein Flex-Item: In der Navbar
  (`gap-2`) erzeugte es im Online-Fall gemessene 8px Abstand um ein leeres
  `<div>` herum. Beides zusammen geht nur, wenn die Live-Region aus dem Layout
  genommen wird — `sr-only` ist absolut positioniert und damit kein Flex-Item.
  Die sichtbare Fläche wird daneben ganz normal bedingt gerendert.
-->
<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { connection, watchConnection } from '$lib/stores/connectionState.svelte';

	let {
		/** Blendet den erklärenden Zusatz aus — für enge Leisten. */
		compact = false,
		/**
		 * Ob diese Instanz die Live-Region stellt.
		 *
		 * Es können mehrere Abzeichen gleichzeitig im Bild sein — in der Navbar
		 * und im ortsfesten Schritt-Balken. Zwei Live-Regionen mit demselben Text
		 * lassen den Screenreader „Offline" doppelt ansagen. Deshalb meldet nur
		 * die globale Instanz in der Navbar; die übrigen sind rein visuell.
		 */
		announce = true,
		/**
		 * Layout-Klassen für die sichtbare Fläche.
		 *
		 * Bewusst hier und nicht an einem Wrapper der Aufrufstelle: Ein Wrapper
		 * mit `mb-2` behielte seinen Abstand auch dann, wenn nichts zu sehen ist.
		 * Am Element selbst verschwindet er mit ihm.
		 */
		class: className = ''
	}: { compact?: boolean; announce?: boolean; class?: string } = $props();

	// Mehrfaches Anmelden ist unkritisch: Jede Instanz meldet ihre eigenen
	// Listener wieder ab, der Zustand dahinter ist derselbe.
	$effect(() => watchConnection());

	/** Was der Screenreader hört. Leer, solange alles in Ordnung ist. */
	const liveText = $derived(
		connection.isOffline
			? 'Keine Internetverbindung. Ihre Eingaben werden gespeichert.'
			: connection.justReconnected
				? 'Wieder online.'
				: ''
	);

	const SURFACE =
		'bg-base-200/95 rounded-box border-base-300 flex items-center gap-2 border px-3 py-2';
</script>

{#if announce}
	<!--
		Dauerhaft im DOM, dauerhaft im Accessibility-Baum, aber ohne jede Wirkung
		aufs Layout (`sr-only` ist absolut positioniert). Die sichtbaren Flächen
		unten sind deshalb `aria-hidden` — sonst stünde derselbe Text zweimal im
		Baum.
	-->
	<span class="sr-only" role="status" aria-live="polite">{liveText}</span>
{/if}

{#if connection.isOffline}
	<div class="{SURFACE} {className}" data-testid="connection-badge-offline" aria-hidden="true">
		<span class="text-warning-strong flex items-center gap-2 text-sm font-medium">
			<Icon icon="lucide:wifi-off" width="16" class="shrink-0" aria-hidden="true" />
			Offline
		</span>
		{#if !compact}
			<span class="text-base-content/70 text-support">Eingaben werden gespeichert</span>
		{/if}
	</div>
{:else if connection.justReconnected}
	<div class="{SURFACE} {className}" data-testid="connection-badge-reconnected" aria-hidden="true">
		<span class="text-success-strong flex items-center gap-2 text-sm font-medium">
			<Icon icon="lucide:wifi" width="16" class="shrink-0" aria-hidden="true" />
			Wieder online
		</span>
	</div>
{/if}
