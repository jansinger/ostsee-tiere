<!--
  Inline-Statusfläche für jede Oberfläche, die Daten lädt.

  Fünf Varianten, eine Struktur: Icon, Aussage, optionale Erklärung, optionale
  Aktion. Der Block nimmt den Platz ein, an dem die Daten stehen würden — nie
  als Overlay. Ein Overlay über der ganzen Fläche nimmt bei jedem Ladevorgang
  die Bedienung aus der Hand; ein Block an der Stelle der Daten sagt dasselbe,
  ohne alles andere zu sperren.

  Zwei Entscheidungen stecken in den Varianten:

  1. `loading` und `empty` tragen KEINE Statusfarbe. Ein Ladevorgang ist keine
     Warnung, und ein Filter ohne Treffer ist kein Fehler. Erst `partial`,
     `failed` und `offline` nutzen die Alert-Flächen.
  2. Die ARIA-Rolle unterscheidet sich pro Variante: `status`/`aria-live=polite`
     für Zustände, die von selbst entstehen, `alert` nur für die Folge einer
     Nutzeraktion. Sonst unterbricht ein Screenreader den Nutzer beim Tippen.
-->
<script module lang="ts">
	export type StatusBlockVariant = 'loading' | 'empty' | 'partial' | 'failed' | 'offline';

	export interface StatusBlockAction {
		/** Beschriftung der Schaltfläche. */
		label: string;
		/** Was beim Auslösen passiert. */
		onClick: () => void;
		/** Optionales Icon, Standard ist „erneut versuchen". */
		icon?: string;
	}
</script>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let {
		variant,
		title,
		description,
		action,
		announce
	}: {
		variant: StatusBlockVariant;
		/** Die Aussage — was ist der Fall. Immer erforderlich. */
		title: string;
		/** Erklärung darunter: Ursache, Folge, was der Nutzer erwarten kann. */
		description?: string | undefined;
		/**
		 * Ein Ausweg, falls es einen gibt.
		 *
		 * `| undefined` steht explizit da: Unter `exactOptionalPropertyTypes`
		 * dürfte eine Aufrufstelle sonst kein bedingtes `action={… : undefined}`
		 * übergeben — und genau das braucht die Karte, wo der Ausweg nur dann
		 * existiert, wenn es ein anderes Jahr mit Daten gibt.
		 */
		action?: StatusBlockAction | undefined;
		/**
		 * Übersteuert die aus der Variante abgeleitete ARIA-Rolle.
		 *
		 * Die Regel „`alert` bei `failed`" setzt voraus, dass der Fehlschlag die
		 * Folge einer Nutzeraktion ist — das kann die Komponente nicht wissen.
		 * Ein Abruf, der beim Seitenaufbau scheitert, ist inhaltlich `failed`,
		 * darf den Screenreader aber nicht unterbrechen. Solche Aufrufstellen
		 * setzen hier `status`.
		 */
		announce?: 'status' | 'alert' | undefined;
	} = $props();

	/**
	 * Klassen stehen vollständig ausgeschrieben — Tailwind erkennt nur komplette
	 * Strings im Quelltext, ein `alert-${variant}` wäre eine tote Klasse
	 * (daisyui.md, „Content-Detection").
	 */
	const SURFACE: Record<StatusBlockVariant, string> = {
		// Neutrale Flächen bringen ihr Layout selbst mit …
		loading: 'border-base-300 bg-base-200/50 rounded-box flex items-start gap-3 border p-4',
		empty: 'border-base-300 bg-base-200/50 rounded-box flex items-start gap-3 border p-4',
		// … die Alert-Flächen behalten dagegen DaisyUIs eigenes Grid und werden
		// nur oben ausgerichtet, damit das Icon neben der ersten Zeile steht.
		partial: 'alert alert-info items-start',
		failed: 'alert alert-warning items-start',
		offline: 'alert alert-warning items-start'
	};

	/** Jede Variante hat eine eigene Icon-Form — sie trägt die Bedeutung. */
	const ICON: Record<StatusBlockVariant, string> = {
		loading: '',
		empty: 'lucide:search-x',
		partial: 'lucide:info',
		failed: 'lucide:triangle-alert',
		offline: 'lucide:wifi-off'
	};

	/**
	 * `alert` nur bei `failed`: Das ist die Folge einer Nutzeraktion (ein Abruf,
	 * den er angestoßen hat). Alle übrigen entstehen von selbst und melden sich
	 * höflich.
	 */
	const role = $derived(announce ?? (variant === 'failed' ? 'alert' : 'status'));

	/**
	 * `aria-live` wird NUR für `status` gesetzt — und zwar deshalb, weil ein
	 * explizites `aria-live="polite"` das implizite `assertive` von
	 * `role="alert"` überschreibt. Stünde es unbedingt hier, wäre die im
	 * Kopfkommentar zugesagte Unterbrechung nie eingetreten und der
	 * Unterschied zwischen den Rollen reine Dekoration.
	 */
	const ariaLive = $derived(role === 'status' ? 'polite' : undefined);
</script>

<div class={SURFACE[variant]} {role} aria-live={ariaLive} data-testid="status-block-{variant}">
	{#if variant === 'loading'}
		<span class="loading loading-spinner loading-sm text-primary mt-0.5 shrink-0"></span>
	{:else}
		<Icon
			icon={ICON[variant]}
			class={variant === 'empty' ? 'text-base-content/60 mt-0.5 shrink-0' : 'mt-0.5 shrink-0'}
			aria-hidden="true"
		/>
	{/if}

	<div>
		<p class="text-base-content font-medium">{title}</p>
		{#if description}
			<p class="text-base-content/70 text-support mt-1">{description}</p>
		{/if}
		{#if action}
			<button type="button" class="btn btn-outline btn-sm mt-3" onclick={action.onClick}>
				<Icon
					icon={action.icon ?? 'lucide:refresh-cw'}
					width="16"
					class="shrink-0"
					aria-hidden="true"
				/>
				{action.label}
			</button>
		{/if}
	</div>
</div>
