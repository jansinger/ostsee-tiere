<script lang="ts">
	/**
	 * Allgemeiner Bestätigungsdialog für destruktive Aktionen.
	 *
	 * Herausgezogen aus `DeleteDialog.svelte`, das dieselbe Mechanik trug, sie
	 * aber fest mit „Sichtung löschen" verdrahtet hatte — weshalb
	 * `ResetSettingsButton.svelte` sie Zeile für Zeile abschreiben musste und die
	 * dritte Stelle (`FormActions.svelte`) beim nativen `confirm()` blieb. Alles
	 * Fallspezifische kommt hier über Props herein; die Komponente kennt keinen
	 * einzigen Botschaftsschlüssel außer der Beschriftung ihres Schließen-Knopfs.
	 *
	 * Basis bleibt das native `<dialog>` mit `showModal()`: Fokus-Trap, ESC und
	 * der Top-Layer kommen damit vom Browser und werden nicht nachgebaut.
	 */
	import * as m from '#lib/paraglide/messages.js';

	let {
		show = $bindable(false),
		title,
		message,
		detail,
		confirmLabel,
		cancelLabel,
		confirmClass = 'btn-error',
		closeLabel = m.components_ui_dialog_confirmdialog_aria_label_dialog_schliessen(),
		onConfirm,
		onCancel
	}: {
		/** Steuert das Öffnen; wird von jedem Weg aus dem Dialog auf `false` gesetzt. */
		show?: boolean;
		title: string;
		message: string;
		/** Zweiter Absatz, z. B. der Hinweis auf die Unumkehrbarkeit. */
		detail?: string;
		confirmLabel: string;
		cancelLabel: string;
		/** Variante des Bestätigen-Knopfs. Default ist die destruktive aus `design-system.md`. */
		confirmClass?: string;
		closeLabel?: string;
		onConfirm: () => void;
		onCancel?: () => void;
	} = $props();

	let dialogElement = $state<HTMLDialogElement | null>(null);
	let confirmed = false;
	/**
	 * Woher der Fokus kam. Chromium stellt ihn beim `close()` von sich aus
	 * zurück, WebKit und Firefox tun das nicht in jedem Fall — und wer per
	 * Tastatur arbeitet, verlöre seine Position mitten in der Aktion.
	 */
	let triggerElement: HTMLElement | null = null;

	// `$props.id()` darf nur direkt als Initialisierer stehen, nicht in einem
	// Template-Literal — daher die zwei Schritte.
	const uid = $props.id();
	const titleId = `confirm-dialog-title-${uid}`;

	$effect(() => {
		if (!dialogElement) return;
		if (show && !dialogElement.open) {
			confirmed = false;
			triggerElement =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			dialogElement.showModal();
		} else if (!show && dialogElement.open) {
			dialogElement.close();
		}
	});

	function confirm() {
		confirmed = true;
		onConfirm();
		show = false;
	}

	function cancel() {
		show = false;
	}

	/** Läuft bei ESC, Backdrop-Klick und jedem `close()` — der eine gemeinsame Ausgang. */
	function handleClose() {
		if (!confirmed) {
			onCancel?.();
		}
		show = false;
		// `isConnected`: Ein `onConfirm` darf seinen eigenen Auslöser entfernen —
		// „Formular zurücksetzen" führt zur Auswahlseite, „Löschen" in
		// `CleanupPanel` lässt den Knopf über `hasFindings` verschwinden. Dann
		// gibt es kein Ziel mehr, und `focus()` auf einem abgehängten Element
		// setzt den Fokus auf `<body>`. Das ist nicht nur nutzlos, sondern
		// zerstört die Platzierung, die die neue Ansicht selbst vornimmt
		// (`ReportKindChoice` fokussiert ihre Auswahlfrage, B7). Wer gewinnt,
		// hinge sonst an der Reihenfolge von `close`-Ereignis und Svelte-Flush —
		// in Chromium gemessen geht es gut aus, zugesichert ist es nirgends.
		if (triggerElement?.isConnected) {
			triggerElement.focus();
		}
		triggerElement = null;
	}
</script>

<dialog bind:this={dialogElement} class="modal" aria-labelledby={titleId} onclose={handleClose}>
	<!-- `w-full max-w-96` statt des geerbten `w-96`: Die feste Breite von 384px
	     ist breiter als ein 375px-Viewport, und der Dialog lief dort rechts aus
	     dem Bild. Im Admin-Bereich fiel das nie auf, im Meldeformular schon —
	     es wird laut Design-Regeln an Deck bedient. Auf dem Desktop ändert sich
	     nichts: `max-w-96` deckelt bei denselben 384px. -->
	<div class="modal-box w-full max-w-96">
		<h3 id={titleId} class="mb-4 text-lg font-bold">{title}</h3>
		<p class="mb-4">{message}</p>
		{#if detail}
			<p class="mb-4">{detail}</p>
		{/if}
		<div class="modal-action">
			<button type="button" class="btn" onclick={cancel}>{cancelLabel}</button>
			<button type="button" class="btn {confirmClass}" onclick={confirm}>{confirmLabel}</button>
		</div>
	</div>
	<!-- Schleier über der Seite dahinter, kein Theme-Ton: bg-scrim/<n>
	     (--scrim-surface in tokens.css).

	     `div` statt DaisyUIs `form method="dialog"`: Der Dialog steht in
	     `FormActions` INNERHALB des Meldeformular-`<form>`, und verschachtelte
	     `<form>` verwirft der HTML-Parser. SSR-Markup und DOM wichen dadurch ab,
	     die Hydration brach ab, und Svelte baute die Seite clientseitig neu auf —
	     sichtbar daran, dass der Wiederherstellungs-Toast doppelt erschien
	     (`e2e/form-autosave.spec.ts`). In `DeleteDialog` fiel das nie auf, weil
	     der Dialog dort außerhalb jedes Formulars sitzt.

	     Funktional ist es dasselbe: `.modal-backdrop` ist ein Grid mit
	     `place-self: stretch`, der Knopf füllt es als Grid-Item, und geschlossen
	     wird ohnehin über `cancel()` und nicht über das native Submit. -->
	<div class="modal-backdrop bg-scrim/50">
		<button type="button" aria-label={closeLabel} onclick={cancel}>
			<span class="sr-only">{closeLabel}</span>
		</button>
	</div>
</dialog>
